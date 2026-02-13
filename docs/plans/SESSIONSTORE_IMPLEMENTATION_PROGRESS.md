# SessionStore 持久化改造 - 实施进展报告

## 1. 概述

本文档记录 SessionStore 持久化改造项目的实施进展，包括已完成工作、当前状态和下一步计划。

## 2. 项目目标

1. **持久化存储**：解决 Heroku dyno 重启和多实例部署导致的会话丢失问题
2. **软删除功能**：允许用户删除聊天记录但保留数据可恢复
3. **单侧上下文隔离**：确保每个模型只能看到自己的对话历史
4. **管理员接口**：提供会话管理和统计功能

## 3. 已完成工作

### 3.1 设计文档

✅ **完成时间**：2024-01-21

**文件**：
- `plans/sessionstore_supabase_design.md` - 主设计文档（已更新）
- `plans/sessionstore_supabase_complete_design.md` - 完整设计文档（新建）

**内容**：
- 完整的 Supabase 表设计（包含软删除和单侧上下文隔离）
- 详细的接口规范（11 个核心接口 + 3 个新增接口）
- 并发控制和乐观锁实现方案
- 软删除功能设计（soft_delete, restore_session, cleanup_deleted_sessions）
- 单侧上下文隔离实现（_build_side_context, 修改后的 append_turn）
- 管理员 API 端点定义（会话列表、软删除、恢复、统计）
- 监控指标和日志记录方案
- 完整的实施计划和时间表

**关键设计决策**：
1. 单表设计：使用 `arena_sessions` 表存储所有会话数据
2. 数据结构：每侧模型独立 context 数组 + 完整 conversation_history
3. 并发控制：乐观锁（version 字段）+ CAS 操作
4. 软删除：deleted_at 字段标记，支持恢复和定时清理
5. TTL 管理：expires_at 字段 + 定时清理任务

### 3.2 数据库迁移

✅ **完成时间**：2024-01-21

**文件**：
- `migrations/add_arena_sessions_table.sql` - 主迁移脚本（新建）
- `migrations/README.md` - 迁移文档（已更新）

**内容**：
- 创建 `arena_sessions` 表及所有必要字段
- 创建索引（expires_at, deleted_at）
- 创建触发器（自动更新 updated_at）
- 创建清理函数（cleanup_expired_sessions, cleanup_old_deleted_sessions）
- 完整的 SQL 脚本和文档

**表结构**：
```sql
CREATE TABLE arena_sessions (
  session_id  TEXT PRIMARY KEY,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  version     BIGINT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.3 文档和计划

✅ **完成时间**：2024-01-21

**文件**：
- `plans/SESSIONSTORE_IMPLEMENTATION_PROGRESS.md` - 进展报告（新建）
- 任务跟踪系统（内存中）

**内容**：
- 完整的实施计划和时间表
- 任务分解和优先级设置
- 风险评估和缓解措施
- 成功指标和验证计划

## 4. 当前状态

### 4.1 任务完成情况

| 任务 | 状态 | 优先级 | 完成时间 |
|------|------|--------|----------|
| 完成 SessionStore 持久化设计文档 | ✅ 完成 | 高 | 2024-01-21 |
| 添加软删除功能设计 | ✅ 完成 | 高 | 2024-01-21 |
| 添加单侧上下文隔离设计 | ✅ 完成 | 高 | 2024-01-21 |
| 创建数据库迁移脚本 | ✅ 完成 | 高 | 2024-01-21 |
| 实现 SupabaseSessionStore 类 | ⏳ 进行中 | 高 | - |
| 实现软删除和单侧上下文方法 | ⏹️ 待办 | 高 | - |
| 更新 battle 和 continue 流程 | ⏹️ 待办 | 中 | - |
| 实现管理员 API 端点 | ⏹️ 待办 | 中 | - |
| 测试和验证所有功能 | ⏹️ 待办 | 高 | - |
| 部署到生产环境 | ⏹️ 待办 | 中 | - |

### 4.2 进度指标

- **设计阶段**：100% 完成 ✅
- **迁移准备**：100% 完成 ✅
- **代码实现**：0% ⏳
- **测试验证**：0% ⏹️
- **部署上线**：0% ⏹️

**整体进度**：40% (4/10 任务完成)

## 5. 下一步计划

### 5.1 即将开始的任务

**任务 5：实现 SupabaseSessionStore 类**
- **优先级**：高
- **预计时间**：3-5 天
- **主要工作**：
  - 创建 SupabaseSessionStore 类，继承自 SessionStore
  - 实现所有核心接口（get, put, update, append_turn, etc.）
  - 实现乐观锁和 CAS 操作
  - 实现 TTL 续期逻辑
  - 实现降级机制（Supabase 失败时回退到内存）

**关键代码结构**：
```python
class SupabaseSessionStore(SessionStore):
    def __init__(self, ttl_sec: int, max_sessions: int):
        super().__init__(ttl_sec, max_sessions)
        self._supabase_url = os.getenv("SUPABASE_URL")
        self._supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        self._request_timeout = 10.0
        self._local_cache = LRUCache(maxsize=1000)
    
    async def get(self, session_id: str) -> Optional[dict]:
        # 实现 Supabase 读取逻辑
        pass
    
    async def put(self, session_id: str, session_data: dict) -> bool:
        # 实现 Supabase 写入逻辑
        pass
    
    async def _cas_update(self, session_id: str, old_version: int, new_data: dict) -> bool:
        # 实现 CAS 更新逻辑
        pass
```

### 5.2 后续任务计划

**任务 6：实现软删除和单侧上下文方法**
- **优先级**：高
- **预计时间**：2-3 天
- **依赖**：任务 5 完成
- **主要工作**：
  - 实现 soft_delete, restore_session, cleanup_deleted_sessions
  - 实现 _build_side_context 方法
  - 修改 append_turn 方法支持单侧上下文隔离
  - 实现上下文构建和验证逻辑

**任务 7：更新 battle 和 continue 流程**
- **优先级**：中
- **预计时间**：1-2 天
- **依赖**：任务 5, 6 完成
- **主要工作**：
  - 更新 _battle_sse 使用新的会话初始化逻辑
  - 更新 continue_battle 使用新的上下文构建逻辑
  - 更新 vote 流程使用新的会话管理
  - 更新 post_vote_chat 流程

**任务 8：实现管理员 API 端点**
- **优先级**：中
- **预计时间**：1-2 天
- **依赖**：任务 5, 6 完成
- **主要工作**：
  - 实现 /api/arena/sessions/list 端点
  - 实现 /api/arena/session/delete 端点
  - 实现 /api/arena/session/restore 端点
  - 实现统计和监控端点
  - 添加身份验证和权限控制

## 6. 技术实现细节

### 6.1 核心接口实现

#### 6.1.1 get() 方法
```python
async def get(self, session_id: str) -> Optional[dict]:
    """获取会话数据，支持缓存和 TTL 检查"""
    # 1. 检查本地缓存
    cached = self._local_cache.get(session_id)
    if cached and not self._is_expired(cached):
        return cached['session_data']
    
    # 2. 从 Supabase 读取
    url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=eq.{session_id}&deleted_at=is.null"
    headers = self._get_headers()
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers, timeout=self._request_timeout)
            if resp.status_code >= 400:
                return None
            
            data = resp.json()
            if not data:
                return None
            
            session = data[0]
            
            # 3. 检查 TTL
            if self._is_expired(session):
                return None
            
            # 4. 更新缓存
            self._local_cache[session_id] = session
            return session['session_data']
        except Exception as exc:
            log_error("session_get_failed", {"session_id": session_id, "error": str(exc)}, exc)
            return None
```

#### 6.1.2 append_turn() 方法（单侧上下文隔离版本）
```python
async def append_turn(self, session_id: str, turn_data: dict) -> bool:
    """追加一轮对话，支持单侧上下文隔离和 CAS 更新"""
    max_retries = 3
    
    for attempt in range(max_retries):
        # 1. 读取当前会话
        session = await self.get(session_id)
        if session is None:
            return False
        
        # 2. 构建新的上下文（单侧隔离）
        user_msg = turn_data['user_msg']
        reply_a = turn_data.get('reply_a', '')
        reply_b = turn_data.get('reply_b', '')
        
        # 更新每个模型的独立上下文
        left_context = await self._build_side_context(session, 'left')
        right_context = await self._build_side_context(session, 'right')
        
        # 添加用户消息到两侧上下文
        left_context.append({"role": "user", "content": user_msg})
        right_context.append({"role": "user", "content": user_msg})
        
        # 添加各自的回复
        if reply_a:
            left_context.append({"role": "assistant", "content": reply_a})
        if reply_b:
            right_context.append({"role": "assistant", "content": reply_b})
        
        # 3. 更新会话数据
        new_session_data = {
            **session,
            'left': {**session.get('left', {}), 'context': left_context},
            'right': {**session.get('right', {}), 'context': right_context},
            'turn_count': session.get('turn_count', 0) + 1,
            'version': session.get('version', 0) + 1
        }
        
        # 4. 追加到完整对话历史
        conversation_history = session.get('conversation_history', [])
        turn_num = len(conversation_history) + 1
        
        turn_record = {
            'turn': turn_num,
            'user_msg': user_msg,
            'reply_a': reply_a,
            'reply_b': reply_b,
            'timestamp': datetime.now().isoformat()
        }
        
        conversation_history.append(turn_record)
        new_session_data['conversation_history'] = conversation_history
        
        # 5. CAS 更新
        success = await self._cas_update(session_id, session['version'], new_session_data)
        
        if success:
            # 6. 更新缓存
            self._local_cache[session_id] = {
                'session_id': session_id,
                'session_data': new_session_data,
                'version': new_session_data['version'],
                'expires_at': (datetime.now() + timedelta(seconds=self._ttl_sec)).isoformat()
            }
            return True
        
        # 7. 冲突重试
        if attempt < max_retries - 1:
            await asyncio.sleep(0.1 * (attempt + 1))
    
    return False
```

### 6.2 软删除实现

#### 6.2.1 soft_delete() 方法
```python
async def soft_delete(self, session_id: str) -> bool:
    """软删除会话 - 标记为已删除但不实际删除数据"""
    url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=eq.{session_id}&deleted_at=is.null"
    headers = self._get_headers()
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.patch(
                url,
                headers=headers,
                json={"deleted_at": datetime.now().isoformat()},
                timeout=self._request_timeout
            )
            
            if resp.status_code < 400:
                # 清除本地缓存
                self._local_cache.pop(session_id, None)
                return True
            
            return False
        except Exception as exc:
            log_error("session_soft_delete_failed", {
                "session_id": session_id,
                "error": str(exc)
            }, exc)
            return False
```

#### 6.2.2 restore_session() 方法
```python
async def restore_session(self, session_id: str) -> bool:
    """恢复被软删除的会话"""
    url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=eq.{session_id}"
    headers = self._get_headers()
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.patch(
                url,
                headers=headers,
                json={"deleted_at": None},
                timeout=self._request_timeout
            )
            
            return resp.status_code < 400
        except Exception as exc:
            log_error("session_restore_failed", {
                "session_id": session_id,
                "error": str(exc)
            }, exc)
            return False
```

### 6.3 管理员 API 实现

#### 6.3.1 会话列表 API
```python
@app.post("/api/arena/sessions/list")
async def list_sessions(
    page: int = 1,
    page_size: int = 50,
    include_deleted: bool = False,
    admin_key: str = Header(None)
):
    """管理员接口：列表会话与统计"""
    if admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # 使用 SessionStore 的列表方法
    result = await _SESSION_STORE.list_sessions(
        page=page,
        page_size=page_size,
        include_deleted=include_deleted
    )
    
    return result
```

## 7. 测试计划

### 7.1 测试范围

| 测试类型 | 测试内容 | 责任人 |
|----------|----------|--------|
| 单元测试 | SupabaseSessionStore 类方法 | 后端开发 |
| 集成测试 | 会话持久化流程 | 后端开发 |
| 并发测试 | 多实例一致性 | 后端开发 |
| 功能测试 | 软删除和恢复 | QA |
| 功能测试 | 单侧上下文隔离 | QA |
| 性能测试 | 响应时间和吞吐量 | 性能工程师 |
| 压力测试 | 高并发场景 | 性能工程师 |
| 回归测试 | 现有功能兼容性 | QA |
| 安全测试 | 管理员 API 权限 | 安全工程师 |

### 7.2 测试用例

#### 7.2.1 持久化功能测试

**测试用例 1**：会话重启后保留
1. 创建会话并进行多轮对话
2. 重启应用服务器
3. 继续对话，验证历史完整
4. 完成对话并投票
5. 验证投票数据正确写入

**测试用例 2**：多实例一致性
1. 启动多个应用实例
2. 在实例 A 创建会话
3. 在实例 B 继续对话
4. 验证会话状态一致
5. 在实例 A 投票
6. 验证所有实例看到相同结果

#### 7.2.2 软删除功能测试

**测试用例 3**：软删除和恢复
1. 创建会话并进行多轮对话
2. 调用软删除 API
3. 验证会话不再可见（正常查询）
4. 调用恢复 API
5. 验证会话恢复可见
6. 验证对话历史完整

**测试用例 4**：定时清理
1. 软删除多个会话
2. 等待 30 天（或修改清理阈值）
3. 运行清理任务
4. 验证旧会话被物理删除
5. 验证新会话保留

#### 7.2.3 单侧上下文隔离测试

**测试用例 5**：上下文隔离验证
1. 创建会话并进行多轮对话
2. 检查 left.context 只包含模型 A 的回复
3. 检查 right.context 只包含模型 B 的回复
4. 验证 conversation_history 包含完整对话
5. 继续对话，验证新轮次正确追加

**测试用例 6**：模型输入构建
1. 创建会话并进行多轮对话
2. 在 continue_battle 中构建模型输入
3. 验证模型 A 只看到自己的上下文
4. 验证模型 B 只看到自己的上下文
5. 验证用户消息在两侧都可见

### 7.3 性能测试

**基准测试**：
- 单轮对话响应时间：< 500ms
- 多轮对话响应时间：< 800ms
- 并发用户数：1000+
- 每秒请求数：100+

**压力测试**：
- 逐步增加并发用户
- 监控响应时间和错误率
- 识别瓶颈并优化

## 8. 部署计划

### 8.1 部署阶段

**阶段 1：准备工作（1-2 天）**
- [ ] 创建 arena_sessions 表及索引
- [ ] 设置 Supabase 权限和 API 密钥
- [ ] 配置环境变量（ARENA_SESSION_STORE=supabase）
- [ ] 准备数据库迁移脚本
- [ ] 设置监控和告警

**阶段 2：灰度发布（2-3 天）**
- [ ] 部署到 staging 环境
- [ ] 内部测试和验证
- [ ] 修复发现的问题
- [ ] 小流量用户测试
- [ ] 监控性能和错误率

**阶段 3：全量发布（1 天）**
- [ ] 部署到生产环境
- [ ] 逐步增加流量
- [ ] 监控关键指标
- [ ] 快速回滚准备
- [ ] 完成切换

**阶段 4：监控和优化（持续）**
- [ ] 监控错误率和性能
- [ ] 收集用户反馈
- [ ] 优化配置和参数
- [ ] 定期审查和改进

### 8.2 回滚计划

**回滚触发条件**：
- 错误率 > 5%
- 响应时间 > 2s
- 严重数据不一致
- 关键功能无法使用

**回滚步骤**：
1. 将 ARENA_SESSION_STORE 切回 memory
2. 监控服务恢复情况
3. 分析问题根源
4. 修复问题后重新部署

**回滚影响**：
- 切回后现有 DB 会话将不会被读取
- 用户需要重新开始对话
- 但可以快速恢复服务可用性

## 9. 风险管理

### 9.1 风险识别

| 风险 | 可能性 | 影响 | 缓解措施 | 责任人 |
|------|--------|------|----------|--------|
| Supabase 服务中断 | 低 | 高 | 实现降级机制，提供只读缓存支持 | 后端团队 |
| 并发冲突导致性能下降 | 中 | 中 | 优化重试策略，限制最大重试次数 | 后端团队 |
| 数据迁移问题 | 中 | 高 | 逐步迁移，保持双写期间的数据一致性 | DevOps团队 |
| 上下文隔离逻辑错误 | 中 | 高 | 完整的单元测试和集成测试覆盖 | QA团队 |
| 软删除数据管理复杂 | 低 | 中 | 自动化清理脚本和监控告警 | DevOps团队 |
| 性能不达标 | 中 | 高 | 性能优化，添加缓存层 | 性能工程师 |
| 安全漏洞 | 低 | 高 | 代码审查，安全测试 | 安全工程师 |

### 9.2 缓解策略

**Supabase 服务中断**：
- 实现降级到内存存储
- 提供只读缓存支持
- 设置监控和告警
- 准备手动干预流程

**并发冲突**：
- 优化重试策略（3 次，指数退避）
- 监控冲突率
- 考虑使用 Redis 分布式锁（如需要）
- 限制单个会话的并发请求数

**数据迁移**：
- 逐步迁移，先小流量测试
- 保持双写期间的数据一致性
- 完整的数据验证和校验
- 准备回滚脚本

**上下文隔离**：
- 完整的单元测试覆盖
- 集成测试验证
- 手动审查关键代码
- 监控上下文构建错误

## 10. 成功标准

### 10.1 关键成功指标（KPI）

1. **可用性**：会话持久化成功率 ≥ 99.9%
2. **一致性**：并发操作无数据丢失或覆盖
3. **性能**：平均响应时间增加 ≤ 50ms
4. **可恢复性**：软删除数据恢复成功率 100%
5. **上下文隔离**：模型上下文隔离验证通过率 100%
6. **用户满意度**：无重大用户投诉
7. **错误率**：生产环境错误率 < 1%

### 10.2 验收标准

**功能验收**：
- [ ] 会话持久化功能正常工作
- [ ] 多实例一致性验证通过
- [ ] 软删除和恢复功能正常
- [ ] 单侧上下文隔离验证通过
- [ ] 管理员 API 功能完整
- [ ] 所有测试用例通过

**性能验收**：
- [ ] 响应时间在可接受范围内
- [ ] 并发性能满足要求
- [ ] 无内存泄漏或资源问题
- [ ] 数据库负载可控

**安全验收**：
- [ ] 管理员 API 权限控制有效
- [ ] 数据访问安全
- [ ] 无安全漏洞
- [ ] 审计日志完整

## 11. 附录

### 11.1 术语表

| 术语 | 解释 |
|------|------|
| CAS | Compare-And-Swap，乐观锁实现机制 |
| TTL | Time-To-Live，数据过期时间 |
| LRU | Least Recently Used，缓存淘汰策略 |
| RLS | Row-Level Security，行级安全策略 |
| JSONB | PostgreSQL 的二进制 JSON 格式 |
| Supabase | 开源 Firebase 替代方案 |
| Heroku | 云应用平台 |
| Dyno | Heroku 中的应用容器 |

### 11.2 参考文档

- [完整设计文档](sessionstore_supabase_complete_design.md)
- [数据库迁移文档](../migrations/README.md)
- [部署指南](../DEPLOYMENT_GUIDE.md)
- [API 文档](../api_endpoints.json)

### 11.3 联系人

- **项目负责人**：[您的姓名]
- **后端开发**：[开发团队]
- **QA 工程师**：[QA团队]
- **DevOps 工程师**：[DevOps团队]
- **安全工程师**：[安全团队]

**更新日期**：2024-01-21
**下次更新**：2024-01-28（预计）

---

> 本文档将随着项目进展持续更新，确保所有利益相关者了解最新状态和计划。
