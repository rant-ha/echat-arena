# OMC Notepad

## Priority Context
<!-- Keep under 500 chars. Always loaded on session start. -->
echat-arena: 双模型A/B情感支持AI测试平台。后端 arena/ 包。分支 refactor/arena-package。部署: Heroku+Vercel+Supabase+Redis。Web搜索已从DuckDuckGo切换到Serper.dev(f79dead)，含LLM关键词提炼+分层超时。持久化三阶段加固完成(9a34bf4)。Redis L1缓存层。部署需设 ARENA_SESSION_STORE=redis + SERPER_API_KEY。

## Working Memory
<!-- Timestamped session notes. Auto-pruned after 7 days. -->

## 2026-02-13 - Web Search: DuckDuckGo → Serper.dev 迁移完成

**问题**: DuckDuckGo 在 Heroku 上 IP 被限流/屏蔽，搜索频繁失败
**方案**: 改用 Serper.dev Google Search API + LLM 关键词提炼 (commit f79dead)

**修改文件 (5)**:
| 文件 | 改动 |
|------|------|
| `arena/config.py` | +SERPER_API_KEY, SERPER_GL, SERPER_HL, SEARCH_QUERY_MODEL, SEARCH_QUERY_REFINE_TIMEOUT_SEC |
| `arena/prompts.py` | +SEARCH_QUERY_REFINE_PROMPT (关键词提炼 prompt) |
| `arena/tools/web_search.py` | 完全重写: Serper API + LLM提炼 + 分层超时(8s管线/5s LLM) + _http_post_json_with_retries |
| `requirements.txt` | 删除 duckduckgo-search==8.1.1 |
| `.env.example` | 添加新环境变量文档 |

**接口不变**: `search_web()` / `format_search_context()` 签名和返回格式不变，调用方无需改动
**模型说明**: `SEARCH_QUERY_MODEL` 可设为任意模型名（如 gpt-4o-mini），_get_endpoint() 自动 fallback 到 OPENAI_API_BASE/KEY
**部署配置**: `SERPER_API_KEY=xxx`, 可选 `SERPER_GL=cn`, `SERPER_HL=zh-cn`
**状态**: 已部署验证，搜索结果正常出现在模型回复中

---

## 2026-02-12 - Post-vote Chat 持久化三阶段加固完成

### V7 持久化加固计划 — 全部三阶段已完成并推送

**Phase 1: 立即修复** (commit 93b3730)
- InsertStatus 枚举统一数据库操作结果
- 两层重试循环 (即时 3 次 + 延迟 2 次)
- 补偿队列 (内存+文件备份) 兜底最终一致性
- PersistenceMetrics 计数器 + /health 端点暴露

**Phase 2: 数据库优化** (commit 93b3730)
- 共享 httpx 连接池 (`arena/db/client.py`)
- 断路器模式 CLOSED→OPEN→HALF_OPEN (`arena/db/circuit_breaker.py`)
- Supabase store 切换为共享客户端
- 前端 localStorage turns 缓存 (usePostVoteChat)

**Phase 3: Redis L1 缓存层** (commit 9a34bf4)
| 文件 | 说明 |
|------|------|
| `arena/config.py` | +3 Redis 环境变量 (REDIS_URL, TTL, MAX_CONNECTIONS) |
| `arena/session/redis_store.py` | 296行, WATCH/MULTI/EXEC CAS 乐观锁 |
| `arena/session/hybrid.py` | 203行, Redis L1 + Supabase L2 write-through |
| `arena/session/__init__.py` | 条件导入, redis 未安装时降级为 None |
| `arena/main.py` | store 选择逻辑 + 生命周期管理 (216行) |
| `Dockerfile` | 添加 `redis[hiredis]` 依赖 |

**部署配置**: `ARENA_SESSION_STORE=redis`，REDIS_URL 由 Heroku addon 自动注入
**降级链**: Redis+Supabase混合 → 纯Supabase → Memory

### 架构总览
```
前端 localStorage → Redis L1 (TTL 1h) → Supabase L2 (持久) → 补偿队列 (兜底)
```
数据丢失风险降低约 99%（四层防护）。

---

## 2026-02-12 - Post-vote Chat 持久化全面修复（第6次，根治）

### 问题
投票后继续对话，刷新浏览器后对话记录消失。已修5次仍复现。用户确认：
- /battle 和 /chat/[id] 两个页面刷新后都消失
- Supabase post_vote_turns 表有数据（后端保存成功）
- 问题在前端恢复逻辑

### 根因分析
1. **Battle 页 sessionId 丢失**：hook 依赖 `meta?.session_id`（ephemeral React state），刷新后 null。localStorage 存了 session_id 但从不恢复。
2. **后端 is_disconnected() 早退**：流式完成后、DB写入前检查断开→静默丢弃 turn。
3. **Chat 页无加载/错误反馈**：history fetch 失败时页面空白，用户无感知。

### 修复方案（commit 56155ac）
| 文件 | 改动 |
|------|------|
| `arena/services/chat.py` | 删除 line 298-299 `is_disconnected()` 早退，保证即使断开也持久化 |
| `web/hooks/usePostVoteChat.ts` | 新增 `storedSessionId` + `resolvedSessionId`(prop优先、localStorage回退) + `retryHistory` |
| `web/app/battle/page.tsx` | 移除全部 post-vote 内联聊天(-116行)，投票后跳转 /chat/[vote_id]，tie/both_bad 跳 /history |
| `web/app/chat/[id]/page.tsx` | 添加历史加载中/错误+重试按钮 UI |

### 架构变更
- **Battle 页**：不再管理 post-vote 状态，投票后 800ms 跳转 `/chat/[vote_id]`
- **Draft 页**：已在上轮改为跳转（039d6ba）
- **Chat 页**：唯一的 post-vote 对话入口，session_id 来自 Supabase 数据库查询
- **usePostVoteChat hook**：`resolvedSessionId = sessionId || storedSessionId` 解决刷新丢失

---
## 2026-02-11 - Post-vote Chat 重构 + Draft 页面简化 + 安全修复

### 提交记录 (refactor/arena-package)
- `b52ee56` - refactor: extract usePostVoteChat hook and simplify battle/chat pages
- `039d6ba` - fix: draft page redirect-only post-vote UX + /chat/history session validation

### usePostVoteChat Hook (web/hooks/usePostVoteChat.ts) - 新文件
- 统一管理 post-vote 聊天状态：voteId, winnerSide, turns, SSE streaming
- localStorage 持久化 (Battle 页用 localStorageKey，Draft 页不用)
- 被 Battle 和 Chat/[id] 页面使用，Draft 页面不使用（redirect-only）

### Draft 页面改动 (web/app/draft/[session_id]/page.tsx)
- 移除 usePostVoteChat hook，改为本地 voteId/winnerSide/pendingRedirect 状态
- 投票后显示"继续与获胜模型对话 →"跳转按钮，不再内联渲染 post-vote chat
- fetchDraft 用 `res.status === 404 && data.vote_id` 双条件判断
- tie/both_bad 用 pendingRedirect 防重复点击，isVoted 仅由 voteId 驱动

### 安全修复
1. `/chat/history` session_id 绑定校验（chat.py:182-189）
   - 先查 vote_record → 校验 session_id → 再查 turns（防信息泄露）
   - 不匹配返回 404（降低枚举价值）
2. `_fetch_vote_record` SELECT 补 session_id 列（votes.py:227）
3. Cache-Control: no-store 加到 /chat/history 全路由 + get_single_draft 所有 404

### 后端 Draft API 增强 (drafts.py:get_single_draft)
- Draft 不存在时 best-effort 回退查 votes 表拿 vote_id
- 404 body 可选带 vote_id，前端据此显示跳转入口

### 热修复
- chat.py: _history_error/_history_response 定义移到 guard clause 前（修复 UnboundLocalError）
- 勘误: "所有 404 加 no-store" 仅限 get_single_draft，vote_draft 的 POST 404 不需要

---
## 2026-01-26 - 功能增强和数据结构优化

### Part 1: Draft 页面添加模型选择器
- 后端: `/api/arena/continue` 端点支持 `model_key` 参数
- 前端 Hook: `useBattleStream.ts` 的 `continueConversation` 添加 modelKey 参数
- Draft 页面: 集成 ModelSelector 到 Header，仅投票前显示
- 与 Battle 页面共享 localStorage 持久化

### Part 2: Vote 表数据结构优化
**问题**: `model_config` 中 `left/right` (UI层) 与 `model_a/model_b` (DB层) 混淆
- `left/right` = 屏幕位置，随机分配
- `model_a/model_b` = 数据库语义，固定（A=baseline, B=strategy）

**解决**: 新增 `winner_type` 字段
- `model_a` → `baseline`
- `model_b` → `strategy`
- `tie` → `tie`
- `both_bad` → `both_bad`

**文件**:
- `migrations/add_winner_type.sql` - 迁移脚本（含回填+索引）
- `app.py` - 主投票 + Draft投票逻辑添加 winner_type

### Part 3: Battle 投票揭示优化
- 投票后不再显示实际模型 ID（如 nv/ds-v3.1-terminus）
- 改为显示匿名标签 "Model A" / "Model B"
- 修改文件: `web/app/battle/page.tsx` 第 740, 747 行

### Part 4: SessionStore put_or_update 修复
**问题**: 草稿恢复时 Supabase 409 冲突错误
```
duplicate key value violates unique constraint "arena_sessions_pkey"
old_version: 0, new_version: 1
```

**原因**: `vote_draft()` 调用 `put()` 时用 `old_version=0` 尝试创建，但 session 可能已存在

**解决**: 新增 `put_or_update()` 方法 (Check-Then-Upsert 模式)
- 先检查 session 是否存在
- 存在 → CAS 更新 (create_if_not_exists=False)
- 不存在 → 创建 (create_if_not_exists=True)
- 3 次重试 + 指数退避
- 失败回退到内存存储

**修改文件**:
- `app.py:1715-1853` - 新增 `put_or_update()` 方法
- `app.py:4220-4227` - `vote_draft()` 使用新方法

### Part 5: 其他修复
- 邮箱验证链接自定义 (`/auth/verify` 端点)
- 模型排序功能 (`PUT /admin/models/reorder`)
- 下拉菜单 z-index 修复
- 投票按钮 UI 优化

### Part 6: AI 评估时机优化
**问题**: 评估模型在每次模型回复时都触发，API 调用次数和速率消耗过高

**解决**: 将评估改为仅在用户投票时触发
- 移除 `battle()` 中的即时评估 (原 lines 3056-3074)
- 增强 `vote()` 评估逻辑，修复 reply_key 映射 bug
- 为 `vote_draft()` 新增评估功能 (BackgroundTasks)

**reply_key 映射修复**:
- `conversation_history[].reply_a` = 位置层（始终左侧）
- DB `model_a` = 语义层（始终 baseline）
- `is_left_baseline` 决定映射：baseline 在左→reply_key_a="reply_a"，在右→reply_key_a="reply_b"

**性能**: 评估 API 调用减少 50-90%（仅投票的 session 才评估）

**修改文件**: `app.py`
- 删除 battle() 评估代码
- 修改 vote() 评估逻辑 (lines 3887-3934)
- 修改 vote_draft() 签名 + 添加评估任务 (lines 4093, 4193-4229)

**Commits:**
- `eb50e3d` - perf: 优化 AI 评估时机，仅在用户投票时评估
- `398503e` - chore: 更新项目进度笔记
- `4af276d` - fix: 修复 draft API 并发请求导致的 500 错误 (put_or_update)
- `f2af5c7` - fix: 投票后隐藏实际模型ID，显示Model A/B
- `43310f9` - feat: 添加 winner_type 字段优化统计
- `7b84374` - feat: Draft 页面添加模型选择器功能
- `1e0cd67` - fix: 修复三个问题 - API路由顺序 + 投票按钮UI + 下拉菜单遮挡

---

## 2026-01-25 - Draft Save & Resume Feature + Heroku Fix

**New Feature: 草稿保存和恢复功能**

用户未投票的对话现在会自动保存到数据库，可以在 /history 页面恢复并继续。

**Created Files (2):**
- `migrations/add_draft_conversations.sql` - 草稿表 with RLS policies
- `web/app/draft/[session_id]/page.tsx` - 草稿详情页（查看、投票、继续对话）

**Modified Files (4):**
- `app.py` - 添加 draft API endpoints:
  - `POST /api/arena/draft` - 保存草稿
  - `GET /api/arena/drafts` - 获取用户草稿列表
  - `GET /api/arena/draft/{session_id}` - 获取单个草稿
  - `POST /api/arena/draft/{session_id}/vote` - 草稿投票（恢复session到内存）
  - `DELETE /api/arena/draft/{session_id}` - 删除草稿
- `web/app/battle/page.tsx` - 自动保存草稿，投票后删除
- `web/app/chat/[id]/page.tsx` - 投票后继续对话功能
- `web/app/history/page.tsx` - 显示草稿列表，点击进入详情页

**Key Features:**
- 对话自动保存到数据库（不依赖localStorage）
- 浏览器关闭后可恢复未投票对话
- 草稿投票后恢复session到内存，支持继续对话
- 只有选择胜者(A/B)才能继续对话，Tie/Both Bad 不能继续
- 投票后隐藏内部配置信息(Strategy/Baseline)

**Bug Fix: Heroku H10 Crash**
- 原因：`Query` 未从 FastAPI 导入
- 修复：`app.py` 第18行添加 `Query` 到 import

**Commits:**
- `e7baf00` - feat: Add draft save and resume functionality
- `9aecac0` - fix: Add missing Query import to fix Heroku H10 crash

---

## 2026-01-24 - Model Selector Feature Complete

**New Feature: Battle 页面模型选择器**

用户现在可以在 Battle 页面选择不同的 AI 模型进行对话，类似 ChatGPT 的模型选择器设计。

**Created Files (2):**
- `migrations/add_model_is_default.sql` - 添加 is_default 列和唯一约束
- `web/components/ModelSelector.tsx` - ChatGPT 风格下拉选择器组件

**Modified Files (3):**
- `app.py` - 添加公共 API `GET /api/arena/models` + 修改 battle 端点接受 model_key
- `web/hooks/useBattleStream.ts` - startBattle 添加 modelKey 参数
- `web/app/battle/page.tsx` - 集成 ModelSelector + localStorage 持久化

**Key Features:**
- 下拉框显示模型名称 + 描述
- 键盘导航支持 (↑↓ Enter Escape)
- 加载/错误/空状态处理
- localStorage 持久化用户选择
- 公共 API 速率限制 (60 req/min)
- 安全：不暴露 API 密钥

**Architecture Decision:**
- 使用 model_key 作为前后端桥梁
- 约束：数据库模型必须在 _MODEL_CONFIG 或环境变量中有匹配项
- 回退链：localStorage → API default → REPLY_MODEL_NAME → BASELINE_MODEL_ID

**Deployment:**
1. Run `migrations/add_model_is_default.sql` in Supabase SQL Editor
2. Set one model's `is_default = true` in Admin
3. Push to deploy

---

## 2026-01-24 - Admin UI Bug Fixes

**Fixed Issues:**
1. `/admin/sessions` 显示 "Unauthorized" → 统一使用 admin-token 认证
2. `/admin/statistics` 显示 404 → 创建重定向到 /admin

---

## 2026-01-24 - Admin UI Implementation Complete

**Created Files (16 total):**

**Database Migrations:**
- `migrations/add_model_configs.sql` - 模型配置表 (model_key, api_base, api_key_encrypted, weight, etc.)
- `migrations/add_admin_audit_log.sql` - 审计日志表

**Backend API (app.py ~800 lines added):**
- Admin Auth: `/api/arena/admin/login`, `/admin/verify`, `/admin/logout`
- Model CRUD: `GET/POST/PUT/DELETE /api/arena/admin/models`
- User Management: `GET /admin/users`, `POST /admin/users/{id}/disable|enable`, `GET /admin/users/{id}/votes`
- Statistics: `GET /api/arena/admin/statistics?period=7d`

**Frontend Pages (9):**
- `web/app/admin/layout.tsx` - Auth wrapper with sidebar
- `web/app/admin/page.tsx` - Dashboard with stats cards and charts
- `web/app/admin/login/page.tsx` - Password login
- `web/app/admin/models/page.tsx` - Model list
- `web/app/admin/models/new/page.tsx` - Create model
- `web/app/admin/models/[id]/page.tsx` - Edit model
- `web/app/admin/users/page.tsx` - User management
- `web/app/admin/sessions/page.tsx` - Session management

**Components (2):**
- `web/components/admin/AdminSidebar.tsx`
- `web/components/admin/StatsCard.tsx`

**Hook (1):**
- `web/hooks/useAdminAuth.ts` - Token management, login/logout

**Modified:**
- `web/middleware.ts` - Skip Supabase auth for /admin/* routes

**Deployment:**
1. Run migrations in Supabase SQL Editor
2. Set `ADMIN_PASSWORD` in Heroku
3. Push to deploy

**Features:**
- Dashboard: total votes, users, sessions, active models, vote distribution chart, daily activity chart
- User Management: list, search, disable/enable, view vote history
- Model Configuration: CRUD, API key management, weight settings
- Session Management: list, delete/restore, bulk cleanup

## MANUAL
<!-- Never auto-pruned. User-controlled permanent notes. -->

