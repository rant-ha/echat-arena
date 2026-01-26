# OMC Notepad

## Priority Context
<!-- Keep under 500 chars. Always loaded on session start. -->
echat-arena: AI chat arena with multi-turn conversations. Backend: FastAPI (Heroku), Frontend: Next.js 14 (Vercel), DB: Supabase. Admin UI at /admin with password auth (ADMIN_PASSWORD env var).

## Working Memory
<!-- Timestamped session notes. Auto-pruned after 7 days. -->

## 2026-01-26 - 多项修复和功能增强

**Fix 1: 邮箱验证链接自定义**
- 创建 `/auth/verify` 端点处理自定义验证链接
- 创建 `/auth/error` 错误页面
- 将 `/auth/verify` 和 `/auth/error` 添加到 middleware PUBLIC_PATHS
- 用户现在收到 `https://chat.ranai.me/auth/verify?token_hash=...` 而非 Supabase/SendGrid 链接
- **需要用户操作**: SendGrid 禁用 Click Tracking + Supabase 修改邮件模板

**Fix 2: 模型排序功能**
- 后端添加 `PUT /admin/models/reorder` 批量排序 API
- 前端添加上下移动按钮（ChevronUp/ChevronDown）
- **修复 "No fields to update" 错误**: 将 `/reorder` 路由移到 `/{model_id}` 之前

**Fix 3: 下拉菜单被遮挡**
- 给打开菜单的 Card 添加 `relative z-50`
- 解决 `backdrop-blur` 导致的 stacking context 问题

**Fix 4: 投票按钮 UI 优化**
- 移除蓝绿色渐变配色（政治敏感）
- 使用设计系统变量: `bg-surface-tertiary`, `hover:bg-interactive-accent`

**Commits:**
- `64682aa` - feat: 添加自定义邮件验证端点
- `7859a80` - feat: 修复下拉菜单遮挡 + 添加模型排序功能
- `dc4d82f` - fix: 修复邮箱验证链接被中间件拦截问题
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

