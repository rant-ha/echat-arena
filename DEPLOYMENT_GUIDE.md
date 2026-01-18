# Deployment Guide

本指南提供了部署 eChat Arena 项目的详细步骤。

## 目录

1. [环境准备](#1-环境准备)
2. [后端部署](#2-后端部署)
3. [前端部署](#3-前端部署)
4. [Supabase 配置](#4-supabase-配置)
5. [数据库迁移](#5-数据库迁移)
6. [验证部署](#6-验证部署)
7. [多轮对话功能部署检查](#7-多轮对话功能部署检查)
8. [故障排查](#8-故障排查)
9. [监控和维护](#9-监控和维护)
10. [更新和升级](#10-更新和升级)

---

## 1. 环境准备

### 1.1 必需的环境变量

创建 `.env` 文件并配置以下变量：

```bash
# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# API 密钥
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# 其他配置
PORT=8000
```

---

## 2. 后端部署

### 2.1 使用 Docker 部署

```bash
docker build -t echat-arena .
docker run -p 8000:8000 --env-file .env echat-arena
```

### 2.2 使用 Heroku 部署

```bash
heroku create your-app-name
heroku config:set SUPABASE_URL=your_supabase_url
heroku config:set SUPABASE_KEY=your_supabase_anon_key
git push heroku main
```

---

## 3. 前端部署

### 3.1 Vercel 部署

```bash
cd web
vercel --prod
```

### 3.2 环境变量配置

在 Vercel Dashboard 中配置：

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=your_backend_api_url
```

---

## 4. Supabase 配置

### 4.1 创建数据库表

在 Supabase Dashboard 的 SQL Editor 中执行以下 SQL：

```sql
-- 创建 votes 表
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  winner TEXT NOT NULL,
  prompt TEXT NOT NULL,
  reply_a TEXT NOT NULL,
  reply_b TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_votes_user_id ON votes(user_id);
CREATE INDEX idx_votes_created_at ON votes(created_at);
```

### 4.2 配置 Row Level Security (RLS)

```sql
-- 启用 RLS
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- 允许用户查看自己的投票
CREATE POLICY "Users can view own votes"
  ON votes FOR SELECT
  USING (auth.uid() = user_id);

-- 允许用户插入投票
CREATE POLICY "Users can insert votes"
  ON votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## 5. 数据库迁移

### 5.1 初始 Schema 设置

参考上面的 [4.1 创建数据库表](#41-创建数据库表) 部分。

### 5.2 数据库 Schema 迁移（多轮对话功能）

**Phase 3.3 - 添加 conversation_history 和 turn_count 字段**

在 Supabase Dashboard 的 SQL Editor 中执行以下迁移脚本：

```sql
-- Add conversation history support
ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;

ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS turn_count INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_votes_turn_count ON votes(turn_count);

-- Add comments for documentation
COMMENT ON COLUMN votes.conversation_history IS 'Complete conversation history in multi-turn dialogues. Format: [{"turn": 1, "user": "...", "reply_a": "...", "reply_b": "...", "timestamp": "..."}]';
COMMENT ON COLUMN votes.turn_count IS 'Total number of conversation turns before voting. Minimum value is 1 (single-turn dialogue).';
```

#### 验证迁移成功

执行以下查询验证字段已正确添加：

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'votes' 
AND column_name IN ('conversation_history', 'turn_count');
```

**预期输出：**

| column_name | data_type | column_default |
|------------|-----------|----------------|
| conversation_history | jsonb | '[]'::jsonb |
| turn_count | integer | 1 |

#### 字段说明

**conversation_history 字段：**
- 类型：`JSONB`
- 默认值：`'[]'::jsonb`（空数组）
- 用途：存储完整的多轮对话历史
- 数据结构：
  ```json
  [
    {
      "turn": 1,
      "user": "用户输入",
      "reply_a": "模型 A 回复",
      "reply_b": "模型 B 回复",
      "timestamp": "2026-01-17T12:00:00.000Z"
    },
    {
      "turn": 2,
      "user": "用户第二轮输入",
      "reply_a": "模型 A 第二轮回复",
      "reply_b": "模型 B 第二轮回复",
      "timestamp": "2026-01-17T12:01:00.000Z"
    }
  ]
  ```

**turn_count 字段：**
- 类型：`INTEGER`
- 默认值：`1`
- 约束：最小值为 1（单轮对话）
- 用途：快速统计对话轮次，用于分析和查询

#### 数据向后兼容性

- 现有的 votes 记录会自动填充默认值
- `conversation_history` 默认为空数组 `[]`
- `turn_count` 默认为 `1`（表示单轮对话）
- 不会影响现有数据的完整性

#### 迁移脚本文件

完整的迁移脚本位于：[`migrations/add_conversation_history.sql`](migrations/add_conversation_history.sql:1)

验证脚本位于：[`migrations/verify_schema.sql`](migrations/verify_schema.sql:1)

回滚脚本位于：[`migrations/rollback_conversation_history.sql`](migrations/rollback_conversation_history.sql:1)

### 5.3 Phase 8.2/8.3 - 投票后继续对话与幂等性增强

**重要：** 这些迁移必须在 Phase 3.3 迁移（`add_conversation_history.sql`）之后执行。

#### 5.3.1 投票后继续对话部署 (add_post_vote_chat.sql)

此迁移创建 `post_vote_turns` 表，支持用户在投票后与获胜模型继续对话。

**执行脚本：**

在 Supabase Dashboard 的 SQL Editor 中执行 [`migrations/add_post_vote_chat.sql`](migrations/add_post_vote_chat.sql:1)

**验证 SQL：**

```sql
-- 验证 post_vote_turns 表是否存在
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'post_vote_turns'
AND table_schema = 'public';

-- 验证表结构
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'post_vote_turns'
ORDER BY ordinal_position;

-- 验证唯一约束（vote_id, turn_index）
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'post_vote_turns'
AND constraint_name = 'unique_vote_turn';

-- 验证索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'post_vote_turns'
ORDER BY indexname;
```

**预期输出：**
- `post_vote_turns` 表存在
- 包含字段：`id`, `vote_id`, `user_id`, `winner_side`, `turn_index`, `user_message`, `assistant_message`, `created_at`
- 存在 `unique_vote_turn` 唯一约束
- 存在 3 个索引：`idx_post_vote_turns_vote_id_turn`, `idx_post_vote_turns_vote_id_created`, `idx_post_vote_turns_user_id`

#### 5.3.2 投票幂等性部署 (add_vote_idempotency.sql)

此迁移在 `votes` 表的 `session_id` 列上添加唯一约束，防止重复投票。

**⚠️ 重要警告：** 执行此迁移前，必须确保 `votes.session_id` 中没有重复值，否则迁移会失败。

**执行前检查：**

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

**清洗重复数据（如需要）：**

如果发现重复 `session_id`，执行以下清洗脚本（保留每个 `session_id` 的最早记录）：

```sql
-- 方法 1：删除重复记录，保留最早的一条
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

-- 方法 2：如果需要保留最新的记录
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

**执行迁移：**

确认无重复数据后，在 Supabase Dashboard 的 SQL Editor 中执行 [`migrations/add_vote_idempotency.sql`](migrations/add_vote_idempotency.sql:1)

**验证 SQL：**

```sql
-- 验证 session_id 唯一约束
SELECT
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'votes'
AND constraint_name = 'votes_session_id_unique';

-- 测试唯一约束是否生效（应该返回空结果）
SELECT
    session_id,
    COUNT(*) as count
FROM votes
WHERE session_id IS NOT NULL
GROUP BY session_id
HAVING COUNT(*) > 1;
```

**预期输出：**
- 存在 `votes_session_id_unique` 约束
- 无重复 `session_id` 记录

#### 5.3.3 完整迁移顺序

建议按以下顺序执行所有迁移脚本：

1. [`migrations/add_conversation_history.sql`](migrations/add_conversation_history.sql:1) - 多轮对话支持
2. [`migrations/add_jsonb_indexes.sql`](migrations/add_jsonb_indexes.sql:1) - JSONB 索引优化（如存在）
3. [`migrations/add_post_vote_chat.sql`](migrations/add_post_vote_chat.sql:1) - 投票后继续对话
4. 检查并清洗重复 `session_id`（如需要）
5. [`migrations/add_vote_idempotency.sql`](migrations/add_vote_idempotency.sql:1) - 投票幂等性
6. [`migrations/verify_schema.sql`](migrations/verify_schema.sql:1) - 验证所有迁移

#### 5.3.4 综合验证 SQL

执行所有迁移后，运行以下综合验证：

```sql
-- 验证所有关键表和字段
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('votes', 'post_vote_turns')
AND column_name IN (
    'conversation_history',
    'turn_count',
    'session_id',
    'vote_id',
    'turn_index',
    'winner_side'
)
ORDER BY table_name, column_name;

-- 验证所有约束
SELECT
    table_name,
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_name IN ('votes', 'post_vote_turns')
AND constraint_name IN (
    'votes_session_id_unique',
    'unique_vote_turn'
)
ORDER BY table_name, constraint_name;
```

---

## 6. 验证部署

### 6.1 健康检查

```bash
# 检查后端 API
curl https://your-backend-url/health

# 检查前端
curl https://your-frontend-url
```

### 6.2 测试投票功能

1. 访问前端 URL
2. 登录或注册账户
3. 进入 Battle 模式
4. 输入提示词并投票
5. 检查 Supabase Dashboard 中的 votes 表是否有新记录

---

## 7. 多轮对话功能部署检查

### 7.1 数据库迁移
- [ ] 在 Supabase 执行 `migrations/add_conversation_history.sql`
- [ ] 验证字段已添加：运行 `migrations/verify_schema.sql`
- [ ] 在 `app.py` 中取消注释 `await _insert_vote_supabase(row)` (第 2037 行)

### 7.2 后端验证
- [ ] Heroku 部署成功（`git push heroku main`）
- [ ] 检查后端日志，确认无错误
- [ ] 测试 `/api/arena/battle` 端点
- [ ] 测试 `/api/arena/continue` 端点（需先创建 session）

### 7.3 前端验证
- [ ] Vercel 部署成功
- [ ] 测试单轮对话流程
- [ ] 测试多轮对话流程
- [ ] 验证对话历史显示
- [ ] 验证轮次警告显示

### 7.4 数据验证
- [ ] 投票后检查 Supabase votes 表
- [ ] 确认 conversation_history 字段包含完整对话
- [ ] 确认 turn_count 字段正确

---

## 8. 故障排查

### 8.1 常见问题

**问题：无法连接到 Supabase**
- 检查 `SUPABASE_URL` 和 `SUPABASE_KEY` 是否正确
- 确认 Supabase 项目状态正常

**问题：投票数据未保存**
- 检查 RLS 策略是否正确配置
- 确认用户已登录且 `user_id` 正确

**问题：多轮对话数据未保存**
- 确认已执行 Phase 3.3 的数据库迁移
- 检查 [`app.py`](app.py:1) 中的 Supabase insert 调用是否已取消注释

---

## 9. 监控和维护

### 9.1 日志监控

- Heroku: `heroku logs --tail`
- Vercel: 在 Vercel Dashboard 查看日志

### 9.2 数据库备份

在 Supabase Dashboard 中定期创建数据库备份。

---

## 10. 更新和升级

### 10.1 后端更新

```bash
git pull origin main
heroku container:push web
heroku container:release web
```

### 10.2 前端更新

```bash
cd web
git pull origin main
vercel --prod
```

---

## 联系支持

如有问题，请查看项目 README 或提交 Issue。
