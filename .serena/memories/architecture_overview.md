# echat-arena 架构概述

## 系统架构

### 高层架构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Database      │
│   (Next.js 14)  │◄──►│   (FastAPI)     │◄──►│   (Supabase)    │
│   localhost:3000│    │   localhost:8000│    │   PostgreSQL    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    User         │    │   OpenAI API    │    │   Google Drive  │
│    Browser      │    │   (External)    │    │   (Archive)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 后端架构（重构后）

### 模块结构（重构后）
```
arena/
├── main.py             # FastAPI应用组装（重构后新增）
├── config.py           # 配置管理和环境变量
├── models.py           # 数据模型和Pydantic模式
├── llm.py              # LLM API调用和流处理
├── classifier.py       # 情感分类器
├── evaluator.py        # 评估逻辑
├── prompts.py          # 系统提示和模板
├── utils.py            # 工具函数
├── state.py            # 会话状态管理
├── archive.py          # 归档功能
├── __init__.py         # 包导出
├── db/                 # 数据库操作
│   ├── __init__.py
│   ├── votes.py        # 投票CRUD操作
│   └── post_vote.py    # 投票后聊天操作
├── routes/             # API路由（重构后新增）
│   ├── __init__.py
│   ├── health.py       # 健康检查端点
│   ├── config_routes.py # 配置端点
│   ├── battle.py       # 对战端点
│   ├── vote.py         # 投票端点
│   ├── chat.py         # 聊天端点
│   ├── drafts.py       # 草稿端点
│   ├── sessions.py     # 会话端点
│   └── admin/          # 管理路由（重构后新增）
│       ├── __init__.py
│       ├── auth.py     # 管理员认证
│       ├── models.py   # 模型管理
│       ├── users.py    # 用户管理
│       ├── stats.py    # 统计数据
│       └── archive.py  # 归档管理
├── services/           # 业务逻辑服务
│   ├── __init__.py
│   ├── battle.py       # 对战逻辑
│   └── reconstruction.py
└── session/            # 会话管理
    ├── __init__.py
    ├── base.py         # 基础会话类
    └── supabase.py     # Supabase会话存储
```

### 应用组装（重构后）

#### arena/main.py
- **功能**: FastAPI应用组装和启动逻辑
- **特性**:
  - 模块化路由注册
  - CORS中间件配置
  - 启动事件处理
  - 会话存储初始化（内存或Supabase）
  - 归档任务调度

#### 路由模块
- **health**: `/api/arena/health` - 健康检查
- **config_routes**: `/api/arena/config` - 配置信息
- **battle**: `/api/arena/battle` - 对战端点（SSE流）
- **vote**: `/api/arena/vote` - 投票端点
- **chat**: `/api/arena/chat` - 聊天端点
- **drafts**: `/api/arena/drafts` - 草稿管理（保存未投票的对话）
- **sessions**: `/api/arena/sessions` - 会话管理
- **admin/auth**: `/api/arena/admin/auth` - 管理员认证
- **admin/models**: `/api/arena/admin/models` - 模型管理
- **admin/users**: `/api/arena/admin/users` - 用户管理
- **admin/stats**: `/api/arena/admin/stats` - 统计数据
- **admin/archive**: `/api/arena/admin/archive` - 归档管理

### 关键端点

#### Battle端点 (SSE流)
- **端点**: `POST /api/arena/battle`
- **功能**: 启动新聊天轮次，SSE流式传输两个模型的响应
- **请求体**:
  ```json
  {
    "prompt": "用户输入的提示词",
    "session_id": "optional-session-uuid",
    "model_a": "baseline-model-id",
    "model_b": "strategy-model-id",
    "use_sse": true
  }
  ```

#### Vote端点
- **端点**: `POST /api/arena/vote`
- **功能**: 记录投票和完整对话历史
- **请求体**:
  ```json
  {
    "session_id": "session-uuid",
    "winner": "left" | "right",
    "conversation_history": [...],
    "turn_count": 1,
    "emotion": "neutral",
    "intensity": "medium",
    "support_type": "both"
  }
  ```

#### Session端点
- **端点**: `GET /api/arena/sessions/{session_id}`
- **功能**: 检索会话数据

#### Post-Vote Chat端点
- **端点**: `POST /api/arena/post-vote-chat`
- **功能**: 投票后继续与获胜模型聊天

### 会话管理

#### 三层会话存储架构（最新）
- **L1 - Redis 缓存层**（可选）
  - **位置**: `arena/session/redis_store.py`
  - **用途**: 快速访问热点会话
  - **TTL**: `REDIS_SESSION_TTL_SEC`（默认：7200秒）
  - **连接池**: `REDIS_MAX_CONNECTIONS`（默认：50）
  - **特性**: 高性能、自动降级

- **L2 - Supabase 权威存储**
  - **位置**: `arena/session/supabase.py`
  - **表**: `arena_sessions`
  - **字段**:
    - `session_id` (TEXT) - 主键
    - `session_data` (JSONB) - 完整会话状态
    - `version` (BIGINT) - 乐观锁（CAS）
    - `expires_at` (TIMESTAMPTZ) - TTL支持
    - `deleted_at` (TIMESTAMPTZ) - 软删除支持
  - **特性**:
    - 跨dyno重启持久化
    - 多实例一致性（共享状态）
    - 并发更新的乐观锁（CAS）
    - 数据恢复的软删除
    - 过期会话的自动清理
    - 本地缓存（LRU，TTL 60秒）

- **L3 - 内存降级层**
  - **位置**: `arena/session/base.py`
  - **用途**: 当 Redis 和 Supabase 都不可用时的降级方案
  - **TTL**: `ARENA_SESSION_TTL_SEC`（默认：7200秒）
  - **最大会话数**: `ARENA_MAX_SESSIONS`（默认：2000）

#### 混合存储模式
- **位置**: `arena/session/hybrid.py`
- **架构**: Redis (L1) + Supabase (L2) write-through
- **读路径**: L1 hit → return; L1 miss → L2 lookup + backfill L1
- **写路径**: L2 first → then L1
- **特性**:
  - Redis 失败自动降级到 Supabase-only
  - 数据正确性优先于性能
  - 优雅降级，永不丢失数据

#### 配置
```bash
# 会话存储模式
ARENA_SESSION_STORE=redis  # memory | redis | supabase

# Redis 配置（L1）
REDIS_URL=redis://localhost:6379
REDIS_SESSION_TTL_SEC=7200
REDIS_MAX_CONNECTIONS=50

# Supabase 配置（L2）
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

### 网络搜索系统（最新）

#### 搜索架构
- **API**: Serper.dev (Google Search API)
- **LLM 提炼**: 关键词优化
- **超时控制**: 8秒管线 / 5秒 LLM

#### 实现细节
- **位置**: `arena/tools/web_search.py`
- **流程**:
  1. 用户输入 → LLM 提炼关键词（5秒超时）
  2. 关键词 → Serper.dev 搜索
  3. 结果 → 格式化为 LLM 上下文
- **配置**:
  ```bash
  SERPER_API_KEY=
  SERPER_GL=cn              # 地理位置
  SERPER_HL=zh-cn           # 界面语言
  SEARCH_QUERY_MODEL=       # LLM 提炼模型
  ARENA_WEB_SEARCH_TIMEOUT_SEC=8
  ARENA_SEARCH_QUERY_REFINE_TIMEOUT_SEC=5
  ```

#### 集成点
- **Battle 端点**: 用户可切换搜索开关
- **Continue 端点**: 多轮对话中支持搜索
- **格式化**: `format_search_context()` 生成带引用的上下文

### 持久化加固（最新）

#### 补偿队列
- **位置**: `arena/db/compensation.py`
- **用途**: 数据库写入失败自动重试
- **特性**:
  - 失败写入持久化到本地文件
  - 应用启动时自动恢复
  - 关闭时处理剩余队列

#### 熔断器
- **位置**: `arena/db/circuit_breaker.py`
- **用途**: 防止级联失败
- **特性**:
  - 失败计数和阈值
  - 自动打开/关闭
  - 半开状态测试

#### 持久化指标
- **位置**: `arena/db/metrics.py`
- **用途**: 监控持久化健康状态
- **指标**:
  - 写入成功/失败计数
  - 熔断器状态
  - 补偿队列大小

### 情感分类系统

#### 分类类别
- **情感（6个类别）**:
  - `anger` - 愤怒、恼怒、冒犯
  - `sadness` - 悲伤、失落、失望
  - `anxiety` - 担忧、紧张、压力
  - `fear` - 恐惧、害怕后果
  - `happy` - 快乐、满足、满意
  - `neutral` - 中性情感语调

- **强度（3个级别）**:
  - `low` - 轻微情感
  - `medium` - 中等情感（默认）
  - `high` - 强烈情感

- **支持类型（3个类别）**:
  - `emotional` - 情感支持/陪伴
  - `practical` - 实用建议/解决方案
  - `both` - 情感和实用支持都有

#### 分类器实现
- **位置**: `app.py`（第81-120+行）
- **系统提示**: 中文文本（支持中文输入分类）
- **输出格式**: 结构化JSON输出
- **集成**:
  - 异步运行（非阻塞）
  - 默认超时：12秒
  - 回退：超时或失败时返回`CLASSIFICATION_ERROR`
  - 结果包含在投票记录中

## 前端架构

### 应用结构
```
web/
├── app/                    # Next.js 14 App Router
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 主页
│   ├── globals.css        # 全局样式
│   ├── HomeClient.tsx     # 主页客户端组件
│   ├── battle/            # 对战页面
│   │   └── page.tsx       # 主对战页面
│   ├── chat/[id]/         # 聊天历史详情
│   │   └── page.tsx
│   ├── history/           # 用户对话历史
│   │   └── page.tsx
│   ├── login/             # 登录页面
│   │   └── page.tsx
│   ├── register/          # 注册页面
│   │   └── page.tsx
│   └── admin/             # 管理页面
├── components/            # 可重用组件
│   ├── AIResponseCard.tsx # AI模型响应显示
│   ├── ConversationTurnBlock.tsx # 对话轮次显示
│   ├── MarkdownRenderer.tsx # Markdown渲染
│   ├── MermaidBlock.tsx   # Mermaid图表
│   └── ...
├── hooks/                 # 自定义React钩子
│   ├── useBattleStream.ts # SSE流钩子
│   └── ...
└── utils/                 # 工具函数
    ├── supabase/          # Supabase客户端工具
    └── ...
```

### 关键组件

#### BattleClient
- **位置**: `app/battle/page.tsx`
- **功能**: 主对战页面，多轮聊天比较
- **特性**:
  - SSE流式传输两个模型的响应
  - 多轮对话支持
  - 投票界面
  - 会话管理

#### ConversationTurnBlock
- **位置**: `components/ConversationTurnBlock.tsx`
- **功能**: 可重用的对话轮次显示组件
- **特性**:
  - 显示用户输入和AI响应
  - 支持Markdown渲染
  - 情感分类显示

#### AIResponseCard
- **位置**: `components/AIResponseCard.tsx`
- **功能**: AI模型响应显示，支持流式传输
- **特性**:
  - 实时流式更新
  - 加载状态指示器
  - 复制到剪贴板功能

### 状态管理

#### 会话状态
- 使用React状态钩子管理本地状态
- 使用SWR进行数据获取和缓存
- 使用Supabase进行用户认证

#### 流状态
- 使用`useBattleStream`钩子管理SSE连接
- 自动重连逻辑
- 心跳检测

## 数据库架构

### 核心表

#### votes表
```sql
CREATE TABLE votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    winner TEXT NOT NULL CHECK (winner IN ('left', 'right')),
    conversation_history JSONB NOT NULL,
    turn_count INTEGER NOT NULL,
    emotion TEXT NOT NULL,
    intensity TEXT NOT NULL,
    support_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id)  -- Phase 8.3: 投票幂等性
);
```

#### arena_sessions表 (Phase 9.1)
```sql
CREATE TABLE arena_sessions (
    session_id TEXT PRIMARY KEY,
    session_data JSONB NOT NULL,
    version BIGINT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### draft_conversations表（草稿对话）
```sql
CREATE TABLE draft_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    prompt TEXT NOT NULL,
    reply_a TEXT NOT NULL,
    reply_b TEXT NOT NULL,
    model_a TEXT NOT NULL,
    model_b TEXT NOT NULL,
    conversation_history JSONB,
    turn_count INT DEFAULT 1,
    model_config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### admin_sessions表（管理员会话）
```sql
CREATE TABLE admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);
```

#### admin_audit_log表（管理员审计日志）
```sql
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### model_configs表（模型配置）
```sql
CREATE TABLE model_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    api_base TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model_name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### post_vote_turns表 (Phase 8.2)
```sql
CREATE TABLE post_vote_turns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vote_id UUID REFERENCES votes(id),
    turn_number INTEGER NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 索引优化
- `conversation_history`字段的GIN索引
- `session_id`字段的B树索引
- `created_at`字段的时间索引
- `draft_conversations.user_id`索引 - 用户草稿查询
- `draft_conversations.session_id`索引 - 会话草稿查询
- `admin_sessions.token`索引 - 令牌查找
- `admin_sessions.expires_at`索引 - 过期会话清理

## 新增功能（重构后）

### 草稿对话功能
- **端点**: `POST /api/arena/draft` - 保存草稿
- **端点**: `GET /api/arena/drafts` - 获取用户草稿列表
- **端点**: `DELETE /api/arena/draft/{session_id}` - 删除草稿
- **功能**: 允许用户保存未投票的对话，稍后继续
- **数据表**: `draft_conversations`
- **特性**:
  - 用户只能访问自己的草稿（RLS策略）
  - 支持多轮对话历史
  - 自动更新时间戳

### 管理员后台功能
- **认证**: `/api/arena/admin/auth/login` - 管理员登录
- **模型管理**: `/api/arena/admin/models` - 模型配置CRUD
- **用户管理**: `/api/arena/admin/users` - 用户查询和管理
- **统计数据**: `/api/arena/admin/stats` - 投票统计、用户统计
- **归档管理**: `/api/arena/admin/archive` - 手动触发归档
- **数据表**:
  - `admin_sessions` - 持久化管理员令牌
  - `admin_audit_log` - 操作审计日志
  - `model_configs` - 模型配置管理
- **特性**:
  - JWT令牌认证
  - 令牌持久化到数据库（跨dyno重启）
  - 审计日志记录所有管理操作
  - 模型配置动态管理

## 部署架构

### 后端部署 (Heroku)
- **容器**: Docker容器
- **运行时**: Python 3.9+
- **Web服务器**: Uvicorn
- **进程类型**: Web dyno
- **扩展**: 水平扩展支持多实例

### 前端部署 (Vercel)
- **框架**: Next.js 14
- **运行时**: Node.js
- **构建**: 静态生成和服务器端渲染混合
- **CDN**: 全球CDN分发

### 数据库部署 (Supabase)
- **数据库**: PostgreSQL
- **托管**: 完全托管
- **备份**: 自动备份
- **扩展**: 自动扩展

## 安全架构

### 认证和授权
- Supabase Auth用于用户认证
- JWT令牌用于API认证
- 基于角色的访问控制

### 数据安全
- 环境变量中的敏感数据
- 数据库连接加密
- API请求验证

### 输入验证
- Pydantic模型验证
- 用户输入清理
- 注入攻击检测

## 监控架构

### 应用监控
- Heroku日志用于后端
- Vercel分析用于前端
- Supabase监控用于数据库

### 性能监控
- API响应时间监控
- 数据库查询性能监控
- 前端加载性能监控

### 错误监控
- 应用错误跟踪
- 数据库错误日志
- 用户报告的错误