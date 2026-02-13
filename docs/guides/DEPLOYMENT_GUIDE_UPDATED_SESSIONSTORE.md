# eChat Arena 部署指南 - 更新版本（包含 SessionStore 持久化）

本指南在原有部署指南的基础上，增加了 SessionStore 持久化改造的部署步骤和配置。

## 目录

1. [环境准备](#1-环境准备)
2. [后端部署](#2-后端部署)
3. [前端部署](#3-前端部署)
4. [Supabase 配置](#4-supabase-配置)
5. [数据库迁移](#5-数据库迁移)
6. [SessionStore 持久化部署（新增）](#6-sessionstore-持久化部署新增)
7. [验证部署](#7-验证部署)
8. [多轮对话功能部署检查](#8-多轮对话功能部署检查)
9. [故障排查](#9-故障排查)
10. [监控和维护](#10-监控和维护)
11. [更新和升级](#11-更新和升级)

---

## 1. 环境准备

### 1.1 必需的环境变量

**原有环境变量（保持不变）**：

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

**新增 SessionStore 环境变量**：

```bash
# SessionStore 模式（必需）
ARENA_SESSION_STORE=supabase  # 或 "memory" 用于开发/测试

# Supabase 服务角色密钥（必需，用于后端写入）
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# 会话 TTL 设置（可选，默认 7200 秒 = 2 小时）
ARENA_SESSION_TTL_SEC=7200

# 最大会话数（可选，默认 2000）
ARENA_MAX_SESSIONS=2000

# 本地缓存 TTL（可选，默认 60 秒）
ARENA_CACHE_TTL_SEC=60

# 是否允许降级到内存存储（可选，默认 true）
ARENA_ALLOW_FALLBACK=true

# 管理员 API 密钥（必需，用于管理端点）
ARENA_ADMIN_API_KEY=your_secure_admin_key

# 请求超时设置（可选，默认 60 秒）
ARENA_REQUEST_TIMEOUT=60
```

**注意**：
- `SUPABASE_SERVICE_KEY` 是服务角色密钥，具有完整数据库访问权限
- `SUPABASE_KEY` 是匿名公钥，用于前端访问
- `ARENA_ADMIN_API_KEY` 是自定义管理员密钥，用于保护管理端点

---

## 2. 后端部署

### 2.1 使用 Docker 部署

```bash
# 构建镜像
docker build -t echat-arena .

# 运行容器（包含新的 SessionStore 环境变量）
docker run -p 8000:8000 \
  -e SUPABASE_URL=your_supabase_url \
  -e SUPABASE_KEY=your_supabase_anon_key \
  -e SUPABASE_SERVICE_KEY=your_supabase_service_role_key \
  -e ARENA_SESSION_STORE=supabase \
  -e ARENA_ADMIN_API_KEY=your_secure_admin_key \
  echat-arena
```

### 2.2 使用 Heroku 部署

```bash
# 创建 Heroku 应用
heroku create your-app-name

# 设置环境变量（包含新的 SessionStore 配置）
heroku config:set SUPABASE_URL=your_supabase_url
heroku config:set SUPABASE_KEY=your_supabase_anon_key
heroku config:set SUPABASE_SERVICE_KEY=your_supabase_service_role_key
heroku config:set ARENA_SESSION_STORE=supabase
heroku config:set ARENA_ADMIN_API_KEY=your_secure_admin_key
heroku config:set ARENA_SESSION_TTL_SEC=7200
heroku config:set ARENA_MAX_SESSIONS=2000
heroku config:set ARENA_CACHE_TTL_SEC=60
heroku config:set ARENA_ALLOW_FALLBACK=true

# 部署代码
git push heroku main
```

**部署后检查**：
```bash
# 查看日志，确认 SessionStore 初始化成功
heroku logs --tail | grep "SessionStore initialized"

# 应该看到：[INFO] SessionStore initialized in supabase mode
```

---

## 3. 前端部署

### 3.1 Vercel 部署

```bash
cd web
vercel --prod
```

### 3.2 环境变量配置

在 Vercel Dashboard 中配置（保持不变）：

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=your_backend_api_url
```

**注意**：前端不需要访问 SessionStore 管理 API，因此不需要配置管理员密钥。

---

## 4. Supabase 配置

### 4.1 创建数据库表

**原有 votes 表（保持不变）**：

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

**新增 arena_sessions 表（SessionStore 持久化）**：

```sql
-- 创建 arena_sessions 表
CREATE TABLE IF NOT EXISTS arena_sessions (
  session_id  TEXT PRIMARY KEY,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version     BIGINT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_arena_sessions_expires_at ON arena_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_arena_sessions_deleted_at ON arena_sessions (deleted_at);

-- 创建触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_updated_at
BEFORE UPDATE ON arena_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
```

### 4.2 配置 Row Level Security (RLS)

**原有 votes 表 RLS（保持不变）**：

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

**新增 arena_sessions 表 RLS（允许服务角色访问）**：

```sql
-- 启用 RLS
ALTER TABLE arena_sessions ENABLE ROW LEVEL SECURITY;

-- 允许服务角色完全访问（后端使用服务角色）
CREATE POLICY "Allow service role full access to arena_sessions"
    ON arena_sessions FOR ALL 
    USING (true);
```

改为更安全的做法：启用 RLS，但不要为 public/anon 添加任何允许访问的 Policy。Supabase 的 Service Role key 自动绕过 RLS，后端使用该 key 即可读写表。

```sql
-- 启用 RLS（必须）
ALTER TABLE arena_sessions ENABLE ROW LEVEL SECURITY;

-- 如之前误添加过过度开放的策略，先删除它（若不存在则忽略）
DROP POLICY IF EXISTS "Allow service role full access to arena_sessions" ON arena_sessions;

-- 注意：不要为 public/anon 创建允许读写的 POLICY；只要开启了 RLS 且不为普通用户添加策略，
-- 普通前端/匿名用户将被拒绝访问，只有使用 Service Role key 的后端能访问该表。
```

---

## 5. 数据库迁移

### 5.1 初始 Schema 设置

**原有多轮对话迁移（保持不变）**：

```sql
-- Add conversation history support
ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;

ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS turn_count INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_votes_turn_count ON votes(turn_count);
```

**新增 SessionStore 迁移（必须执行）**：

在 Supabase Dashboard 的 SQL Editor 中执行 [`migrations/add_arena_sessions_table.sql`](migrations/add_arena_sessions_table.sql:1)

**验证迁移成功**：

```sql
-- 验证 arena_sessions 表是否存在
SELECT table_name
FROM information_schema.tables 
WHERE table_name = 'arena_sessions';

-- 验证所有字段
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'arena_sessions' 
ORDER BY ordinal_position;

-- 验证索引
SELECT indexname, indexdef
FROM pg_indexes 
WHERE tablename = 'arena_sessions' 
ORDER BY indexname;
```

**预期输出**：
- `arena_sessions` 表存在
- 包含所有字段：`session_id`, `session_data`, `version`, `expires_at`, `deleted_at`, `created_at`, `updated_at`
- 存在 2 个索引：`idx_arena_sessions_expires_at`, `idx_arena_sessions_deleted_at`

### 5.2 完整迁移顺序

建议按以下顺序执行所有迁移脚本：

1. **原有迁移**（如果尚未执行）：
   - [`migrations/add_conversation_history.sql`](migrations/add_conversation_history.sql:1)
   - [`migrations/add_jsonb_indexes.sql`](migrations/add_jsonb_indexes.sql:1)（如存在）
   - [`migrations/add_post_vote_chat.sql`](migrations/add_post_vote_chat.sql:1)
   - [`migrations/add_vote_idempotency.sql`](migrations/add_vote_idempotency.sql:1)

2. **新增 SessionStore 迁移**：
   - [`migrations/add_arena_sessions_table.sql`](migrations/add_arena_sessions_table.sql:1)

3. **验证所有迁移**：
   - [`migrations/verify_schema.sql`](migrations/verify_schema.sql:1)

---

## 6. SessionStore 持久化部署（新增）

### 6.1 部署步骤

**步骤 1：创建 arena_sessions 表**

在 Supabase Dashboard 的 SQL Editor 中执行：
```sql
-- 复制 migrations/add_arena_sessions_table.sql 的内容并执行
```

**步骤 2：配置 Heroku 环境变量**

确保所有 SessionStore 相关环境变量已设置：
```bash
heroku config:set ARENA_SESSION_STORE=supabase
heroku config:set SUPABASE_SERVICE_KEY=your_supabase_service_role_key
heroku config:set ARENA_ADMIN_API_KEY=your_secure_admin_key
```

**步骤 3：部署后端代码**
```bash
git push heroku main
```

**步骤 4：验证 SessionStore 初始化**
```bash
# 查看 Heroku 日志
heroku logs --tail | grep "SessionStore"

# 应该看到：[INFO] SessionStore initialized in supabase mode
```

### 6.2 管理员 API 使用

**会话列表**：
```bash
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/list \
  -H "Content-Type: application/json" \
  -H "admin_key: your_secure_admin_key" \
  -d '{"page": 1, "page_size": 10}'
```

**软删除会话**：
```bash
curl -X POST https://your-app.herokuapp.com/api/arena/session/delete \
  -H "Content-Type: application/json" \
  -H "admin_key: your_secure_admin_key" \
  -d '{"session_id": "your-session-id"}'
```

**恢复会话**：
```bash
curl -X POST https://your-app.herokuapp.com/api/arena/session/restore \
  -H "Content-Type: application/json" \
  -H "admin_key: your_secure_admin_key" \
  -d '{"session_id": "your-session-id"}'
```

**清理软删除会话**：
```bash
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/cleanup \
  -H "Content-Type: application/json" \
  -H "admin_key: your_secure_admin_key" \
  -d '{"max_age_days": 30}'
```

### 6.3 定时任务（可选）

如果启用了 pg_cron 扩展，可以设置自动清理任务：

```sql
-- 每天凌晨 3 点清理过期会话
SELECT cron.schedule('cleanup-expired-sessions', '0 3 * * *', $$
  DELETE FROM arena_sessions WHERE expires_at < NOW() AND deleted_at IS NULL;
$$);

-- 每周清理超过 30 天的软删除会话
SELECT cron.schedule('cleanup-old-deleted-sessions', '0 4 * * 0', $$
  DELETE FROM arena_sessions WHERE deleted_at < NOW() - '30 days'::INTERVAL;
$$);
```

---

## 7. 验证部署

### 7.1 健康检查

```bash
# 检查后端 API
curl https://your-backend-url/health

# 检查前端
curl https://your-frontend-url
```

### 7.2 测试 SessionStore 功能

**测试会话持久化**：
1. 创建一个新的 battle 会话
2. 重启 Heroku dyno：`heroku restart`
3. 继续对话，验证会话历史完整
4. 检查 Supabase arena_sessions 表是否有记录

**测试多实例一致性**：
1. 启动多个 Heroku dyno：`heroku ps:scale web=2`
2. 在实例 A 创建会话
3. 在实例 B 继续对话
4. 验证会话状态一致

**测试软删除功能**：
1. 创建一个会话并进行多轮对话
2. 调用软删除 API
3. 验证会话不再可见（正常查询）
4. 调用恢复 API
5. 验证会话恢复可见

**测试单侧上下文隔离**：
1. 创建一个会话并进行多轮对话
2. 检查 left.context 只包含模型 A 的回复
3. 检查 right.context 只包含模型 B 的回复
4. 验证 conversation_history 包含完整对话

---

## 8. 多轮对话功能部署检查

### 8.1 数据库迁移
- [x] 在 Supabase 执行 `migrations/add_conversation_history.sql`
- [x] 验证字段已添加：运行 `migrations/verify_schema.sql`
- [x] 在 `app.py` 中取消注释 `await _insert_vote_supabase(row)` (第 2037 行)

### 8.2 后端验证
- [ ] Heroku 部署成功（`git push heroku main`）
- [ ] 检查后端日志，确认无错误
- [ ] 测试 `/api/arena/battle` 端点
- [ ] 测试 `/api/arena/continue` 端点（需先创建 session）

### 8.3 前端验证
- [ ] Vercel 部署成功
- [ ] 测试单轮对话流程
- [ ] 测试多轮对话流程
- [ ] 验证对话历史显示
- [ ] 验证轮次警告显示

### 8.4 数据验证
- [ ] 投票后检查 Supabase votes 表
- [ ] 确认 conversation_history 字段包含完整对话
- [ ] 确认 turn_count 字段正确

---

## 9. 故障排查

### 9.1 常见问题

**问题：无法连接到 Supabase**
- 检查 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 是否正确
- 确认 Supabase 项目状态正常
- 检查 Heroku 网络连接

**问题：SessionStore 初始化失败**
- 检查日志：`heroku logs --tail | grep "SessionStore"`
- 确认 `SUPABASE_SERVICE_KEY` 是服务角色密钥
- 确认 arena_sessions 表已正确创建

**问题：会话无法持久化**
- 检查 RLS 策略是否正确配置
- 确认后端使用服务角色访问 Supabase
- 检查 Heroku 日志中的 `supabase_cas_update_error`

**问题：并发冲突频繁**
- 检查日志中的 `version_conflict` 错误
- 考虑调整重试策略（在代码中修改）
- 监控冲突率，如 > 10% 需要优化

**问题：性能下降**
- 检查 Supabase 查询性能：`EXPLAIN ANALYZE SELECT * FROM arena_sessions WHERE session_id = 'test'`
- 调整本地缓存 TTL：`heroku config:set ARENA_CACHE_TTL_SEC=120`
- 考虑添加额外索引

### 9.2 回滚策略

如果发现严重问题，可以快速回滚到内存存储模式：

```bash
# 切换到内存模式
heroku config:set ARENA_SESSION_STORE=memory
heroku restart
```

**回滚影响**：
- 切换到内存模式后，现有 Supabase 会话将不会被读取
- 用户需要重新开始对话
- 但可以快速恢复服务可用性

---

## 10. 监控和维护

### 10.1 日志监控

**Heroku 日志**：
```bash
# 查看实时日志
heroku logs --tail

# 过滤错误日志
heroku logs --tail | grep "ERROR\|WARN"

# 过滤 SessionStore 相关日志
heroku logs --tail | grep "session_store\|supabase"
```

**关键日志模式**：
- `supabase_get_error` - Supabase 读取错误
- `supabase_cas_update_error` - Supabase 写入错误
- `version_conflict` - 并发冲突
- `session_store_fallback_to_memory` - 降级到内存存储

### 10.2 关键指标监控

| 指标 | 阈值 | 告警级别 |
|------|------|----------|
| 错误率 | > 5% | 高 |
| 响应时间 | > 1s | 中 |
| 内存使用 | > 80% | 高 |
| 并发冲突率 | > 10% | 中 |
| 会话创建失败率 | > 1% | 高 |
| 降级率 | > 0% | 高 |

### 10.3 定期维护任务

```bash
# 手动触发软删除会话清理
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/cleanup \
  -H "Content-Type: application/json" \
  -H "admin_key: your_secure_admin_key" \
  -d '{"max_age_days": 30}'

# 定期检查会话统计
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/list \
  -H "Content-Type: application/json" \
  -H "admin_key: your_secure_admin_key" \
  -d '{"page": 1, "page_size": 50, "include_deleted": true}'

# 监控 Supabase 表大小
SELECT pg_size_pretty(pg_total_relation_size('arena_sessions'));
```

---

## 11. 更新和升级

### 11.1 后端更新

```bash
# 更新代码
git pull origin main

# 部署到 Heroku
git push heroku main

# 监控部署
heroku logs --tail
```

### 11.2 前端更新

```bash
cd web

# 更新代码
git pull origin main

# 部署到 Vercel
vercel --prod
```

### 11.3 数据库维护

```sql
-- 定期重建索引
REINDEX TABLE arena_sessions;

-- 定期清理表
VACUUM FULL arena_sessions;

-- 监控表大小
SELECT pg_size_pretty(pg_total_relation_size('arena_sessions'));
```

---

## 联系支持

如有问题，请参考：

- **项目文档**：`plans/sessionstore_supabase_complete_design.md`
- **部署指南**：`DEPLOYMENT_GUIDE_SESSIONSTORE.md`
- **迁移文档**：`migrations/README.md`
- **进展报告**：`plans/SESSIONSTORE_IMPLEMENTATION_PROGRESS.md`

**更新日期**：2024-01-21
**版本**：2.0.0（包含 SessionStore 持久化）

---

> 本指南在原有部署指南的基础上，增加了 SessionStore 持久化改造的完整部署流程和配置。
