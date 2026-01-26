# OMC Notepad

## Priority Context
<!-- Keep under 500 chars. Always loaded on session start. -->
echat-arena: AI chat arena with multi-turn conversations. Backend: FastAPI (Heroku), Frontend: Next.js 14 (Vercel), DB: Supabase. Admin UI at /admin with password auth (ADMIN_PASSWORD env var).

## Working Memory
<!-- Timestamped session notes. Auto-pruned after 7 days. -->

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

