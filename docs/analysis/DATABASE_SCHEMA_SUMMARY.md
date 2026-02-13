# eChat Arena 数据库 Schema 分析总结

**生成日期**: 2026-02-11  
**分析范围**: migrations/ 目录、arena/db/、arena/session/、arena/routes/

---

## 执行摘要

本分析深入研究了 eChat Arena 项目的数据库 schema 和持久化机制，识别了 7 个核心表、它们之间的关系、对话消息的存储方式，以及可能导致数据丢失和不一致的关键操作。

### 关键发现

1. **数据库设计**: 采用清晰的表结构，使用 JSONB 字段灵活存储复杂数据，支持软删除和乐观锁
2. **对话存储**: 投票前对话存储在 `arena_sessions` 和 `votes.conversation_history`，投票后对话存储在独立的 `post_vote_turns` 表
3. **数据丢失风险**: 识别了 5 个主要的数据丢失风险点，包括 Session Store 内存回退、CAS 更新失败等
4. **数据不一致风险**: 识别了 4 个主要的数据不一致风险点，包括乐观锁版本冲突、幂等性检查竞态等

### 优先级建议

| 优先级 | 问题 | 影响 | 建议措施 |
|--------|------|------|----------|
| P0 | Post-vote turn 保存失败无重试 | 高 | 添加持久化队列和重试机制 |
| P0 | Session Store 内存回退导致数据丢失 | 高 | 添加本地持久化缓存 |
| P1 | 异步任务失败无重试 | 中 | 添加任务队列和重试机制 |
| P1 | 乐观锁版本冲突 | 中 | 添加自动合并策略 |
| P2 | 幂等性检查竞态 | 中 | 使用数据库级别 UPSERT |
| P2 | turn_index 计算冲突 | 低 | 使用数据库序列 |
| P3 | Session 重建不完整 | 低 | 改进重建逻辑 |

---

## 1. 数据库表结构概览

### 1.1 核心表

| 表名 | 用途 | 记录数估计 | 主要字段 |
|------|------|-----------|----------|
| `votes` | 投票记录 | 高 | id, session_id, conversation_history, turn_count |
| `post_vote_turns` | 投票后对话 | 中 | id, vote_id, turn_index, user_message, assistant_message |
| `arena_sessions` | 会话存储 | 高 | session_id, session_data, version, expires_at |
| `draft_conversations` | 草稿对话 | 低 | id, session_id, user_id, conversation_history |
| `admin_sessions` | 管理员会话 | 低 | id, token, expires_at |
| `model_configs` | 模型配置 | 低 | id, model_key, is_enabled, is_default |
| `admin_audit_log` | 审计日志 | 中 | id, action_type, target_type, details |

### 1.2 表关系

```
votes (1) ──< (N) post_vote_turns
  │
  └── session_id ──> arena_sessions (1)

draft_conversations (N) ──> auth.users (1)
```

**注意**: 大部分表之间采用软关联（无外键约束），以提供更大的灵活性。

---

## 2. 对话消息的存储方式

### 2.1 投票前对话（Pre-vote）

**存储位置**:
1. **临时存储**: `arena_sessions.session_data`
2. **持久化**: `votes.conversation_history`

**数据结构**:
```json
{
  "conversation_history": [
    {
      "turn": 1,
      "user": "我感到很焦虑",
      "reply_a": "我理解你的感受...",
      "reply_b": "听起来你现在很焦虑...",
      "timestamp": "2026-02-11T10:00:00Z"
    }
  ],
  "turn_count": 1,
  "left": {
    "context": [
      {"role": "user", "content": "我感到很焦虑"},
      {"role": "assistant", "content": "我理解你的感受..."}
    ]
  },
  "right": {
    "context": [
      {"role": "user", "content": "我感到很焦虑"},
      {"role": "assistant", "content": "听起来你现在很焦虑..."}
    ]
  }
}
```

### 2.2 投票后对话（Post-vote）

**存储位置**: 独立表 `post_vote_turns`

**数据结构**:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "vote_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user_456",
  "winner_side": "right",
  "turn_index": 1,
  "user_message": "能给我一些建议吗？",
  "assistant_message": "当然可以。首先...",
  "created_at": "2026-02-11T10:05:00Z"
}
```

### 2.3 存储流程

```
用户输入
  ↓
arena_sessions.session_data (临时)
  ├─ conversation_history (完整历史)
  ├─ turn_count (轮数)
  ├─ left.context (单侧上下文)
  └─ right.context (单侧上下文)
  ↓
用户投票
  ↓
votes 表 (持久化)
  ├─ conversation_history (完整历史)
  └─ turn_count (总轮数)
  ↓
用户继续对话（投票后）
  ↓
post_vote_turns 表 (每轮一条记录)
```

---

## 3. 可能导致数据丢失的数据库操作

### 3.1 Session Store 的内存回退机制

**位置**: `arena/session/supabase.py`

**风险等级**: 🔴 高

**问题描述**:
- 当 Supabase 不可用时，数据只存储在内存中
- Heroku dyno 重启会导致数据永久丢失
- 用户投票前的对话历史会丢失

**影响范围**:
- 投票前的所有对话轮次
- 未投票的会话
- 草稿对话

**触发条件**:
- Supabase 连接失败
- 网络超时
- Supabase 服务不可用

**代码位置**:
```python
# arena/session/supabase.py:put()
if self._is_supabase_available():
    success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
    if success:
        self._cache_set(session_id, value)
        return
    elif not self._allow_fallback:
        return

# Fallback to memory store
async with self._lock:
    value["_ts"] = time.time()
    self._sessions[session_id] = value
    await self._gc_locked()
```

**建议措施**:
1. 添加本地持久化缓存（文件或 Redis）
2. Supabase 不可用时使用本地持久化
3. 添加数据恢复机制

---

### 3.2 CAS 更新失败后的回退

**位置**: `arena/session/supabase.py`

**风险等级**: 🟡 中

**问题描述**:
- CAS 更新失败且不允许回退时，数据更新会丢失
- 版本冲突可能导致更新失败
- 重试次数有限（3次）

**影响范围**:
- 对话轮次更新
- 会话状态更新
- 投票信息更新

**代码位置**:
```python
# arena/session/supabase.py:update()
if self._is_supabase_available():
    success = await self._supabase_cas_update(
        session_id,
        current_version,
        new_session_data
    )

    if success:
        self._cache_set(session_id, new_session_data)
        return
    elif not self._allow_fallback:
        return

# Fallback to memory store
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

**建议措施**:
1. 增加重试次数
2. 添加自动合并策略
3. 改进错误处理

---

### 3.3 Post-vote Turn 保存失败

**位置**: `arena/services/chat.py`

**风险等级**: 🔴 高

**问题描述**:
- Post-vote turn 保存失败后没有重试机制
- 数据库错误会导致对话轮次永久丢失
- 用户无法恢复丢失的对话

**影响范围**:
- 投票后的对话轮次
- 用户与获胜模型的继续对话

**触发条件**:
- 数据库连接失败
- 数据库写入错误
- 网络超时

**代码位置**:
```python
# arena/services/chat.py:post_vote_event_stream()
MAX_TURN_INDEX_RETRIES = 8
saved_turn_index: Optional[int] = None
for i in range(MAX_TURN_INDEX_RETRIES):
    candidate = base_turn_index + i
    status = await _insert_post_vote_turn_supabase(
        vote_id=vote_id,
        winner_side=winner_side,
        turn_index=candidate,
        user_message=user_message,
        assistant_message=assistant_text,
        user_id=user_id,
    )
    if status == "ok":
        saved_turn_index = candidate
        break
    if status == "conflict":
        await asyncio.sleep(0.05 + random.random() * 0.05)
        continue
    break

if saved_turn_index is not None:
    print(...)
else:
    print(..., file=sys.stderr)
    # 没有重试机制，数据丢失
```

**建议措施**:
1. 添加持久化队列
2. 定期重试失败的保存操作
3. 添加数据恢复机制

---

### 3.4 Conversation History 的竞态条件

**位置**: `arena/session/base.py`

**风险等级**: 🟡 中

**问题描述**:
- 并发更新时，`turn_count` 和 `conversation_history` 可能不一致
- 自动修复可能导致数据丢失
- 乐观锁版本冲突

**影响范围**:
- 对话轮次计数
- 对话历史完整性

**代码位置**:
```python
# arena/session/base.py:append_turn()
# Verify turn continuity (data consistency check)
if len(item["conversation_history"]) != item["turn_count"]:
    print(_json_dumps({
        "t": _utc_now_iso(),
        "type": "append_turn_warning",
        "session": session_id,
        "history_length": len(item["conversation_history"]),
        "turn_count": item["turn_count"],
        "action": "auto_repair"
    }), file=sys.stderr)
    # Auto-repair: sync turn_count with actual history length
    item["turn_count"] = len(item["conversation_history"])
    expected_turn = item["turn_count"] + 1
```

**建议措施**:
1. 改进并发控制
2. 添加数据一致性检查
3. 改进自动修复逻辑

---

### 3.5 投票时的异步更新

**位置**: `arena/routes/vote.py`

**风险等级**: 🟡 中

**问题描述**:
- 后台任务失败时，`ai_scores` 会丢失
- 没有重试机制
- 异常处理只是打印日志

**影响范围**:
- AI 评分数据
- 模型性能分析

**代码位置**:
```python
# arena/routes/vote.py:vote()
async def _bg_eval_and_update() -> None:
    try:
        # ... AI 评分逻辑 ...
        await _SESSION_STORE.update(session_id, {"ai_scores": computed_scores})
        await _update_vote_supabase(session_id, computed_scores)
    except Exception as exc:
        print(f"[WARN] vote_eval failed session={session_id}: {exc}", file=sys.stderr)

background_tasks.add_task(_bg_eval_and_update)
```

**建议措施**:
1. 添加任务队列
2. 定期重试失败的任务
3. 改进错误处理

---

### 3.6 Session 过期清理

**位置**: `arena/session/base.py`

**风险等级**: 🟡 中

**问题描述**:
- 内存中的 session 过期后会被清理
- 如果 Supabase 不可用，数据会永久丢失
- 大小限制可能导致未过期 session 被清理

**影响范围**:
- 未投票的会话
- 投票前的对话历史
- 草稿对话

**代码位置**:
```python
# arena/session/base.py:_gc_locked()
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
    items = sorted(self._sessions.items(), key=lambda kv: float(kv[1].get("_ts", 0)))
    for sid, _ in items[: max(0, len(items) - _MAX_SESSIONS)]:
        self._sessions.pop(sid, None)
```

**建议措施**:
1. 改进清理策略
2. 添加数据持久化
3. 添加数据恢复机制

---

## 4. 可能导致数据不一致的数据库操作

### 4.1 乐观锁版本冲突

**位置**: `arena/session/supabase.py`

**风险等级**: 🟡 中

**问题描述**:
- 并发更新时，版本冲突会导致更新失败
- 没有自动合并机制
- 重试次数有限

**影响范围**:
- 会话数据更新
- 对话轮次追加
- 投票信息更新

**代码位置**:
```python
# arena/session/supabase.py:_supabase_cas_update()
if create_if_not_exists:
    conditions.append("deleted_at=is.null")
else:
    conditions.append(f"version=eq.{old_version}")
    conditions.append("deleted_at=is.null")

query = "&".join(conditions)
url = f"{self._supabase_url}/rest/v1/arena_sessions?{query}"

resp = await client.patch(url, headers=headers, json=update_data, timeout=self._request_timeout)

if resp.status_code < 400:
    return True

# Check for version conflict (common case)
if resp.status_code == 409 or "version" in (resp.text or "").lower():
    error_details["reason"] = "version_conflict"

print(_json_dumps(error_details), file=sys.stderr)
return False
```

**建议措施**:
1. 添加自动合并策略
2. 增加重试次数
3. 改进错误处理

---

### 4.2 幂等性检查的竞态条件

**位置**: `arena/db/votes.py`

**风险等级**: 🟡 中

**问题描述**:
- 检查和插入之间的时间窗口可能导致重复记录
- 并发请求可能导致数据不一致
- UNIQUE 约束冲突处理可能失败

**影响范围**:
- 投票记录
- 幂等性保证

**代码位置**:
```python
# arena/db/votes.py:_insert_vote_supabase()
existing = await _fetch_vote_id_by_session_id_supabase(session_id)
if existing:
    return existing

url = f"{SUPABASE_URL}/rest/v1/votes"
resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)

if resp.status_code >= 400:
    # If a concurrent request inserted the row first, a UNIQUE(session_id) violation is expected.
    if _looks_like_unique_violation(resp):
        existing = await _fetch_vote_id_by_session_id_supabase(session_id)
        if existing:
            return existing
    raise RuntimeError(f"supabase insert failed {resp.status_code}: {resp.text}")
```

**建议措施**:
1. 使用数据库级别 UPSERT
2. 改进并发控制
3. 添加数据一致性检查

---

### 4.3 Post-vote Turn 的 turn_index 计算

**位置**: `arena/services/chat.py`

**风险等级**: 🟢 低

**问题描述**:
- 并发请求时，`turn_index` 可能冲突
- 基于本地数据计算，可能与数据库不一致
- 重试机制可能导致跳号

**影响范围**:
- Post-vote turn 的顺序
- 对话历史的完整性

**代码位置**:
```python
# arena/services/chat.py:post_vote_event_stream()
base_turn_index = len(post_vote_turns) + 1

MAX_TURN_INDEX_RETRIES = 8
saved_turn_index: Optional[int] = None
for i in range(MAX_TURN_INDEX_RETRIES):
    candidate = base_turn_index + i
    status = await _insert_post_vote_turn_supabase(
        vote_id=vote_id,
        winner_side=winner_side,
        turn_index=candidate,
        user_message=user_message,
        assistant_message=assistant_text,
        user_id=user_id,
    )
    if status == "ok":
        saved_turn_index = candidate
        break
    if status == "conflict":
        await asyncio.sleep(0.05 + random.random() * 0.05)
        continue
    break
```

**建议措施**:
1. 使用数据库序列
2. 改进并发控制
3. 添加数据一致性检查

---

### 4.4 Session 重建的不完整性

**位置**: `arena/services/reconstruction.py`

**风险等级**: 🟢 低

**问题描述**:
- 重建的 session 可能不完整
- 单侧上下文可能无法完全恢复
- 临时数据会丢失

**影响范围**:
- 永久对话功能
- Session 恢复

**代码位置**:
```python
# arena/services/reconstruction.py:_reconstruct_session_from_votes()
async def _reconstruct_session_from_votes(session_id: str) -> Optional[Dict[str, Any]]:
    """从 votes 表重建 session，用于永久对话支持。

    注意：重建的 session 可能不完整，因为：
    1. arena_sessions 可能已被清理
    2. 某些临时数据可能丢失
    3. 单侧上下文可能无法完全恢复
    """
    # Fetch vote record
    vote_record = await _fetch_vote_record_by_session_id(session_id)
    if not vote_record:
        return None

    # Reconstruct session data
    sess = {
        "session_id": session_id,
        "vote_id": vote_record.get("id"),
        "prompt": vote_record.get("prompt"),
        "conversation_history": vote_record.get("conversation_history", []),
        "turn_count": vote_record.get("turn_count", 1),
        "_reconstructed": True,  # 标记为重建的 session
    }

    # ... 重建逻辑 ...

    return sess
```

**建议措施**:
1. 改进重建逻辑
2. 添加数据完整性检查
3. 添加数据恢复机制

---

## 5. 改进建议

### 5.1 数据丢失防护

#### 5.1.1 添加 Post-vote turn 保存的重试机制

**优先级**: P0

**实现方案**:
```python
# 创建重试表
CREATE TABLE IF NOT EXISTS post_vote_turn_retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID NOT NULL,
    winner_side TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    user_message TEXT NOT NULL,
    assistant_message TEXT NOT NULL,
    user_id UUID,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 10,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# 添加索引
CREATE INDEX IF NOT EXISTS idx_post_vote_turn_retry_queue_vote_id 
ON post_vote_turn_retry_queue(vote_id);

CREATE INDEX IF NOT EXISTS idx_post_vote_turn_retry_queue_retry_count 
ON post_vote_turn_retry_queue(retry_count);

# 定期重试
async def _retry_failed_post_vote_turns() -> None:
    """重试失败的 post-vote turn"""
    # 查询需要重试的记录
    # 尝试插入到 post_vote_turns
    # 成功后删除重试记录
    # 失败后更新重试次数
    pass
```

#### 5.1.2 改进 Session Store 的回退策略

**优先级**: P0

**实现方案**:
```python
# 添加本地持久化缓存
import json
import os
from pathlib import Path

class LocalPersistentCache:
    """本地持久化缓存"""
    
    def __init__(self, cache_dir: str = "/tmp/echat_arena_cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """从本地缓存获取"""
        cache_file = self.cache_dir / f"{key}.json"
        if not cache_file.exists():
            return None
        
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
                # 检查过期时间
                if time.time() - data.get("_ts", 0) > _SESSION_TTL_SEC:
                    cache_file.unlink()
                    return None
                return data
        except Exception:
            return None
    
    async def set(self, key: str, value: Dict[str, Any]) -> None:
        """保存到本地缓存"""
        cache_file = self.cache_dir / f"{key}.json"
        value["_ts"] = time.time()
        
        try:
            with open(cache_file, 'w') as f:
                json.dump(value, f)
        except Exception as exc:
            print(f"[WARN] Failed to save to local cache: {exc}", file=sys.stderr)

# 在 SupabaseSessionStore 中使用
class SupabaseSessionStore(SessionStore):
    def __init__(self) -> None:
        super().__init__()
        self._local_cache = {}  # 内存缓存
        self._persistent_cache = LocalPersistentCache()  # 持久化缓存
    
    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        # Try Supabase first
        if self._is_supabase_available():
            success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
            if success:
                self._cache_set(session_id, value)
                await self._persistent_cache.set(session_id, value)
                return
        
        # Fallback to persistent cache
        await self._persistent_cache.set(session_id, value)
        # Also keep in memory for fast access
        async with self._lock:
            value["_ts"] = time.time()
            self._sessions[session_id] = value
```

#### 5.1.3 增强异步任务的重试机制

**优先级**: P1

**实现方案**:
```python
# 创建任务队列
CREATE TABLE IF NOT EXISTS task_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# 添加索引
CREATE INDEX IF NOT EXISTS idx_task_queue_status 
ON task_queue(status);

CREATE INDEX IF NOT EXISTS idx_task_queue_created_at 
ON task_queue(created_at);

# 定期重试失败的任务
async def _retry_failed_tasks() -> None:
    """重试失败的任务"""
    # 查询需要重试的任务
    # 根据任务类型执行相应的逻辑
    # 成功后更新状态为 completed
    # 失败后更新重试次数和错误信息
    pass
```

### 5.2 数据一致性保障

#### 5.2.1 改进乐观锁机制

**优先级**: P1

**实现方案**:
```python
async def _merge_session_data(
    old_data: Dict[str, Any],
    new_data: Dict[str, Any],
) -> Dict[str, Any]:
    """合并冲突的 session 数据"""
    merged = old_data.copy()
    
    # 合并 conversation_history
    old_history = old_data.get("conversation_history", [])
    new_history = new_data.get("conversation_history", [])
    
    # 去重并按 turn 排序
    all_turns = {turn["turn"]: turn for turn in old_history + new_history}
    merged["conversation_history"] = sorted(all_turns.values(), key=lambda x: x["turn"])
    
    # 更新 turn_count
    merged["turn_count"] = len(merged["conversation_history"])
    
    # 合并其他字段
    for key, value in new_data.items():
        if key not in ["conversation_history", "turn_count", "version"]:
            merged[key] = value
    
    return merged
```

#### 5.2.2 改进幂等性检查

**优先级**: P2

**实现方案**:
```python
# 使用数据库级别的 UPSERT
async def _upsert_vote_supabase(row: Dict[str, Any]) -> Optional[str]:
    """使用 UPSERT 替代检查-插入模式"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    session_id = str(row.get("session_id") or "").strip()
    if not session_id:
        raise RuntimeError("supabase insert failed: missing session_id")

    url = f"{SUPABASE_URL}/rest/v1/votes"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    # 使用 ON CONFLICT 实现 UPSERT
    # 注意：PostgREST 不直接支持 ON CONFLICT，需要使用 RPC 函数
    # 或者使用 INSERT ... ON CONFLICT DO UPDATE
    
    # 这里使用 RPC 函数的方式
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/upsert_vote"
    
    async with httpx.AsyncClient() as client:
        resp = await _http_post_json_with_retries(client, rpc_url, headers, row, timeout=REQUEST_TIMEOUT)
        
        if resp.status_code >= 400:
            raise RuntimeError(f"supabase upsert failed {resp.status_code}: {resp.text}")

        # Parse response to get vote_id
        try:
            result = resp.json()
            if isinstance(result, list) and len(result) > 0:
                vote_id = result[0].get("id")
                return str(vote_id) if vote_id else None
        except Exception as exc:
            print(f"[WARN] failed to parse vote_id from response: {exc}", file=sys.stderr)

    return None
```

#### 5.2.3 改进 turn_index 计算

**优先级**: P2

**实现方案**:
```python
# 使用数据库序列
async def _get_next_turn_index(vote_id: str) -> int:
    """从数据库获取下一个 turn_index"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return 1

    url = f"{SUPABASE_URL}/rest/v1/post_vote_turns"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }

    params = {
        "vote_id": f"eq.{vote_id}",
        "select": "turn_index",
        "order": "turn_index.desc",
        "limit": "1",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                return 1
            
            rows = resp.json()
            if rows and len(rows) > 0:
                return rows[0].get("turn_index", 0) + 1
            return 1
    except Exception:
        return 1
```

### 5.3 性能优化

#### 5.3.1 添加定期清理机制

**优先级**: P3

**实现方案**:
```python
# 定期清理过期数据
async def _cleanup_expired_data() -> None:
    """清理过期数据"""
    # 清理过期的 arena_sessions
    await cleanup_expired_sessions()
    
    # 清理过期的 admin_sessions
    await cleanup_expired_admin_sessions()
    
    # 清理软删除的数据
    await cleanup_old_deleted_sessions(days_threshold=30)
    
    # 清理失败的重试记录
    await cleanup_old_retry_records(days_threshold=7)

# 定期执行
import asyncio

async def _schedule_cleanup_tasks():
    """定期执行清理任务"""
    while True:
        try:
            await _cleanup_expired_data()
        except Exception as exc:
            print(f"[WARN] Cleanup task failed: {exc}", file=sys.stderr)
        
        # 每小时执行一次
        await asyncio.sleep(3600)
```

#### 5.3.2 改进缓存策略

**优先级**: P3

**实现方案**:
```python
# 添加多级缓存
class MultiLevelCache:
    """多级缓存：内存 -> Redis -> 数据库"""
    
    def __init__(self):
        self.memory_cache = {}  # 内存缓存
        self.redis_client = None  # Redis 客户端（可选）
    
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        # 1. 尝试内存缓存
        if key in self.memory_cache:
            return self.memory_cache[key]
        
        # 2. 尝试 Redis 缓存
        if self.redis_client:
            try:
                data = await self.redis_client.get(key)
                if data:
                    value = json.loads(data)
                    self.memory_cache[key] = value
                    return value
            except Exception:
                pass
        
        # 3. 从数据库获取
        return None
    
    async def set(self, key: str, value: Dict[str, Any], ttl: int = 60) -> None:
        # 1. 设置内存缓存
        self.memory_cache[key] = value
        
        # 2. 设置 Redis 缓存
        if self.redis_client:
            try:
                await self.redis_client.setex(key, ttl, json.dumps(value))
            except Exception:
                pass
```

#### 5.3.3 添加监控和告警

**优先级**: P3

**实现方案**:
```python
# 监控数据库操作
async def _monitor_database_operations() -> None:
    """监控数据库操作"""
    # 记录慢查询
    # 记录失败操作
    # 发送告警
    pass

# 添加指标收集
class DatabaseMetrics:
    """数据库指标收集"""
    
    def __init__(self):
        self.query_count = 0
        self.slow_query_count = 0
        self.error_count = 0
        self.retry_count = 0
    
    def record_query(self, duration: float, success: bool):
        """记录查询"""
        self.query_count += 1
        if duration > 1.0:  # 超过 1 秒视为慢查询
            self.slow_query_count += 1
        if not success:
            self.error_count += 1
    
    def record_retry(self):
        """记录重试"""
        self.retry_count += 1
    
    def get_metrics(self) -> Dict[str, Any]:
        """获取指标"""
        return {
            "query_count": self.query_count,
            "slow_query_count": self.slow_query_count,
            "error_count": self.error_count,
            "retry_count": self.retry_count,
            "error_rate": self.error_count / self.query_count if self.query_count > 0 else 0,
        }
```

### 5.4 数据完整性检查

#### 5.4.1 添加数据一致性检查工具

**优先级**: P3

**实现方案**:
```python
async def _check_data_consistency() -> Dict[str, Any]:
    """检查数据一致性"""
    issues = []
    
    # 检查 votes 和 post_vote_turns 的一致性
    votes = await _fetch_all_votes_from_supabase()
    for vote in votes:
        vote_id = vote.get("id")
        post_vote_turns, _ = await _fetch_post_vote_turns_supabase(vote_id)
        
        # 检查 turn_index 是否连续
        if post_vote_turns:
            expected_indices = list(range(1, len(post_vote_turns) + 1))
            actual_indices = [turn.get("turn_index") for turn in post_vote_turns]
            if expected_indices != actual_indices:
                issues.append({
                    "type": "turn_index_gap",
                    "vote_id": vote_id,
                    "expected": expected_indices,
                    "actual": actual_indices,
                })
    
    # 检查 arena_sessions 和 votes 的一致性
    # 检查 turn_count 和 conversation_history 的一致性
    
    return {
        "issues": issues,
        "total_issues": len(issues),
    }
```

#### 5.4.2 添加数据修复工具

**优先级**: P3

**实现方案**:
```python
async def _repair_data_inconsistency() -> None:
    """修复数据不一致"""
    # 修复 turn_count
    # 修复 conversation_history
    # 修复 orphaned records
    pass
```

---

## 6. 相关文件清单

### 6.1 数据库迁移

| 文件名 | 说明 |
|--------|------|
| `migrations/add_arena_sessions_table.sql` | 创建 arena_sessions 表 |
| `migrations/add_conversation_history.sql` | 添加 conversation_history 和 turn_count |
| `migrations/add_post_vote_chat.sql` | 创建 post_vote_turns 表 |
| `migrations/add_vote_idempotency.sql` | 添加投票幂等性约束 |
| `migrations/add_winner_type.sql` | 添加 winner_type 字段 |
| `migrations/add_draft_conversations.sql` | 创建 draft_conversations 表 |
| `migrations/add_admin_sessions.sql` | 创建 admin_sessions 表 |
| `migrations/add_model_configs.sql` | 创建 model_configs 表 |
| `migrations/add_model_is_default.sql` | 添加 is_default 字段 |
| `migrations/add_jsonb_indexes.sql` | 添加 JSONB 索引 |
| `migrations/add_admin_audit_log.sql` | 创建 admin_audit_log 表 |
| `migrations/verify_schema.sql` | 验证 schema |

### 6.2 数据库操作

| 文件名 | 说明 |
|--------|------|
| `arena/db/votes.py` | votes 表操作 |
| `arena/db/post_vote.py` | post_vote_turns 表操作 |
| `arena/db/helpers.py` | 数据库辅助函数 |

### 6.3 Session 存储

| 文件名 | 说明 |
|--------|------|
| `arena/session/base.py` | 内存 SessionStore |
| `arena/session/supabase.py` | Supabase SessionStore |

### 6.4 路由

| 文件名 | 说明 |
|--------|------|
| `arena/routes/vote.py` | 投票路由 |
| `arena/routes/chat.py` | 投票后对话路由 |

### 6.5 服务

| 文件名 | 说明 |
|--------|------|
| `arena/services/chat.py` | 投票后对话服务 |
| `arena/services/reconstruction.py` | Session 重建服务 |

---

## 7. 关键配置参数

| 参数名 | 默认值 | 说明 |
|--------|--------|------|
| `_SESSION_TTL_SEC` | 3600 | Session 过期时间（秒） |
| `_SESSION_CACHE_TTL_SEC` | 60 | 本地缓存过期时间（秒） |
| `_SESSION_STORE_MODE` | "supabase" | Session 存储模式 |
| `_SESSION_ALLOW_FALLBACK` | True | 是否允许回退到内存 |
| `_MAX_SESSIONS` | 1000 | 最大 session 数量 |
| `REQUEST_TIMEOUT` | 30 | 请求超时时间（秒） |
| `MAX_RETRIES` | 3 | 最大重试次数 |
| `BACKOFF_BASE` | 0.5 | 重试退避基数（秒） |
| `SSE_HEARTBEAT_SEC` | 15 | SSE 心跳间隔（秒） |

---

## 8. 总结

### 8.1 数据库设计优点

1. **清晰的表结构**: 每个表职责明确，易于维护
2. **灵活的关联设计**: 采用软关联，避免级联删除问题
3. **完善的索引**: 支持高效查询
4. **JSONB 字段**: 灵活存储复杂数据结构
5. **软删除支持**: 数据可恢复
6. **乐观锁机制**: 防止并发更新冲突

### 8.2 潜在问题

1. **数据丢失风险**:
   - Session Store 的内存回退机制
   - Post-vote turn 保存失败无重试
   - 异步更新任务失败

2. **数据不一致风险**:
   - 乐观锁版本冲突
   - 幂等性检查的竞态条件
   - turn_index 计算冲突

3. **性能问题**:
   - 大量 JSONB 数据可能影响查询性能
   - 缺少定期清理机制
   - 缓存策略不够完善

### 8.3 优先级建议

| 优先级 | 问题 | 影响 | 建议措施 |
|--------|------|------|----------|
| P0 | Post-vote turn 保存失败无重试 | 高 | 添加持久化队列和重试机制 |
| P0 | Session Store 内存回退导致数据丢失 | 高 | 添加本地持久化缓存 |
| P1 | 异步任务失败无重试 | 中 | 添加任务队列和重试机制 |
| P1 | 乐观锁版本冲突 | 中 | 添加自动合并策略 |
| P2 | 幂等性检查竞态 | 中 | 使用数据库级别 UPSERT |
| P2 | turn_index 计算冲突 | 低 | 使用数据库序列 |
| P3 | Session 重建不完整 | 低 | 改进重建逻辑 |

---

**文档结束**
