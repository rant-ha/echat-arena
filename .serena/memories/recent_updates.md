# echat-arena 最近更新

## 2026-02-13 - Web Search 迁移完成

### 问题
DuckDuckGo 在 Heroku 上 IP 被限流/屏蔽，搜索频繁失败

### 解决方案
改用 Serper.dev Google Search API + LLM 关键词提炼

### 修改文件（5个）
| 文件 | 改动 |
|------|------|
| `arena/config.py` | +SERPER_API_KEY, SERPER_GL, SERPER_HL, SEARCH_QUERY_MODEL, SEARCH_QUERY_REFINE_TIMEOUT_SEC |
| `arena/prompts.py` | +SEARCH_QUERY_REFINE_PROMPT (关键词提炼 prompt) |
| `arena/tools/web_search.py` | 完全重写: Serper API + LLM提炼 + 分层超时(8s管线/5s LLM) + _http_post_json_with_retries |
| `requirements.txt` | 删除 duckduckgo-search==8.1.1 |
| `.env.example` | 添加新环境变量文档 |

### 接口不变
`search_web()` / `format_search_context()` 签名和返回格式不变，调用方无需改动

### 模型说明
`SEARCH_QUERY_MODEL` 可设为任意模型名（如 gpt-4o-mini），`_get_endpoint()` 自动 fallback 到 OPENAI_API_BASE/KEY

### 部署配置
```bash
SERPER_API_KEY=xxx
SERPER_GL=cn              # 地理位置
SERPER_HL=zh-cn           # 界面语言
```

### 状态
✅ 已部署验证，搜索结果正常出现在模型回复中

---

## 2026-02-13 - 持久化三阶段加固完成

### 架构变更
三层会话存储架构：
- **L1**: Redis 缓存（快速访问）
- **L2**: Supabase（权威存储）
- **L3**: 本地内存（降级兜底）

### 新增文件
| 文件 | 用途 |
|------|------|
| `arena/session/redis_store.py` | Redis L1 缓存实现 |
| `arena/session/hybrid.py` | 混合存储（L1+L2） |
| `arena/db/compensation.py` | 补偿队列（失败重试） |
| `arena/db/circuit_breaker.py` | 熔断器（防止级联失败） |
| `arena/db/metrics.py` | 持久化指标监控 |

### 关键特性
1. **CAS 并发控制**: 乐观锁防止并发更新冲突
2. **软删除**: 数据可恢复，支持审计
3. **本地缓存**: SupabaseSessionStore 内置 LRU 缓存（TTL 60秒）
4. **自动降级**: Redis 失败自动降级到 Supabase-only
5. **补偿队列**: 失败写入持久化到本地文件，启动时恢复
6. **熔断器**: 防止级联失败，自动打开/关闭

### 配置
```bash
# 会话存储模式
ARENA_SESSION_STORE=redis  # memory | redis | supabase

# Redis 配置（L1）
REDIS_URL=redis://localhost:6379
REDIS_SESSION_TTL_SEC=7200
REDIS_MAX_CONNECTIONS=50
```

### 状态
✅ 已部署验证，会话在 dyno 重启后正常恢复

---

## 2026-02-13 - 投票后继续对话功能

### 新增功能
用户投票后可与获胜模型继续对话

### 数据库变更
- **新增表**: `post_vote_turns`
- **字段**:
  - `id` (UUID) - 主键
  - `vote_id` (UUID) - 关联投票
  - `user_id` (UUID) - 用户（可为 NULL）
  - `winner_side` (TEXT) - 'left' 或 'right'
  - `turn_index` (INTEGER) - 轮次索引（从 1 开始）
  - `user_message` (TEXT) - 用户消息
  - `assistant_message` (TEXT) - 模型回复
  - `created_at` (TIMESTAMPTZ) - 创建时间

### API 端点
- `POST /api/arena/chat` - 投票后对话（SSE 流式）
- `GET /api/arena/chat/history` - 获取对话历史

### 特性
- SSE 流式响应
- 独立存储（不影响实验数据）
- 会话重建支持（过期会话可恢复）

### 状态
✅ 已部署验证，投票后对话正常工作

---

## 2026-02-13 - 多轮对话支持

### 新增功能
支持多轮对话，完整历史跟踪

### 数据库变更
- **votes 表新增字段**:
  - `conversation_history` (JSONB) - 完整对话历史
  - `turn_count` (INTEGER) - 对话轮次

### 索引优化
- `idx_votes_turn_count` - 按轮次过滤
- `idx_votes_conversation_history_gin` - JSONB 查询优化

### 单侧上下文隔离
每个模型维护独立的上下文历史，防止信息泄漏

### 状态
✅ 已部署验证，多轮对话正常工作

---

## 2026-02-13 - 投票幂等性增强

### 问题
用户可能重复提交投票，导致数据污染

### 解决方案
- **唯一约束**: `(session_id)` 在 votes 表
- **幂等性检查**: 投票前检查是否已存在
- **错误处理**: 返回已有投票信息而非错误

### 状态
✅ 已部署验证，重复投票被正确处理

---

## 部署检查清单

### 环境变量
```bash
# 必需
OPENAI_API_BASE=
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# 推荐
ARENA_SESSION_STORE=redis
REDIS_URL=
SERPER_API_KEY=
```

### 数据库迁移
```sql
-- 验证所有表存在
\i migrations/verify_schema.sql

-- 检查索引
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename IN ('votes', 'post_vote_turns', 'arena_sessions');
```

### 健康检查
```bash
curl https://your-app.herokuapp.com/health
```

### 预期输出
```json
{
  "ok": true,
  "version": "0.6.0",
  "ts": "2026-02-13T...",
  "persistence": {
    "metrics": {...},
    "circuit_breaker": {...},
    "compensation_queue_size": 0
  }
}
```
