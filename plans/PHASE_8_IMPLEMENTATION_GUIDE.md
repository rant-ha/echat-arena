# Phase 8.2-8.3：投票后继续对话功能实现指南

## 任务概述

实现投票后继续对话功能，允许用户在投票后与选中的模型继续对话，并确保所有对话历史（包括投票前和投票后）都能持久化保存，关闭浏览器后再打开仍能看到完整的对话历史。

## Phase 8.2：接口契约统一（已完成）

### 统一的 SSE Frame Schema

所有 SSE 端点（[`/api/arena/battle`](app.py:1915)、[`/api/arena/continue`](app.py:1951)、[`/api/arena/chat`](app.py:2522)）现在使用统一的 frame 格式：

#### Meta Frame
```json
{
  "type": "meta",
  "side": "meta" | "left" | "right" | "winner",
  "finish": false,
  "session_id": "uuid",
  "emotion": "anger|sadness|anxiety|fear|happy|neutral",
  "intensity": "low|medium|high",
  "support_type": "emotional|practical|both",
  "ts": "2026-01-18T10:00:00.000Z",
  // ... 其他元数据字段
}
```

#### Delta Frame（流式内容）
```json
{
  "type": "delta",
  "side": "left" | "right" | "winner",
  "delta": "文本片段",
  "finish": false
}
```

#### Finish Frame（完成信号）
```json
{
  "type": "finish",
  "side": "left" | "right" | "winner",
  "finish": true
}
```

#### Error Frame（错误处理）
```json
{
  "type": "error",
  "side": "error",
  "error": "错误信息",
  "finish": true
}
```

### 请求体规范

#### POST /api/arena/chat（投票后对话）

**请求体（向后兼容）**：
```json
{
  "session_id": "uuid",
  "user_message": "用户输入"  // preferred
  // 或 "prompt": "用户输入"  // deprecated, for backward compatibility
}
```

后端同时接受 `user_message`（推荐）和 `prompt`（已弃用但兼容）字段。

### 响应体规范

#### GET /api/arena/chat/history

**响应结构（稳定）**：
```json
{
  "ok": true,
  "data": {
    "type": "history",
    "vote_id": "uuid",
    "winner": "left" | "right",
    "turns": [
      {
        "turn_index": 1,
        "user_message": "...",
        "assistant_message": "...",
        "created_at": "2026-01-18T10:00:00.000Z"
      }
    ]
  }
}
```

### 前端兼容性

前端 SSE 解析器（[`web/app/battle/page.tsx`](web/app/battle/page.tsx:131)）现在支持：
- **优先按 `type` 字段分发**：`meta`、`delta`、`finish`、`error`
- **向后兼容旧格式**：如果没有 `type` 字段，根据 `delta`/`finish`/`error` 字段推断类型
- **统一错误处理**：所有错误通过 `type: "error"` frame 传递

### 向后兼容策略

1. **请求体兼容**：后端同时接受 `user_message` 和 `prompt`
2. **响应体兼容**：前端解析器支持有/无 `type` 字段的 frame
3. **渐进式迁移**：旧客户端仍可正常工作，新客户端享受统一接口

### 实施验证

- ✅ 后端三个 SSE 端点输出一致的 frame schema
- ✅ 前端 postVote SSE 解析按 type/side 分发
- ✅ 向后兼容旧格式（无 type 字段）
- ✅ GET /api/arena/chat/history 返回稳定结构
- ✅ 刷新页面后投票后对话历史正常恢复

## 核心设计决策

### 1. 数据存储策略

**方案选择**：扩展现有的 `votes` 表，添加 `post_vote_messages` 字段

```sql
-- 在 Supabase votes 表中添加新字段
ALTER TABLE votes ADD COLUMN IF NOT EXISTS post_vote_messages JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN votes.post_vote_messages IS 'Conversation after voting with winner model only. Format: [{"turn": 1, "user": "...", "reply": "...", "timestamp": "..."}]';
```

**设计理由**：
- 保持与现有 `conversation_history` 字段的一致性
- 使用 JSONB 类型便于灵活存储和查询
- 仅存储与胜者模型的对话，减少数据冗余
- 关闭浏览器后可通过 session_id 恢复完整对话历史

### 2. 后端实现要点

#### 2.1 修改 /api/arena/vote 端点

在用户投票时，需要创建一个标记，表示投票已完成，并保存 vote_id 到 session 中，以便后续对话可以引用。

**关键修改**：
```python
# 在 vote 端点成功后，将 vote_id 保存到 session 中
vote_id = result['id']  # 从 Supabase 插入结果中获取
await _SESSION_STORE.update(session_id, {
    "vote_id": vote_id,
    "winner": vote_value,  # 保存胜者信息
    "voted_at": _utc_now_iso()
})
```

#### 2.2 新增 /api/arena/chat 端点

```python
@app.post("/api/arena/chat")
async def post_vote_chat(request: Request):
    """
    投票后与选中模型继续对话（带持久化）
    
    请求体：
    {
        "session_id": "uuid",
        "user_message": "用户新输入的问题"
    }
    
    返回：SSE 流式响应，格式与 /api/arena/battle 相同
    """
    data = await request.json()
    session_id = data.get("session_id")
    user_message = data.get("user_message")
    
    # 1. 验证 session 和投票状态
    if not session_id or not user_message:
        raise HTTPException(status_code=400, detail="缺少必填参数")
    
    sess = await _SESSION_STORE.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    if not sess.get("vote_id"):
        raise HTTPException(status_code=400, detail="尚未投票，无法继续对话")
    
    vote_id = sess.get("vote_id")
    winner = sess.get("winner")
    
    # 2. 从 Supabase 获取现有的 post_vote_messages
    supabase = create_client()
    vote_record = supabase.table("votes").select("post_vote_messages").eq("id", vote_id).single().execute()
    post_vote_history = vote_record.get("post_vote_messages", [])
    
    # 3. 构建上下文（包含投票前 + 投票后的历史）
    # 获取投票前的对话历史
    conversation_history = sess.get("conversation_history", [])
    
    # 构建完整的消息历史
    messages = [{"role": "system", "content": "You are a helpful assistant."}]
    
    # 添加投票前的对话历史
    for turn in conversation_history:
        messages.append({"role": "user", "content": turn["user"]})
        # 根据 winner 选择正确的回复
        if winner in ["left", "model_a"] and sess.get("left").get("arm") == "baseline":
            messages.append({"role": "assistant", "content": turn["reply_a"]})
        elif winner in ["right", "model_b"] and sess.get("right").get("arm") == "empathy":
            messages.append({"role": "assistant", "content": turn["reply_b"]})
        else:
            # 根据实际 arm 分配选择
            messages.append({"role": "assistant", "content": turn["reply_a"] if turn["reply_a"] else turn["reply_b"]})
    
    # 添加投票后的对话历史
    for msg in post_vote_history:
        messages.append({"role": "user", "content": msg["user"]})
        messages.append({"role": "assistant", "content": msg["reply"]})
    
    # 添加当前用户消息
    messages.append({"role": "user", "content": user_message})
    
    # 4. 调用 LLM 生成回复
    endpoint = _get_endpoint(REPLY_MODEL_NAME)
    full_text = ""
    
    async def generate():
        nonlocal full_text
        async for delta in _chat_completion_stream(endpoint, messages, temperature=0.2):
            full_text += delta
            yield delta
    
    # 5. **关键**：将新对话追加到 post_vote_messages 并更新数据库
    new_turn = {
        "turn": len(post_vote_history) + 1,
        "user": user_message,
        "reply": full_text,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    # 更新 Supabase
    supabase.table("votes").update({
        "post_vote_messages": post_vote_history + [new_turn]
    }).eq("id", vote_id).execute()
    
    # 6. 返回流式响应
    return StreamingResponse(generate(), media_type="text/event-stream")
```

#### 2.3 数据获取端点

修改 `/api/arena/session/{session_id}` 或创建新的获取端点，返回完整的对话历史（包括 conversation_history 和 post_vote_messages）。

```python
@app.get("/api/arena/session/{session_id}")
async def get_session_history(session_id: str):
    """
    获取完整的对话历史（包括投票前和投票后）
    """
    # 1. 从 session store 获取基本信息
    sess = await _SESSION_STORE.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    # 2. 从 Supabase 获取投票后的对话历史
    vote_id = sess.get("vote_id")
    post_vote_messages = []
    
    if vote_id:
        supabase = create_client()
        vote_record = supabase.table("votes").select("post_vote_messages").eq("id", vote_id).single().execute()
        post_vote_messages = vote_record.get("post_vote_messages", [])
    
    # 3. 返回完整的对话历史
    return {
        "session_id": session_id,
        "conversation_history": sess.get("conversation_history", []),
        "post_vote_messages": post_vote_messages,
        "has_voted": bool(vote_id),
        "winner": sess.get("winner")
    }
```

### 3. 前端实现要点

#### 3.1 Battle 页面状态管理

```typescript
// 新增状态
const [postVoteMessages, setPostVoteMessages] = useState<Array<{
  turn: number;
  user: string;
  reply: string;
  timestamp: string;
}>>([]);

const [winnerSide, setWinnerSide] = useState<"left" | "right" | null>(null);

// 从后端加载投票后的历史（页面刷新时）
useEffect(() => {
  if (sessionId && voteState.isRevealed) {
    fetchPostVoteHistory(sessionId).then(history => {
      setPostVoteMessages(history);
      // 根据投票结果设置胜者
      if (voteState.result?.revealed_left?.arm === "empathy") {
        setWinnerSide("left");
      } else if (voteState.result?.revealed_right?.arm === "empathy") {
        setWinnerSide("right");
      }
    });
  }
}, [sessionId, voteState.isRevealed]);

// 投票后发送消息
const handlePostVoteChat = async (message: string) => {
  if (!sessionId || !voteState.isRevealed) {
    toast.error("尚未投票或会话无效");
    return;
  }
  
  try {
    const response = await fetch("/api/proxy/api/arena/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        user_message: message
      })
    });
    
    if (!response.ok) {
      throw new Error("发送消息失败");
    }
    
    // 处理流式响应
    const reader = response.body?.getReader();
    let fullReply = "";
    
    while (true) {
      const { done, value } = await reader?.read();
      if (done) break;
      
      const chunk = new TextDecoder().decode(value);
      fullReply += chunk;
      // 实时更新 UI
    }
    
    // 成功后添加到本地状态
    setPostVoteMessages(prev => [...prev, { 
      turn: prev.length + 1, 
      user: message, 
      reply: fullReply, 
      timestamp: new Date().toISOString() 
    }]);
    
  } catch (error) {
    toast.error("发送消息失败: " + error.message);
  }
};
```

#### 3.2 ResponseCard 显示逻辑

```typescript
<ResponseCard
  side="left"
  // 投票前的历史
  conversationHistory={conversationHistory.map(turn => ({
    turn: turn.turn,
    user: turn.user,
    reply: turn.reply_a
  }))}
  // 投票后的历史（仅选中侧显示）
  postVoteMessages={winnerSide === 'left' ? postVoteMessages : []}
  currentReply={winnerSide === 'left' ? postVoteReply : ''}
  isGenerating={isGenerating && winnerSide === 'left'}
  isRevealed={voteState.isRevealed}
  isWinner={winnerSide === 'left'}  // 新增：标记是否为胜者侧
/>
```

#### 3.3 置灰未选中侧（Phase 8.3）

```typescript
<div className={cn(
  "flex-1 transition-all duration-300",
  voteState.isRevealed && winnerSide !== 'left' && "opacity-30 grayscale pointer-events-none"
)}>
  <ResponseCard side="left" ... />
</div>
```

### 4. History 页面集成

修改 [`web/app/history/page.tsx`](web/app/history/page.tsx:1) 和 [`web/app/chat/[id]/page.tsx`](web/app/chat/[id]/page.tsx:1)，显示完整的对话历史（包括投票后的对话）。

```typescript
// 从 Supabase 获取 vote 记录时，同时获取 post_vote_messages
const { data: vote } = await supabase
  .from('votes')
  .select('*, conversation_history, post_vote_messages')
  .eq('id', voteId)
  .single();

// 渲染时合并显示
{conversation_history.map(turn => <TurnDisplay />)}
{vote.post_vote_messages && vote.post_vote_messages.length > 0 && (
  <>
    <div className="my-4 text-center text-sm text-zinc-500">
      --- 投票后继续对话 ---
    </div>
    {vote.post_vote_messages.map(msg => <PostVoteTurnDisplay />)}
  </>
)}
```

### 5. 数据库 Schema 完整定义

```sql
-- votes 表字段总览
CREATE TABLE votes (
  id UUID PRIMARY KEY,
  session_id TEXT,
  winner TEXT,  -- 'left' | 'right'
  user_prompt TEXT,
  reply_a TEXT,
  reply_b TEXT,
  conversation_history JSONB DEFAULT '[]'::jsonb,  -- 投票前的多轮对话
  turn_count INTEGER DEFAULT 1,
  post_vote_messages JSONB DEFAULT '[]'::jsonb,  -- 投票后的单侧对话（新增）
  created_at TIMESTAMP DEFAULT NOW(),
  -- ... 其他字段 ...
);

-- 索引
CREATE INDEX idx_votes_post_vote_gin ON votes USING gin (post_vote_messages);
```

### 6. 实施步骤

**步骤 1**：数据库迁移
- 创建 `migrations/add_post_vote_messages.sql`
- 在 Supabase 执行迁移

**步骤 2**：后端实现
- 实现 /api/arena/chat 端点
- 修改 /api/arena/vote 保存 vote_id 到 session
- 实现 Supabase 更新逻辑

**步骤 3**：前端实现（Battle 页面）
- 新增状态管理
- 实现投票后对话逻辑
- 实现数据加载和持久化

**步骤 4**：前端实现（History 页面）
- 更新数据查询
- 更新 UI 显示

**步骤 5**：前端实现（Phase 8.3 置灰效果）
- 添加条件样式
- 实现交互限制

### 7. 测试场景

- 投票后发送多条消息，刷新页面验证历史保存
- 关闭浏览器，重新打开 History 页面验证完整历史显示
- 验证未选中侧置灰且无法交互
- 验证选中侧可以继续对话

### 8. 验收标准

- [ ] 数据库迁移脚本创建
- [ ] 后端 /api/arena/chat 端点实现（带持久化）
- [ ] 前端 Battle 页面投票后对话逻辑
- [ ] 前端 History 页面显示完整历史
- [ ] Phase 8.3 置灰效果实现
- [ ] 数据持久化验证通过
- [ ] 刷新/重新打开浏览器测试通过

### 9. 注意事项

- **数据一致性**：确保 post_vote_messages 的更新是原子性的
- **性能考虑**：投票后对话可能很长，考虑分页或虚拟滚动
- **双盲性**：投票后仍然显示 "Reply A/B"，不显示实际模型名
- **错误处理**：网络中断时的重试机制和本地缓存
- **安全性**：验证 session 和投票状态，防止未投票用户调用 chat 端点

### 10. 实施建议

1. **迭代实现**：先实现基本功能，再添加错误处理和优化
2. **测试优先**：每个组件完成后立即测试
3. **代码复用**：最大化利用现有的 useBattleStream hook 和 ResponseCard 组件
4. **性能优化**：对于长对话历史，考虑使用虚拟滚动
5. **用户体验**：添加加载状态和错误提示

### 11. 依赖关系

- 需要现有的 session store 和 Supabase 集成
- 依赖于现有的投票流程和状态管理
- 需要现有的 LLM 调用和流式响应处理逻辑

### 12. 回滚计划

如果实施过程中发现问题，可以：
1. 回滚数据库迁移
2. 禁用新的 chat 端点
3. 保持现有功能不变
4. 逐步调试和修复

### 13. 文档更新

完成后需要更新：
- API 文档（新增 /api/arena/chat 端点）
- 用户指南（如何使用投票后对话功能）
- 数据库 schema 文档
- 前端组件文档

### 14. 监控和日志

建议添加以下监控：
- 投票后对话的成功率
- 平均对话轮次
- 常见错误类型
- 性能指标（响应时间等）

### 15. 未来扩展

1. 支持多模型对话（不限于胜者）
2. 添加对话评分和反馈机制
3. 实现对话搜索和过滤
4. 添加对话导出功能
5. 实现对话分享功能

## 结论

本实施指南提供了完整的技术方案，涵盖了数据库设计、后端实现、前端集成和测试验证等方面。通过逐步实施和充分测试，可以确保投票后继续对话功能的成功实现，为用户提供更完整和持久化的对话体验。