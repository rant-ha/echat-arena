# echat-arena 重构详情

## 重构概述

### 重构分支
- **分支名称**: `refactor/arena-package`
- **重构目标**: 将单体 `app.py` 拆分为模块化的 `arena` 包
- **重构时间**: 2026年

### 最新更新（2026-02-13）

#### 1. Web Search 迁移 (commit f79dead)
- **变更**: DuckDuckGo → Serper.dev
- **新增**: LLM 关键词提炼
- **新增**: 分层超时控制（8秒管线 / 5秒 LLM）
- **修改文件**:
  - `arena/config.py` - 添加 Serper 配置
  - `arena/prompts.py` - 添加搜索提炼 prompt
  - `arena/tools/web_search.py` - 完全重写
  - `requirements.txt` - 删除 duckduckgo-search
  - `.env.example` - 添加新环境变量文档

#### 2. 持久化三阶段加固 (commit 9a34bf4)
- **新增**: Redis L1 缓存层
- **新增**: Supabase L2 权威存储
- **新增**: 本地内存 L3 降级
- **新增**: 混合存储模式（HybridSessionStore）
- **新增**: 补偿队列（失败重试）
- **新增**: 熔断器（防止级联失败）
- **新增**: 持久化指标监控

#### 3. 投票后继续对话
- **新增**: `post_vote_turns` 表
- **新增**: SSE 流式响应
- **新增**: 会话重建支持
- **新增**: 投票幂等性（Phase 8.3）

#### 4. 多轮对话支持
- **新增**: `conversation_history` JSONB 字段
- **新增**: `turn_count` 索引
- **新增**: 单侧上下文隔离
- **新增**: 草稿对话保存

### 主要变更

#### 1. 应用组装重构
**变更前**:
- 所有逻辑在单个 `app.py` 文件中
- 路由、配置、业务逻辑混在一起

**变更后**:
- 新增 `arena/main.py` - FastAPI应用组装
- `app.py` 变为薄包装层，保持向后兼容
- 模块化路由注册

#### 2. 路由模块化
**新增路由模块**:
- `arena/routes/health.py` - 健康检查端点
- `arena/routes/config_routes.py` - 配置信息端点
- `arena/routes/battle.py` - 对战端点
- `arena/routes/vote.py` - 投票端点
- `arena/routes/chat.py` - 聊天端点
- `arena/routes/drafts.py` - 草稿管理端点（新增功能）
- `arena/routes/sessions.py` - 会话管理端点
- `arena/routes/admin/` - 管理员路由（新增功能）
  - `auth.py` - 管理员认证
  - `models.py` - 模型管理
  - `users.py` - 用户管理
  - `stats.py` - 统计数据
  - `archive.py` - 归档管理

#### 3. 新增功能

##### 草稿对话功能
- **目的**: 允许用户保存未投票的对话，稍后继续
- **端点**:
  - `POST /api/arena/draft` - 保存或更新草稿
  - `GET /api/arena/drafts` - 获取用户草稿列表
  - `DELETE /api/arena/draft/{session_id}` - 删除草稿
- **数据表**: `draft_conversations`
- **特性**:
  - 用户只能访问自己的草稿（RLS策略）
  - 支持多轮对话历史
  - 自动更新时间戳
  - 支持模型配置存储

##### 管理员后台功能
- **目的**: 提供管理界面和API
- **端点**:
  - `POST /api/arena/admin/auth/login` - 管理员登录
  - `GET /api/arena/admin/auth/verify` - 验证令牌
  - `POST /api/arena/admin/auth/logout` - 登出
  - `GET /api/arena/admin/models` - 获取模型列表
  - `POST /api/arena/admin/models` - 创建模型配置
  - `PUT /api/arena/admin/models/{id}` - 更新模型配置
  - `DELETE /api/arena/admin/models/{id}` - 删除模型配置
  - `GET /api/arena/admin/users` - 获取用户列表
  - `GET /api/arena/admin/stats` - 获取统计数据
  - `POST /api/arena/admin/archive/trigger` - 手动触发归档
- **数据表**:
  - `admin_sessions` - 持久化管理员令牌
  - `admin_audit_log` - 操作审计日志
  - `model_configs` - 模型配置管理
- **特性**:
  - JWT令牌认证
  - 令牌持久化到数据库（跨dyno重启）
  - 审计日志记录所有管理操作
  - 模型配置动态管理

#### 4. 数据库迁移新增

##### 新增迁移文件
- `add_draft_conversations.sql` - 草稿对话表
- `add_admin_sessions.sql` - 管理员会话表
- `add_admin_audit_log.sql` - 管理员审计日志表
- `add_model_configs.sql` - 模型配置表
- `add_model_is_default.sql` - 模型默认标记

##### 迁移特性
- 所有表都启用了RLS（行级安全）
- 服务角色拥有完全访问权限
- 用户只能访问自己的数据
- 索引优化查询性能

#### 5. 环境变量新增

##### 管理员认证
- `ADMIN_PASSWORD` - 管理员密码
- `ADMIN_JWT_SECRET` - JWT签名密钥（可选，默认随机生成）

##### 会话存储
- `ARENA_SESSION_STORE` - 会话存储模式（`memory` 或 `supabase`）

#### 6. 代码组织改进

##### 模块职责分离
- `arena/config.py` - 配置管理
- `arena/models.py` - 数据模型
- `arena/llm.py` - LLM API调用
- `arena/classifier.py` - 情感分类
- `arena/evaluator.py` - 评估逻辑
- `arena/prompts.py` - 系统提示
- `arena/utils.py` - 工具函数
- `arena/state.py` - 全局状态
- `arena/archive.py` - 归档功能
- `arena/db/` - 数据库操作
- `arena/routes/` - API路由
- `arena/services/` - 业务逻辑
- `arena/session/` - 会话管理

##### 启动流程改进
- `arena/main.py` 中的 `create_app()` 函数组装应用
- 启动事件处理：
  - 会话存储初始化（内存或Supabase）
  - 归档任务调度（如果启用）
  - 日志输出启动状态

## 向后兼容性

### 保持兼容的接口
- `uvicorn app:app` 仍然有效（通过 `app.py` 薄包装）
- 所有现有API端点保持不变
- 环境变量保持兼容

### 新增接口
- `uvicorn arena.main:app` - 直接使用模块化应用
- 新增管理员API端点
- 新增草稿管理API端点

## 部署变更

### Dockerfile变更
- 无需修改，仍然使用 `CMD ["./start.sh"]`
- `start.sh` 脚本保持不变

### Heroku部署
- 无需修改部署流程
- 新增环境变量需要配置：
  - `ADMIN_PASSWORD`
  - `ADMIN_JWT_SECRET`（可选）

### 数据库迁移
- 需要运行新的迁移脚本：
  - `add_draft_conversations.sql`
  - `add_admin_sessions.sql`
  - `add_admin_audit_log.sql`
  - `add_model_configs.sql`
  - `add_model_is_default.sql`

## 测试变更

### 现有测试
- 所有现有测试保持不变
- 测试脚本仍然可以运行

### 新增测试需求
- 草稿管理功能测试
- 管理员认证测试
- 管理员API测试
- 模型配置管理测试

## 文档更新

### 已更新文档
- `AGENTS.md` - 项目架构文档
- `.serena/memories/` - Serena内存文件

### 需要更新的文档
- `README.md` - 添加新功能说明
- `DEPLOYMENT_GUIDE.md` - 添加新环境变量说明
- `TROUBLESHOOTING.md` - 添加新功能故障排除

## 性能影响

### 改进
- 模块化加载可能略微提高启动速度
- 数据库索引优化查询性能
- 会话持久化减少重启影响

### 注意事项
- 管理员令牌持久化增加数据库查询
- 草稿功能增加数据库存储需求

## 安全改进

### 新增安全特性
- 管理员JWT认证
- 审计日志记录
- RLS策略增强数据隔离
- 令牌持久化防止重启丢失

### 安全注意事项
- 确保 `ADMIN_PASSWORD` 设置强密码
- 确保 `ADMIN_JWT_SECRET` 安全存储
- 定期清理过期的管理员会话

## 迁移指南

### 从旧版本迁移到重构版本

#### 1. 代码迁移
```bash
# 拉取最新代码
git pull origin refactor/arena-package

# 安装依赖（如果有新增）
pip install -r requirements.txt
```

#### 2. 数据库迁移
```sql
-- 在Supabase SQL编辑器中运行
\i migrations/add_draft_conversations.sql
\i migrations/add_admin_sessions.sql
\i migrations/add_admin_audit_log.sql
\i migrations/add_model_configs.sql
\i migrations/add_model_is_default.sql

-- 验证
\i migrations/verify_schema.sql
```

#### 3. 环境变量配置
```bash
# 设置管理员密码
heroku config:set ADMIN_PASSWORD=<strong-password>

# 可选：设置JWT密钥
heroku config:set ADMIN_JWT_SECRET=<random-secret>

# 可选：设置会话存储模式
heroku config:set ARENA_SESSION_STORE=supabase
```

#### 4. 部署
```bash
# 部署到Heroku
git push heroku refactor/arena-package

# 查看日志
heroku logs --tail
```

#### 5. 验证
```bash
# 测试健康检查
curl https://your-app.herokuapp.com/api/arena/health

# 测试管理员登录
curl -X POST https://your-app.herokuapp.com/api/arena/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "<your-password>"}'
```

## 回滚计划

### 如果需要回滚
```bash
# 切换回主分支
git checkout main

# 回滚数据库（如果需要）
\i migrations/rollback_conversation_history.sql

# 重新部署
git push heroku main
```

## 已知问题

### 当前限制
- 管理员界面尚未实现（只有API）
- 草稿功能前端集成待完成
- 模型配置动态加载待实现

### 未来改进
- 添加管理员Web界面
- 实现草稿功能前端集成
- 支持模型配置热重载
- 添加更多审计日志类型
- 实现会话存储模式切换

## 总结

重构成功地将单体应用拆分为模块化架构，提高了代码可维护性和可扩展性。新增的草稿功能和管理员后台为用户和管理员提供了更好的体验。所有变更都保持了向后兼容性，现有功能不受影响。
