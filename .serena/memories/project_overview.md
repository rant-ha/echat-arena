# echat-arena 项目概述

## 项目目的
echat-arena (Empathy Arena) 是一个基于Web的AI竞技场应用，用于运行受控的A/B测试实验，比较大型语言模型的响应。平台允许用户进行匿名的多轮对话比较两个AI模型的响应，包含情感分类和基于同理心的评估。

## 关键功能
- 匿名多模型聊天比较（A/B测试）
- 多轮对话支持，完整历史跟踪
- 情感分类（愤怒、悲伤、焦虑、恐惧、快乐、中性）
- 投票后聊天继续与获胜模型
- **三层会话持久化架构** - Redis L1 + Supabase L2 + 内存 L3
- **网络搜索集成** - Serper.dev Google Search API + LLM 关键词提炼
- **补偿队列和熔断器** - 数据库写入失败自动重试
- 全面的实验数据导出和分析
- **草稿对话保存** - 保存未投票的对话以便稍后继续
- **管理员后台** - 管理员认证、模型管理、用户管理、统计数据、归档管理

## 技术栈
### 后端 (Python FastAPI)
- 框架：FastAPI (Python)
- 异步HTTP：httpx（用于上游API调用）
- Token计数：tiktoken（用于上下文管理）
- 数据库：Supabase (PostgreSQL)
- 部署：Heroku

### 前端 (Next.js 14)
- 框架：Next.js 14
- React版本：18
- 语言：TypeScript
- 样式：Tailwind CSS
- 状态管理：React hooks
- 数据库认证：Supabase
- 部署：Vercel

### 数据库架构 (Supabase)
- `votes` - 核心投票记录，包含对话历史
- `arena_sessions` - 持久会话数据（多实例支持）
- `post_vote_turns` - 投票后聊天继续
- `draft_conversations` - 草稿对话保存（未投票的对话）
- `admin_sessions` - 管理员会话令牌存储
- `admin_audit_log` - 管理员操作审计日志
- `model_configs` - 模型配置管理
- 通过Supabase Auth处理认证

## 项目结构（重构后）
```
echat-arena/
├── Backend (Python FastAPI)           ← arena/main.py（重构后）
├── Frontend (Next.js 14)              ← web/
├── Database Schema (Supabase)         ← migrations/
└── Configuration & Deployment         ← .env.example, heroku.yml, Dockerfile
```

## 版本信息
- 版本：0.6.0
- 最后更新：2026-01-23
- 当前分支：refactor/arena-package（重构分支）
- 主要变更：模块化重构，将 app.py 拆分为 arena/main.py 和 arena/routes/