# echat-arena 开发工作流

## 本地开发设置

### 1. 环境设置
```bash
# 克隆仓库
git clone https://github.com/rant-ha/echat-arena.git
cd echat-arena

# 设置后端环境变量
cp .env.example .env
# 编辑 .env 文件配置必要的值

# 设置前端环境变量
cd web
cp .env.example .env.local
# 编辑 .env.local 文件配置必要的值
cd ..
```

### 2. 依赖安装
```bash
# 后端依赖（如果没有requirements.txt，根据app.py导入安装）
pip install fastapi uvicorn httpx tiktoken supabase-py

# 前端依赖
cd web
npm install
cd ..
```

### 3. 启动开发服务器（重构后）
```bash
# 启动后端（端口8000）- 使用新的模块化入口
python -m uvicorn arena.main:app --reload --port 8000

# 或者使用旧的 app.py（向后兼容）
python -m uvicorn app:app --reload --port 8000

# 在新终端中启动前端（端口3000）
cd web
npm run dev
```

## 开发工作流

### 功能开发
1. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **实现功能**
   - 后端：在`arena/`目录中添加或修改Python模块
   - 前端：在`web/`目录中添加或修改TypeScript/React组件
   - 数据库：在`migrations/`中添加SQL迁移脚本

3. **测试功能**
   ```bash
   # 运行后端测试
   python test_supabase_sessionstore.py
   python test_context_aware_classification.py
   
   # 运行前端lint检查
   cd web && npm run lint
   cd ..
   ```

4. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加新功能描述"
   ```

### 数据库迁移工作流
1. **创建迁移文件**
   ```bash
   # 在 migrations/ 目录中创建新的 .sql 文件
   # 例如：migrations/add_new_feature.sql
   ```

2. **测试迁移**
   ```bash
   # 在Supabase SQL编辑器中运行迁移
   \i migrations/add_new_feature.sql
   
   # 验证架构
   \i migrations/verify_schema.sql
   ```

3. **记录迁移**
   - 更新 `migrations/README.md`
   - 添加验证查询到 `verify_schema.sql`

### 代码审查工作流
1. **推送更改**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **创建Pull Request**
   - 在GitHub上创建PR
   - 添加描述和测试结果

3. **代码审查检查清单**
   - [ ] 类型安全：TypeScript严格模式，Python类型提示
   - [ ] 错误处理：优雅降级，适当的HTTP状态码
   - [ ] 性能：无N+1查询，高效的JSONB操作
   - [ ] 安全：代码中无秘密，适当的访问控制
   - [ ] 向后兼容性：现有数据不被更改破坏

## 测试工作流

### 后端测试
```bash
# 运行所有后端测试
python test_supabase_sessionstore.py
python test_context_aware_classification.py
python run_experiment.py

# 运行特定测试模块
python -m pytest test_supabase_sessionstore.py -v
```

### 前端测试
```bash
cd web
# Lint检查
npm run lint

# 构建测试
npm run build

# 类型检查
npx tsc --noEmit
cd ..
```

### 集成测试
1. **启动完整应用**
   ```bash
   # 终端1：后端
   python -m uvicorn app:app --reload --port 8000
   
   # 终端2：前端
   cd web && npm run dev
   ```

2. **手动测试**
   - 访问 http://localhost:3000/battle
   - 测试多轮对话
   - 测试投票功能
   - 测试会话持久化

## 部署工作流

### 预部署检查
```bash
# 1. 运行所有测试
python test_supabase_sessionstore.py
python test_context_aware_classification.py
cd web && npm run lint && npm run build
cd ..

# 2. 检查环境变量
cat .env.example | grep -v "^#" | grep "="

# 3. 检查数据库迁移
ls migrations/*.sql

# 4. 检查文档
ls AGENTS.md DEPLOYMENT_GUIDE.md TROUBLESHOOTING.md
```

### 后端部署 (Heroku)
```bash
# 1. 设置Heroku远程
heroku git:remote -a your-heroku-app-name

# 2. 部署
git push heroku main

# 3. 设置环境变量
heroku config:set OPENAI_API_BASE=<api-endpoint>
heroku config:set OPENAI_API_KEY=<api-key>
heroku config:set SUPABASE_URL=<url>
heroku config:set SUPABASE_SERVICE_KEY=<key>

# 4. 监控
heroku logs --tail
```

### 前端部署 (Vercel)
1. 连接GitHub仓库到Vercel
2. 设置环境变量从 `web/.env.example`
3. 自动部署在推送到main分支时
4. 手动部署：`vercel --prod`

## 故障排除工作流

### 常见问题解决
1. **SSE连接断开**
   - 检查后端心跳（每25秒）
   - 检查Heroku路由器超时（默认30秒）
   - 增加`ARENA_SSE_HEARTBEAT_SEC`如果需要

2. **会话不持久**
   - 检查`SUPABASE_SERVICE_KEY`已设置（服务角色，非匿名）
   - 验证`arena_sessions`表存在（运行迁移）
   - 检查Supabase连接日志

3. **情感分类超时**
   - 默认超时：12秒（`ARENA_CLASSIFY_TIMEOUT_SEC`）
   - 如果分类器慢，增加超时或优化模型
   - 非阻塞：第一个字节在分类完成前返回

4. **Token计数问题**
   - `tiktoken`库未安装：回退到朴素估计
   - 安装：`pip install tiktoken`
   - 验证日志：`[WARN] tiktoken not available...`

### 调试步骤
1. **检查日志**
   ```bash
   # 后端日志
   heroku logs --tail
   
   # 前端控制台
   # 在浏览器中打开开发者工具
   ```

2. **验证API端点**
   ```bash
   curl http://localhost:8000/api/arena/health
   curl http://localhost:8000/api/arena/sessions/test
   ```

3. **检查数据库**
   ```bash
   # 在Supabase SQL编辑器中
   SELECT * FROM votes ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM arena_sessions ORDER BY expires_at DESC LIMIT 5;
   ```

## 维护工作流

### 定期任务
1. **数据库清理**
   ```sql
   -- 清理过期会话
   DELETE FROM arena_sessions WHERE expires_at < NOW();
   
   -- 清理软删除记录
   DELETE FROM arena_sessions WHERE deleted_at IS NOT NULL;
   ```

2. **日志轮转**
   - 监控Heroku日志大小
   - 设置日志轮转如果使用文件日志

3. **依赖更新**
   ```bash
   # 后端依赖
   pip list --outdated
   
   # 前端依赖
   cd web && npm outdated
   cd ..
   ```

### 监控
1. **应用健康**
   - 监控 `/api/arena/health` 端点
   - 设置正常运行时间监控

2. **性能监控**
   - 监控API响应时间
   - 监控数据库查询性能
   - 监控内存使用情况

3. **错误监控**
   - 设置错误跟踪（Sentry等）
   - 监控HTTP错误率
   - 监控数据库错误