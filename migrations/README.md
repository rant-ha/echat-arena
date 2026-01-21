# 数据库迁移文档

本目录包含 eChat Arena 项目的数据库 Schema 迁移脚本。

## 目录结构

```
migrations/
├── README.md                           # 本文档
├── add_conversation_history.sql        # 添加多轮对话支持的迁移脚本
├── add_jsonb_indexes.sql              # JSONB 字段索引优化
├── add_post_vote_chat.sql             # 添加投票后继续对话支持（Phase 8.2）
├── add_vote_idempotency.sql           # 添加投票幂等性约束（Phase 8.3）
├── add_arena_sessions_table.sql       # 添加会话持久化表（Phase 9.1）
├── verify_schema.sql                   # 验证迁移成功的脚本
└── rollback_conversation_history.sql   # 回滚迁移的脚本
```

---

## Phase 3.3：多轮对话支持迁移

### 概述

此迁移为 `votes` 表添加了两个新字段，用于支持多轮对话功能：

- **`conversation_history`**: 存储完整的对话历史记录
- **`turn_count`**: 记录对话轮次数量

### 迁移文件

#### 1. [`add_conversation_history.sql`](add_conversation_history.sql:1)

主迁移脚本，执行以下操作：

- 添加 `conversation_history` 列（JSONB 类型）
- 添加 `turn_count` 列（INTEGER 类型）
- 创建 `idx_votes_turn_count` 索引
- 添加列注释说明

**执行方式：**
在 Supabase Dashboard 的 SQL Editor 中执行此脚本。

#### 2. [`verify_schema.sql`](verify_schema.sql:1)

验证脚本，用于确认迁移是否成功执行。

**执行方式：**
在迁移后运行此脚本，检查输出是否符合预期。

**预期输出：**
```
NOTICE:  Migration verification passed!
NOTICE:  conversation_history column: EXISTS
NOTICE:  turn_count column: EXISTS
NOTICE:  idx_votes_turn_count index: EXISTS
```

#### 3. [`rollback_conversation_history.sql`](rollback_conversation_history.sql:1)

回滚脚本，用于撤销迁移（如果需要）。

**警告：** 执行此脚本将永久删除 `conversation_history` 和 `turn_count` 列及其数据。

---

## 字段详细说明

### `conversation_history` 字段

**类型：** `JSONB`  
**默认值：** `'[]'::jsonb`（空数组）  
**用途：** 存储完整的多轮对话历史记录

#### 数据结构

```json
[
  {
    "turn": 1,
    "user": "用户第一轮输入",
    "reply_a": "模型 A（Baseline）第一轮回复",
    "reply_b": "模型 B（Strategy）第一轮回复",
    "timestamp": "2026-01-17T12:00:00.000Z"
  },
  {
    "turn": 2,
    "user": "用户第二轮输入",
    "reply_a": "模型 A 第二轮回复",
    "reply_b": "模型 B 第二轮回复",
    "timestamp": "2026-01-17T12:01:30.000Z"
  }
]
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `turn` | Integer | 对话轮次编号（从 1 开始） |
| `user` | String | 用户在该轮的输入文本 |
| `reply_a` | String | 模型 A（Baseline）的完整回复 |
| `reply_b` | String | 模型 B（Strategy）的完整回复 |
| `timestamp` | String (ISO 8601) | 该轮对话的时间戳 |

#### 使用场景

1. **多轮对话分析**：研究用户在多轮对话中的行为模式
2. **上下文理解**：分析模型在多轮对话中的上下文理解能力
3. **对话质量评估**：评估长对话中的模型表现
4. **数据回溯**：完整记录每次投票前的所有对话内容

---

### `turn_count` 字段

**类型：** `INTEGER`  
**默认值：** `1`  
**约束：** 最小值为 1  
**用途：** 快速统计对话轮次，用于分析和查询

#### 取值说明

- **`1`**: 单轮对话（用户输入一次后直接投票）
- **`2+`**: 多轮对话（用户进行了多次交互后投票）

#### 使用场景

1. **快速筛选**：通过索引快速查询特定轮次的投票
   ```sql
   SELECT * FROM votes WHERE turn_count > 1;  -- 查询所有多轮对话
   ```

2. **统计分析**：分析不同对话轮次的投票分布
   ```sql
   SELECT turn_count, COUNT(*) as vote_count 
   FROM votes 
   GROUP BY turn_count 
   ORDER BY turn_count;
   ```

3. **性能优化**：避免解析 JSONB 数组来获取轮次信息

---

## 数据向后兼容性

### 现有数据处理

迁移执行后，所有现有的 `votes` 记录将自动获得默认值：

- `conversation_history` = `[]`（空数组）
- `turn_count` = `1`（表示单轮对话）

这确保了：
- ✅ 现有数据不会丢失
- ✅ 现有查询不会中断
- ✅ 新旧数据可以共存

### 应用程序兼容性

在 [`app.py`](../app.py:1) 中：

1. **Phase 1.3** 已实现对话历史记录功能
2. **Phase 3.3** 完成数据库 Schema 迁移
3. 迁移后需要取消注释 Supabase insert 调用以启用持久化

---

## 迁移执行步骤

### 1. 执行迁移

在 Supabase Dashboard 的 SQL Editor 中：

```sql
-- 复制 add_conversation_history.sql 的内容并执行
```

### 2. 验证迁移

```sql
-- 复制 verify_schema.sql 的内容并执行
```

检查输出是否显示所有字段和索引都已成功创建。

### 3. 更新应用代码

在 [`app.py`](../app.py:2037) 中，找到以下注释行：

```python
# await _insert_vote_supabase(row)
```

取消注释以启用 Supabase 持久化：

```python
await _insert_vote_supabase(row)
```

### 4. 测试验证

1. 启动应用程序
2. 进行一次单轮对话并投票
3. 进行一次多轮对话并投票
4. 在 Supabase Dashboard 中检查 `votes` 表，确认数据正确写入

---

## 查询示例

### 查询所有多轮对话

```sql
SELECT 
  id,
  session_id,
  turn_count,
  user_vote,
  created_at
FROM votes
WHERE turn_count > 1
ORDER BY created_at DESC;
```

### 查询特定轮次的对话历史

```sql
SELECT 
  session_id,
  conversation_history,
  turn_count
FROM votes
WHERE turn_count = 3;
```

### 分析对话轮次分布

```sql
SELECT 
  turn_count,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM votes
GROUP BY turn_count
ORDER BY turn_count;
```

### 提取特定轮次的用户输入

```sql
SELECT 
  session_id,
  jsonb_array_elements(conversation_history)->>'user' as user_input,
  jsonb_array_elements(conversation_history)->>'turn' as turn_number
FROM votes
WHERE turn_count >= 2;
```

---

## 索引说明

### `idx_votes_turn_count`

**类型：** B-tree 索引  
**列：** `turn_count`  
**用途：** 加速按对话轮次筛选的查询

#### 性能影响

- ✅ 加速 `WHERE turn_count = ?` 查询
- ✅ 加速 `WHERE turn_count > ?` 范围查询
- ✅ 加速 `GROUP BY turn_count` 聚合查询
- ⚠️ 轻微增加 INSERT 操作的开销（可忽略）

---

## 故障排查

### 问题：迁移执行失败

**可能原因：**
- 列已存在（重复执行迁移）
- 权限不足

**解决方案：**
```sql
-- 检查列是否已存在
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'votes' 
AND column_name IN ('conversation_history', 'turn_count');
```

如果列已存在，迁移已完成，无需重复执行。

### 问题：应用无法写入新字段

**可能原因：**
- 迁移未执行
- Supabase insert 调用仍被注释

**解决方案：**
1. 执行 [`verify_schema.sql`](verify_schema.sql:1) 确认迁移状态
2. 检查 [`app.py`](../app.py:2037) 中的 insert 调用是否已取消注释

### 问题：查询性能下降

**可能原因：**
- 索引未创建
- JSONB 字段查询未优化

**解决方案：**
```sql
-- 检查索引是否存在
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'votes' 
AND indexname = 'idx_votes_turn_count';

-- 如果需要，手动创建索引
CREATE INDEX IF NOT EXISTS idx_votes_turn_count ON votes(turn_count);
```

---

## Phase 8.2：投票后继续对话支持迁移

### 概述

此迁移创建 `post_vote_turns` 表，支持用户在投票后与获胜模型继续对话，同时不污染实验数据（votes 表）。

### 迁移文件

#### [`add_post_vote_chat.sql`](add_post_vote_chat.sql:1)

**功能：**
- 创建 `post_vote_turns` 表存储投票后对话轮次
- 添加必要的索引以优化查询性能
- 配置 Row Level Security (RLS) 策略
- 添加唯一约束确保 `(vote_id, turn_index)` 唯一性

**表结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键，自动生成 |
| `vote_id` | UUID | 关联的投票 ID（指向 votes.id） |
| `user_id` | UUID | 用户 ID（可为 NULL） |
| `winner_side` | TEXT | 获胜方：'left' 或 'right' |
| `turn_index` | INTEGER | 轮次索引（从 1 开始） |
| `user_message` | TEXT | 用户消息 |
| `assistant_message` | TEXT | 助手回复 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

**索引：**
- `idx_post_vote_turns_vote_id_turn`: 按 vote_id 和 turn_index 查询
- `idx_post_vote_turns_vote_id_created`: 按 vote_id 和创建时间查询
- `idx_post_vote_turns_user_id`: 按 user_id 查询（部分索引）

**执行方式：**
在 Supabase Dashboard 的 SQL Editor 中执行此脚本。

**使用场景：**
1. **投票后对话**：用户投票后可与获胜模型继续对话
2. **数据隔离**：投票后对话与实验数据分离，不影响数据分析
3. **历史回溯**：完整记录用户与获胜模型的后续交互

---

## Phase 9.1：会话持久化支持

### 概述

此迁移创建 `arena_sessions` 表，用于持久化存储会话状态，解决 Heroku dyno 重启和多实例部署导致的会话丢失问题。同时支持软删除功能和单侧上下文隔离。

### 迁移文件

#### [`add_arena_sessions_table.sql`](add_arena_sessions_table.sql:1)

**功能：**
- 创建 `arena_sessions` 表存储完整会话数据
- 添加乐观锁支持（version 字段）
- 添加 TTL 支持（expires_at 字段）
- 添加软删除支持（deleted_at 字段）
- 创建必要的索引和触发器

**表结构：**

| 字段 | 类型 | 说明 |
|-------|------|------|
| `session_id` | TEXT | 主键，会话唯一标识 |
| `session_data` | JSONB | 完整会话数据（包含上下文、对话历史等） |
| `version` | BIGINT | 乐观锁版本号 |
| `expires_at` | TIMESTAMPTZ | 会话过期时间 |
| `deleted_at` | TIMESTAMPTZ | 软删除时间标记 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 最后更新时间 |

**索引：**
- `idx_arena_sessions_expires_at`: 按过期时间查询（用于清理）
- `idx_arena_sessions_deleted_at`: 按删除时间查询（用于软删除管理）

**触发器：**
- `trigger_update_updated_at`: 自动更新 updated_at 字段

**函数：**
- `cleanup_expired_sessions()`: 清理过期会话
- `cleanup_old_deleted_sessions(days_threshold)`: 清理旧的软删除会话

**执行方式：**
在 Supabase Dashboard 的 SQL Editor 中执行此脚本。

**使用场景：**
1. **会话持久化**：解决内存会话在重启后丢失的问题
2. **多实例支持**：多个应用实例可以共享会话状态
3. **软删除**：允许用户删除会话但保留数据可恢复
4. **单侧上下文隔离**：每个模型只能看到自己的对话历史

### 数据结构详解

#### session_data JSONB 结构

```json
{
  "session_id": "abc123",
  "prompt": "用户提示",
  "left": {
    "arm": "left",
    "model_id": "model_a",
    "text": "模型A的回复",
    "context": [
      {"role": "user", "content": "用户消息1"},
      {"role": "assistant", "content": "模型A的回复1"}
    ]
  },
  "right": {
    "arm": "right",
    "model_id": "model_b",
    "text": "模型B的回复",
    "context": [
      {"role": "user", "content": "用户消息1"},
      {"role": "assistant", "content": "模型B的回复1"}
    ]
  },
  "conversation_history": [
    {
      "turn": 1,
      "user_msg": "用户消息1",
      "reply_a": "模型A的回复1",
      "reply_b": "模型B的回复1",
      "timestamp": "2023-01-01T00:00:00Z"
    }
  ],
  "turn_count": 1,
  "version": 1,
  "created_at": "2023-01-01T00:00:00Z",
  "winner": null,
  "vote_id": null,
  "template_id": "template1",
  "strategy_name": "strategy1",
  "last_template_id": "template1",
  "last_strategy_name": "strategy1",
  "emotion": "neutral",
  "intensity": "medium",
  "support_type": "neutral",
  "classifier_comment": "分类注释",
  "ai_scores": {}
}
```

**关键设计点**：
- `left.context` 和 `right.context`: 每个模型独立的上下文，实现单侧上下文隔离
- `conversation_history`: 完整对话历史，用于投票和审计
- `version`: 乐观锁版本号，用于并发控制
- `deleted_at`: 软删除标记，允许数据恢复

### 并发控制机制

本表使用**乐观锁**机制处理并发更新：

1. **读取**：获取当前 `version`
2. **修改**：基于当前数据构造新状态
3. **写入**：仅当 `version` 未变化时更新（CAS 操作）
4. **冲突**：如果 `version` 不匹配，操作失败，需要重试

**示例 SQL**：
```sql
-- CAS 更新示例
UPDATE arena_sessions
SET 
  session_data = '{"key": "new_value"}'::jsonb,
  version = version + 1,
  updated_at = NOW()
WHERE 
  session_id = 'abc123' 
  AND version = 5  -- 期望的版本
  AND deleted_at IS NULL;  -- 仅更新未删除的会话
```

### 软删除管理

#### 软删除操作
```sql
-- 标记会话为已删除
UPDATE arena_sessions
SET deleted_at = NOW()
WHERE session_id = 'abc123';
```

#### 恢复操作
```sql
-- 恢复被删除的会话
UPDATE arena_sessions
SET deleted_at = NULL
WHERE session_id = 'abc123';
```

#### 清理操作
```sql
-- 清理超过30天的软删除会话
SELECT cleanup_old_deleted_sessions(30);
```

### TTL 管理

#### 自动过期
- 每次写入操作更新 `expires_at = NOW() + TTL`
- 过期会话被视为不存在（但不立即删除）
- 定期任务清理过期会话

#### 清理过期会话
```sql
-- 手动清理过期会话
SELECT cleanup_expired_sessions();

-- 使用 pg_cron 自动清理（推荐）
SELECT cron.schedule('cleanup-expired-sessions', '0 3 * * *', $$
  DELETE FROM arena_sessions WHERE expires_at < NOW() AND deleted_at IS NULL;
$$);
```

### 迁移执行步骤

1. **执行迁移脚本**
   ```sql
   -- 复制 add_arena_sessions_table.sql 的内容并执行
   ```

2. **验证迁移**
   ```sql
   -- 检查表是否创建成功
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_name = 'arena_sessions';
   
   -- 检查索引是否创建成功
   SELECT indexname 
   FROM pg_indexes 
   WHERE tablename = 'arena_sessions';
   ```

3. **配置应用程序**
   - 设置环境变量 `ARENA_SESSION_STORE=supabase`
   - 配置 Supabase 连接信息
   - 部署更新后的应用代码

4. **测试验证**
   - 测试会话持久化功能
   - 测试多实例一致性
   - 测试软删除和恢复功能
   - 测试单侧上下文隔离

### 兼容性考虑

#### 现有数据
- 新表独立于现有 `votes` 表，无兼容性问题
- 旧的内存会话不会自动迁移（用户需要重新开始对话）

#### 应用程序兼容性
- 所有现有接口保持向后兼容
- 新功能为增量添加，不影响现有流程
- 提供降级机制（如 Supabase 失败，可降级到内存存储）

### 性能优化建议

1. **缓存策略**
   - 使用本地 LRU 缓存减少 DB 读取
   - 缓存 TTL 设置为 10-60 秒

2. **批量操作**
   - 对于管理员操作，使用批量查询和更新
   - 避免在热路径中进行复杂 JSONB 操作

3. **索引优化**
   - 根据实际查询模式添加额外索引
   - 考虑对常用 JSONB 字段创建表达式索引

### 故障排查

#### 问题：迁移执行失败

**可能原因：**
- 表已存在（重复执行迁移）
- 权限不足

**解决方案：**
```sql
-- 检查表是否已存在
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'arena_sessions';
```

如果表已存在，迁移已完成，无需重复执行。

#### 问题：并发冲突频繁

**可能原因：**
- 高并发写入同一会话
- 重试策略不合理

**解决方案：**
1. 优化重试策略（调整重试次数和间隔）
2. 检查业务逻辑，减少并发写入
3. 考虑使用悲观锁（如 Redis 锁）

#### 问题：性能下降

**可能原因：**
- 索引缺失
- JSONB 操作复杂

**解决方案：**
```sql
-- 检查索引使用情况
EXPLAIN ANALYZE 
SELECT * FROM arena_sessions 
WHERE session_id = 'abc123';

-- 考虑添加额外索引
CREATE INDEX IF NOT EXISTS idx_arena_sessions_session_data_field 
ON arena_sessions (((session_data->>'field_name')));
```

### 相关文档

- [完整设计文档](../plans/sessionstore_supabase_complete_design.md) - 详细设计和实现方案
- [部署指南](../DEPLOYMENT_GUIDE.md) - 完整的部署和迁移步骤
- [应用代码](../app.py) - 后端实现细节

---

## Phase 8.3：投票幂等性增强

### 概述

此迁移在 `votes` 表的 `session_id` 列上添加唯一约束，确保同一会话不会因网络重试或误操作产生重复投票记录。

### 迁移文件

#### [`add_vote_idempotency.sql`](add_vote_idempotency.sql:1)

**功能：**
- 在 `votes.session_id` 上添加 UNIQUE 约束
- 使用幂等性检查，避免重复添加约束

**约束名称：** `votes_session_id_unique`

**执行方式：**
在 Supabase Dashboard 的 SQL Editor 中执行此脚本。

### ⚠️ 重要警告

**执行此迁移前必须确保没有重复的 `session_id`**，否则迁移会失败。

#### 检查重复数据

```sql
-- 查找重复的 session_id
SELECT
    session_id,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at) as vote_ids,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM votes
WHERE session_id IS NOT NULL
GROUP BY session_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

#### 清洗重复数据

如果发现重复的 `session_id`，必须先清洗数据。以下提供两种清洗策略：

**策略 1：保留最早的记录**

```sql
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY session_id
            ORDER BY created_at ASC
        ) as rn
    FROM votes
    WHERE session_id IS NOT NULL
)
DELETE FROM votes
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
```

**策略 2：保留最新的记录**

```sql
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY session_id
            ORDER BY created_at DESC
        ) as rn
    FROM votes
    WHERE session_id IS NOT NULL
)
DELETE FROM votes
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
```

**建议：** 通常保留最早的记录更符合实验数据的完整性要求。

#### 验证清洗结果

```sql
-- 确认无重复（应返回空结果）
SELECT
    session_id,
    COUNT(*) as count
FROM votes
WHERE session_id IS NOT NULL
GROUP BY session_id
HAVING COUNT(*) > 1;
```

### 使用场景

1. **防止重复投票**：网络重试时不会创建重复记录
2. **数据一致性**：确保每个会话只有一条投票记录
3. **幂等性保障**：`/api/arena/vote` 端点可安全重试

### 风险与注意事项

**风险：**
- ⚠️ 如有重复 `session_id`，迁移会失败
- ⚠️ 清洗数据会永久删除重复记录
- ⚠️ 建议在执行前备份数据库

**注意事项：**
1. 务必先执行检查 SQL，确认是否有重复数据
2. 如有重复，仔细选择清洗策略（保留最早 vs 最新）
3. 清洗后再次验证，确保无重复
4. 最后执行迁移脚本

---

## 迁移执行顺序

推荐按以下顺序执行所有迁移：

1. **Phase 3.3**: [`add_conversation_history.sql`](add_conversation_history.sql:1) - 多轮对话支持
2. **索引优化**: [`add_jsonb_indexes.sql`](add_jsonb_indexes.sql:1) - JSONB 索引（如存在）
3. **Phase 8.2**: [`add_post_vote_chat.sql`](add_post_vote_chat.sql:1) - 投票后继续对话
4. **数据清洗**: 检查并清洗重复 `session_id`（如需要）
5. **Phase 8.3**: [`add_vote_idempotency.sql`](add_vote_idempotency.sql:1) - 投票幂等性
6. **验证**: [`verify_schema.sql`](verify_schema.sql:1) - 验证所有迁移

详细步骤请参考 [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md:1) 第 5.3 节。

---

## 回滚说明

如果需要回滚迁移（例如发现严重问题），执行 [`rollback_conversation_history.sql`](rollback_conversation_history.sql:1)。

**警告：**
- ⚠️ 回滚将永久删除所有 `conversation_history` 和 `turn_count` 数据
- ⚠️ 回滚后应用程序需要重新注释 Supabase insert 调用
- ⚠️ 建议在回滚前备份数据

---

## 相关文档

- [部署指南](../DEPLOYMENT_GUIDE.md:1) - 完整的部署和迁移步骤
- [应用代码](../app.py:1) - 后端实现细节
- [前端计划](../frontend_plan.md:1) - 前端多轮对话功能规划

---

## 更新日志

### 2026-01-18 - Phase 8.2/8.3

- ✅ 创建迁移脚本 [`add_post_vote_chat.sql`](add_post_vote_chat.sql:1)
- ✅ 创建迁移脚本 [`add_vote_idempotency.sql`](add_vote_idempotency.sql:1)
- ✅ 更新 [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md:1) 第 5.3 节
- ✅ 更新 [`DEPLOYMENT_CHECKLIST.md`](../plans/DEPLOYMENT_CHECKLIST.md:1)
- ✅ 更新本文档，添加新迁移说明

### 2026-01-17 - Phase 3.3

- ✅ 创建迁移脚本 [`add_conversation_history.sql`](add_conversation_history.sql:1)
- ✅ 创建验证脚本 [`verify_schema.sql`](verify_schema.sql:1)
- ✅ 创建回滚脚本 [`rollback_conversation_history.sql`](rollback_conversation_history.sql:1)
- ✅ 更新 [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md:1)
- ✅ 更新 [`app.py`](../app.py:1) 注释
- ✅ 创建本文档

---

## 联系与支持

如有问题或需要帮助，请参考：
- 项目 README
- 提交 GitHub Issue
- 查看部署指南中的故障排查章节
