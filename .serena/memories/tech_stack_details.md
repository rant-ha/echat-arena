# echat-arena 技术栈详细信息

## 后端技术栈

### 核心框架
- **FastAPI**: 现代、快速（高性能）的Web框架，用于构建API
- **版本**: 最新稳定版
- **特性**: 自动API文档、数据验证、依赖注入

### 异步HTTP客户端
- **httpx**: 下一代HTTP客户端，支持HTTP/1.1和HTTP/2
- **用途**: 向上游OpenAI兼容API发出异步请求
- **特性**: 连接池、超时、重试

### Token计数
- **tiktoken**: OpenAI的Token计数库
- **用途**: 精确的上下文管理和Token计数
- **回退**: 如果tiktoken不可用，使用朴素估计

### 数据库ORM
- **supabase-py**: Supabase的Python客户端
- **用途**: 与Supabase PostgreSQL数据库交互
- **特性**: 自动重连、连接池、实时订阅

### 缓存层
- **redis**: Redis 客户端（可选，L1 缓存）
- **用途**: 快速会话缓存，减少数据库查询
- **特性**: 连接池、TTL 支持、自动降级

### 网络搜索
- **Serper.dev**: Google Search API
- **用途**: 为模型提供实时网络搜索结果
- **特性**: LLM 关键词提炼、分层超时控制

### 任务调度
- **APScheduler**: 异步任务调度器
- **用途**: 定期归档任务调度
- **特性**: Cron 表达式、异步支持

### 数据验证
- **Pydantic**: 数据验证和设置管理
- **用途**: 请求/响应模型验证
- **特性**: 类型提示、自动JSON序列化

### 其他关键依赖
- **asyncio**: Python异步I/O框架
- **uuid**: 唯一标识符生成
- **datetime**: 日期和时间处理
- **json**: JSON序列化/反序列化

## 前端技术栈

### 核心框架
- **Next.js 14**: React框架，支持App Router
- **版本**: 14.2.8
- **特性**: 服务器组件、流式传输、增量静态再生

### UI库
- **React 18**: JavaScript库，用于构建用户界面
- **版本**: 18.2.0
- **特性**: 并发特性、自动批处理、过渡

### 样式框架
- **Tailwind CSS**: 实用优先的CSS框架
- **版本**: 3.4.3
- **配置**: `tailwind.config.ts`
- **插件**: `@tailwindcss/typography`

### 状态管理
- **SWR**: React Hooks用于数据获取
- **版本**: 2.2.5
- **特性**: 缓存、重新验证、分页

### 动画
- **framer-motion**: 生产就绪的动画库
- **版本**: 11.0.0
- **特性**: 声明式动画、手势、布局动画

### Markdown处理
- **react-markdown**: React的Markdown组件
- **版本**: 9.0.1
- **插件**:
  - `remark-gfm`: GitHub风格的Markdown
  - `remark-math`: Math支持
  - `rehype-katex`: KaTeX渲染
  - `rehype-highlight`: 语法高亮

### 图表
- **mermaid**: 基于文本的图表生成
- **版本**: 11.12.2
- **用途**: 在Markdown中渲染流程图、序列图等

### 数学渲染
- **katex**: LaTeX数学渲染
- **版本**: 0.16.28
- **用途**: 数学公式显示

### 图标
- **lucide-react**: 精美且一致的图标集
- **版本**: 0.452.0
- **特性**: 树摇、TypeScript支持

### 虚拟化
- **react-window**: 高效渲染大型列表和表格数据
- **版本**: 1.8.10
- **react-virtualized-auto-sizer**: 自动调整虚拟化组件大小

### 认证
- **@supabase/supabase-js**: Supabase JavaScript客户端
- **版本**: 2.45.4
- **@supabase/ssr**: 服务器端渲染支持
- **版本**: 0.4.0

### 分析
- **@vercel/analytics**: Vercel分析
- **版本**: 1.6.1
- **@vercel/speed-insights**: Vercel速度洞察
- **版本**: 1.3.1

### CAPTCHA
- **@marsidev/react-turnstile**: Cloudflare Turnstile React组件
- **版本**: 1.4.1
- **用途**: 机器人检测和滥用预防

## 开发工具

### 前端开发工具
- **TypeScript**: JavaScript的类型化超集
- **版本**: 5.9.3
- **配置**: `tsconfig.json`
- **ESLint**: 代码检查工具
- **版本**: 8.57.0
- **配置**: `eslint-config-next`
- **PostCSS**: 用JavaScript转换CSS的工具
- **版本**: 8.4.38
- **Autoprefixer**: PostCSS插件，解析CSS并添加供应商前缀
- **版本**: 10.4.19

### 构建工具
- **Next.js Build**: 内置构建系统
- **特性**: 代码分割、树摇、预取

## 数据库技术栈

### PostgreSQL (通过Supabase)
- **版本**: PostgreSQL 15+
- **扩展**:
  - `pgcrypto`: 加密函数
  - `uuid-ossp`: UUID生成
  - `pg_stat_statements`: 查询统计

### JSONB支持
- **用途**: 存储结构化对话历史
- **索引**: GIN索引用于高效JSON查询
- **操作**: JSON路径查询、数组操作

## 部署技术栈

### 容器化
- **Docker**: 容器平台
- **基础镜像**: `python:3.9-slim`
- **多阶段构建**: 最小化最终镜像大小

### 平台即服务
- **Heroku**: 后端部署平台
- **特性**: 自动扩展、日志聚合、监控
- **Vercel**: 前端部署平台
- **特性**: 边缘网络、自动CI/CD、预览部署

### 数据库即服务
- **Supabase**: 开源Firebase替代品
- **特性**: 实时数据库、认证、存储
- **托管**: 完全托管的PostgreSQL

## 监控和运维

### 日志聚合
- **Heroku Logplex**: 应用日志聚合
- **Supabase Logs**: 数据库查询日志
- **Vercel Logs**: 前端应用日志

### 性能监控
- **Heroku Metrics**: 应用性能指标
- **Vercel Analytics**: 前端性能分析
- **Supabase Dashboard**: 数据库性能监控

### 错误跟踪
- 应用级错误处理
- 数据库错误日志
- 前端错误边界

## 测试技术栈

### 单元测试
- **pytest**: Python测试框架
- **用途**: 后端逻辑测试
- **特性**: 夹具、参数化、插件

### 集成测试
- **测试脚本**: 自定义测试脚本
- **`test_supabase_sessionstore.py`**: 会话存储测试
- **`test_context_aware_classification.py`**: 情感分类测试
- **`run_experiment.py`**: 实验执行和数据分析

### 前端测试
- **ESLint**: 代码质量检查
- **TypeScript编译器**: 类型检查
- **Next.js Build**: 构建验证

## 开发环境

### 操作系统
- **开发**: Linux (Ubuntu 24.04.3 LTS)
- **生产**: Heroku (Linux容器)
- **工具**: bash, git, curl, wget

### 版本控制
- **Git**: 分布式版本控制系统
- **GitHub**: 代码托管和协作
- **分支策略**: 功能分支工作流

### IDE/编辑器
- **VS Code**: 源代码编辑器
- **扩展**: Python、TypeScript、ESLint、Prettier
- **配置**: `.vscode/` 目录中的设置

## 架构决策记录

### ADR-001: 单模型用于受控测试
- **决策**: 使用`REPLY_MODEL_NAME`进行单模型设置，而不是多模型设置
- **理由**: 使用一致模型实现受控变量实验
- **影响**: 遗留的多模型开关仍可用于向后兼容

### ADR-002: 上下文隔离
- **决策**: 每个模型维护独立的上下文历史
- **理由**: 防止关于竞争模型的信息泄漏
- **影响**: 模型无法看到对手的响应；公平比较

### ADR-003: 持久会话存储 (Phase 9.1)
- **决策**: 使用Supabase arena_sessions表进行会话持久化
- **理由**: 支持多实例部署和从重启中恢复
- **影响**: 会话数据在Heroku dyno重启后存活；支持扩展

### ADR-004: 投票后聊天分离 (Phase 8.2)
- **决策**: 将投票后聊天存储在单独的`post_vote_turns`表中
- **理由**: 保持实验数据（投票）清洁和不受污染
- **影响**: 用户可以在投票后继续聊天而不影响数据分析