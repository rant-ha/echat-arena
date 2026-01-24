# OMC Notepad

## Priority Context
<!-- Keep under 500 chars. Always loaded on session start. -->
echat-arena: AI chat arena with multi-turn conversations. Backend: FastAPI (Heroku), Frontend: Next.js 14 (Vercel), DB: Supabase. Admin UI at /admin with password auth (ADMIN_PASSWORD env var).

## Working Memory
<!-- Timestamped session notes. Auto-pruned after 7 days. -->

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

