# eChat Arena 持久化 Bug 修复历史分析报告

生成时间：2026-02-11
分析范围：/workspaces/echat-arena 项目

---

## 执行摘要

本报告系统分析了 eChat Arena 项目中所有与持久化相关的 bug 修复历史，识别了之前修复的问题、可能被遗漏的持久化点、代码中的可疑模式，以及需要重构的代码区域。

**关键发现**：
- 共发现 **7 个主要持久化相关 bug 修复**
- 识别出 **5 个可能被遗漏的持久化点**
- 发现 **4 个可疑的代码模式**
- 标记 **3 个需要重构的代码区域**

---

## 1. 持久化 Bug 修复历史

### 1.1 SessionStore 持久化改造 (commit: 8144383)
**日期**: 2026-01-21
**影响范围**: 核心会话管理

**问题描述**：
- Heroku dyno 重启导致会话丢失
- 多实例部署无法共享会话
- 模型上下文隔离问题

**解决方案**：
- 实现 `SupabaseSessionStore` 类，支持持久化存储
- 添加软删除功能（`soft_delete`, `restore_session`, `cleanup_deleted_sessions`）
- 实现单侧上下文隔离（`_build_side_context`, 修改 `append_turn`）
- 添加管理员 API 端点（会话列表、软删除、恢复、清理）
- 创建数据库迁移脚本 `add_arena_sessions_table.sql`

**文件变更**：
- `app.py`: 添加 SupabaseSessionStore 类和管理 API 端点
- `migrations/add_arena_sessions_table.sql`: 新增迁移脚本
- `test_supabase_sessionstore.py`: 完整测试套件

**关键代码模式**：
```python
# CAS (Compare-And-Swap) 并发控制
async def _supabase_cas_update(
    self,
    session_id: str,
    old_version: int,
    new_data: Dict[str, Any],
    create_if_not_exists: bool = False
) -> bool:
    # 使用 version 字段实现乐观锁
```

---

### 1.2 Post-vote 持久化修复 (commit: bbdd07c)
**日期**: 2026-02-04
**影响范围**: 投票后对话

**问题描述**：
- Post-vote 对话消息在浏览器刷新时丢失
- 前端只在 React state 中存储消息，没有持久化

**解决方案**：
- 所有三个页面（battle, chat detail, draft）在每条消息完成后重新从 `post_vote_turns` 表获取持久化数据
- 添加会话重建回退到 chat history API 端点

**文件变更**：
- `app.py`: 修改 SSE 流逻辑
- `web/app/battle/page.tsx`: 添加历史获取逻辑
- `web/app/chat/[id]/page.tsx`: 添加历史获取逻辑
- `web/app/draft/[session_id]/page.tsx`: 添加历史获取逻辑

**关键代码模式**：
```typescript
// 在消息完成后重新获取历史
useEffect(() => {
  if (status === "done" && prompt && leftText && rightText) {
    // 重新获取持久化数据
  }
}, [status, prompt, leftText, rightText]);
```

---

### 1.3 Race Condition 修复 (commit: 880f6c0)
**日期**: 2026-02-04
**影响范围**: Post-vote 消息流

**问题描述**：
- 之前的持久化修复引入了回归问题
- 消息在流式传输过程中消失
- 根本原因：后端在写入数据库之前发送 SSE finish frame，导致前端 refetch 返回过期数据并清除所有本地状态

**解决方案**：
- **后端**：将 finish frame 移到数据库写入之后，确保数据在客户端查询时始终可用
- **Chat/Draft 页面**：用乐观本地状态更新替换 refetch-on-finish，完全消除竞态条件
- **Battle 页面**：添加 `isPostVoteChatting` 守卫到 history fetch useEffect，防止覆盖活跃对话状态

**文件变更**：
- `app.py`: 调整 SSE 流顺序
- `web/app/battle/page.tsx`: 添加守卫逻辑
- `web/app/chat/[id]/page.tsx`: 乐观更新
- `web/app/draft/[session_id]/page.tsx`: 乐观更新

**关键代码模式**：
```python
# 后端：先写入数据库，再发送 finish frame
if saved_turn_index is not None:
    # 数据库写入成功
    pass

# 然后发送 finish frame
yield _sse_data({
    "type": "finish",
    "saved": saved_turn_index is not None,
    "turn_index": saved_turn_index,
    "finish": True
})
```

---

### 1.4 页面刷新恢复 (commit: 29376f9)
**日期**: 2026-02-04
**影响范围**: Draft 页面

**问题描述**：
- Draft 页面在页面刷新后无法恢复 post-vote turns
- `_reconstruct_session_from_votes` 只处理 `model_a`/`model_b`，不处理 `left`/`right`

**解决方案**：
- 后端：添加 `left`/`right` 投票值支持到 `_reconstruct_session_from_votes`
- Draft 页面：在页面挂载时添加 post-vote turns 加载

**文件变更**：
- `app.py`: 扩展会话重建逻辑
- `web/app/draft/[session_id]/page.tsx`: 添加挂载时加载

**关键代码模式**：
```python
# 支持多种投票值格式
if user_vote == "model_a":
    winner = "left" if is_left_baseline else "right"
elif user_vote == "model_b":
    winner = "right" if is_left_baseline else "left"
elif user_vote in ("left", "right"):
    winner = user_vote
```

---

### 1.5 跨页面恢复 (commit: 96b4ddb)
**日期**: 2026-02-10
**影响范围**: Battle 和 Draft 页面

**问题描述**：
- **Battle 页面**：`conversationHistory` 在刷新时为空，导致 `ConversationTurnBlock` 无法渲染，post-vote turns 没有容器显示
- **Draft 页面**：投票后 draft 记录被删除，导致硬错误隐藏所有 post-vote 内容。API 返回 `winner` 字段但前端读取 `winner_side`

**解决方案**：
- 添加 `_fetch_vote_record()` 辅助函数查询 pre-vote 对话数据
- 扩展 `/api/arena/chat/history` 返回 `winner_side` 和 `conversation` 对象（包含 prompt, replies, history）
- Battle 页面：从 API 恢复 `conversationHistory`
- Draft 页面：优雅处理已删除的 draft，从 chat history API 重建显示数据；修复 `winner_side` 字段不匹配

**文件变更**：
- `app.py`: 添加 `_fetch_vote_record` 和扩展 history API
- `web/app/battle/page.tsx`: 恢复 conversationHistory
- `web/app/draft/[session_id]/page.tsx`: 优雅处理删除的 draft

**关键代码模式**：
```python
async def _fetch_vote_record(vote_id: str) -> Optional[Dict[str, Any]]:
    """获取投票记录以获取 pre-vote 对话数据"""
    params = {
        "id": f"eq.{vote_id}",
        "select": "id,session_id,prompt,reply_a,reply_b,conversation_history,model_config,user_vote,model_a,model_b",
    }
```

---

### 1.6 Draft Save and Resume (commit: e7baf00)
**日期**: 2026-01-25
**影响范围**: Draft 功能

**问题描述**：
- 未投票的对话无法保存
- 用户无法恢复未完成的对话

**解决方案**：
- 保存未投票的对话到数据库以实现持久化
- 添加 `/draft/{session_id}` 页面用于查看和投票 draft
- 添加专用的 draft 投票端点，处理过期会话
- 启用与获胜模型的 post-vote 聊天继续
- History 页面现在显示 draft 部分，包含到 draft 详情页面的链接
- 投票后隐藏内部模型配置（Strategy/Baseline）

**文件变更**：
- `app.py`: 添加 draft API 端点
- `migrations/add_draft_conversations.sql`: 新增迁移脚本
- `web/app/battle/page.tsx`: 添加 draft 保存逻辑
- `web/app/chat/[id]/page.tsx`: 添加 draft 支持
- `web/app/draft/[session_id]/page.tsx`: 新建页面
- `web/app/history/page.tsx`: 添加 draft 显示

**关键代码模式**：
```python
# Draft 保存逻辑
@router.post(f"{API_PREFIX}/draft")
async def save_draft(body: Dict[str, Any] = Body(...)) -> JSONResponse:
    """保存或更新 draft 对话（未投票）"""
    # 使用 upsert 逻辑
```

---

### 1.7 提取 usePostVoteChat Hook (commit: b52ee56)
**日期**: 2026-02-10
**影响范围**: 前端代码重构

**问题描述**：
- Post-vote 聊天状态管理逻辑在多个页面重复
- localStorage 持久化和 SSE 流逻辑分散

**解决方案**：
- 提取共享的 `usePostVoteChat` hook 用于 post-vote 聊天状态管理
- 简化 battle 页面，将 post-vote 聊天委托给共享 hook
- 简化 chat/[id] 页面，使用相同的 hook 集成
- 更新 `_fetch_post_vote_turns_supabase` 返回 `(turns, error_type)` 元组
- 从 `AIResponseCard` 移除冗余的 post-vote 渲染逻辑
- 清理 `ConversationTurnBlock` 未使用的 props

**文件变更**：
- `arena/db/post_vote.py`: 修改返回类型
- `arena/services/chat.py`: 更新服务
- `web/app/battle/page.tsx`: 简化逻辑
- `web/app/chat/[id]/page.tsx`: 简化逻辑
- `web/components/AIResponseCard.tsx`: 移除冗余逻辑
- `web/components/ConversationTurnBlock.tsx`: 清理 props
- `web/hooks/usePostVoteChat.ts`: 新建 hook

**关键代码模式**：
```typescript
// 统一的 post-vote 聊天状态管理
export function usePostVoteChat({
  sessionId,
  initialVoteId,
  localStorageKey,
}: UsePostVoteChatOptions): UsePostVoteChatReturn {
  // localStorage 持久化
  // SSE 流处理
  // 历史获取
  // 错误处理
}
```

---

## 2. 可能被遗漏的持久化点

### 2.1 模型选择器状态 (selectedModelKey)
**位置**: `web/app/battle/page.tsx`, `web/app/HomeClient.tsx`
**当前实现**: 仅 localStorage 持久化
**风险等级**: 中

**问题描述**：
- `selectedModelKey` 只在 localStorage 中存储
- 没有后端持久化，用户在不同设备间无法同步
- localStorage 可能被清除或不可用（隐私模式）

**代码位置**：
```typescript
// web/app/battle/page.tsx:103-120
const stored = localStorage.getItem(MODEL_STORAGE_KEY);
if (stored) {
  setSelectedModelKey(stored);
}
```

**建议修复**：
- 将用户模型选择保存到 Supabase `user_preferences` 表
- 在用户登录时从数据库加载偏好
- 保持 localStorage 作为快速访问的缓存

---

### 2.2 Admin Token 内存回退
**位置**: `arena/routes/admin/auth.py`
**当前实现**: 数据库 + 内存回退
**风险等级**: 高

**问题描述**：
- Admin token 在数据库不可用时回退到内存存储
- Heroku dyno 重启会导致所有 token 失效
- 多实例部署时 token 不共享

**代码位置**：
```python
# arena/routes/admin/auth.py:45-50
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    # Fallback to in-memory if Supabase not configured
    _ADMIN_TOKENS[token] = expires_at
    return token, expires_at
```

**建议修复**：
- 移除内存回退，强制要求 Supabase 配置
- 或使用 Redis 作为分布式缓存
- 添加监控告警，当数据库不可用时立即通知

---

### 2.3 Rate Limiting (_LOGIN_ATTEMPTS)
**位置**: `arena/routes/admin/auth.py`
**当前实现**: 纯内存存储
**风险等级**: 中

**问题描述**：
- 登录尝试限制只在内存中存储
- Heroku dyno 重启会重置所有限制
- 攻击者可以通过重启 dyno 绕过限制

**代码位置**：
```python
# arena/routes/admin/auth.py:68-75
_LOGIN_ATTEMPTS: Dict[str, List[datetime]] = {}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 1
```

**建议修复**：
- 将登录尝试记录保存到 Supabase `admin_audit_log` 表
- 使用数据库查询检查限制
- 添加 IP 黑名单功能

---

### 2.4 分类器缓存
**位置**: `arena/classifier.py`
**当前实现**: 无缓存
**风险等级**: 低

**问题描述**：
- 情绪分类每次都调用 LLM API
- 相同输入重复分类浪费资源
- 没有缓存机制

**建议修复**：
- 添加 LRU 缓存，基于输入文本和对话历史
- 缓存有效期 1 小时
- 使用 Redis 或内存缓存

---

### 2.5 模型配置加载
**位置**: `arena/config.py`, `api_endpoints.json`
**当前实现**: 从 JSON 文件加载，无缓存
**风险等级**: 低

**问题描述**：
- 模型配置每次启动时从文件加载
- 运行时修改配置需要重启服务
- 没有热重载机制

**建议修复**：
- 添加配置热重载功能
- 监听文件变化或提供 API 端点重新加载
- 缓存配置在内存中，减少文件 I/O

---

## 3. 可疑的代码模式

### 3.1 双重持久化可能导致不一致
**位置**: `web/hooks/usePostVoteChat.ts`
**模式**: localStorage + 数据库双重持久化

**问题描述**：
```typescript
// 1. 保存到 localStorage
localStorage.setItem(localStorageKey, JSON.stringify({
  session_id: sessionId,
  vote_id: newVoteId,
  winnerSide: newWinnerSide,
  timestamp: Date.now(),
}));

// 2. 从数据库获取历史
const res = await fetch(`/api/proxy/api/arena/chat/history?${params.toString()}`);
```

**风险**：
- localStorage 和数据库可能不同步
- 过期数据可能误导用户
- 清除 localStorage 会导致状态丢失

**建议**：
- 统一使用单一数据源（数据库）
- localStorage 仅作为临时缓存，设置短过期时间
- 添加数据一致性检查

---

### 3.2 内存回退机制可能导致数据丢失
**位置**: `arena/session/supabase.py`
**模式**: Supabase 不可用时回退到内存

**问题描述**：
```python
# Fallback to memory store
print(_json_dumps({
    "t": _utc_now_iso(),
    "type": "session_store_fallback_to_memory",
    "session_id": session_id,
    "reason": "supabase_unavailable"
}), file=sys.stderr)

async with self._lock:
    value["_ts"] = time.time()
    self._sessions[session_id] = value
```

**风险**：
- 数据库恢复后内存数据不会同步
- 用户可能在不同 dyno 上访问，导致数据不一致
- 没有明确的恢复机制

**建议**：
- 移除内存回退，失败时返回错误
- 或实现内存到数据库的同步队列
- 添加监控和告警

---

### 3.3 SSE 流中的 finish frame 顺序
**位置**: `arena/services/chat.py`
**模式**: 数据库写入后发送 finish frame

**问题描述**：
```python
# Write to database
status = await _insert_post_vote_turn_supabase(...)

# Then send finish frame
yield _sse_data({
    "type": "finish",
    "saved": saved_turn_index is not None,
    "turn_index": saved_turn_index,
    "finish": True
})
```

**风险**：
- 如果数据库写入失败，finish frame 仍然发送
- 前端可能认为保存成功，实际失败
- 没有重试机制

**建议**：
- 只在保存成功时发送 finish frame
- 添加重试逻辑
- 前端验证 `saved` 字段

---

### 3.4 乐观更新可能导致 UI 不一致
**位置**: `web/hooks/usePostVoteChat.ts`
**模式**: 乐观更新 + 延迟验证

**问题描述**：
```typescript
case "finish": {
  if (json.saved === true) {
    // Server confirmed persistence — safe to add turn
    const newTurn: PostVoteTurn = {
      turn_index: json.turn_index ?? 0,
      user_message: message,
      assistant_message: reply,
      created_at: new Date().toISOString(),
    };
    setTurns(prev => dedupTurns([...prev, newTurn]));
  } else {
    // Server did NOT persist — don't add phantom turn
    setSendError("save_failed");
  }
  break;
}
```

**风险**：
- 如果 `saved` 为 false，用户消息仍然显示但未保存
- 没有明确的重试机制
- 用户可能不知道消息未保存

**建议**：
- 添加重试按钮
- 显示明确的错误状态
- 提供手动保存选项

---

## 4. 需要重构的代码区域

### 4.1 SessionStore 并发控制
**位置**: `arena/session/supabase.py`
**问题**: CAS 逻辑复杂，重试机制分散

**当前代码**：
```python
async def _supabase_cas_update(
    self,
    session_id: str,
    old_version: int,
    new_data: Dict[str, Any],
    create_if_not_exists: bool = False
) -> bool:
    # 复杂的 CAS 逻辑
    # 重试机制分散在多个方法中
```

**建议重构**：
- 提取通用的重试装饰器
- 统一 CAS 更新逻辑
- 添加更详细的错误日志
- 实现指数退避算法

---

### 4.2 Post-vote 聊天状态管理
**位置**: `web/hooks/usePostVoteChat.ts`
**问题**: 状态管理复杂，副作用多

**当前代码**：
```typescript
export function usePostVoteChat({
  sessionId,
  initialVoteId,
  localStorageKey,
}: UsePostVoteChatOptions): UsePostVoteChatReturn {
  // 多个 useEffect
  // 复杂的状态依赖
  // localStorage 和数据库双重持久化
}
```

**建议重构**：
- 使用状态机模式管理状态
- 分离 localStorage 和数据库逻辑
- 添加单元测试
- 简化状态依赖

---

### 4.3 Admin 认证逻辑
**位置**: `arena/routes/admin/auth.py`
**问题**: 内存回退和数据库逻辑混合

**当前代码**：
```python
async def _verify_admin_token(token: str) -> bool:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        # Fallback to in-memory
        return token in _ADMIN_TOKENS and ...
    # Database logic
```

**建议重构**：
- 移除内存回退
- 统一使用数据库
- 添加 Redis 缓存层
- 实现分布式锁

---

## 5. TODO/FIXME/HACK 标记

### 5.1 代码中的标记

从搜索结果中发现以下标记：

**TODO 标记**：
- 无明显 TODO 标记

**FIXME 标记**：
- 无明显 FIXME 标记

**HACK 标记**：
- 无明显 HACK 标记

**NOTE 标记**：
- `test_supabase_sessionstore.py:193`: "Note: In memory mode, soft delete won't actually delete from Supabase"
- `migrations/add_model_is_default.sql:13`: "-- Note: To set a model as default, first unset any existing default:"
- `migrations/add_vote_idempotency.sql:7`: "-- Notes:"

### 5.2 隐式问题

虽然没有显式的 TODO/FIXME 标记，但以下代码区域隐含了需要改进的问题：

1. **内存回退机制**：多处使用内存回退，但没有明确的改进计划
2. **双重持久化**：localStorage 和数据库双重持久化，没有统一策略
3. **错误处理**：某些错误只是打印日志，没有恢复机制

---

## 6. 建议的改进优先级

### 高优先级（立即修复）
1. **移除 Admin Token 内存回退**：可能导致安全问题
2. **修复 Rate Limiting 持久化**：可能被绕过
3. **统一 Post-vote 持久化策略**：避免数据不一致

### 中优先级（近期修复）
1. **添加模型选择器后端持久化**：改善用户体验
2. **重构 SessionStore 并发控制**：提高可靠性
3. **添加分类器缓存**：降低成本

### 低优先级（长期改进）
1. **添加模型配置热重载**：提高运维效率
2. **重构 Post-vote 聊天状态管理**：提高可维护性
3. **添加更多监控和告警**：提高可观测性

---

## 7. 测试建议

### 7.1 持久化测试场景

1. **Heroku dyno 重启测试**：
   - 在对话过程中重启 dyno
   - 验证会话数据恢复
   - 验证 post-vote 消息恢复

2. **多实例部署测试**：
   - 在多个 dyno 间切换请求
   - 验证会话数据一致性
   - 验证 admin token 共享

3. **网络故障测试**：
   - 模拟 Supabase 不可用
   - 验证错误处理
   - 验证回退机制

4. **并发写入测试**：
   - 同时发送多个消息
   - 验证 CAS 并发控制
   - 验证数据一致性

### 7.2 自动化测试

建议添加以下测试：

```python
# test_persistence_scenarios.py
async def test_dyno_restart_session_recovery():
    """测试 dyno 重启后会话恢复"""
    pass

async def test_multi_instance_session_consistency():
    """测试多实例会话一致性"""
    pass

async def test_supabase_unavailable_fallback():
    """测试 Supabase 不可用时的回退"""
    pass

async def test_concurrent_post_vote_messages():
    """测试并发 post-vote 消息"""
    pass
```

---

## 8. 监控和告警建议

### 8.1 关键指标

1. **持久化成功率**：
   - SessionStore 写入成功率
   - Post-vote turn 保存成功率
   - Draft 保存成功率

2. **回退机制触发率**：
   - 内存回退触发次数
   - 数据库查询失败次数
   - 重试次数

3. **数据一致性**：
   - localStorage 和数据库不一致次数
   - 会话重建失败次数
   - 版本冲突次数

### 8.2 告警规则

```yaml
# 示例告警规则
alerts:
  - name: HighPersistenceFailureRate
    condition: persistence_failure_rate > 0.05
    severity: critical

  - name: FrequentMemoryFallback
    condition: memory_fallback_count > 10 per hour
    severity: warning

  - name: DataInconsistencyDetected
    condition: data_inconsistency_count > 0
    severity: critical
```

---

## 9. 结论

通过对 eChat Arena 项目的深入分析，我们发现了以下关键问题：

1. **历史修复有效**：之前的 7 个持久化 bug 修复都解决了实际问题，但引入了一些新的复杂性
2. **遗漏的持久化点**：模型选择器、admin token、rate limiting 等需要持久化
3. **可疑模式**：双重持久化、内存回退、SSE 顺序等可能导致问题
4. **重构需求**：SessionStore、Post-vote 聊天、Admin 认证需要重构

**建议**：
- 优先修复高优先级问题
- 添加全面的持久化测试
- 实现监控和告警
- 逐步重构复杂代码区域

---

## 附录

### A. 相关文件清单

**后端文件**：
- `arena/session/base.py` - 内存 SessionStore
- `arena/session/supabase.py` - Supabase SessionStore
- `arena/db/post_vote.py` - Post-vote 数据库操作
- `arena/db/votes.py` - 投票数据库操作
- `arena/services/chat.py` - Post-vote 聊天服务
- `arena/routes/chat.py` - Post-vote 聊天路由
- `arena/routes/admin/auth.py` - Admin 认证
- `arena/routes/sessions.py` - 会话管理
- `arena/routes/drafts.py` - Draft 管理

**前端文件**：
- `web/hooks/usePostVoteChat.ts` - Post-vote 聊天 Hook
- `web/app/battle/page.tsx` - Battle 页面
- `web/app/chat/[id]/page.tsx` - Chat 详情页面
- `web/app/draft/[session_id]/page.tsx` - Draft 页面
- `web/app/HomeClient.tsx` - 首页客户端

**测试文件**：
- `test_supabase_sessionstore.py` - SessionStore 测试

**迁移文件**：
- `migrations/add_arena_sessions_table.sql` - 会话表
- `migrations/add_draft_conversations.sql` - Draft 表
- `migrations/add_post_vote_chat.sql` - Post-vote 聊天表

### B. Git 提交历史

```
8144383 feat: SessionStore 持久化改造完整实施
bbdd07c fix: persist post-vote chat messages across page refreshes
880f6c0 fix: resolve race condition causing post-vote messages to disappear
29376f9 fix: restore post-vote chat history on page refresh
96b4ddb fix: restore post-vote chat history across both battle and draft pages
e7baf00 feat: Add draft save and resume functionality
b52ee56 refactor: extract usePostVoteChat hook and simplify battle/chat pages
```

### C. 参考资料

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 部署指南
- [DEPLOYMENT_GUIDE_SESSIONSTORE.md](DEPLOYMENT_GUIDE_SESSIONSTORE.md) - SessionStore 部署指南
- [plans/sessionstore_supabase_complete_design.md](plans/sessionstore_supabase_complete_design.md) - SessionStore 设计文档
- [plans/SESSIONSTORE_IMPLEMENTATION_PROGRESS.md](plans/SESSIONSTORE_IMPLEMENTATION_PROGRESS.md) - 实施进度

---

**报告结束**
