# eChat Arena 数据库 Schema 和持久化机制分析

**生成日期**: 2026-02-11  
**分析范围**: migrations/ 目录、arena/db/、arena/session/、arena/routes/

---

## 1. 数据库表结构概览

### 1.1 核心表关系图

```
┌─────────────────┐
│   votes         │
│  (投票记录)      │
└────────┬────────┘
         │ session_id
         │
         ▼
┌─────────────────┐
│ arena_sessions  │
│  (会话存储)      │
└─────────────────┘

┌─────────────────┐
│   votes         │
└────────┬────────┘
         │ vote_id
         │
         ▼
┌─────────────────┐
│ post_vote_turns │
│ (投票后对话)     │
└─────────────────┘

┌─────────────────┐
│draft_conversations│
│  (草稿对话)      │
└─────────────────┘

┌─────────────────┐
│ admin_sessions  │
│ (管理员会话)     │
└─────────────────┘

┌─────────────────┐
│ model_configs   │
│ (模型配置)       │
└─────────────────┘

┌─────────────────┐
│admin_audit_log  │
│ (审计日志)       │
└─────────────────┘
```

---

## 2. 详细表结构

### 2.1 votes 表 - 核心投票记录表

**用途**: 存储用户投票记录和完整的对话历史

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | UUID | PRIMARY KEY | 投票记录唯一标识 |
| `session_id` | TEXT | UNIQUE | 会话ID（幂等性键） |
| `user_id` | UUID | NULLABLE | 用户ID |
| `user_email` | TEXT | NULLABLE | 用户邮箱 |
| `prompt` | TEXT | NOT NULL | 用户输入 |
| `reply_a` | TEXT | NOT NULL | 模型A回复（baseline） |
| `reply_b` | TEXT | NOT NULL | 模型B回复（strategy） |
| `model_config` | JSONB | NOT NULL | 模型配置信息 |
| `user_vote` | TEXT | NOT NULL | 用户投票值 |
| `user_tags` | JSONB | NULLABLE | 用户标签 |
| `user_comment` | TEXT | NULLABLE | 用户评论 |
| `ai_scores` | JSONB | NULLABLE | AI评分 |
| `client_info` | JSONB | NULLABLE | 客户端信息 |
| `base_model_name` | TEXT | NULLABLE | 基础模型名称 |
| `template_id` | TEXT | NOT NULL | 模板ID |
| `strategy_name` | TEXT | NOT NULL | 策略名称 |
| `conversation_history` | JSONB | DEFAULT '[]' | 完整对话历史 |
| `turn_count` | INTEGER | DEFAULT 1 | 对话轮数 |
| `winner_type` | VARCHAR(20) | NULLABLE | 获胜者类型 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**:
- `idx_votes_session_id` - session_id 查询
- `idx_votes_turn_count` - turn_count 查询
- `idx_votes_conversation_history_gin` - JSONB 查询优化
- `idx_votes_user_turn` - user_id + turn_count 复合索引
- `idx_votes_created_at` - 时间排序
- `idx_votes_winner_type` - winner_type 分组

**约束**:
- `votes_session_id_unique` - UNIQUE(session_id) - 幂等性保证

**数据示例**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "sess_abc123",
  "user_id": "user_456",
  "prompt": "我感到很焦虑",
  "reply_a": "我理解你的感受...",
  "reply_b": "听起来你现在很焦虑...",
  "model_config": {
    "left": {"arm": "baseline", "model_id": "gpt-4"},
    "right": {"arm": "empathy", "model_id": "gpt-4"},
    "template_id": "anxiety_high",
    "strategy_name": "empathetic_validation"
  },
  "user_vote": "model_b",
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
  "winner_type": "strategy"
}
```

---

### 2.2 post_vote_turns 表 - 投票后对话轮次表

**用途**: 存储投票后继续对话的轮次，避免污染 votes 表

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | UUID | PRIMARY KEY | 轮次记录唯一标识 |
| `vote_id` | UUID | NOT NULL | 关联的投票记录ID |
| `user_id` | UUID | NULLABLE | 用户ID |
| `winner_side` | TEXT | NOT NULL | 获胜方（left/right） |
| `turn_index` | INTEGER | NOT NULL | 轮次索引（从1开始） |
| `user_message` | TEXT | NOT NULL | 用户消息 |
| `assistant_message` | TEXT | NOT NULL | 助手回复 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**:
- `idx_post_vote_turns_vote_id_turn` - vote_id + turn_index 复合索引
- `idx_post_vote_turns_vote_id_created` - vote_id + created_at 复合索引
- `idx_post_vote_turns_user_id` - user_id 查询（部分索引）

**约束**:
- `unique_vote_turn` - UNIQUE(vote_id, turn_index) - 防止重复轮次

**RLS 策略**:
- Service role: 完全访问
- Authenticated: 只能读取自己的记录
- Anonymous: 可以读取（临时策略）

**数据示例**:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "vote_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user_456",
  "winner_side": "right",
  "turn_index": 1,
  "user_message": "你能给我一些建议吗？",
  "assistant_message": "当然可以。首先...",
  "created_at": "2026-02-11T10:05:00Z"
}
```

---

### 2.3 arena_sessions 表 - 会话存储表

**用途**: 持久化会话数据，支持软删除和乐观锁

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `session_id` | TEXT | PRIMARY KEY | 会话ID |
| `session_data` | JSONB | NOT NULL | 会话数据 |
| `version` | BIGINT | NOT NULL | 乐观锁版本号 |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 过期时间 |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | 软删除时间 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL | 更新时间 |

**索引**:
- `idx_arena_sessions_expires_at` - TTL 清理
- `idx_arena_sessions_deleted_at` - 软删除查询

**触发器**:
- `trigger_update_updated_at` - 自动更新 updated_at

**函数**:
- `cleanup_expired_sessions()` - 清理过期会话
- `cleanup_old_deleted_sessions(days_threshold)` - 清理旧软删除会话

**session_data 结构**:
```json
{
  "session_id": "sess_abc123",
  "prompt": "我感到很焦虑",
  "left": {
    "arm": "baseline",
    "model_id": "gpt-4",
    "text": "我理解你的感受...",
    "context": [
      {"role": "user", "content": "我感到很焦虑"},
      {"role": "assistant", "content": "我理解你的感受..."}
    ]
  },
  "right": {
    "arm": "empathy",
    "model_id": "gpt-4",
    "text": "听起来你现在很焦虑...",
    "context": [
      {"role": "user", "content": "我感到很焦虑"},
      {"role": "assistant", "content": "听起来你现在很焦虑..."}
    ]
  },
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
  "version": 1,
  "template_id": "anxiety_high",
  "strategy_name": "empathetic_validation",
  "emotion": "anxiety",
  "intensity": "high",
  "support_type": "emotional"
}
```

---

### 2.4 draft_conversations 表 - 草稿对话表

**用途**: 保存未投票的对话，允许用户恢复

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | UUID | PRIMARY KEY | 草稿记录唯一标识 |
| `session_id` | TEXT | UNIQUE | 会话ID |
| `user_id` | UUID | FOREIGN KEY | 用户ID |
| `user_email` | TEXT | NULLABLE | 用户邮箱 |
| `prompt` | TEXT | NOT NULL | 用户输入 |
| `reply_a` | TEXT | NOT NULL | 模型A回复 |
| `reply_b` | TEXT | NOT NULL | 模型B回复 |
| `model_a` | TEXT | NOT NULL | 模型A名称 |
| `model_b` | TEXT | NOT NULL | 模型B名称 |
| `conversation_history` | JSONB | NULLABLE | 对话历史 |
| `turn_count` | INT | DEFAULT 1 | 轮数 |
| `model_config` | JSONB | NULLABLE | 模型配置 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL | 更新时间 |

**索引**:
- `idx_draft_user_id` - 用户查询
- `idx_draft_session_id` - 会话查询

**RLS 策略**:
- 用户只能访问自己的草稿
- Service role 完全访问

---

### 2.5 admin_sessions 表 - 管理员会话表

**用途**: 持久化管理员登录令牌，替代内存存储

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | UUID | PRIMARY KEY | 会话记录唯一标识 |
| `token` | TEXT | UNIQUE | 访问令牌 |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 过期时间 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |
| `ip_address` | TEXT | NULLABLE | IP地址 |
| `user_agent` | TEXT | NULLABLE | 用户代理 |

**索引**:
- `idx_admin_sessions_token` - 令牌查询
- `idx_admin_sessions_expires_at` - 过期清理

**函数**:
- `cleanup_expired_admin_sessions()` - 清理过期会话

---

### 2.6 model_configs 表 - 模型配置表

**用途**: 动态管理模型配置

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | UUID | PRIMARY KEY | 配置记录唯一标识 |
| `model_key` | TEXT | UNIQUE | 模型键 |
| `model_name` | TEXT | NOT NULL | 模型名称 |
| `api_type` | TEXT | NOT NULL | API类型 |
| `api_base` | TEXT | NULLABLE | API基础地址 |
| `api_key_encrypted` | TEXT | NULLABLE | 加密API密钥 |
| `is_enabled` | BOOLEAN | NOT NULL | 是否启用 |
| `anony_only` | BOOLEAN | NOT NULL | 仅匿名 |
| `weight` | INTEGER | NOT NULL | 权重 |
| `description` | TEXT | NULLABLE | 描述 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL | 更新时间 |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | 软删除时间 |
| `is_default` | BOOLEAN | NOT NULL | 是否默认 |

**索引**:
- `idx_model_configs_model_key` - model_key 查询
- `idx_model_configs_is_enabled` - 启用状态查询（部分索引）
- `idx_model_configs_deleted_at` - 软删除查询
- `idx_model_configs_single_default` - 单一默认模型（部分唯一索引）

**触发器**:
- `trigger_model_configs_updated_at` - 自动更新 updated_at

---

### 2.7 admin_audit_log 表 - 审计日志表

**用途**: 记录所有管理员操作

**字段**:
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | UUID | PRIMARY KEY | 日志记录唯一标识 |
| `action_type` | TEXT | NOT NULL | 操作类型 |
| `target_type` | TEXT | NULLABLE | 目标类型 |
| `target_id` | TEXT | NULLABLE | 目标ID |
| `details` | JSONB | DEFAULT '{}' | 详细信息 |
| `ip_address` | TEXT | NULLABLE | IP地址 |
| `user_agent` | TEXT | NULLABLE | 用户代理 |
| `created_at` | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**:
- `idx_admin_audit_log_action` - 操作类型查询
- `idx_admin_audit_log_created` - 时间查询

---

## 3. 表关系和约束

### 3.1 主要关系

```
votes (1) ──< (N) post_vote_turns
  │
  └── session_id ──> arena_sessions (1)

draft_conversations (N) ──> auth.users (1)
  │
  └── user_id (FK)

model_configs (N) ──> (无外键，独立管理)
```

### 3.2 关键约束

| 约束名 | 表 | 字段 | 类型 | 用途 |
|--------|-----|------|------|------|
| `votes_session_id_unique` | votes | session_id | UNIQUE | 幂等性保证 |
| `unique_vote_turn` | post_vote_turns | (vote_id, turn_index) | UNIQUE | 防止重复轮次 |
| `model_configs_model_key_unique` | model_configs | model_key | UNIQUE | 模型键唯一 |
| `idx_model_configs_single_default` | model_configs | is_default | PARTIAL UNIQUE | 单一默认模型 |
| `draft_conversations_user_id_fkey` | draft_conversations | user_id | FOREIGN KEY | 用户关联 |

### 3.3 外键约束

**注意**: 大部分表之间没有强制外键约束，采用软关联设计：

1. **votes ↔ post_vote_turns**: 通过 `vote_id` 关联（无外键）
   - 原因: 灵活部署，避免级联删除问题

2. **votes ↔ arena_sessions**: 通过 `session_id` 关联（无外键）
   - 原因: session 可能被清理，votes 仍需保留

3. **draft_conversations ↔ auth.users**: 有外键约束
   - 原因: 需要确保用户存在

---

## 4. 对话消息的存储方式

### 4.1 投票前对话（Pre-vote）

#### 存储位置
1. **临时存储**: `arena_sessions.session_data`
2. **持久化**: `votes.conversation_history`

#### 数据结构

**arena_sessions.session_data**:
```json
{
  "conversation_history": [
    {
      "turn": 1,
      "user": "我感到很焦虑",
      "reply_a": "我理解你的感受...",
      "reply_b": "听起来你现在很焦虑...",
      "timestamp": "2026-02-11T10:00:00Z"
    },
    {
      "turn": 2,
      "user": "能给我一些建议吗？",
      "reply_a": "当然可以。首先...",
      "reply_b": "我明白。让我想想...",
      "timestamp": "2026-02-11T10:05:00Z"
    }
  ],
  "turn_count": 2,
  "left": {
    "context": [
      {"role": "user", "content": "我感到很焦虑"},
      {"role": "assistant", "content": "我理解你的感受..."},
      {"role": "user", "content": "能给我一些建议吗？"},
      {"role": "assistant", "content": "当然可以。首先..."}
    ]
  },
  "right": {
    "context": [
      {"role": "user", "content": "我感到很焦虑"},
      {"role": "assistant", "content": "听起来你现在很焦虑..."},
      {"role": "user", "content": "能给我一些建议吗？"},
      {"role": "assistant", "content": "我明白。让我想想..."}
    ]
  }
}
```

**votes.conversation_history**:
```json
[
  {
    "turn": 1,
    "user": "我感到很焦虑",
    "reply_a": "我理解你的感受...",
    "reply_b": "听起来你现在很焦虑...",
    "timestamp": "2026-02-11T10:00:00Z"
  },
  {
    "turn": 2,
    "user": "能给我一些建议吗？",
    "reply_a": "当然可以。首先...",
    "reply_b": "我明白。让我想想...",
    "timestamp": "2026-02-11T10:05:00Z"
  }
]
```

#### 存储流程

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
```

### 4.2 投票后对话（Post-vote）

#### 存储位置
**独立表**: `post_vote_turns`

#### 数据结构

**post_vote_turns**:
```json
[
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "vote_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_456",
    "winner_side": "right",
    "turn_index": 1,
    "user_message": "能给我一些建议吗？",
    "assistant_message": "当然可以。首先...",
    "created_at": "2026-02-11T10:05:00Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440002",
    "vote_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_456",
    "winner_side": "right",
    "turn_index": 2,
    "user_message": "谢谢你的建议",
    "assistant_message": "不客气！如果还有其他问题...",
    "created_at": "2026-02-11T10:10:00Z"
  }
]
```

#### 存储流程

```
用户投票后继续对话
  ↓
生成回复（流式）
  ↓
post_vote_turns 表 (每轮一条记录)
  ├─ vote_id (关联投票)
  ├─ turn_index (轮次索引)
  ├─ user_message (用户消息)
  └─ assistant_message (助手回复)
```

### 4.3 对话历史查询

#### 投票前历史
```python
# 从 arena_sessions 获取
history = await session_store.get_conversation_history(session_id)

# 从 votes 获取
vote_record = await _fetch_vote_record(vote_id)
history = vote_record.get("conversation_history", [])
```

#### 投票后历史
```python
# 从 post_vote_turns 获取
turns, error = await _fetch_post_vote_turns_supabase(vote_id)
```

#### 完整历史（投票前 + 投票后）
```python
# 投票前
pre_vote_history = vote_record.get("conversation_history", [])

# 投票后
post_vote_turns = await _fetch_post_vote_turns_supabase(vote_id)

# 合并
combined_history = []
for turn in pre_vote_history:
    combined_history.append({
        "user": turn.get("user"),
        "reply_a": turn.get("reply_a"),
        "reply_b": turn.get("reply_b")
    })

for turn in post_vote_turns:
    combined_history.append({
        "user": turn.get("user_message"),
        "reply_a": turn.get("assistant_message"),
        "reply_b": turn.get("assistant_message")  # 只有一侧
    })
```

---

## 5. 可能导致数据丢失的数据库操作

### 5.1 Session Store 的内存回退机制

**位置**: `arena/session/supabase.py`

**代码**:
```python
async def put(self, session_id: str, value: Dict[str, Any]) -> None:
    # Try Supabase first if available
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

**风险**:
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

---

### 5.2 CAS 更新失败后的回退

**位置**: `arena/session/supabase.py`

**代码**:
```python
async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
    max_retries = 3

    for attempt in range(max_retries):
        session = await self.get(session_id)
        if session is None:
            return

        new_session_data = {**session, **patch}
        current_version = session.get("version", 0)

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

**风险**:
- CAS 更新失败且不允许回退时，数据更新会丢失
- 版本冲突可能导致更新失败
- 重试次数有限（3次）

**影响范围**:
- 对话轮次更新
- 会话状态更新
- 投票信息更新

---

### 5.3 Post-vote Turn 保存失败

**位置**: `arena/services/chat.py`

**代码**:
```python
# Write to database (concurrency-safe): retry on UNIQUE(vote_id, turn_index) conflict
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

if saved_turn_index is not None:
    print(...)
else:
    print(..., file=sys.stderr)
    # 没有重试机制，数据丢失
```

**风险**:
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

---

### 5.4 Conversation History 的竞态条件

**位置**: `arena/session/base.py`

**代码**:
```python
async def append_turn(
    self,
    session_id: str,
    user_msg: str,
    reply_a: str,
    reply_b: str,
) -> bool:
    async with self._lock:
        item = self._sessions.get(session_id)
        if not item:
            return False

        current_version = item.get("version", 0)
        expected_turn = item.get("turn_count", 0) + 1

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

        # Create turn record
        turn_record = {
            "turn": expected_turn,
            "user": user_msg,
            "reply_a": reply_a,
            "reply_b": reply_b,
            "timestamp": _utc_now_iso(),
        }

        # Append to history
        item["conversation_history"].append(turn_record)
        item["turn_count"] = expected_turn
        item["version"] = current_version + 1
        item["_ts"] = time.time()

        self._sessions[session_id] = item
        await self._gc_locked()

        return True
```

**风险**:
- 并发更新时，`turn_count` 和 `conversation_history` 可能不一致
- 自动修复可能导致数据丢失
- 乐观锁版本冲突

**影响范围**:
- 对话轮次计数
- 对话历史完整性

---

### 5.5 投票时的异步更新

**位置**: `arena/routes/vote.py`

**代码**:
```python
# Schedule background evaluation with full conversation context
async def _bg_eval_and_update() -> None:
    try:
        p = sess.get("prompt", prompt)
        conv_history = sess.get("conversation_history", [])

        if not conv_history:
            try:
                fresh_sess = await _SESSION_STORE.get(session_id)
                if fresh_sess:
                    conv_history = fresh_sess.get("conversation_history", [])
            except Exception:
                conv_history = []

        if is_left_baseline:
            reply_key_a = "reply_a"
            reply_key_b = "reply_b"
        else:
            reply_key_a = "reply_b"
            reply_key_b = "reply_a"

        score_a = await _judge_with_ai(p, reply_a_text, conv_history, reply_key_a)
        score_b = await _judge_with_ai(p, reply_b_text, conv_history, reply_key_b)
        computed_scores = {"model_a": score_a, "model_b": score_b}

        await _SESSION_STORE.update(session_id, {"ai_scores": computed_scores})
        await _update_vote_supabase(session_id, computed_scores)

        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "vote_eval_complete",
            "session": session_id,
            "turn_count": len(conv_history) if conv_history else 1,
            "baseline_position": "left" if is_left_baseline else "right"
        }))
    except Exception as exc:
        print(f"[WARN] vote_eval failed session={session_id}: {exc}", file=sys.stderr)

background_tasks.add_task(_bg_eval_and_update)
```

**风险**:
- 后台任务失败时，`ai_scores` 会丢失
- 没有重试机制
- 异常处理只是打印日志

**影响范围**:
- AI 评分数据
- 模型性能分析

---

### 5.6 Session 过期清理

**位置**: `arena/session/base.py`

**代码**:
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
    items = sorted(self._sessions.items(), key=lambda kv: float(kv[1].get("_ts", 0)))
    for sid, _ in items[: max(0, len(items) - _MAX_SESSIONS)]:
        self._sessions.pop(sid, None)
```

**风险**:
- 内存中的 session 过期后会被清理
- 如果 Supabase 不可用，数据会永久丢失
- 大小限制可能导致未过期 session 被清理

**影响范围**:
- 未投票的会话
- 投票前的对话历史
- 草稿对话

---

## 6. 可能导致数据不一致的数据库操作

### 6.1 乐观锁版本冲突

**位置**: `arena/session/supabase.py`

**代码**:
```python
async def _supabase_cas_update(
    self,
    session_id: str,
    old_version: int,
    new_data: Dict[str, Any],
    create_if_not_exists: bool = False
) -> bool:
    # Prepare update data
    update_data = {
        "session_data": new_data,
        "version": old_version + 1,
        "expires_at": (datetime.now() + timedelta(seconds=_SESSION_TTL_SEC)).isoformat(),
        "updated_at": _utc_now_iso()
    }

    # Build query conditions
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

            # Check for version conflict (common case)
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

**风险**:
- 并发更新时，版本冲突会导致更新失败
- 没有自动合并机制
- 重试次数有限

**影响范围**:
- 会话数据更新
- 对话轮次追加
- 投票信息更新

---

### 6.2 幂等性检查的竞态条件

**位置**: `arena/db/votes.py`

**代码**:
```python
async def _insert_vote_supabase(row: Dict[str, Any]) -> Optional[str]:
    session_id = str(row.get("session_id") or "").strip()
    if not session_id:
        raise RuntimeError("supabase insert failed: missing session_id")

    existing = await _fetch_vote_id_by_session_id_supabase(session_id)
    if existing:
        return existing

    url = f"{SUPABASE_URL}/rest/v1/votes"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient() as client:
        resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)

        if resp.status_code >= 400:
            # If a concurrent request inserted the row first, a UNIQUE(session_id) violation is expected.
            if _looks_like_unique_violation(resp):
                existing = await _fetch_vote_id_by_session_id_supabase(session_id)
                if existing:
                    return existing
            raise RuntimeError(f"supabase insert failed {resp.status_code}: {resp.text}")

        # Parse response to get vote_id
        try:
            result = resp.json()
            if isinstance(result, list) and len(result) > 0:
                vote_id = result[0].get("id")
                return str(vote_id) if vote_id else None
        except Exception as exc:
            print(f"[WARN] failed to parse vote_id from response: {exc}", file=sys.stderr)

    # Fallback: if response didn't include id, try select again.
    return await _fetch_vote_id_by_session_id_supabase(session_id)
```

**风险**:
- 检查和插入之间的时间窗口可能导致重复记录
- 并发请求可能导致数据不一致
- UNIQUE 约束冲突处理可能失败

**影响范围**:
- 投票记录
- 幂等性保证

---

### 6.3 Post-vote Turn 的 turn_index 计算

**位置**: `arena/services/chat.py`

**代码**:
```python
# Write to database (concurrency-safe): retry on UNIQUE(vote_id, turn_index) conflict
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

**风险**:
- 并发请求时，`turn_index` 可能冲突
- 基于本地数据计算，可能与数据库不一致
- 重试机制可能导致跳号

**影响范围**:
- Post-vote turn 的顺序
- 对话历史的完整性

---

### 6.4 Session 重建的不完整性

**位置**: `arena/services/reconstruction.py`

**代码**:
```python
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

    # Reconstruct model config
    model_config = vote_record.get("model_config", {})
    sess["left"] = {
        "arm": model_config.get("left", {}).get("arm", "baseline"),
        "model_id": model_config.get("left", {}).get("model_id"),
    }
    sess["right"] = {
        "arm": model_config.get("right", {}).get("arm", "empathy"),
        "model_id": model_config.get("right", {}).get("model_id"),
    }

    # Determine winner
    user_vote = vote_record.get("user_vote")
    is_left_baseline = model_config.get("left", {}).get("arm") == "baseline"
    if user_vote == "model_a":
        winner = "left" if is_left_baseline else "right"
    elif user_vote == "model_b":
        winner = "right" if is_left_baseline else "left"
    elif user_vote in ("left", "right"):
        winner = user_vote
    else:
        winner = None

    sess["winner"] = winner

    return sess
```

**风险**:
- 重建的 session 可能不完整
- 单侧上下文可能无法完全恢复
- 临时数据会丢失

**影响范围**:
- 永久对话功能
- Session 恢复

---

## 7. 数据库 Schema 图

### 7.1 完整 ER 图

```
┌─────────────────────────────────────────────────────────────┐
│                        votes                                │
├─────────────────────────────────────────────────────────────┤
│ PK  id: UUID                                                │
│ UK  session_id: TEXT                                        │
│ FK  user_id: UUID (soft)                                    │
│     prompt: TEXT                                            │
│     reply_a: TEXT                                           │
│     reply_b: TEXT                                           │
│     model_config: JSONB                                     │
│     user_vote: TEXT                                         │
│     conversation_history: JSONB                             │
│     turn_count: INTEGER                                     │
│     winner_type: VARCHAR(20)                                │
│     created_at: TIMESTAMPTZ                                 │
└─────────────────────────────────────────────────────────────┘
         │
         │ session_id
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    arena_sessions                            │
├─────────────────────────────────────────────────────────────┤
│ PK  session_id: TEXT                                        │
│     session_data: JSONB                                     │
│     version: BIGINT                                         │
│     expires_at: TIMESTAMPTZ                                 │
│     deleted_at: TIMESTAMPTZ                                 │
│     created_at: TIMESTAMPTZ                                 │
│     updated_at: TIMESTAMPTZ                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        votes                                │
└─────────────────────────────────────────────────────────────┘
         │
         │ vote_id (soft)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    post_vote_turns                          │
├─────────────────────────────────────────────────────────────┤
│ PK  id: UUID                                                │
│ FK  vote_id: UUID (soft)                                    │
│ FK  user_id: UUID (soft)                                    │
│     winner_side: TEXT                                       │
│     turn_index: INTEGER                                     │
│     user_message: TEXT                                      │
│     assistant_message: TEXT                                 │
│     created_at: TIMESTAMPTZ                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  draft_conversations                        │
├─────────────────────────────────────────────────────────────┤
│ PK  id: UUID                                                │
│ UK  session_id: TEXT                                        │
│ FK  user_id: UUID (hard) → auth.users                      │
│     user_email: TEXT                                        │
│     prompt: TEXT                                            │
│     reply_a: TEXT                                           │
│     reply_b: TEXT                                           │
│     model_a: TEXT                                           │
│     model_b: TEXT                                           │
│     conversation_history: JSONB                             │
│     turn_count: INT                                         │
│     model_config: JSONB                                     │
│     created_at: TIMESTAMPTZ                                 │
│     updated_at: TIMESTAMPTZ                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   admin_sessions                            │
├─────────────────────────────────────────────────────────────┤
│ PK  id: UUID                                                │
│ UK  token: TEXT                                             │
│     expires_at: TIMESTAMPTZ                                 │
│     created_at: TIMESTAMPTZ                                 │
│     ip_address: TEXT                                        │
│     user_agent: TEXT                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    model_configs                            │
├─────────────────────────────────────────────────────────────┤
│ PK  id: UUID                                                │
│ UK  model_key: TEXT                                         │
│     model_name: TEXT                                        │
│     api_type: TEXT                                          │
│     api_base: TEXT                                          │
│     api_key_encrypted: TEXT                                 │
│     is_enabled: BOOLEAN                                     │
│     anony_only: BOOLEAN                                     │
│     weight: INTEGER                                         │
│     description: TEXT                                       │
│     created_at: TIMESTAMPTZ                                 │
│     updated_at: TIMESTAMPTZ                                 │
│     deleted_at: TIMESTAMPTZ                                 │
│     is_default: BOOLEAN                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   admin_audit_log                           │
├─────────────────────────────────────────────────────────────┤
│ PK  id: UUID                                                │
│     action_type: TEXT                                       │
│     target_type: TEXT                                       │
│     target_id: TEXT                                         │
│     details: JSONB                                          │
│     ip_address: TEXT                                        │
│     user_agent: TEXT                                        │
│     created_at: TIMESTAMPTZ                                 │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 数据流图

```
用户输入
  ↓
arena_sessions.session_data (临时存储)
  ├─ conversation_history
  ├─ turn_count
  ├─ left.context
  └─ right.context
  ↓
用户继续对话
  ↓
arena_sessions.session_data (更新)
  ├─ conversation_history (追加)
  ├─ turn_count (递增)
  ├─ left.context (追加)
  └─ right.context (追加)
  ↓
用户投票
  ↓
votes 表 (持久化)
  ├─ conversation_history (完整历史)
  ├─ turn_count (总轮数)
  ├─ prompt, reply_a, reply_b
  └─ model_config
  ↓
后台任务
  ├─ AI 评分 (ai_scores)
  └─ Google Drive 快照
  ↓
用户继续对话（投票后）
  ↓
post_vote_turns 表 (每轮一条记录)
  ├─ vote_id
  ├─ turn_index
  ├─ user_message
  └─ assistant_message
```

---

## 8. 总结和建议

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

### 8.3 改进建议

#### 8.3.1 数据丢失防护

1. **添加 Post-vote turn 保存的重试机制**:
```python
# 添加持久化队列
async def _queue_post_vote_turn_for_retry(
    vote_id: str,
    winner_side: str,
    turn_index: int,
    user_message: str,
    assistant_message: str,
    user_id: Optional[str] = None,
) -> None:
    """将失败的 post-vote turn 加入重试队列"""
    # 存储到重试表或消息队列
    pass

# 定期重试
async def _retry_failed_post_vote_turns() -> None:
    """重试失败的 post-vote turn"""
    pass
```

2. **改进 Session Store 的回退策略**:
```python
# 添加本地持久化缓存
async def _persist_to_local_cache(session_id: str, value: Dict[str, Any]) -> None:
    """持久化到本地缓存（文件或 Redis）"""
    pass

# Supabase 不可用时使用本地持久化
if not self._is_supabase_available():
    await self._persist_to_local_cache(session_id, value)
```

3. **增强异步任务的重试机制**:
```python
# 添加任务队列
async def _queue_ai_score_update(session_id: str, scores: Dict[str, Any]) -> None:
    """将 AI 评分更新加入队列"""
    pass

# 定期重试失败的任务
async def _retry_failed_ai_score_updates() -> None:
    """重试失败的 AI 评分更新"""
    pass
```

#### 8.3.2 数据一致性保障

1. **改进乐观锁机制**:
```python
# 添加自动合并策略
async def _merge_session_data(
    old_data: Dict[str, Any],
    new_data: Dict[str, Any],
) -> Dict[str, Any]:
    """合并冲突的 session 数据"""
    # 实现智能合并逻辑
    pass
```

2. **改进幂等性检查**:
```python
# 使用数据库级别的 UPSERT
async def _upsert_vote_supabase(row: Dict[str, Any]) -> Optional[str]:
    """使用 UPSERT 替代检查-插入模式"""
    # 利用 Postgres 的 ON CONFLICT
    pass
```

3. **改进 turn_index 计算**:
```python
# 使用数据库序列
async def _get_next_turn_index(vote_id: str) -> int:
    """从数据库获取下一个 turn_index"""
    # 使用数据库级别的序列生成
    pass
```

#### 8.3.3 性能优化

1. **添加定期清理机制**:
```python
# 定期清理过期数据
async def _cleanup_expired_data() -> None:
    """清理过期数据"""
    # 清理过期的 arena_sessions
    # 清理过期的 admin_sessions
    # 清理软删除的数据
    pass
```

2. **改进缓存策略**:
```python
# 添加多级缓存
class MultiLevelCache:
    """多级缓存：内存 -> Redis -> 数据库"""
    pass
```

3. **添加监控和告警**:
```python
# 监控数据库操作
async def _monitor_database_operations() -> None:
    """监控数据库操作"""
    # 记录慢查询
    # 记录失败操作
    # 发送告警
    pass
```

#### 8.3.4 数据完整性检查

1. **添加数据一致性检查工具**:
```python
async def _check_data_consistency() -> Dict[str, Any]:
    """检查数据一致性"""
    # 检查 votes 和 post_vote_turns 的一致性
    # 检查 arena_sessions 和 votes 的一致性
    # 检查 turn_count 和 conversation_history 的一致性
    pass
```

2. **添加数据修复工具**:
```python
async def _repair_data_inconsistency() -> None:
    """修复数据不一致"""
    # 修复 turn_count
    # 修复 conversation_history
    # 修复 orphaned records
    pass
```

---

## 9. 附录

### 9.1 迁移脚本执行顺序

1. `add_arena_sessions_table.sql` - 创建 arena_sessions 表
2. `add_conversation_history.sql` - 添加 conversation_history 和 turn_count
3. `add_post_vote_chat.sql` - 创建 post_vote_turns 表
4. `add_vote_idempotency.sql` - 添加投票幂等性约束
5. `add_winner_type.sql` - 添加 winner_type 字段
6. `add_draft_conversations.sql` - 创建 draft_conversations 表
7. `add_admin_sessions.sql` - 创建 admin_sessions 表
8. `add_model_configs.sql` - 创建 model_configs 表
9. `add_model_is_default.sql` - 添加 is_default 字段
10. `add_jsonb_indexes.sql` - 添加 JSONB 索引
11. `add_admin_audit_log.sql` - 创建 admin_audit_log 表

### 9.2 关键配置参数

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

### 9.3 相关文件清单

**数据库迁移**:
- `migrations/add_arena_sessions_table.sql`
- `migrations/add_conversation_history.sql`
- `migrations/add_post_vote_chat.sql`
- `migrations/add_vote_idempotency.sql`
- `migrations/add_winner_type.sql`
- `migrations/add_draft_conversations.sql`
- `migrations/add_admin_sessions.sql`
- `migrations/add_model_configs.sql`
- `migrations/add_model_is_default.sql`
- `migrations/add_jsonb_indexes.sql`
- `migrations/add_admin_audit_log.sql`
- `migrations/verify_schema.sql`

**数据库操作**:
- `arena/db/votes.py` - votes 表操作
- `arena/db/post_vote.py` - post_vote_turns 表操作
- `arena/db/helpers.py` - 数据库辅助函数

**Session 存储**:
- `arena/session/base.py` - 内存 SessionStore
- `arena/session/supabase.py` - Supabase SessionStore

**路由**:
- `arena/routes/vote.py` - 投票路由
- `arena/routes/chat.py` - 投票后对话路由

**服务**:
- `arena/services/chat.py` - 投票后对话服务
- `arena/services/reconstruction.py` - Session 重建服务

---

**文档结束**
