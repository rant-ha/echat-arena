# echat-arena 代码风格和约定

## Python 后端风格

### 文件组织
- 配置加载在顶部（app.py 第28-79行）
- 数据类定义用于请求/响应模型
- 异步函数用于I/O操作（httpx调用、数据库）
- 同步工具函数用于本地逻辑

### 命名约定
- 私有函数：`_snake_case_with_leading_underscore`
- 公共端点：`/api/arena/endpoint_name`
- 环境变量：`UPPERCASE_WITH_UNDERSCORES`
- 类名：`PascalCase`
- 函数名：`snake_case`
- 变量名：`snake_case`

### 错误处理
- HTTPException用于API错误，包含适当的状态码
- 外部API调用的try/except块，包含重试逻辑
- 优雅降级（例如，tiktoken回退）

### 导入顺序
1. 标准库导入
2. 第三方库导入
3. 本地模块导入
4. 从arena包的导入

### 类型提示
- 使用Python类型提示
- 为公共API函数添加docstring
- 使用Optional表示可选参数

## TypeScript 前端风格

### 文件组织
- 页面在 `app/` 目录
- 组件在 `components/` 目录
- 钩子在 `hooks/` 目录（自定义React钩子）
- 工具在 `utils/` 目录

### 命名约定
- React组件：`PascalCase`
- 钩子：`use`前缀（例如 `useBattleStream`）
- 工具函数：`camelCase`
- 接口：`PascalCase`（通常以`I`前缀或直接命名）
- 类型别名：`PascalCase`

### 类型安全
- 为API响应定义接口
- 使用TypeScript严格模式
- 避免`any`类型 - 使用适当的类型
- 为组件props定义类型

### React约定
- 使用函数组件和钩子
- 适当的错误边界
- 加载状态处理
- 使用SWR进行数据获取

## 数据库约定

### Supabase表设计
- 使用JSONB字段存储结构化数据
- 为常用查询添加索引
- 使用外键约束确保数据完整性
- 为时间戳字段添加索引

### 迁移管理
- 每个迁移在单独的`.sql`文件中
- 包含回滚脚本
- 在`migrations/README.md`中记录
- 添加验证查询到`verify_schema.sql`

## 文档约定

### 代码注释
- 为复杂逻辑添加注释
- 解释为什么而不是什么
- 使用TODO标记待办事项
- 使用FIXME标记需要修复的问题

### 文档文件
- 每个主要子目录有自己的AGENTS.md文件
- 保持README.md更新
- 记录架构决策
- 包含部署指南

## 设计模式

### 后端模式
- 工厂模式用于模型配置
- 策略模式用于情感分类
- 观察者模式用于SSE流
- 存储库模式用于数据库访问

### 前端模式
- 容器/展示组件模式
- 自定义钩子用于业务逻辑
- 上下文提供者用于状态管理
- 高阶组件用于认证

## 测试约定

### 单元测试
- 为关键业务逻辑编写测试
- 模拟外部依赖
- 测试边缘情况
- 保持测试独立

### 集成测试
- 测试API端点
- 测试数据库操作
- 测试前端-后端集成
- 使用真实环境进行测试

## 提交前检查清单
1. 代码通过lint检查（前端：`npm run lint`）
2. 测试通过（`python test_*.py`）
3. 环境变量已记录
4. 数据库迁移已包含（如果架构更改）
5. AGENTS.md已更新架构更改