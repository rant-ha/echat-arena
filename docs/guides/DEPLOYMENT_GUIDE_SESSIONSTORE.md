# SessionStore 持久化改造 - 部署指南

## 1. 概述

本指南提供了将 SessionStore 持久化改造部署到生产环境的完整步骤，适用于 Heroku 后端 + Supabase 数据库的架构。

## 2. 先决条件

### 2.1 环境要求

- **Heroku 帐户**：用于部署后端应用
- **Supabase 项目**：用于数据库和认证服务
- **Vercel 帐户**：用于部署前端应用（如适用）
- **Python 3.9+**：本地开发和测试
- **PostgreSQL 12+**：Supabase 已提供

### 2.2 所需工具

```bash
# 安装 Heroku CLI
https://devcenter.heroku.com/articles/heroku-cli

# 安装 Supabase CLI（可选，用于本地开发）
npm install -g supabase

# 安装 Python 依赖
pip install -r requirements.txt
```

## 3. 部署步骤

### 3.1 准备 Supabase 数据库

#### 3.1.1 创建 arena_sessions 表

在 Supabase Dashboard 的 SQL Editor 中执行以下脚本：

```sql
-- 创建 arena_sessions 表
CREATE TABLE IF NOT EXISTS arena_sessions (
  session_id  TEXT PRIMARY KEY,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version     BIGINT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

#### 3.1.2 配置 Row Level Security (RLS)

由于后端使用 Service Role 访问 Supabase，RLS 需要允许服务角色访问：

```sql
-- 允许服务角色访问 arena_sessions 表
ALTER TABLE arena_sessions ENABLE ROW LEVEL SECURITY;

-- 创建策略允许服务角色所有操作
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

#### 3.1.3 设置定时任务（可选）

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

### 3.2 配置 Heroku 环境变量

在 Heroku Dashboard 或使用 CLI 设置以下环境变量：

```bash
# 设置 SessionStore 模式（必需）
heroku config:set ARENA_SESSION_STORE=supabase

# Supabase 配置（必需）
heroku config:set SUPABASE_URL=https://your-project-ref.supabase.co
heroku config:set SUPABASE_SERVICE_KEY=your-service-role-key

# 会话 TTL 设置（可选，默认 7200 秒 = 2 小时）
heroku config:set ARENA_SESSION_TTL_SEC=7200

# 最大会话数（可选，默认 2000）
heroku config:set ARENA_MAX_SESSIONS=2000

# 本地缓存 TTL（可选，默认 60 秒）
heroku config:set ARENA_CACHE_TTL_SEC=60

# 是否允许降级到内存存储（可选，默认 true）
heroku config:set ARENA_ALLOW_FALLBACK=true

# 管理员 API 密钥（必需，用于管理端点）
heroku config:set ARENA_ADMIN_API_KEY=your-secure-admin-key

# 请求超时设置（可选，默认 60 秒）
heroku config:set ARENA_REQUEST_TIMEOUT=60
```

### 3.3 部署后端代码

```bash
# 提交所有更改
git add .
git commit -m "feat: SessionStore 持久化改造"

# 部署到 Heroku
git push heroku main

# 监控部署日志
heroku logs --tail
```

### 3.4 验证部署

#### 3.4.1 检查应用日志

```bash
heroku logs --tail
```

查找以下日志确认 SessionStore 初始化成功：

```
[INFO] SessionStore initialized in supabase mode
```

#### 3.4.2 测试基本功能

```bash
# 测试健康检查
curl https://your-app.herokuapp.com/api/arena/health

# 测试会话创建（需要有效的 API 密钥和请求体）
curl -X POST https://your-app.herokuapp.com/api/arena/battle \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, how are you?"}'
```

#### 3.4.3 测试管理员 API

```bash
# 测试会话列表
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/list \
  -H "Content-Type: application/json" \
  -H "admin_key: your-secure-admin-key" \
  -d '{"page": 1, "page_size": 10}'
```

## 4. 监控和维护

### 4.1 关键指标监控

在 Heroku Dashboard 中设置以下监控指标：

- **错误率**：监控 `/api/arena/*` 端点的 5xx 错误
- **响应时间**：监控平均响应时间，特别是 `battle` 和 `continue` 端点
- **内存使用**：监控内存使用情况，特别是本地缓存
- **请求吞吐量**：监控每秒请求数

### 4.2 日志监控

设置日志警报以监控关键错误：

```bash
# 查看实时日志
heroku logs --tail

# 过滤错误日志
heroku logs --tail | grep "ERROR\|WARN"

# 过滤 SessionStore 相关日志
heroku logs --tail | grep "session_store\|supabase"
```

### 4.3 定期维护任务

```bash
# 手动触发软删除会话清理
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/cleanup \
  -H "Content-Type: application/json" \
  -H "admin_key: your-secure-admin-key" \
  -d '{"max_age_days": 30}'

# 定期检查会话统计
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/list \
  -H "Content-Type: application/json" \
  -H "admin_key: your-secure-admin-key" \
  -d '{"page": 1, "page_size": 50, "include_deleted": true}'
```

## 5. 故障排查

### 5.1 常见问题

#### 问题 1：SessionStore 初始化失败

**症状**：日志中显示 `Supabase mode enabled but SUPABASE_URL not configured`

**解决方案**：
```bash
# 检查环境变量
heroku config:get SUPABASE_URL

# 设置正确的 Supabase URL
heroku config:set SUPABASE_URL=https://your-project-ref.supabase.co
```

#### 问题 2：Supabase 连接错误

**症状**：日志中显示 `supabase_get_error` 或 `supabase_cas_update_error`

**解决方案**：
```bash
# 检查 Supabase 服务状态
curl https://your-project-ref.supabase.co/rest/v1/ 
  -H "apikey: your-service-role-key" 
  -H "Authorization: Bearer your-service-role-key"

# 检查网络连接
heroku run bash -a your-app
ping your-project-ref.supabase.co
```

#### 问题 3：并发冲突频繁

**症状**：日志中显示大量 `version_conflict` 错误

**解决方案**：
```bash
# 调整重试策略（在代码中修改）
# 或者考虑使用 Redis 分布式锁

# 监控冲突率
heroku logs --tail | grep "version_conflict" | wc -l
```

#### 问题 4：性能下降

**症状**：响应时间明显增加

**解决方案**：
```bash
# 检查 Supabase 查询性能
EXPLAIN ANALYZE 
SELECT * FROM arena_sessions 
WHERE session_id = 'test-session-id';

# 考虑添加额外索引
CREATE INDEX IF NOT EXISTS idx_arena_sessions_session_data_field 
ON arena_sessions (((session_data->>'field_name')));

# 调整本地缓存大小
heroku config:set ARENA_CACHE_TTL_SEC=120
```

### 5.2 回滚策略

如果发现严重问题，可以快速回滚到内存存储模式：

```bash
# 切换到内存模式
heroku config:set ARENA_SESSION_STORE=memory

# 重新部署
heroku restart
```

**回滚影响**：
- 切换到内存模式后，现有 Supabase 会话将不会被读取
- 用户需要重新开始对话
- 但可以快速恢复服务可用性

## 6. 安全注意事项

### 6.1 管理员 API 安全

- **使用强密钥**：确保 `ARENA_ADMIN_API_KEY` 是一个强随机字符串
- **限制访问**：仅允许特定 IP 地址访问管理端点（可以通过 Heroku 网络规则配置）
- **审计日志**：记录所有管理操作以便审计

### 6.2 数据保护

- **敏感数据**：确保会话数据不包含敏感用户信息
- **访问控制**：仅允许服务角色访问 Supabase 表
- **定期清理**：定期清理软删除的会话以避免数据积累

### 6.3 密钥管理

- **定期轮换**：定期轮换 `SUPABASE_SERVICE_KEY` 和 `ARENA_ADMIN_API_KEY`
- **最小权限**：确保 Supabase 服务角色仅有必要的权限
- **安全存储**：不要在代码仓库中存储密钥

## 7. 性能优化

### 7.1 缓存策略

```bash
# 调整缓存 TTL
heroku config:set ARENA_CACHE_TTL_SEC=120

# 监控缓存命中率
# 需要在代码中添加日志来跟踪缓存命中
```

### 7.2 批量操作

对于管理操作，考虑使用批量 API：

```python
# 批量软删除会话
session_ids = ["session1", "session2", "session3"]
for session_id in session_ids:
    await _SESSION_STORE.soft_delete(session_id)
```

### 7.3 索引优化

根据实际查询模式添加额外索引：

```sql
-- 如果经常按 vote_id 查询
CREATE INDEX IF NOT EXISTS idx_arena_sessions_vote_id 
ON arena_sessions (((session_data->>'vote_id')));

-- 如果经常按模型 ID 查询
CREATE INDEX IF NOT EXISTS idx_arena_sessions_model_id 
ON arena_sessions (((session_data->>'model_id')));
```

## 8. 监控和告警

### 8.1 关键指标

| 指标 | 阈值 | 告警级别 |
|------|------|----------|
| 错误率 | > 5% | 高 |
| 响应时间 | > 1s | 中 |
| 内存使用 | > 80% | 高 |
| 并发冲突率 | > 10% | 中 |
| 会话创建失败率 | > 1% | 高 |

### 8.2 日志告警

设置以下日志模式的告警：

- `supabase_get_error`
- `supabase_cas_update_error`
- `version_conflict`
- `session_store_fallback_to_memory`

### 8.3 定期报告

```bash
# 每日会话统计报告
curl -X POST https://your-app.herokuapp.com/api/arena/sessions/list \
  -H "Content-Type: application/json" \
  -H "admin_key: your-secure-admin-key" \
  -d '{"page": 1, "page_size": 1000}' > daily_report_$(date +%Y%m%d).json

# 每周性能报告
# 需要集成第三方监控工具
```

## 9. 更新和维护

### 9.1 版本更新

```bash
# 更新依赖
pip freeze > requirements.txt

# 提交更改
git add requirements.txt
git commit -m "chore: update dependencies"

# 部署
git push heroku main
```

### 9.2 数据库维护

```sql
-- 定期重建索引
REINDEX TABLE arena_sessions;

-- 定期清理表
VACUUM FULL arena_sessions;

-- 监控表大小
SELECT pg_size_pretty(pg_total_relation_size('arena_sessions'));
```

### 9.3 文档更新

```bash
# 更新设计文档
vim plans/sessionstore_supabase_complete_design.md

# 更新部署指南
vim DEPLOYMENT_GUIDE_SESSIONSTORE.md

# 提交文档更改
git add .
git commit -m "docs: update deployment guide"
```

## 10. 联系和支持

如有问题或需要帮助，请参考：

- **项目文档**：`plans/sessionstore_supabase_complete_design.md`
- **部署指南**：`DEPLOYMENT_GUIDE_SESSIONSTORE.md`
- **迁移文档**：`migrations/README.md`
- **进展报告**：`plans/SESSIONSTORE_IMPLEMENTATION_PROGRESS.md`

**更新日期**：2024-01-21
**版本**：1.0.0

---

> 本指南将随着项目进展持续更新，确保所有运维人员了解最新的部署和维护流程。
