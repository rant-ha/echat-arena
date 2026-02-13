# Empathy Arena 设计文档（学术实验版）

> 本文档是“交付手册 + 设计说明”。按第 9 章配置，即可在 Vercel + Heroku + Supabase 上跑通。

## 1. 项目愿景与核心目标
- 面向公众的 Web 实验平台，对比普通 LLM 回复 (Baseline) 与基于心理学共情策略的回复 (Empathetic) 在真实对话中的效果。
- 双盲测试：用户未知哪一路是实验组。
- 评估体系：人机共评（前端用户主观投票 + 后台 AI 裁判客观打分）。
- 数据价值：全量长期留存，用于科研论文（分析人机评价一致性、策略有效性）。

## 2. 系统架构（Headless）
- 前端：Vercel；Next.js 14 (App Router) + TS + Tailwind + Framer Motion + Zustand + SWR；API Routes 代理 Heroku（禁止浏览器直连）。
- 后端：Heroku Container；Python 3.9；FastAPI + Uvicorn；继续运行 fschat controller/worker。
- 数据库：Supabase (PostgreSQL) 作为单一真理源；RLS 保护。
- 定时归档：Heroku 内 apscheduler/cron 拉 Supabase → CSV → Google Drive；取消实时 Sheets 双写。

## 3. 技术栈与依赖红线
- 必锁版本：pydantic==2.8.2，gradio==4.44.1，huggingface_hub==0.23.0。
- 后端关键库：fastapi（已有）、uvicorn（已有）、apscheduler（定时）、gspread/httpx（Drive/HTTP 轻量客户端，需评估体积）。
- 禁止在 Heroku 写本地文件存储业务数据；日志仅 stdout。

## 4. 功能模块
### 4.1 鉴权
- Supabase Auth Email/Password。
- 注册邮箱域名白名单校验（如 @xxx.edu.cn 列表配置）。
- 未登录可体验但限流，并记录匿名 user_id。

### 4.2 对战流程（POST /api/arena/battle）
- Baseline 回复 A：直接 LLM。
- Empathy 回复 B：情绪识别 -> templates.json 选模板 -> 注入系统提示 -> LLM 生成共情回复。
- 双路 SSE 推送 A/B；首帧含 session_id、left/right 模型占位。
- 后台裁判异步：A/B 完成后触发 evaluator 模型按 CARE 量表打分，结果以 session_id 暂存后入库。

### 4.3 投票与结算（POST /api/arena/vote）
- 接收：user_vote (model_a/model_b/tie/both_bad) + user_tags + user_comment。
- 取后台 AI 评分，合并用户评价与完整对话入 Supabase。

### 4.4 历史记录（/history）
- 前端用 Supabase client 查询 votes（依赖 RLS）；展示对话、投票、AI 评分对比。

### 4.5 数据归档
- 定时批处理：每 4 小时从 Supabase 拉全量/增量 → CSV → 上传指定 Drive 目录。
- Drive 凭据：环境变量单行 JSON（SHEETS/DRIVE_CREDS），严禁提交 credentials.json。

## 5. 数据库 Schema（Supabase SQL）
```sql
create table public.votes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  session_id text not null,
  user_id uuid references auth.users(id),
  user_email text,
  prompt text not null,
  reply_a text not null,
  reply_b text not null,
  model_config jsonb,
  user_vote text check (user_vote in ('model_a','model_b','tie','both_bad')),
  user_tags jsonb,
  user_comment text,
  ai_scores jsonb,
  client_info text,
  base_model_name text,
  template_id text,
  strategy_name text
);
create index idx_votes_session on public.votes(session_id);
create index idx_votes_user on public.votes(user_id);
create index idx_votes_time on public.votes(created_at desc);

alter table public.votes enable row level security;
create policy "Service Role Full Access" on public.votes for all using (true) with check (true);
create policy "Users can view own history" on public.votes for select using (auth.uid() = user_id);
```

> 说明：后端会在写入时带上 `base_model_name`（用于 Controlled Variable 复现实验），以及 `template_id/strategy_name`（用于分层分析）。

## 6. API 契约（前端经 Next 代理 -> Heroku）
- GET /api/arena/config：`{ base_model_name }`。
- POST /api/arena/battle：Body `{ prompt, session_id? }`；SSE 事件：
  - 首帧：`{ side:"meta", session_id, left_model, right_model, template_id?, strategy_name?, emotion?, intensity?, support_type?, ts }`
  - 流式：`{ side:"left"|"right", delta, finish:false }`
  - 结束：`{ side:"left"|"right", finish:true }`
- POST /api/arena/vote：Body `{ session_id, vote, prompt, left_model?, right_model?, user_id?, user_email?, user_tags?, user_comment?, client_info? }`。
  - vote 允许：`left|right|model_a|model_b|tie|both_bad`；后端会规范化写入 DB：`model_a=baseline`、`model_b=strategy`。
  - 返回：`{ ok, session_id, revealed_left, revealed_right }`（revealed_* 含 arm + model_id）。
- 代理策略：浏览器只请求 Next.js 代理路由 [`route.ts`](web/app/api/proxy/[...path]/route.ts:1)，由其转发到 `ARENA_API_BASE`。

## 7. 后端实现要点（app.py + start.sh）
- [`app.py`](app.py)：FastAPI Headless Arena API。
  - `GET /api/arena/config`：返回可用模型列表（来自 [`api_endpoints.json`](api_endpoints.json)）。
  - `POST /api/arena/battle`：单连接 SSE，首帧 `side="meta"`，随后 `side="left"|"right"` 逐 token `delta`，结束帧 `finish=true`。
  - `POST /api/arena/vote`：读取 session 缓存合并 `ai_scores` 后写入 Supabase（service role），返回 `revealed_left/right`（arm+model_id）。
  - 后台 AI 裁判：battle 完成后 `asyncio.create_task` 调用 CARE 评审并缓存；vote 时若无分数则补算。
  - 归档：启动时（可选）apscheduler 定时执行 Supabase→CSV→Google Drive；另提供 `POST /api/arena/admin/archive` 手动触发。
- SSE 头：`Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`。
- [`start.sh`](start.sh)：先启动 fschat controller，再 `uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1`；保留 env 注入逻辑。
- 依赖红线：仍锁定 `pydantic==2.8.2`、`gradio==4.44.1`、`huggingface_hub==0.23.0`；新增可选依赖用于归档：`apscheduler`、`google-api-python-client`、`google-auth`。

## 8. 前端 IA/UX
- /battle：深色玻璃态；桌面左右，移动上下堆叠；底部输入；双路打字机流；投票后翻牌揭晓 “Baseline / Empathetic Bot”。
- /history：展示个人对话、投票、AI 评分对比；依赖 Supabase RLS。
- 交互：New Round 重抽；Regenerate 复用 prompt/模型（若后端允许）；慢模型提示；未登录限流提醒。

## 9. 配置与安全（交付手册 / Deployment Runbook）

### 9.1 实验设计强调：Single Model / Controlled Variable
- 本项目的实验目标是“控制变量”：**两路回复使用同一个底层模型（Single Model）**，差异仅来自 system prompt（Baseline vs Empathy Strategy）。
- 后端用 [`REPLY_MODEL_NAME`](app.py:32) + [`REPLY_API_BASE`](app.py:33) + [`REPLY_API_KEY`](app.py:34) 作为单一模型源。
  - 若不设置 `REPLY_MODEL_NAME`，会回退到 `BASELINE_MODEL/EMPATHY_MODEL`（不推荐用于论文实验）。
- 数据入库时，后端会把 DB 的 `reply_a/reply_b` 规范化为：
  - `reply_a` = baseline（对照组）
  - `reply_b` = strategy（实验组）
  - `user_vote` 也规范化为 `model_a|model_b|tie|both_bad`（其中 `model_a=baseline`）。

### 9.2 Vercel 部署步骤（Frontend / Next.js 14）
1) 选择仓库并导入项目（Vercel → Add New Project）。
2) **Root Directory** 选择 `web/`。
3) Build & Install：
   - Install Command：`npm install`
   - Build Command：`npm run build`
   - Output：使用 Next.js 默认（不需要手填）。
4) 配置环境变量（Project → Settings → Environment Variables）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_ALLOWED_DOMAINS`（可选，默认 `.edu.cn`；用逗号分隔）
   - `ARENA_API_BASE`（后端 Heroku 基础 URL，例如 `https://xxx.herokuapp.com`）
5) 部署后访问：
   - `/login`、`/register`、`/battle`、`/history`。

### 9.3 Heroku 部署步骤（Backend / Container Stack）
1) 创建 Heroku App，选择 **Stack = Container**（与 [`app.json`](app.json:1) 一致）。
2) 部署方式：
   - 使用 Heroku Dashboard 连接 GitHub，或用 Heroku CLI 推送容器（不强制）。
3) 设置 Config Vars（Heroku → Settings → Config Vars）：
   - 基础：
     - `OPENAI_API_BASE`（你的 OpenAI-compatible API base）
     - `OPENAI_API_KEY`
   - Controlled Variable（强烈建议用于实验）：
     - `REPLY_MODEL_NAME`（单一底层模型名）
     - `REPLY_API_BASE`（可选；默认回退 `OPENAI_API_BASE`）
     - `REPLY_API_KEY`（可选；默认回退 `OPENAI_API_KEY`）
   - Supabase（写入 votes 表）：
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY`（service_role）
   - CORS：
     - `ALLOWED_ORIGINS`（建议填 Vercel 域名；开发可先用 `*`）
   - 可选归档（Supabase → CSV → Google Drive）：
     - `ARCHIVE_ENABLED=1`
     - `ARCHIVE_INTERVAL_HOURS=4`
     - `DRIVE_CREDS_JSON`（单行 JSON 字符串）
     - `DRIVE_FOLDER_ID`

### 9.4 环境变量清单（对齐检查）
- Backend（Heroku / 本地后端）：见 [`.env.example`](.env.example)。
  - 必需（最小可运行）：`OPENAI_API_BASE`, `OPENAI_API_KEY`
  - 实验建议：`REPLY_MODEL_NAME`（以及可选的 `REPLY_API_BASE/REPLY_API_KEY`）
  - Supabase 入库：`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Frontend（Vercel / 本地 Next.js）：见 [`web/.env.example`](web/.env.example:1)。
  - 必需：`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ARENA_API_BASE`
  - 可选：`NEXT_PUBLIC_ALLOWED_DOMAINS`

### 9.5 Supabase RLS 必做
- votes 表必须启用 RLS，并开启策略：
  - `Users can view own history`：`auth.uid() = user_id`
- /history 页面直接用 Supabase Client 查询 votes 表，依赖 RLS 自动过滤。

- 禁止提交任何 credentials.json；所有密钥走环境变量。

## 10. 测试与验证
- SSE 流畅（桌面/移动）；投票入库；RLS 仅本人可读历史；邮箱白名单拦截；后台 evaluator 写 ai_scores；定时归档成功上传 Drive。

## 11. 里程碑
1) 后端 API 可用（battle 双路 SSE + vote 入库 + evaluator 异步）。
2) 前端 UI 骨架 + 流式 + 投票/翻牌。
3) 归档任务跑通（Supabase→CSV→Drive）。
4) 移动/桌面体验打磨与限流、白名单校验完成。
5) 部署与文档交付（env.example、start.sh/app.py 说明、RLS/域名白名单配置）。
