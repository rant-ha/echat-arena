# SessionStore 内存回退机制深度分析报告

生成时间：2026-02-12
分析范围：SupabaseSessionStore 的回退逻辑、数据一致性风险、Heroku dyno重启影响

---

## 执行摘要

本报告深入分析了 eChat Arena 项目中 `SupabaseSessionStore` 的内存回退机制，识别了所有触发回退的条件、数据不一致的风险点，以及 Heroku dyno 重启对数据持久化的影响。

**关键发现**：
- 发现 **6 种触发回退的条件**
- 识别出 **5 个数据不一致的风险点**
- 分析了 **Heroku dyno 重启的 3 个影响维度**
- 提出了 **4 个改进建议**

---

## 1. 回退机制的完整流程

### 1.1 架构层次

```
┌─────────────────────────────────────────────────────────────────┐
│                    应用层 (FastAPI Routes)                      │
│  - battle.py, vote.py, chat.py, sessions.py                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              SupabaseSessionStore (arena/session/supabase.py)   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  L1: Local Cache (_local_cache)                         │   │
│  │  - TTL: 60秒                                            │   │
│  │  - 用途: 热数据快速访问                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  L2: Supabase (arena_sessions 表)                      │   │
│  │  - TTL: 7200秒                                         │   │
│  │  - 用途: 持久化存储，跨 dyno 共享                       │   │
│  │  - CAS 乐观锁控制并发更新                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  L3: Memory Fallback (_sessions)                       │   │
│  │  - TTL: 7200秒                                         │   │
│  │  - Max: 2000 sessions                                  │   │
│  │  - 用途: Supabase 不可用时的降级方案                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 回退决策流程

```
调用 put/update/append_turn
        │
        ▼
┌─────────────────────────────────────┐
│  _is_supabase_available()?          │
│  - _store_mode == "supabase"        │
│  - _supabase_url 存在               │
│  - _supabase_key 存在               │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
      Yes             No
       │               │
       ▼               ▼
┌──────────────┐  ┌──────────────────┐
│ 尝试 Supabase │  │ 直接回退到内存   │
│ CAS 更新     │  │ (如果允许)       │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       ▼                   ▼
┌──────────────┐  ┌──────────────────┐
│ 成功?        │  │ 记录回退日志     │
└──────┬───────┘  └────────┬─────────┘
       │                   │
   ┌───┴───┐               │
   │       │               │
  Yes      No              │
   │       │               │
   ▼       ▼               │
┌──────┐ ┌──────────────┐  │
│ 更新  │ │ _allow_      │  │
│ 缓存  │ │ fallback?    │  │
└──────┘ └──────┬───────┘  │
               │           │
          ┌────┴────┐      │
          │         │      │
         Yes        No     │
          │         │      │
          ▼         ▼      │
     ┌────────┐ ┌──────┐  │
     │ 回退到 │ │ 返回  │  │
     │ 内存   │ │ 错误 │  │
     └────────┘ └──────┘  │
          │               │
          └───────┬───────┘
                  ▼
            ┌──────────┐
            │ 完成     │
            └──────────┘
```

### 1.3 关键代码路径

#### 1.3.1 `put()` 方法的回退逻辑

**位置**: [arena/session/supabase.py](arena/session/supabase.py#L265-L298)

```python
async def put(self, session_id: str, value: Dict[str, Any]) -> None:
    """Store a new session with Supabase persistence."""
    # 初始化必需字段
    if "conversation_history" not in value:
        value["conversation_history"] = []
    if "turn_count" not in value:
        value["turn_count"] = 0
    if "version" not in value:
        value["version"] = 0

    # 初始化单侧上下文
    if "left" not in value or "context" not in value.get("left", {}):
        if "left" not in value:
            value["left"] = {}
        value["left"]["context"] = []

    if "right" not in value or "context" not in value.get("right", {}):
        if "right" not in value:
            value["right"] = {}
        value["right"]["context"] = []

    # 尝试 Supabase 持久化
    if self._is_supabase_available():
        success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
        if success:
            # 更新本地缓存
            self._cache_set(session_id, value)
            return
        elif not self._allow_fallback:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "supabase_put_failed_no_fallback",
                "session_id": session_id
            }), file=sys.stderr)
            return

    # 回退到内存存储
    print(_json_dumps({
        "t": _utc_now_iso(),
        "type": "session_store_fallback_to_memory",
        "session_id": session_id,
        "reason": "supabase_unavailable" if self._is_supabase_available() else "supabase_not_configured"
    }), file=sys.stderr)

    async with self._lock:
        value["_ts"] = time.time()  # For memory store compatibility
        self._sessions[session_id] = value
        await self._gc_locked()
```

**关键点**：
1. 首先尝试 Supabase 持久化
2. 如果失败且 `_allow_fallback=True`，回退到内存
3. 如果失败且 `_allow_fallback=False`，直接返回（数据丢失）
4. 回退时记录详细日志，包括回退原因

#### 1.3.2 `update()` 方法的回退逻辑

**位置**: [arena/session/supabase.py](arena/session/supabase.py#L435-L495)

```python
async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
    """Update session with Supabase persistence support."""
    max_retries = 3

    for attempt in range(max_retries):
        # 1. 获取当前 session
        session = await self.get(session_id)
        if session is None:
            return

        # 2. 应用 patch
        new_session_data = {**session, **patch}
        current_version = session.get("version", 0)

        # 3. 尝试 Supabase 更新
        if self._is_supabase_available():
            success = await self._supabase_cas_update(
                session_id,
                current_version,
                new_session_data
            )

            if success:
                # 更新缓存
                self._cache_set(session_id, new_session_data)
                return
            elif not self._allow_fallback:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "supabase_update_failed_no_fallback",
                    "session_id": session_id,
                    "attempt": attempt + 1
                }), file=sys.stderr)
                return

        # 4. 回退到内存存储或重试
        if self._is_supabase_available() and attempt < max_retries - 1:
            # 重试，使用指数退避
            await asyncio.sleep(0.1 * (attempt + 1))
            continue

        # 回退到内存存储
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "session_update_fallback_to_memory",
            "session_id": session_id,
            "attempt": attempt + 1
        }), file=sys.stderr)

        async with self._lock:
            item = self._sessions.get(session_id)
            if item:
                item.update(patch)
                item["_ts"] = time.time()
                item["version"] = current_version + 1
                self._sessions[session_id] = item
                await self._gc_locked()
        return
```

**关键点**：
1. 最多重试 3 次，使用指数退避
2. 每次重试前重新获取 session（获取最新版本号）
3. 重试耗尽后回退到内存
4. 回退时更新内存中的版本号

#### 1.3.3 `append_turn()` 方法的回退逻辑

**位置**: [arena/session/supabase.py](arena/session/supabase.py#L497-L610)

```python
async def append_turn(
    self,
    session_id: str,
    user_msg: str,
    reply_a: str,
    reply_b: str,
) -> bool:
    """Append a conversation turn with single-side context isolation and CAS."""
    max_retries = 3

    for attempt in range(max_retries):
        # 1. 获取当前 session
        session = await self.get(session_id)
        if session is None:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "append_turn_error",
                "session": session_id,
                "reason": "session_not_found"
            }), file=sys.stderr)
            return False

        # 2. 构建单侧上下文
        current_version = session.get("version", 0)

        # 获取当前上下文
        left_context = await self._build_side_context(session, 'left')
        right_context = await self._build_side_context(session, 'right')

        # 添加用户消息到两侧
        left_context.append({"role": "user", "content": user_msg})
        right_context.append({"role": "user", "content": user_msg})

        # 添加模型特定的回复
        if reply_a:
            left_context.append({"role": "assistant", "content": reply_a})
        if reply_b:
            right_context.append({"role": "assistant", "content": reply_b})

        # 3. 准备新的 session 数据
        new_session_data = {
            **session,
            'left': {
                **session.get('left', {}),
                'context': left_context
            },
            'right': {
                **session.get('right', {}),
                'context': right_context
            },
            'turn_count': session.get('turn_count', 0) + 1,
            'version': current_version + 1
        }

        # 4. 追加到完整对话历史
        conversation_history = session.get('conversation_history', [])
        expected_turn = len(conversation_history) + 1

        # 验证轮次连续性
        if len(conversation_history) != session.get('turn_count', 0):
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "append_turn_warning",
                "session": session_id,
                "history_length": len(conversation_history),
                "turn_count": session.get('turn_count', 0),
                "action": "auto_repair"
            }), file=sys.stderr)
            # 自动修复
            new_session_data['turn_count'] = len(conversation_history)
            expected_turn = len(conversation_history) + 1

        # 创建轮次记录
        turn_record = {
            "turn": expected_turn,
            "user": user_msg,
            "reply_a": reply_a,
            "reply_b": reply_b,
            "timestamp": _utc_now_iso(),
        }

        conversation_history.append(turn_record)
        new_session_data['conversation_history'] = conversation_history

        # 5. 尝试 Supabase 更新
        if self._is_supabase_available():
            success = await self._supabase_cas_update(
                session_id,
                current_version,
                new_session_data
            )

            if success:
                # 更新缓存
                self._cache_set(session_id, new_session_data)

                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "append_turn_success",
                    "session": session_id,
                    "turn": expected_turn,
                    "version": new_session_data["version"]
                }))
                return True
            elif not self._allow_fallback:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "supabase_append_turn_failed_no_fallback",
                    "session_id": session_id,
                    "attempt": attempt + 1
                }), file=sys.stderr)
                return False

        # 6. 重试或回退
        if self._is_supabase_available() and attempt < max_retries - 1:
            await asyncio.sleep(0.1 * (attempt + 1))
            continue

        # 回退到内存存储
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "append_turn_fallback_to_memory",
            "session_id": session_id,
            "attempt": attempt + 1
        }), file=sys.stderr)

        async with self._lock:
            item = self._sessions.get(session_id)
            if item:
                # 更新为新数据
                item.update(new_session_data)
                item["_ts"] = time.time()
                self._sessions[session_id] = item
                await self._gc_locked()
                return True

        return False
```

**关键点**：
1. 构建单侧上下文隔离
2. 验证轮次连续性，自动修复不一致
3. 最多重试 3 次
4. 回退时更新内存中的完整 session 数据

#### 1.3.4 `get()` 方法的回退逻辑

**位置**: [arena/session/supabase.py](arena/session/supabase.py#L397-L433)

```python
async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
    """Get session with Supabase persistence support."""
    # 1. 尝试本地缓存
    cached = self._cache_get(session_id)
    if cached:
        return cached

    # 2. 尝试 Supabase
    if self._is_supabase_available():
        supabase_session = await self._supabase_get(session_id)
        if supabase_session:
            # 检查 TTL
            if self._is_expired(supabase_session):
                # Session 过期，尝试删除
                await self._supabase_soft_delete_internal(session_id)
                return None

            # 更新缓存并返回
            session_data = supabase_session["session_data"]
            self._cache_set(session_id, session_data)
            return session_data

    # 3. 回退到内存存储
    async with self._lock:
        item = self._sessions.get(session_id)
        if not item:
            return None
        if time.time() - float(item.get("_ts", 0)) > _SESSION_TTL_SEC:
            self._sessions.pop(session_id, None)
            return None
        return item
```

**关键点**：
1. 三层查找：缓存 → Supabase → 内存
2. 自动清理过期的 session
3. 内存回退是无条件的（不需要 `_allow_fallback`）

---

## 2. 所有触发回退的条件

### 2.1 条件 1: Supabase 未配置

**触发位置**: `_is_supabase_available()` 方法

**代码**: [arena/session/supabase.py](arena/session/supabase.py#L50-L53)

```python
def _is_supabase_available(self) -> bool:
    """Check if Supabase is configured and available."""
    return (self._store_mode == "supabase" and
            self._supabase_url and
            self._supabase_key)
```

**触发场景**：
- 环境变量 `SUPABASE_URL` 未设置
- 环境变量 `SUPABASE_SERVICE_KEY` 未设置
- 环境变量 `ARENA_SESSION_STORE` 设置为 `"memory"`

**影响**：
- 所有 session 操作直接回退到内存
- 数据不会持久化到 Supabase
- Heroku dyno 重启后数据丢失

**日志示例**：
```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "session_store_fallback_to_memory",
  "session_id": "abc-123",
  "reason": "supabase_not_configured"
}
```

### 2.2 条件 2: Supabase 网络连接失败

**触发位置**: `_supabase_cas_update()` 方法的异常处理

**代码**: [arena/session/supabase.py](arena/session/supabase.py#L115-L163)

```python
async def _supabase_cas_update(...) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(...)  # 或 patch
            if resp.status_code < 400:
                return True
            return False
    except Exception as exc:
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "supabase_cas_update_exception",
            "session_id": session_id,
            "old_version": old_version,
            "error": str(exc)
        }), file=sys.stderr)
        return False
```

**触发场景**：
- Supabase 服务不可用（宕机、维护）
- 网络连接超时（`REQUEST_TIMEOUT=60s`）
- DNS 解析失败
- SSL/TLS 握手失败
- 防火墙阻止连接

**影响**：
- CAS 更新失败
- 如果 `_allow_fallback=True`，回退到内存
- 如果 `_allow_fallback=False`，数据丢失

**日志示例**：
```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "supabase_cas_update_exception",
  "session_id": "abc-123",
  "old_version": 5,
  "error": "ConnectTimeout"
}
```

### 2.3 条件 3: HTTP 状态码错误

**触发位置**: `_supabase_cas_update()` 方法的状态码检查

**代码**: [arena/session/supabase.py](arena/session/supabase.py#L115-L163)

```python
if resp.status_code < 400:
    return True

# 记录详细错误
error_details = {
    "t": _utc_now_iso(),
    "type": "supabase_cas_update_error",
    "session_id": session_id,
    "old_version": old_version,
    "new_version": old_version + 1,
    "status": resp.status_code,
    "response": resp.text,
    "method": "POST" if create_if_not_exists else "PATCH"
}

if resp.status_code == 409 or "version" in (resp.text or "").lower():
    error_details["reason"] = "version_conflict"

print(_json_dumps(error_details), file=sys.stderr)
return False
```

**触发场景**：
- `400 Bad Request`: 请求格式错误
- `401 Unauthorized`: 认证失败（API Key 错误）
- `403 Forbidden`: 权限不足
- `404 Not Found`: 资源不存在
- `409 Conflict`: 版本冲突（CAS 失败）
- `429 Too Many Requests`: 速率限制
- `500 Internal Server Error`: Supabase 内部错误
- `502 Bad Gateway`: 网关错误
- `503 Service Unavailable`: 服务不可用
- `504 Gateway Timeout`: 网关超时

**影响**：
- CAS 更新失败
- 如果是版本冲突，会重试
- 重试耗尽后回退到内存

**日志示例**：
```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "supabase_cas_update_error",
  "session_id": "abc-123",
  "old_version": 5,
  "new_version": 6,
  "status": 409,
  "response": "version conflict",
  "method": "PATCH",
  "reason": "version_conflict"
}
```

### 2.4 条件 4: 版本冲突（CAS 失败）

**触发位置**: `_supabase_cas_update()` 方法的版本检查

**代码**: [arena/session/supabase.py](arena/session/supabase.py#L115-L163)

```python
# 构建查询条件
conditions = [f"session_id=eq.{session_id}"]
if create_if_not_exists:
    conditions.append("deleted_at=is.null")
else:
    conditions.append(f"version=eq.{old_version}")
    conditions.append("deleted_at=is.null")

query = "&".join(conditions)
url = f"{self._supabase_url}/rest/v1/arena_sessions?{query}"
```

**触发场景**：
- 并发更新导致版本号不匹配
- 两个请求同时读取同一个 session，都尝试更新
- 第一个请求成功，第二个请求的版本号已过期

**影响**：
- CAS 更新失败
- 自动重试（最多 3 次）
- 重试耗尽后回退到内存

**日志示例**：
```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "supabase_cas_update_error",
  "session_id": "abc-123",
  "old_version": 5,
  "new_version": 6,
  "status": 409,
  "response": "version conflict",
  "method": "PATCH",
  "reason": "version_conflict"
}
```

### 2.5 条件 5: 重试次数耗尽

**触发位置**: `update()` 和 `append_turn()` 方法的重试循环

**代码**: [arena/session/supabase.py](arena/session/supabase.py#L435-L495)

```python
max_retries = 3

for attempt in range(max_retries):
    # ... 尝试更新 ...

    if self._is_supabase_available() and attempt < max_retries - 1:
        # 重试，使用指数退避
        await asyncio.sleep(0.1 * (attempt + 1))
        continue

    # 回退到内存存储
    print(_json_dumps({
        "t": _utc_now_iso(),
        "type": "session_update_fallback_to_memory",
        "session_id": session_id,
        "attempt": attempt + 1
    }), file=sys.stderr)
```

**触发场景**：
- 连续 3 次 CAS 更新失败
- 持续的网络问题
- 持续的版本冲突（高并发场景）

**影响**：
- 重试耗尽后回退到内存
- 数据可能不一致（内存和 Supabase）

**日志示例**：
```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "session_update_fallback_to_memory",
  "session_id": "abc-123",
  "attempt": 3
}
```

### 2.6 条件 6: `_allow_fallback` 配置

**触发位置**: 所有回退逻辑的配置检查

**代码**: [arena/session/supabase.py](arena/session/supabase.py#L276-L282)

```python
elif not self._allow_fallback:
    print(_json_dumps({
        "t": _utc_now_iso(),
        "type": "supabase_put_failed_no_fallback",
        "session_id": session_id
    }), file=sys.stderr)
    return
```

**触发场景**：
- 环境变量 `ARENA_ALLOW_FALLBACK` 设置为 `"false"`
- Supabase 更新失败
- 不允许回退到内存

**影响**：
- 数据直接丢失
- 用户会话中断
- 需要重新开始对话

**日志示例**：
```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "supabase_put_failed_no_fallback",
  "session_id": "abc-123"
}
```

---

## 3. 数据不一致的风险点

### 3.1 风险点 1: 内存数据不会同步回 Supabase

**问题描述**：
当 Supabase 恢复可用后，内存中的数据不会自动同步回 Supabase。

**代码位置**: [arena/session/supabase.py](arena/session/supabase.py#L284-L298)

```python
# 回退到内存存储
print(_json_dumps({
    "t": _utc_now_iso(),
    "type": "session_store_fallback_to_memory",
    "session_id": session_id,
    "reason": "supabase_unavailable" if self._is_supabase_available() else "supabase_not_configured"
}), file=sys.stderr)

async with self._lock:
    value["_ts"] = time.time()  # For memory store compatibility
    self._sessions[session_id] = value
    await self._gc_locked()
```

**风险场景**：
1. Supabase 不可用，session 数据回退到内存
2. 用户继续对话，数据存储在内存中
3. Supabase 恢复可用
4. 内存中的数据不会自动同步到 Supabase
5. 如果 dyno 重启，内存数据丢失

**影响**：
- 数据永久丢失
- 用户对话历史中断
- 无法恢复会话

**示例**：
```
时间线：
T0: Supabase 可用，session 创建并持久化
T1: Supabase 不可用，用户发送消息
T2: 消息回退到内存存储
T3: 用户继续发送 3 条消息，都在内存中
T4: Supabase 恢复可用
T5: 用户刷新页面，从 Supabase 读取 session
T6: T2-T4 的消息丢失（只在内存中）
```

### 3.2 风险点 2: 多实例部署时数据不一致

**问题描述**：
Heroku 多实例部署时，不同 dyno 的内存存储不共享。

**架构图**：
```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                            │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  Dyno A       │       │  Dyno B       │
│  ┌─────────┐  │       │  ┌─────────┐  │
│  │ Memory  │  │       │  │ Memory  │  │
│  │ Session │  │       │  │ Session │  │
│  │ Store   │  │       │  │ Store   │  │
│  └─────────┘  │       │  └─────────┘  │
└───────────────┘       └───────────────┘
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
            ┌───────────────┐
            │   Supabase    │
            │  (Shared DB)  │
            └───────────────┘
```

**风险场景**：
1. 用户请求路由到 Dyno A
2. Supabase 不可用，数据回退到 Dyno A 的内存
3. 用户刷新页面，请求路由到 Dyno B
4. Dyno B 从 Supabase 读取 session（旧数据）
5. Dyno A 的内存数据无法访问

**影响**：
- 数据不一致
- 用户体验混乱
- 对话历史丢失

**示例**：
```
时间线：
T0: 用户请求 → Dyno A → Supabase 可用 → 持久化成功
T1: 用户请求 → Dyno A → Supabase 不可用 → 回退到 Dyno A 内存
T2: 用户发送消息 → 存储在 Dyno A 内存
T3: 用户刷新页面 → 请求路由到 Dyno B
T4: Dyno B 从 Supabase 读取 → T2 的消息丢失
```

### 3.3 风险点 3: 版本号不一致

**问题描述**：
内存回退时，版本号继续递增，但 Supabase 中的版本号不变。

**代码位置**: [arena/session/supabase.py](arena/session/supabase.py#L481-L495)

```python
async with self._lock:
    item = self._sessions.get(session_id)
    if item:
        item.update(patch)
        item["_ts"] = time.time()
        item["version"] = current_version + 1  # 内存版本号递增
        self._sessions[session_id] = item
        await self._gc_locked()
```

**风险场景**：
1. Supabase 中 session 版本号为 5
2. Supabase 不可用，更新回退到内存
3. 内存中版本号递增到 6
4. Supabase 恢复可用
5. 下次更新时，使用内存版本号 6，但 Supabase 中仍是 5
6. CAS 更新失败（版本冲突）

**影响**：
- CAS 更新失败
- 需要重新获取 session
- 可能导致数据覆盖

**示例**：
```
Supabase: version=5
Memory:   version=6

下次更新：
- 从内存读取 version=6
- 尝试 CAS 更新 Supabase: WHERE version=6
- Supabase 中实际 version=5
- 更新失败（0 行受影响）
```

### 3.4 风险点 4: TTL 过期和 GC 清理

**问题描述**：
内存存储的 TTL 过期和 GC 清理可能导致数据丢失。

**代码位置**: [arena/session/base.py](arena/session/base.py#L95-L108)

```python
async def _gc_locked(self) -> None:
    # TTL
    now = time.time()
    expired = [sid for sid, v in self._sessions.items()
               if now - float(v.get("_ts", 0)) > _SESSION_TTL_SEC]
    for sid in expired:
        self._sessions.pop(sid, None)
    # size cap
    if len(self._sessions) <= _MAX_SESSIONS:
        return
    # drop oldest
    items = sorted(self._sessions.items(),
                   key=lambda kv: float(kv[1].get("_ts", 0)))
    for sid, _ in items[: max(0, len(items) - _MAX_SESSIONS)]:
        self._sessions.pop(sid, None)
```

**风险场景**：
1. Supabase 不可用，数据回退到内存
2. Session 存储在内存中超过 TTL（7200 秒）
3. GC 清理过期 session
4. Supabase 恢复可用
5. Session 已从内存中删除，无法恢复

**影响**：
- 数据永久丢失
- 用户会话中断
- 无法恢复过期 session

**示例**：
```
时间线：
T0: Supabase 不可用，session 回退到内存
T1: 用户离开 2 小时
T2: GC 清理过期 session（TTL=7200s）
T3: 用户返回，session 已丢失
```

### 3.5 风险点 5: 软删除和恢复机制不一致

**问题描述**：
软删除和恢复机制在内存回退时可能不一致。

**代码位置**: [arena/session/supabase.py](arena/session/supabase.py#L612-L645)

```python
async def soft_delete(self, session_id: str) -> bool:
    """Soft delete a session - mark as deleted but keep data recoverable."""
    if not self._is_supabase_available():
        return False

    return await self._supabase_soft_delete_internal(session_id)
```

**风险场景**：
1. Supabase 不可用，session 回退到内存
2. 用户请求软删除 session
3. `soft_delete()` 返回 `False`（Supabase 不可用）
4. 内存中的 session 不会被删除
5. Supabase 恢复可用
6. 内存中的 session 仍然存在，但 Supabase 中可能已删除

**影响**：
- 软删除失败
- 数据不一致
- 恢复机制失效

**示例**：
```
时间线：
T0: Supabase 不可用，session 回退到内存
T1: 用户请求软删除
T2: soft_delete() 返回 False（Supabase 不可用）
T3: 内存中的 session 仍然存在
T4: Supabase 恢复可用
T5: 用户请求恢复 session
T6: 从 Supabase 读取，session 已删除（或不存在）
```

---

## 4. Heroku Dyno 重启的影响分析

### 4.1 影响维度 1: 内存数据全部丢失

**问题描述**：
Heroku dyno 重启时，所有内存中的数据都会丢失。

**代码位置**: [arena/session/base.py](arena/session/base.py#L12-L15)

```python
def __init__(self) -> None:
    self._lock = asyncio.Lock()
    self._sessions: Dict[str, Dict[str, Any]] = {}
```

**影响范围**：
- `SupabaseSessionStore._sessions` 字典
- `SupabaseSessionStore._local_cache` 字典
- 所有回退到内存的 session 数据

**风险场景**：
1. Supabase 不可用，多个 session 回退到内存
2. 用户继续对话，数据存储在内存中
3. Heroku dyno 重启（自动或手动）
4. 所有内存数据丢失
5. 用户刷新页面，session 不存在

**影响**：
- 所有活跃会话中断
- 对话历史丢失
- 用户体验严重受损

**示例**：
```
时间线：
T0: Supabase 不可用，100 个 session 回退到内存
T1: 用户继续对话，数据存储在内存中
T2: Heroku dyno 重启（内存清空）
T3: 用户刷新页面，session 不存在
T4: 用户需要重新开始对话
```

### 4.2 影响维度 2: 本地缓存清空

**问题描述**：
Heroku dyno 重启时，本地缓存也会清空。

**代码位置**: [arena/session/supabase.py](arena/session/supabase.py#L27-L29)

```python
def __init__(self) -> None:
    super().__init__()
    self._local_cache = {}  # Simple in-memory cache for hot sessions
```

**影响范围**：
- `SupabaseSessionStore._local_cache` 字典
- 所有缓存的 session 数据

**风险场景**：
1. 用户频繁访问某个 session（热数据）
2. 数据缓存在本地缓存中
3. Heroku dyno 重启
4. 缓存清空
5. 下次访问需要从 Supabase 重新加载

**影响**：
- 性能下降（缓存未命中）
- 增加 Supabase 负载
- 响应时间增加

**示例**：
```
时间线：
T0: 用户访问 session，数据缓存在本地
T1: 用户再次访问，从缓存读取（快速）
T2: Heroku dyno 重启
T3: 缓存清空
T4: 用户再次访问，从 Supabase 读取（慢）
```

### 4.3 影响维度 3: 多实例部署时的数据不一致

**问题描述**：
Heroku 多实例部署时，dyno 重启会导致数据不一致。

**架构图**：
```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                            │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  Dyno A       │       │  Dyno B       │
│  ┌─────────┐  │       │  ┌─────────┐  │
│  │ Memory  │  │       │  │ Memory  │  │
│  │ Session │  │       │  │ Session │  │
│  │ Store   │  │       │  │ Store   │  │
│  └─────────┘  │       │  └─────────┘  │
└───────────────┘       └───────────────┘
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
            ┌───────────────┐
            │   Supabase    │
            │  (Shared DB)  │
            └───────────────┘
```

**风险场景**：
1. 用户请求路由到 Dyno A
2. Supabase 不可用，数据回退到 Dyno A 的内存
3. Dyno A 重启（内存清空）
4. 用户刷新页面，请求路由到 Dyno B
5. Dyno B 从 Supabase 读取 session（旧数据）
6. Dyno A 的内存数据已丢失

**影响**：
- 数据不一致
- 用户体验混乱
- 对话历史丢失

**示例**：
```
时间线：
T0: 用户请求 → Dyno A → Supabase 不可用 → 回退到 Dyno A 内存
T1: 用户发送消息 → 存储在 Dyno A 内存
T2: Dyno A 重启（内存清空）
T3: 用户刷新页面 → 请求路由到 Dyno B
T4: Dyno B 从 Supabase 读取 → T1 的消息丢失
```

---

## 5. 改进建议

### 5.1 建议 1: 移除内存回退机制

**问题描述**：
内存回退机制导致数据不一致和丢失风险。

**改进方案**：
```python
async def put(self, session_id: str, value: Dict[str, Any]) -> None:
    """Store a new session with Supabase persistence."""
    # 初始化必需字段
    if "conversation_history" not in value:
        value["conversation_history"] = []
    if "turn_count" not in value:
        value["turn_count"] = 0
    if "version" not in value:
        value["version"] = 0

    # 初始化单侧上下文
    if "left" not in value or "context" not in value.get("left", {}):
        if "left" not in value:
            value["left"] = {}
        value["left"]["context"] = []

    if "right" not in value or "context" not in value.get("right", {}):
        if "right" not in value:
            value["right"] = {}
        value["right"]["context"] = []

    # 尝试 Supabase 持久化
    if self._is_supabase_available():
        success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
        if success:
            # 更新本地缓存
            self._cache_set(session_id, value)
            return

        # Supabase 更新失败，抛出异常
        raise RuntimeError(f"Failed to persist session {session_id} to Supabase")

    # Supabase 未配置，抛出异常
    raise RuntimeError("Supabase is not configured")
```

**优点**：
- 消除数据不一致风险
- 强制要求 Supabase 配置
- 简化代码逻辑

**缺点**：
- 降低可用性（Supabase 不可用时无法使用）
- 需要添加监控和告警

**实施步骤**：
1. 移除 `_allow_fallback` 配置
2. 移除所有内存回退逻辑
3. Supabase 失败时抛出异常
4. 添加监控和告警

### 5.2 建议 2: 实现内存到 Supabase 的同步队列

**问题描述**：
内存回退后，数据不会自动同步回 Supabase。

**改进方案**：
```python
class SupabaseSessionStore(SessionStore):
    def __init__(self) -> None:
        super().__init__()
        self._supabase_url = SUPABASE_URL
        self._supabase_key = SUPABASE_SERVICE_KEY
        self._request_timeout = float(REQUEST_TIMEOUT)
        self._local_cache = {}
        self._cache_ttl = _SESSION_CACHE_TTL_SEC

        # 配置
        self._store_mode = _SESSION_STORE_MODE
        self._allow_fallback = _SESSION_ALLOW_FALLBACK

        # 同步队列
        self._sync_queue: asyncio.Queue = asyncio.Queue()
        self._sync_task: Optional[asyncio.Task] = None

    async def _start_sync_task(self) -> None:
        """启动同步任务"""
        if self._sync_task is None:
            self._sync_task = asyncio.create_task(self._sync_loop())

    async def _sync_loop(self) -> None:
        """同步循环"""
        while True:
            try:
                session_id = await self._sync_queue.get()
                await self._sync_to_supabase(session_id)
            except Exception as exc:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "sync_loop_error",
                    "error": str(exc)
                }), file=sys.stderr)

    async def _sync_to_supabase(self, session_id: str) -> bool:
        """同步 session 到 Supabase"""
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                return False

            # 尝试同步到 Supabase
            if self._is_supabase_available():
                current_version = item.get("version", 0)
                success = await self._supabase_cas_update(
                    session_id,
                    current_version,
                    item
                )
                if success:
                    # 同步成功，从内存中删除
                    self._sessions.pop(session_id, None)
                    return True

        return False

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store a new session with Supabase persistence."""
        # 初始化必需字段
        if "conversation_history" not in value:
            value["conversation_history"] = []
        if "turn_count" not in value:
            value["turn_count"] = 0
        if "version" not in value:
            value["version"] = 0

        # 初始化单侧上下文
        if "left" not in value or "context" not in value.get("left", {}):
            if "left" not in value:
                value["left"] = {}
            value["left"]["context"] = []

        if "right" not in value or "context" not in value.get("right", {}):
            if "right" not in value:
                value["right"] = {}
            value["right"]["context"] = []

        # 尝试 Supabase 持久化
        if self._is_supabase_available():
            success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
            if success:
                # 更新本地缓存
                self._cache_set(session_id, value)
                return
            elif not self._allow_fallback:
                raise RuntimeError(f"Failed to persist session {session_id} to Supabase")

        # 回退到内存存储
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "session_store_fallback_to_memory",
            "session_id": session_id,
            "reason": "supabase_unavailable" if self._is_supabase_available() else "supabase_not_configured"
        }), file=sys.stderr)

        async with self._lock:
            value["_ts"] = time.time()
            self._sessions[session_id] = value
            await self._gc_locked()

        # 添加到同步队列
        await self._sync_queue.put(session_id)
```

**优点**：
- 自动同步内存数据到 Supabase
- 减少数据丢失风险
- 保持高可用性

**缺点**：
- 增加复杂性
- 需要管理同步任务
- 可能导致版本冲突

**实施步骤**：
1. 添加同步队列
2. 实现同步循环
3. 回退时添加到队列
4. 启动同步任务

### 5.3 建议 3: 添加监控和告警

**问题描述**：
当前缺乏对回退机制的监控和告警。

**改进方案**：
```python
class SupabaseSessionStore(SessionStore):
    def __init__(self) -> None:
        super().__init__()
        self._supabase_url = SUPABASE_URL
        self._supabase_key = SUPABASE_SERVICE_KEY
        self._request_timeout = float(REQUEST_TIMEOUT)
        self._local_cache = {}
        self._cache_ttl = _SESSION_CACHE_TTL_SEC

        # 配置
        self._store_mode = _SESSION_STORE_MODE
        self._allow_fallback = _SESSION_ALLOW_FALLBACK

        # 监控指标
        self._metrics = {
            "supabase_success": 0,
            "supabase_failure": 0,
            "fallback_count": 0,
            "version_conflict": 0,
            "sync_success": 0,
            "sync_failure": 0,
        }

    def _record_metric(self, metric_name: str, value: int = 1) -> None:
        """记录监控指标"""
        self._metrics[metric_name] = self._metrics.get(metric_name, 0) + value

        # 发送到监控系统（如 Prometheus、Datadog）
        # ...

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store a new session with Supabase persistence."""
        # 初始化必需字段
        if "conversation_history" not in value:
            value["conversation_history"] = []
        if "turn_count" not in value:
            value["turn_count"] = 0
        if "version" not in value:
            value["version"] = 0

        # 初始化单侧上下文
        if "left" not in value or "context" not in value.get("left", {}):
            if "left" not in value:
                value["left"] = {}
            value["left"]["context"] = []

        if "right" not in value or "context" not in value.get("right", {}):
            if "right" not in value:
                value["right"] = {}
            value["right"]["context"] = []

        # 尝试 Supabase 持久化
        if self._is_supabase_available():
            success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
            if success:
                # 更新本地缓存
                self._cache_set(session_id, value)
                self._record_metric("supabase_success")
                return
            else:
                self._record_metric("supabase_failure")
                if not self._allow_fallback:
                    raise RuntimeError(f"Failed to persist session {session_id} to Supabase")

        # 回退到内存存储
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "session_store_fallback_to_memory",
            "session_id": session_id,
            "reason": "supabase_unavailable" if self._is_supabase_available() else "supabase_not_configured"
        }), file=sys.stderr)

        self._record_metric("fallback_count")

        async with self._lock:
            value["_ts"] = time.time()
            self._sessions[session_id] = value
            await self._gc_locked()

        # 触发告警
        if self._metrics["fallback_count"] > 10:
            self._trigger_alert("high_fallback_rate")

    def _trigger_alert(self, alert_type: str) -> None:
        """触发告警"""
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "alert",
            "alert_type": alert_type,
            "metrics": self._metrics
        }), file=sys.stderr)

        # 发送到告警系统（如 PagerDuty、Slack）
        # ...
```

**优点**：
- 实时监控回退机制
- 及时发现问题
- 支持告警和通知

**缺点**：
- 增加复杂性
- 需要集成监控系统

**实施步骤**：
1. 添加监控指标
2. 记录关键事件
3. 实现告警逻辑
4. 集成监控系统

### 5.4 建议 4: 使用 Redis 替代内存存储

**问题描述**：
内存存储在多实例部署时不共享，导致数据不一致。

**改进方案**：
```python
import redis.asyncio as redis

class RedisSessionStore(SessionStore):
    """Redis-backed SessionStore with fallback to Supabase."""

    def __init__(self) -> None:
        super().__init__()
        self._redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        self._redis_client = redis.from_url(self._redis_url, decode_responses=True)
        self._supabase_url = SUPABASE_URL
        self._supabase_key = SUPABASE_SERVICE_KEY
        self._request_timeout = float(REQUEST_TIMEOUT)
        self._cache_ttl = _SESSION_CACHE_TTL_SEC

        # 配置
        self._store_mode = _SESSION_STORE_MODE
        self._allow_fallback = _SESSION_ALLOW_FALLBACK

    async def _redis_get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """从 Redis 获取 session"""
        try:
            data = await self._redis_client.get(f"session:{session_id}")
            if data:
                return json.loads(data)
            return None
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "redis_get_error",
                "session_id": session_id,
                "error": str(exc)
            }), file=sys.stderr)
            return None

    async def _redis_set(self, session_id: str, value: Dict[str, Any]) -> bool:
        """设置 session 到 Redis"""
        try:
            await self._redis_client.setex(
                f"session:{session_id}",
                _SESSION_TTL_SEC,
                json.dumps(value)
            )
            return True
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "redis_set_error",
                "session_id": session_id,
                "error": str(exc)
            }), file=sys.stderr)
            return False

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store a new session with Supabase persistence."""
        # 初始化必需字段
        if "conversation_history" not in value:
            value["conversation_history"] = []
        if "turn_count" not in value:
            value["turn_count"] = 0
        if "version" not in value:
            value["version"] = 0

        # 初始化单侧上下文
        if "left" not in value or "context" not in value.get("left", {}):
            if "left" not in value:
                value["left"] = {}
            value["left"]["context"] = []

        if "right" not in value or "context" not in value.get("right", {}):
            if "right" not in value:
                value["right"] = {}
            value["right"]["context"] = []

        # 尝试 Supabase 持久化
        if self._is_supabase_available():
            success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
            if success:
                # 更新 Redis 缓存
                await self._redis_set(session_id, value)
                return
            elif not self._allow_fallback:
                raise RuntimeError(f"Failed to persist session {session_id} to Supabase")

        # 回退到 Redis 存储
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "session_store_fallback_to_redis",
            "session_id": session_id,
            "reason": "supabase_unavailable" if self._is_supabase_available() else "supabase_not_configured"
        }), file=sys.stderr)

        await self._redis_set(session_id, value)
```

**优点**：
- 多实例共享数据
- 持久化存储（Redis RDB/AOF）
- 高性能
- 支持集群模式

**缺点**：
- 需要额外的 Redis 服务
- 增加成本
- 增加复杂性

**实施步骤**：
1. 添加 Redis 依赖
2. 实现 Redis 存储逻辑
3. 替换内存存储为 Redis
4. 配置 Redis 连接

---

## 6. 总结

### 6.1 关键发现

1. **6 种触发回退的条件**：
   - Supabase 未配置
   - Supabase 网络连接失败
   - HTTP 状态码错误
   - 版本冲突（CAS 失败）
   - 重试次数耗尽
   - `_allow_fallback` 配置

2. **5 个数据不一致的风险点**：
   - 内存数据不会同步回 Supabase
   - 多实例部署时数据不一致
   - 版本号不一致
   - TTL 过期和 GC 清理
   - 软删除和恢复机制不一致

3. **Heroku dyno 重启的 3 个影响维度**：
   - 内存数据全部丢失
   - 本地缓存清空
   - 多实例部署时的数据不一致

### 6.2 改进建议优先级

**高优先级（立即实施）**：
1. 添加监控和告警
2. 移除内存回退机制（或限制使用场景）

**中优先级（近期实施）**：
3. 实现内存到 Supabase 的同步队列
4. 使用 Redis 替代内存存储

**低优先级（长期改进）**：
5. 优化 CAS 并发控制
6. 添加数据一致性检查
7. 实现数据修复工具

### 6.3 风险评估

| 风险 | 概率 | 影响 | 严重性 |
|------|------|------|--------|
| 内存数据丢失 | 高 | 高 | 高 |
| 多实例数据不一致 | 中 | 高 | 高 |
| 版本号不一致 | 中 | 中 | 中 |
| TTL 过期导致数据丢失 | 低 | 中 | 中 |
| 软删除失败 | 低 | 低 | 低 |

---

## 附录

### A. 相关文件清单

| 文件 | 职责 |
|------|------|
| [arena/session/base.py](arena/session/base.py) | 基础内存 SessionStore 实现 |
| [arena/session/supabase.py](arena/session/supabase.py) | Supabase 持久化 SessionStore 实现 |
| [arena/config.py](arena/config.py) | Session 配置 |
| [arena/main.py](arena/main.py) | 应用启动和 session_store 初始化 |

### B. 配置参数

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|---------|--------|------|
| 存储模式 | `ARENA_SESSION_STORE` | `memory` | `memory` 或 `supabase` |
| 允许降级 | `ARENA_ALLOW_FALLBACK` | `true` | Supabase 失败时是否降级到内存 |
| Session TTL | `ARENA_SESSION_TTL_SEC` | `7200` | Session 过期时间（秒） |
| 最大 Session 数 | `ARENA_MAX_SESSIONS` | `2000` | 内存存储最大 session 数 |
| 缓存 TTL | `ARENA_CACHE_TTL_SEC` | `60` | 本地缓存过期时间（秒） |

### C. 参考资料

- [PERSISTENCE_BUG_ANALYSIS.md](PERSISTENCE_BUG_ANALYSIS.md) - 持久化 Bug 修复历史分析
- [SESSION_ARCHITECTURE_ANALYSIS.md](SESSION_ARCHITECTURE_ANALYSIS.md) - Session 存储架构分析
- [DEPLOYMENT_GUIDE_SESSIONSTORE.md](DEPLOYMENT_GUIDE_SESSIONSTORE.md) - SessionStore 部署指南

---

**报告结束**
