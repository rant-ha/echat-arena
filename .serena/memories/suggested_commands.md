# echat-arena 建议命令

## 开发命令

### 后端开发（重构后）
```bash
# 安装依赖
pip install -r requirements.txt

# 设置环境变量
cp .env.example .env
# 编辑 .env 文件配置必要的环境变量

# 运行FastAPI开发服务器（重构后）
python -m uvicorn arena.main:app --reload --port 8000

# 或者使用 app.py（向后兼容）
python -m uvicorn app:app --reload --port 8000

# 运行测试
python test_supabase_sessionstore.py
python test_context_aware_classification.py
python run_experiment.py
```

### 前端开发
```bash
# 进入前端目录
cd web

# 安装依赖
npm install

# 运行开发服务器
npm run dev    # 运行在 http://localhost:3000

# 代码检查
npm run lint   # ESLint检查

# 构建项目
npm run build  # TypeScript编译和Next.js构建

# 启动生产服务器
npm run start
```

### 数据库操作
```bash
# 在Supabase SQL编辑器中运行迁移
# 运行迁移
\i migrations/add_conversation_history.sql

# 验证架构
\i migrations/verify_schema.sql

# 导出投票数据
SELECT * FROM votes ORDER BY created_at DESC;
```

## 部署命令

### 后端部署 (Heroku)
```bash
# 部署到Heroku
git push heroku main

# 查看日志
heroku logs --tail

# 设置环境变量
heroku config:set OPENAI_API_BASE=<api-endpoint>
heroku config:set OPENAI_API_KEY=<api-key>
heroku config:set SUPABASE_URL=<url>
heroku config:set SUPABASE_SERVICE_KEY=<key>

# 管理员认证（新增）
heroku config:set ADMIN_PASSWORD=<admin-password>
heroku config:set ADMIN_JWT_SECRET=<jwt-secret>
```

### 前端部署 (Vercel)
```bash
# 自动部署（连接GitHub仓库到Vercel）
# 或手动部署
vercel --prod
```

## 系统工具命令 (Linux)
```bash
# 文件操作
ls -la          # 列出文件
find . -name "*.py"  # 查找Python文件
grep -r "pattern" .  # 递归搜索模式

# Git操作
git status      # 查看状态
git diff        # 查看更改
git add .       # 添加更改
git commit -m "message"  # 提交更改
git push        # 推送更改

# 进程管理
ps aux | grep python  # 查找Python进程
kill <pid>       # 终止进程

# 网络工具
curl http://localhost:8000/api/arena/health  # 测试API
netstat -tlnp   # 查看监听端口
```

## 任务完成检查清单
完成任何任务后，运行以下命令：
1. `cd web && npm run lint` - 前端代码检查
2. `cd web && npm run build` - 前端构建测试
3. `python test_supabase_sessionstore.py` - 后端会话存储测试
4. `python test_context_aware_classification.py` - 情感分类测试
5. `git status` - 检查未提交的更改
6. `git diff` - 查看更改内容