# eChat Arena Session 存储架构分析报告

生成时间：2026-02-11
分析范围：完整的 session 生命周期、存储机制、关键代码路径

---

## 1. Session 架构概览

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Application                       │
│                        (arena/main.py)                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AppState (arena/state.py)                    │
│                  ┌─────────────────────────────┐                │
│                  │  session_store: SessionStore │                │
│                  └─────────────────────────────┘                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              SessionStore (arena/session/base.py)               │
│              ┌─────────────────────────────────────┐            │
│              │  - put()                            │            │
│              │  - get()                            │            │
│              │  - update()                         │            │
│              │  - append_turn()                    │            │
│              │  - get_conversation_history()       │            │
│              │  - get_turn_count()                 │            │
│              └─────────────────────────────────────┘            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│         SupabaseSessionStore (arena/session/supabase.py)        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Local Cache (TTL: 60s)                                 │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  _local_cache: Dict[str, session_data]          │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Memory Fallback (TTL: 7200s, Max: 2000)               │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  _sessions: Dict[str, session_data]             │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Database                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  arena_sessions (session_data JSONB)                   │   │
│  │  - session_id (PK)                                      │   │
│  │  - session_data (JSONB)                                │   │
│  │  - version (BIGINT, optimistic lock)                   │   │
│  │  - expires_at (TIMESTAMPTZ)                            │   │
│  │  - deleted_at (TIMESTAMPTZ, soft delete)               │   │
│  │  - created_at, updated_at                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  votes (vote record)                                   │   │
│  │  - id (PK, UUID)                                       │   │
│  │  - session_id (UNIQUE)                                 │   │
│  │  - conversation_history (JSONB)                        │   │
│  │  - turn_count (INTEGER)                                │   │
│  │  - vote_id (FK to post_vote_turns)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  post_vote_turns (post-vote chat turns)                │   │
│  │  - vote_id (FK)                                        │   │
│  │  - turn_index (INTEGER)                                │   │
│  │  - UNIQUE(vote_id, turn_index)                         │   │
│  │  - user_message, assistant_message                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 存储层次结构

```
┌─────────────────────────────────────────────────────────────┐
│  L1: Local Cache (SupabaseSessionStore._local_cache)       │
│  - TTL: 60秒 (ARENA_CACHE_TTL_SEC)                         │
│  - 用途: 热数据快速访问                                      │
│  - 命中时直接返回，不访问 Supabase                           │
└─────────────────────────────────────────────────────────────┘
                            │ miss
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  L2: Supabase (arena_sessions 表)                           │
│  - TTL: 7200秒 (ARENA_SESSION_TTL_SEC)                      │
│  - 用途: 持久化存储，跨 dyno 共享                            │
│  - CAS 乐观锁控制并发更新                                    │
│  - 软删除支持 (deleted_at)                                  │
└─────────────────────────────────────────────────────────────┘
                            │ unavailable/error
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  L3: Memory Fallback (SupabaseSessionStore._sessions)       │
│  - TTL: 7200秒                                              │
│  - Max: 2000 sessions (ARENA_MAX_SESSIONS)                  │
│  - 用途: Supabase 不可用时的降级方案                         │
│  - 受 _SESSION_ALLOW_FALLBACK 控制                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 关键文件列表及职责

### 2.1 核心 Session 模块

| 文件 | 职责 | 关键类/函数 |
|------|------|------------|
| [arena/session/base.py](arena/session/base.py) | 基础内存 SessionStore 实现 | `SessionStore` |
| [arena/session/supabase.py](arena/session/supabase.py) | Supabase 持久化 SessionStore 实现 | `SupabaseSessionStore` |
| [arena/state.py](arena/state.py) | 全局状态管理 | `AppState`, `get_state()` |

### 2.2 路由层

| 文件 | 职责 | 关键端点 |
|------|------|---------|
| [arena/routes/battle.py](arena/routes/battle.py) | 投票前多轮对话 | `/api/arena/battle`, `/api/arena/continue` |
| [arena/routes/vote.py](arena/routes/vote.py) | 投票逻辑 | `/api/arena/vote` |
| [arena/routes/chat.py](arena/routes/chat.py) | 投票后对话 | `/api/arena/chat`, `/api/arena/chat/history` |
| [arena/routes/sessions.py](arena/routes/sessions.py) | 管理员 session 管理 | `/api/arena/sessions/*` |

### 2.3 服务层

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| [arena/services/battle.py](arena/services/battle.py) | Battle SSE 流式生成 | `_battle_sse()`, `_generate_stream_for_side()` |
| [arena/services/chat.py](arena/services/chat.py) | 投票后聊天服务 | `build_post_vote_context()`, `post_vote_event_stream()` |
| [arena/services/reconstruction.py](arena/services/reconstruction.py) | 从 votes 表重建 session | `_reconstruct_session_from_votes()` |

### 2.4 数据库层

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| [arena/db/votes.py](arena/db/votes.py) | votes 表操作 | `_insert_vote_supabase()`, `_update_vote_supabase()`, `_fetch_vote_record()` |
| [arena/db/post_vote.py](arena/db/post_vote.py) | post_vote_turns 表操作 | `_insert_post_vote_turn_supabase()`, `_fetch_post_vote_turns_supabase()` |

### 2.5 配置和初始化

| 文件 | 职责 | 关键配置 |
|------|------|---------|
| [arena/config.py](arena/config.py) | Session 配置 | `_SESSION_TTL_SEC`, `_SESSION_STORE_MODE`, `_SESSION_ALLOW_FALLBACK` |
| [arena/main.py](arena/main.py) | 应用启动和 session_store 初始化 | `create_app()`, `_startup()` |

---

## 3. Session 生命周期完整流程

### 3.1 Session 创建流程

```
用户发起 /api/arena/battle
        │
        ▼
[arena/routes/battle.py] battle()
        │
        ├─> 生成 session_id (UUID)
        ├─> 情感分类 + 模板选择
        ├─> 随机分配 left/right arms (baseline/empathy)
        ├─> 并行生成两侧回复 (SSE 流式)
        │
        ▼
[arena/services/battle.py] _battle_sse()
        │
        ├─> 构建初始 session_data
        │   {
        │     session_id, prompt,
        │     left: {arm, model_id, text, context},
        │     right: {arm, model_id, text, context},
        │     emotion, intensity, support_type,
        │     template_id, strategy_name,
        │     conversation_history: [],
        │     turn_count: 0,
        │     version: 0
        │   }
        │
        ▼
[arena/session/supabase.py] put(session_id, session_data)
        │
        ├─> 初始化必需字段
        │   - conversation_history: []
        │   - turn_count: 0
        │   - version: 0
        │   - left.context: []
        │   - right.context: []
        │
        ├─> 尝试 Supabase 持久化
        │   └─> _supabase_cas_update(session_id, 0, session_data, create_if_not_exists=True)
        │       ├─> POST /rest/v1/arena_sessions
        │       ├─> 成功: 更新本地缓存
        │       └─> 失败: 降级到内存存储 (如果 _SESSION_ALLOW_FALLBACK=true)
        │
        ▼
[arena/session/supabase.py] append_turn(session_id, prompt, left_text, right_text)
        │
        ├─> 获取当前 session
        ├─> 构建单侧上下文 (left.context, right.context)
        │   - 添加用户消息到两侧
        │   - 添加模型回复到对应侧
        │
        ├─> 更新 conversation_history
        │   {
        │     turn: 1,
        │     user: prompt,
        │     reply_a: left_text,
        │     reply_b: right_text,
        │     timestamp: ISO8601
        │   }
        │
        ├─> CAS 更新 Supabase
        │   └─> _supabase_cas_update(session_id, current_version, new_session_data)
        │       ├─> PATCH /rest/v1/arena_sessions?version=eq.{old_version}
        │       ├─> 成功: 更新本地缓存
        │       └─> 失败: 重试 (最多3次) 或降级到内存
        │
        ▼
返回 SSE 流给前端
```

### 3.2 投票前多轮对话流程

```
用户发起 /api/arena/continue
        │
        ▼
[arena/routes/battle.py] continue_battle()
        │
        ├─> 验证 session_id
        ├─> 检查 session 是否已投票 (sess.get("winner") is None)
        ├─> 获取当前 turn_count
        │
        ├─> 重新分类情感 (带对话历史上下文)
        │   └─> _safe_classify_emotion(user_message, conversation_history=history)
        │
        ├─> 获取单侧上下文
        │   └─> _SESSION_STORE._build_side_context(session, 'left')
        │   └─> _SESSION_STORE._build_side_context(session, 'right')
        │
        ├─> Token 管理 (H-02 fix)
        │   - 计算上下文 token 数
        │   - 超过限制时从开头截断
        │
        ├─> 并行生成两侧回复 (SSE 流式)
        │
        ▼
[arena/session/supabase.py] append_turn(session_id, user_message, left_text, right_text)
        │
        ├─> 获取当前 session (带版本号)
        ├─> 构建新 session_data
        │   - 更新 left.context, right.context
        │   - 追加到 conversation_history
        │   - turn_count += 1
        │   - version += 1
        │
        ├─> CAS 更新 (最多3次重试)
        │   └─> _supabase_cas_update(session_id, current_version, new_session_data)
        │
        ▼
返回 SSE 流给前端
```

### 3.3 投票流程

```
用户发起 /api/arena/vote
        │
        ▼
[arena/routes/vote.py] vote()
        │
        ├─> 获取 session
        ├─> 获取 conversation_history 和 turn_count
        │   └─> _SESSION_STORE.get_conversation_history(session_id)
        │   └─> _SESSION_STORE.get_turn_count(session_id)
        │
        ├─> 构建 vote row
        │   {
        │     session_id, user_id, prompt,
        │     reply_a, reply_b,
        │     model_config, user_vote,
        │     conversation_history, turn_count,
        │     winner_type
        │   }
        │
        ├─> 插入 votes 表
        │   └─> _insert_vote_supabase(row)
        │       ├─> 检查是否已存在 (session_id 唯一约束)
        │       ├─> POST /rest/v1/votes
        │       └─> 返回 vote_id
        │
        ├─> 更新 session (关键步骤!)
        │   └─> _SESSION_STORE.update(session_id, {
        │         vote_id: vote_id,
        │         winner: winner_for_session
        │       })
        │       └─> _supabase_cas_update(session_id, current_version, new_session_data)
        │
        ├─> 后台任务: AI 评估
        │   └─> _judge_with_ai() -> _update_vote_supabase()
        │
        └─> 后台任务: 上传快照到 Drive
            └─> _upload_snapshot_to_drive()
        │
        ▼
返回投票结果给前端
```

### 3.4 投票后对话流程

```
用户发起 /api/arena/chat
        │
        ▼
[arena/routes/chat.py] post_vote_chat()
        │
        ├─> 验证 session_id 和 user_message
        │
        ├─> 获取 session (多路径)
        │   ├─> 路径1: vote_id 直接查询
        │   │   └─> _fetch_vote_record(vote_id) -> 构建最小 session
        │   ├─> 路径2: session_store.get(session_id)
        │   └─> 路径3: 从 votes 表重建
        │       └─> _reconstruct_session_from_votes(session_id)
        │
        ├─> 检查是否已投票 (sess.get("winner") is not None)
        │
        ├─> 构建上下文
        │   └─> build_post_vote_context(sess, session_id, user_message)
        │       ├─> 获取 pre-vote history (session.conversation_history)
        │       ├─> 获取 post-vote history (post_vote_turns 表)
        │       ├─> 合并历史用于情感分类
        │       ├─> 重新分类情感
        │       ├─> 构建消息列表 (只包含 winner 侧的回复)
        │       └─> Token 管理 (截断超长历史)
        │
        ├─> 流式生成回复
        │   └─> post_vote_event_stream(ctx, session_id, user_message, is_disconnected)
        │       ├─> 生成回复 (SSE 流式)
        │       ├─> 写入 post_vote_turns 表
        │       │   └─> _insert_post_vote_turn_supabase()
        │       │       ├─> POST /rest/v1/post_vote_turns
        │       │       ├─> UNIQUE(vote_id, turn_index) 冲突重试
        │       │       └─> 最多8次重试
        │       └─> 返回 finish frame
        │
        ▼
返回 SSE 流给前端
```

### 3.5 Session 读取流程

```
调用 _SESSION_STORE.get(session_id)
        │
        ▼
[arena/session/supabase.py] get(session_id)
        │
        ├─> L1: 检查本地缓存
        │   └─> _cache_get(session_id)
        │       ├─> 命中且未过期 -> 返回
        │       └─> 未命中 -> 继续
        │
        ├─> L2: 查询 Supabase
        │   └─> _supabase_get(session_id)
        │       ├─> GET /rest/v1/arena_sessions?session_id=eq.{id}&deleted_at=is.null
        │       ├─> 检查 TTL (expires_at)
        │       ├─> 过期 -> 软删除并返回 None
        │       └─> 有效 -> 更新缓存并返回
        │
        └─> L3: 降级到内存存储
            └─> 检查 _sessions 字典
                ├─> 检查 TTL (_ts)
                └─> 返回或删除过期 session
```

### 3.6 Session 更新流程

```
调用 _SESSION_STORE.update(session_id, patch)
        │
        ▼
[arena/session/supabase.py] update(session_id, patch)
        │
        ├─> 获取当前 session (带版本号)
        │   └─> get(session_id)
        │
        ├─> 应用 patch
        │   └─> new_session_data = {**session, **patch}
        │
        ├─> CAS 更新 Supabase (最多3次重试)
        │   └─> _supabase_cas_update(session_id, current_version, new_session_data)
        │       ├─> PATCH /rest/v1/arena_sessions?version=eq.{old_version}
        │       ├─> 成功: 更新缓存
        │       ├─> 失败: 重试或降级到内存
        │
        └─> 降级到内存存储
            └─> 更新 _sessions 字典
```

### 3.7 Session 删除流程

```
调用 _SESSION_STORE.soft_delete(session_id)
        │
        ▼
[arena/session/supabase.py] soft_delete(session_id)
        │
        ├─> 检查 Supabase 可用性
        │
        ├─> 软删除 Supabase 记录
        │   └─> _supabase_soft_delete_internal(session_id)
        │       ├─> PATCH /rest/v1/arena_sessions?session_id=eq.{id}
        │       ├─> {deleted_at: NOW()}
        │       └─> 清除本地缓存
        │
        └─> 返回成功/失败
```

---

## 4. 投票后 Session 状态变化

### 4.1 投票前的 Session 结构

```json
{
  "session_id": "uuid",
  "prompt": "用户初始问题",
  "left": {
    "arm": "baseline",
    "model_id": "gpt-4",
    "text": "baseline 回复",
    "context": [
      {"role": "system", "content": "..."},
      {"role": "user", "content": "用户初始问题"},
      {"role": "assistant", "content": "baseline 回复"}
    ]
  },
  "right": {
    "arm": "empathy",
    "model_id": "gpt-4",
    "text": "empathy 回复",
    "context": [
      {"role": "system", "content": "..."},
      {"role": "user", "content": "用户初始问题"},
      {"role": "assistant", "content": "empathy 回复"}
    ]
  },
  "emotion": "sadness",
  "intensity": "medium",
  "support_type": "emotional",
  "template_id": "sadness_medium_1",
  "strategy_name": "共情回应策略",
  "conversation_history": [
    {
      "turn": 1,
      "user": "用户初始问题",
      "reply_a": "baseline 回复",
      "reply_b": "empathy 回复",
      "timestamp": "2026-02-11T10:00:00Z"
    }
  ],
  "turn_count": 1,
  "version": 1,
  "created_at": "2026-02-11T10:00:00Z"
}
```

### 4.2 投票后的 Session 结构

```json
{
  "session_id": "uuid",
  "prompt": "用户初始问题",
  "left": {
    "arm": "baseline",
    "model_id": "gpt-4",
    "text": "baseline 回复",
    "context": [...]
  },
  "right": {
    "arm": "empathy",
    "model_id": "gpt-4",
    "text": "empathy 回复",
    "context": [...]
  },
  "emotion": "sadness",
  "intensity": "medium",
  "support_type": "emotional",
  "template_id": "sadness_medium_1",
  "strategy_name": "共情回应策略",
  "conversation_history": [...],
  "turn_count": 1,
  "version": 2,
  "created_at": "2026-02-11T10:00:00Z",

  // === 投票后新增字段 ===
  "vote_id": "vote-uuid",           // 投票记录 ID
  "winner": "right",                // 获胜侧 (left/right)
  "ai_scores": {                    // AI 评估分数 (后台异步更新)
    "model_a": 0.85,
    "model_b": 0.92
  }
}
```

### 4.3 投票后数据持久化路径

```
投票操作
    │
    ├─> votes 表 (arena/db/votes.py)
    │   └─> _insert_vote_supabase(row)
    │       ├─> session_id (UNIQUE)
    │       ├─> conversation_history (JSONB)
    │       ├─> turn_count (INTEGER)
    │       ├─> user_vote, model_config
    │       └─> 返回 vote_id
    │
    ├─> arena_sessions 表 (arena/session/supabase.py)
    │   └─> _SESSION_STORE.update(session_id, {vote_id, winner})
    │       └─> _supabase_cas_update()
    │           ├─> 更新 session_data JSONB
    │           └─> version += 1
    │
    └─> post_vote_turns 表 (arena/db/post_vote.py)
        └─> 投票后每次对话调用
            └─> _insert_post_vote_turn_supabase()
                ├─> vote_id (FK)
                ├─> turn_index (UNIQUE with vote_id)
                ├─> user_message, assistant_message
                └─> 冲突重试机制
```

---

## 5. Session 持久化关键代码路径

### 5.1 Session 创建持久化

**入口点：** [arena/routes/battle.py](arena/routes/battle.py#L378-L418)

```python
# 构建初始 session_data
session_data = {
    "session_id": session_id,
    "prompt": prompt,
    "left": {...},
    "right": {...},
    "conversation_history": [],
    "turn_count": 0,
    "version": 0
}

# 持久化到 Supabase
await _SESSION_STORE.put(session_id, session_data)

# 追加第一轮对话
await _SESSION_STORE.append_turn(session_id, prompt, left_text, right_text)
```

**持久化实现：** [arena/session/supabase.py](arena/session/supabase.py#L165-L210)

```python
async def put(self, session_id: str, value: Dict[str, Any]) -> None:
    # 初始化必需字段
    if "conversation_history" not in value:
        value["conversation_history"] = []
    if "turn_count" not in value:
        value["turn_count"] = 0
    if "version" not in value:
        value["version"] = 0

    # 尝试 Supabase 持久化
    if self._is_supabase_available():
        success = await self._supabase_cas_update(
            session_id, 0, value, create_if_not_exists=True
        )
        if success:
            self._cache_set(session_id, value)
            return
        elif not self._allow_fallback:
            return

    # 降级到内存存储
    async with self._lock:
        value["_ts"] = time.time()
        self._sessions[session_id] = value
        await self._gc_locked()
```

### 5.2 投票后 Session 更新持久化

**入口点：** [arena/routes/vote.py](arena/routes/vote.py#L165-L175)

```python
# 插入 vote 记录
vote_id = await _insert_vote_supabase(row)

# 更新 session (关键步骤!)
if vote_id:
    winner_for_session = vote_value
    sess["vote_id"] = vote_id
    sess["winner"] = winner_for_session
    await _SESSION_STORE.update(session_id, {
        "vote_id": vote_id,
        "winner": winner_for_session
    })
```

**持久化实现：** [arena/session/supabase.py](arena/session/supabase.py#L345-L395)

```python
async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
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
                self._cache_set(session_id, new_session_data)
                return
            elif not self._allow_fallback:
                return

        # 4. 重试或降级
        if self._is_supabase_available() and attempt < max_retries - 1:
            await asyncio.sleep(0.1 * (attempt + 1))
            continue

        # 降级到内存存储
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

### 5.3 CAS 更新实现

**核心实现：** [arena/session/supabase.py](arena/session/supabase.py#L115-L163)

```python
async def _supabase_cas_update(
    self,
    session_id: str,
    old_version: int,
    new_data: Dict[str, Any],
    create_if_not_exists: bool = False
) -> bool:
    if not self._is_supabase_available():
        return False

    # 准备更新数据
    update_data = {
        "session_data": new_data,
        "version": old_version + 1,
        "expires_at": (datetime.now() + timedelta(seconds=_SESSION_TTL_SEC)).isoformat(),
        "updated_at": _utc_now_iso()
    }

    if create_if_not_exists:
        update_data["session_id"] = session_id

    # 构建查询条件
    conditions = [f"session_id=eq.{session_id}"]
    if create_if_not_exists:
        conditions.append("deleted_at=is.null")
    else:
        conditions.append(f"version=eq.{old_version}")
        conditions.append("deleted_at=is.null")

    query = "&".join(conditions)
    url = f"{self._supabase_url}/rest/v1/arena_sessions?{query}"
    headers = self._get_headers()

    try:
        async with httpx.AsyncClient() as client:
            if create_if_not_exists:
                resp = await client.post(url, headers=headers, json=update_data, timeout=self._request_timeout)
            else:
                resp = await client.patch(url, headers=headers, json=update_data, timeout=self._request_timeout)

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

---

## 6. 可能导致持久化失败的代码位置

### 6.1 网络连接问题

**位置：** [arena/session/supabase.py](arena/session/supabase.py#L115-L163)

```python
async def _supabase_cas_update(...) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(...)  # 或 patch
            if resp.status_code < 400:
                return True
            # 失败处理
            return False
    except Exception as exc:
        # 网络异常、超时等
        print(_json_dumps({...}), file=sys.stderr)
        return False
```

**风险：**
- Supabase 服务不可用
- 网络超时 (REQUEST_TIMEOUT=60s)
- DNS 解析失败

**缓解措施：**
- 降级到内存存储 (如果 _SESSION_ALLOW_FALLBACK=true)
- 重试机制 (update/append_turn 最多3次)

### 6.2 版本冲突 (CAS 失败)

**位置：** [arena/session/supabase.py](arena/session/supabase.py#L115-L163)

```python
if resp.status_code == 409 or "version" in (resp.text or "").lower():
    error_details["reason"] = "version_conflict"
```

**风险：**
- 并发更新导致版本号不匹配
- 重试次数耗尽后降级到内存

**缓解措施：**
- 重试机制 (最多3次)
- 指数退避 (0.1s, 0.2s, 0.3s)

### 6.3 数据库约束冲突

**位置：** [arena/db/votes.py](arena/db/votes.py#L68-L95)

```python
async def _insert_vote_supabase(row: Dict[str, Any]) -> Optional[str]:
    # 检查是否已存在
    existing = await _fetch_vote_id_by_session_id_supabase(session_id)
    if existing:
        return existing

    # 插入
    resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)

    if resp.status_code >= 400:
        # UNIQUE(session_id) 冲突
        if _looks_like_unique_violation(resp):
            existing = await _fetch_vote_id_by_session_id_supabase(session_id)
            if existing:
                return existing
        raise RuntimeError(f"supabase insert failed {resp.status_code}: {resp.text}")
```

**风险：**
- session_id 唯一约束冲突
- 并发投票请求

**缓解措施：**
- 幂等性设计 (先查询再插入)
- 冲突时返回现有 vote_id

### 6.4 投票后对话持久化冲突

**位置：** [arena/db/post_vote.py](arena/db/post_vote.py#L18-L68)

```python
async def _insert_post_vote_turn_supabase(...) -> str:
    try:
        async with httpx.AsyncClient() as client:
            resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                # UNIQUE(vote_id, turn_index) 冲突
                if _looks_like_unique_violation(resp):
                    return "conflict"
                return "error"
            return "ok"
    except Exception as exc:
        return "error"
```

**位置：** [arena/services/chat.py](arena/services/chat.py#L200-L230)

```python
# 写入数据库 (并发安全): 重试 UNIQUE(vote_id, turn_index) 冲突
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

**风险：**
- 并发发送消息导致 turn_index 冲突
- 重试次数耗尽

**缓解措施：**
- 最多8次重试
- 随机退避 (0.05-0.1s)

### 6.5 Session 重建失败

**位置：** [arena/services/reconstruction.py](arena/services/reconstruction.py#L10-L95)

```python
async def _reconstruct_session_from_votes(session_id: str) -> Optional[Dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params={"session_id": f"eq.{session_id}", ...},
                headers={...},
            )
            if resp.status_code != 200:
                return None

            votes = resp.json()
            if not votes:
                return None

            # 重建 session
            vote = votes[0]
            # ...
            return reconstructed_session
    except Exception as e:
        print(f"Failed to reconstruct session: {e}", file=sys.stderr)
        return None
```

**风险：**
- Supabase 不可用
- votes 表中没有对应记录
- 网络超时

**缓解措施：**
- 返回 None，前端显示 404
- 多路径获取 session (vote_id 直接查询)

### 6.6 配置问题

**位置：** [arena/main.py](arena/main.py#L48-L72)

```python
@application.on_event("startup")
async def _startup() -> None:
    state = get_state()
    store_mode = os.environ.get("ARENA_SESSION_STORE", "memory").lower()
    if store_mode == "supabase":
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "session_store_config_invalid",
                "reason": "missing_supabase_env",
                "SUPABASE_URL": bool(SUPABASE_URL),
                "SUPABASE_SERVICE_KEY": bool(SUPABASE_SERVICE_KEY),
            }), file=sys.stderr)
            # 保持内存存储作为降级方案
        else:
            try:
                ss = SupabaseSessionStore()
                state.session_store = ss
                print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "supabase"}))
            except Exception as exc:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "session_store_init_failed",
                    "error": str(exc)
                }), file=sys.stderr)
                state.session_store = SessionStore()
```

**风险：**
- SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未配置
- SupabaseSessionStore 初始化失败

**缓解措施：**
- 自动降级到内存存储
- 启动时记录详细日志

---

## 7. 关键配置参数

### 7.1 Session 配置

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|---------|--------|------|
| 存储模式 | `ARENA_SESSION_STORE` | `memory` | `memory` 或 `supabase` |
| 允许降级 | `ARENA_ALLOW_FALLBACK` | `true` | Supabase 失败时是否降级到内存 |
| Session TTL | `ARENA_SESSION_TTL_SEC` | `7200` | Session 过期时间 (秒) |
| 最大 Session 数 | `ARENA_MAX_SESSIONS` | `2000` | 内存存储最大 session 数 |
| 缓存 TTL | `ARENA_CACHE_TTL_SEC` | `60` | 本地缓存过期时间 (秒) |

### 7.2 Supabase 配置

| 配置项 | 环境变量 | 必需 | 说明 |
|--------|---------|------|------|
| Supabase URL | `SUPABASE_URL` | 是 | Supabase 项目 URL |
| Service Key | `SUPABASE_SERVICE_KEY` | 是 | Supabase 服务角色密钥 |

### 7.3 超时配置

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|---------|--------|------|
| 请求超时 | `ARENA_REQUEST_TIMEOUT` | `60` | HTTP 请求超时 (秒) |
| 最大重试 | `ARENA_MAX_RETRIES` | `3` | HTTP 请求最大重试次数 |
| 退避基数 | `ARENA_BACKOFF_BASE` | `1` | 指数退避基数 (秒) |

---

## 8. 总结和建议

### 8.1 架构优势

1. **多层存储架构**：本地缓存 + Supabase 持久化 + 内存降级，提供高可用性
2. **CAS 乐观锁**：防止并发更新导致的数据不一致
3. **软删除支持**：保留数据可恢复性
4. **幂等性设计**：投票操作支持重试
5. **多路径获取**：session 可从多个来源获取 (缓存、Supabase、votes 表)

### 8.2 潜在风险

1. **Supabase 单点故障**：如果 Supabase 不可用且降级被禁用，session 将无法持久化
2. **版本冲突**：高并发场景下可能导致重试次数耗尽
3. **内存限制**：Heroku dyno 内存有限，大量 session 可能导致 OOM
4. **数据一致性**：Supabase 和内存存储之间可能存在不一致

### 8.3 改进建议

1. **监控和告警**
   - 添加 Supabase 连接失败监控
   - 监控 CAS 冲突频率
   - 监控降级到内存的频率

2. **性能优化**
   - 考虑使用 Redis 替代本地缓存
   - 批量操作减少 Supabase 请求次数
   - 优化 session_data JSONB 结构

3. **容错增强**
   - 增加 Supabase 连接池
   - 实现断路器模式
   - 添加更详细的错误日志

4. **数据一致性**
   - 定期同步内存和 Supabase 数据
   - 实现数据校验机制
   - 添加数据修复工具

---

## 附录：关键代码位置索引

| 功能 | 文件 | 行号 |
|------|------|------|
| Session 创建 | [arena/routes/battle.py](arena/routes/battle.py#L378-L418) | 378-418 |
| 投票逻辑 | [arena/routes/vote.py](arena/routes/vote.py#L1-L250) | 1-250 |
| 投票后对话 | [arena/routes/chat.py](arena/routes/chat.py#L1-L250) | 1-250 |
| Session 持久化 | [arena/session/supabase.py](arena/session/supabase.py#L165-L210) | 165-210 |
| CAS 更新 | [arena/session/supabase.py](arena/session/supabase.py#L115-L163) | 115-163 |
| Vote 插入 | [arena/db/votes.py](arena/db/votes.py#L68-L95) | 68-95 |
| Post-vote turn 插入 | [arena/db/post_vote.py](arena/db/post_vote.py#L18-L68) | 18-68 |
| Session 重建 | [arena/services/reconstruction.py](arena/services/reconstruction.py#L10-L95) | 10-95 |
| 启动初始化 | [arena/main.py](arena/main.py#L48-L72) | 48-72 |
