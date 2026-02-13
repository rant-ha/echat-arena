# 前端持久化逻辑深度分析报告

## 执行摘要

本报告深入分析了 `web/hooks/usePostVoteChat.ts` 的持久化逻辑，识别了双重持久化导致的不一致问题，以及页面刷新后数据消失的根本原因。

**核心发现**：
1. localStorage 仅存储投票上下文，不存储对话轮次
2. 页面刷新后依赖数据库获取历史记录，存在单点故障
3. SSE finish frame 的 saved 字段是数据持久化的关键验证点
4. 双重持久化（localStorage + 数据库）缺乏同步机制

---

## 1. 前端持久化的完整流程

### 1.1 状态管理架构

```typescript
// 核心状态
const [voteId, setVoteId] = useState<string | null>(null);
const [winnerSide, setWinnerSide] = useState<"left" | "right" | null>(null);
const [turns, setTurns] = useState<PostVoteTurn[]>([]);  // 对话轮次
const [currentReply, setCurrentReply] = useState("");    // 当前流式回复
const [isChatting, setIsChatting] = useState(false);
const [pendingMessage, setPendingMessage] = useState<string | null>(null);
const [historyLoaded, setHistoryLoaded] = useState(false);
const [historyError, setHistoryError] = useState<string | null>(null);
const [sendError, setSendError] = useState<string | null>(null);
const [isVoted, setIsVoted] = useState(false);
const [preVoteConversation, setPreVoteConversation] = useState<...>(null);
const [storedSessionId, setStoredSessionId] = useState<string | null>(null);
```

### 1.2 持久化流程图

```
用户投票
    ↓
setVoteContext(voteId, winnerSide)
    ↓
写入 localStorage: { session_id, vote_id, winnerSide, timestamp }
    ↓
设置状态: voteId, winnerSide, isVoted=true, historyLoaded=false
    ↓
触发 useEffect #3: 自动获取历史记录
    ↓
GET /api/proxy/api/arena/chat/history?session_id=xxx&vote_id=xxx
    ↓
合并 turns: dedupTurns([...prev, ...data.turns])
    ↓
设置 historyLoaded=true
```

### 1.3 发送消息流程

```
用户发送消息
    ↓
sendMessage(message)
    ↓
POST /api/proxy/api/arena/chat (SSE 流)
    ↓
接收 SSE frames:
  - meta: 元数据
  - delta: 流式文本片段
  - finish: 完成标志 + saved 状态
  - error: 错误信息
    ↓
finish frame 处理:
  if (json.saved === true) {
    // 服务器确认持久化成功
    添加新 turn 到 turns 数组
    清空 pendingMessage 和 currentReply
    1秒后重新获取历史记录 (setTimeout)
  } else {
    // 服务器未持久化
    设置 sendError = "save_failed"
    保留 pendingMessage 显示
  }
```

---

## 2. localStorage 和数据库的交互

### 2.1 localStorage 的读写时机

#### 写入时机（setVoteContext）

```typescript
// useEffect #5: setVoteContext — called by parent after voting
const setVoteContext = useCallback((newVoteId: string, newWinnerSide: "left" | "right") => {
  setVoteId(newVoteId);
  setWinnerSide(newWinnerSide);
  setIsVoted(true);
  setHistoryLoaded(false);  // 触发历史记录获取
  setHistoryError(null);

  if (localStorageKey && resolvedSessionId) {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify({
        session_id: resolvedSessionId,
        vote_id: newVoteId,
        winnerSide: newWinnerSide,
        timestamp: Date.now(),
      }));
    } catch {
      // localStorage unavailable
    }
  }
}, [localStorageKey, resolvedSessionId]);
```

**存储内容**：
- `session_id`: 会话 ID
- `vote_id`: 投票 ID
- `winnerSide`: 获胜方（"left" | "right"）
- `timestamp`: 时间戳（用于过期检查）

**不存储的内容**：
- ❌ 对话轮次（turns）
- ❌ 当前回复（currentReply）
- ❌ 错误状态（historyError, sendError）

#### 读取时机（组件挂载）

```typescript
// useEffect #1: Restore from localStorage on mount
useEffect(() => {
  if (!localStorageKey) return;
  try {
    const saved = localStorage.getItem(localStorageKey);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    const { session_id, vote_id, winnerSide: savedWinner, timestamp } = parsed;

    // 验证数据完整性
    if (!session_id || !savedWinner || !timestamp) {
      localStorage.removeItem(localStorageKey);
      return;
    }

    // 检查过期（30天）
    if (Date.now() - timestamp > EXPIRY_MS) {
      localStorage.removeItem(localStorageKey);
      return;
    }

    // 恢复状态
    if (vote_id) setVoteId(vote_id);
    setWinnerSide(savedWinner);
    setIsVoted(true);
    setStoredSessionId(session_id);
  } catch {
    localStorage.removeItem(localStorageKey);
  }
}, [localStorageKey]);
```

#### 清除时机（clearVoteState）

```typescript
// useEffect #6: clearVoteState
const clearVoteState = useCallback(() => {
  setVoteId(null);
  setWinnerSide(null);
  setTurns([]);  // 清空对话轮次
  setCurrentReply("");
  setIsChatting(false);
  setPendingMessage(null);
  setHistoryLoaded(false);
  setHistoryError(null);
  setSendError(null);
  setIsVoted(false);
  setPreVoteConversation(null);
  setStoredSessionId(null);

  if (localStorageKey) {
    try {
      localStorage.removeItem(localStorageKey);
    } catch {}
  }
}, [localStorageKey]);
```

### 2.2 数据库交互

#### 历史记录获取（useEffect #3）

```typescript
// useEffect #3: Auto-fetch history when voteId is available
useEffect(() => {
  if (!resolvedSessionId || !voteId || historyLoaded || fetchingRef.current || isChatting) return;

  fetchingRef.current = true;

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams({ session_id: resolvedSessionId });
      params.set("vote_id", voteId);
      const res = await fetch(`/api/proxy/api/arena/chat/history?${params.toString()}`);

      if (!res.ok) {
        setHistoryError("http_error");
        return;
      }

      const json = await res.json();
      const data = json?.data || json;

      // 检查后端错误类型
      if (data.error_type) {
        setHistoryError(data.error_type);
        return;  // 不设置 historyLoaded — 允许重试
      }

      // 合并对话轮次（去重）
      if (data.turns && Array.isArray(data.turns)) {
        setTurns(prev => dedupTurns([...prev, ...data.turns]));
      }

      // 提取获胜方信息
      const ws = data.winner_side || data.winner;
      if (ws === "left" || ws === "right") {
        setWinnerSide(ws);
      }
      if (data.vote_id) {
        setVoteId(data.vote_id);
      }
      if (data.turns?.length > 0 || ws) {
        setIsVoted(true);
      }

      // 提取投票前对话
      if (data.conversation) {
        const conv = data.conversation;
        setPreVoteConversation({
          prompt: conv.prompt || "",
          reply_a: conv.reply_a || "",
          reply_b: conv.reply_b || "",
          conversation_history: conv.conversation_history || [],
          model_config: conv.model_config || null,
        });
      }

      setHistoryError(null);
      setHistoryLoaded(true);
    } catch (err) {
      console.warn("Failed to fetch post-vote chat history:", err);
      setHistoryError("fetch_exception");
    } finally {
      fetchingRef.current = false;
    }
  };

  fetchHistory();
}, [resolvedSessionId, voteId, historyLoaded, isChatting]);
```

#### 后端历史记录接口

```python
# arena/routes/chat.py
@router.get(f"{API_PREFIX}/chat/history")
async def get_post_vote_chat_history(session_id: str, vote_id: str = "") -> JSONResponse:
    """
    查询参数：
    - session_id: 会话 ID
    - vote_id: (optional) 投票 ID，提供时直接查询 post_vote_turns

    返回：
    {
        "ok": true,
        "data": {
            "type": "history",
            "vote_id": "uuid",
            "winner": "left" | "right",
            "winner_side": "left" | "right",
            "turns": [
                {
                    "turn_index": 1,
                    "user_message": "...",
                    "assistant_message": "...",
                    "created_at": "..."
                }
            ],
            "conversation": {
                "prompt": "...",
                "reply_a": "...",
                "reply_b": "...",
                "conversation_history": [...],
                "model_config": {...}
            } | null
        }
    }
    """
```

---

## 3. 双重持久化的问题点

### 3.1 持久化架构对比

| 维度 | localStorage | Supabase 数据库 |
|------|-------------|-----------------|
| **存储内容** | 投票上下文（session_id, vote_id, winnerSide） | 完整对话轮次（user_message, assistant_message） |
| **写入时机** | 投票后（setVoteContext） | 每次消息发送后（SSE finish frame） |
| **读取时机** | 组件挂载时 | 页面刷新后（自动触发） |
| **过期策略** | 30天自动过期 | 永久存储 |
| **同步机制** | ❌ 无同步 | ❌ 无同步 |
| **数据一致性** | ⚠️ 可能不一致 | ✅ 单一数据源 |

### 3.2 问题点分析

#### 问题 1：localStorage 不存储对话轮次

**现象**：
- localStorage 仅存储投票上下文（session_id, vote_id, winnerSide）
- 对话轮次（turns）仅存储在 React state 中
- 页面刷新后，turns 状态丢失，必须从数据库重新获取

**影响**：
- 页面刷新后必须依赖网络请求获取历史记录
- 如果数据库查询失败，对话轮次永久丢失
- 用户体验：刷新后短暂显示"加载对话历史..."

**根本原因**：
设计决策：localStorage 仅用于快速恢复投票上下文，避免每次刷新都需要重新投票。对话轮次被认为是"可重建"的数据，因此不存储在 localStorage。

#### 问题 2：数据库查询是单点故障

**现象**：
```typescript
// useEffect #3: 历史记录获取
const res = await fetch(`/api/proxy/api/arena/chat/history?${params.toString()}`);
if (!res.ok) {
  setHistoryError("http_error");
  return;  // 不设置 historyLoaded — 允许重试
}
```

**影响**：
- 如果网络请求失败，historyLoaded 保持 false
- 用户看到错误提示："加载对话历史失败"
- 用户可以点击"重试"按钮重新获取
- 但如果数据库本身有问题，重试也无济于事

**根本原因**：
缺乏本地缓存机制。如果数据库查询失败，没有备用数据源。

#### 问题 3：SSE finish frame 的 saved 字段验证

**现象**：
```typescript
case "finish": {
  if (json.saved === true) {
    // 服务器确认持久化成功
    const newTurn: PostVoteTurn = {
      turn_index: json.turn_index ?? 0,
      user_message: message,
      assistant_message: reply,
      created_at: new Date().toISOString(),
    };
    setTurns(prev => dedupTurns([...prev, newTurn]));
    setPendingMessage(null);
    setCurrentReply("");

    // Post-send reconciliation: 1秒后重新获取历史记录
    setTimeout(() => setHistoryLoaded(false), 1000);
  } else {
    // 服务器未持久化
    setSendError("save_failed");
    // 保留 pendingMessage 显示
  }
  break;
}
```

**影响**：
- 如果后端数据库写入失败，saved !== true
- 前端不会添加 phantom turn，避免数据不一致
- 但用户看到错误提示，体验不佳
- 1秒后重新获取历史记录，可能仍然失败

**根本原因**：
后端数据库写入可能失败（网络问题、唯一约束冲突等），前端需要处理这种情况。

#### 问题 4：双重持久化缺乏同步机制

**现象**：
- localStorage 和数据库独立管理
- localStorage 写入时机：投票后
- 数据库写入时机：每次消息发送后
- 两者之间没有同步机制

**影响**：
- 如果 localStorage 中的 vote_id 与数据库中的不一致，会导致查询错误
- 如果用户在多个标签页中打开同一会话，可能出现数据竞争
- 没有版本控制或冲突解决机制

**根本原因**：
设计时未考虑多标签页并发场景，localStorage 仅用于单标签页快速恢复。

---

## 4. 页面刷新后的数据恢复流程

### 4.1 完整恢复流程

```
页面刷新
    ↓
组件重新挂载
    ↓
useEffect #1: 从 localStorage 恢复投票上下文
    ├─ 读取 localStorage.getItem(localStorageKey)
    ├─ 验证数据完整性（session_id, winnerSide, timestamp）
    ├─ 检查过期（30天）
    └─ 恢复状态: voteId, winnerSide, isVoted=true, storedSessionId
    ↓
useEffect #2: 设置 initialVoteId（仅 /chat/[id] 页面）
    └─ 如果 initialVoteId 存在且无 localStorageKey，设置 voteId
    ↓
useEffect #3: 自动获取历史记录
    ├─ 检查条件: resolvedSessionId && voteId && !historyLoaded && !isChatting
    ├─ 设置 fetchingRef.current = true（防止重复请求）
    ├─ 发起请求: GET /api/proxy/api/arena/chat/history?session_id=xxx&vote_id=xxx
    ├─ 处理响应:
    │   ├─ HTTP 错误 → setHistoryError("http_error")
    │   ├─ 后端错误类型 → setHistoryError(data.error_type)
    │   ├─ 成功 → 合并 turns: dedupTurns([...prev, ...data.turns])
    │   ├─ 提取获胜方: setWinnerSide(ws)
    │   ├─ 提取投票前对话: setPreVoteConversation(...)
    │   └─ 设置 historyLoaded=true
    └─ 设置 fetchingRef.current = false
    ↓
渲染 UI
    ├─ 如果 historyLoaded=false && !historyError → 显示"加载对话历史..."
    ├─ 如果 historyError → 显示错误提示 + "重试"按钮
    └─ 如果 historyLoaded=true → 渲染对话轮次
```

### 4.2 关键依赖关系

```
localStorage (投票上下文)
    ↓ 提供
voteId + storedSessionId
    ↓ 触发
useEffect #3 (历史记录获取)
    ↓ 依赖
数据库查询
    ↓ 返回
turns (对话轮次)
    ↓ 渲染
UI
```

**关键点**：
1. localStorage 是数据恢复的起点
2. 如果 localStorage 为空或过期，无法自动恢复
3. 数据库查询是数据恢复的终点
4. 如果数据库查询失败，数据永久丢失

### 4.3 失败场景分析

#### 场景 1：localStorage 为空

```
页面刷新
    ↓
localStorage.getItem(localStorageKey) → null
    ↓
不恢复任何状态
    ↓
voteId = null, storedSessionId = null
    ↓
useEffect #3 不触发（条件不满足）
    ↓
UI 显示空状态
```

**解决方案**：
- 用户需要重新投票
- 或直接访问 /chat/[id] 页面（通过 initialVoteId）

#### 场景 2：localStorage 过期

```
页面刷新
    ↓
localStorage.getItem(localStorageKey) → { session_id, vote_id, winnerSide, timestamp }
    ↓
检查过期: Date.now() - timestamp > EXPIRY_MS (30天)
    ↓
localStorage.removeItem(localStorageKey)
    ↓
不恢复任何状态
    ↓
UI 显示空状态
```

**解决方案**：
- 用户需要重新投票
- 或直接访问 /chat/[id] 页面

#### 场景 3：数据库查询失败

```
页面刷新
    ↓
localStorage 恢复成功
    ↓
useEffect #3 触发
    ↓
GET /api/proxy/api/arena/chat/history?session_id=xxx&vote_id=xxx
    ↓
HTTP 错误 (500, 503, etc.)
    ↓
setHistoryError("http_error")
    ↓
UI 显示错误提示 + "重试"按钮
    ↓
用户点击"重试"
    ↓
setHistoryLoaded(false) → 触发 useEffect #3 重新获取
```

**解决方案**：
- 用户点击"重试"按钮
- 或刷新页面
- 如果数据库持续失败，数据永久丢失

#### 场景 4：数据库返回空数据

```
页面刷新
    ↓
localStorage 恢复成功
    ↓
useEffect #3 触发
    ↓
GET /api/proxy/api/arena/chat/history?session_id=xxx&vote_id=xxx
    ↓
HTTP 200 OK
    ↓
data.turns = []
    ↓
setTurns(prev => dedupTurns([...prev, []])) → turns 保持不变
    ↓
UI 显示空对话
```

**解决方案**：
- 检查数据库中是否真的有数据
- 可能是 vote_id 错误或数据被删除

---

## 5. 数据消失的根本原因

### 5.1 根本原因总结

| 原因 | 描述 | 影响 |
|------|------|------|
| **localStorage 不存储对话轮次** | localStorage 仅存储投票上下文，不存储对话轮次 | 页面刷新后必须依赖数据库获取历史记录 |
| **数据库查询是单点故障** | 如果数据库查询失败，没有备用数据源 | 数据永久丢失 |
| **缺乏本地缓存机制** | 没有将对话轮次缓存到 localStorage 或 IndexedDB | 网络问题导致数据丢失 |
| **SSE finish frame 验证严格** | 如果 saved !== true，不添加 phantom turn | 数据库写入失败时，用户看到错误提示 |
| **双重持久化缺乏同步** | localStorage 和数据库独立管理，无同步机制 | 可能出现数据不一致 |

### 5.2 数据消失的触发条件

```
数据消失 = (localStorage 为空或过期) OR (数据库查询失败) OR (数据库返回空数据)
```

#### 条件 1：localStorage 为空或过期

**触发场景**：
- 用户首次访问（未投票）
- 用户清除浏览器缓存
- localStorage 过期（30天）
- localStorage 损坏（JSON 解析失败）

**影响**：
- 无法自动恢复投票上下文
- 需要重新投票或直接访问 /chat/[id] 页面

#### 条件 2：数据库查询失败

**触发场景**：
- 网络问题（断网、超时）
- 后端服务不可用（500, 503）
- 数据库连接失败
- 权限问题（401, 403）

**影响**：
- 无法获取历史记录
- 用户看到错误提示
- 数据永久丢失（除非重试成功）

#### 条件 3：数据库返回空数据

**触发场景**：
- vote_id 错误
- 数据被删除
- 数据库查询条件错误

**影响**：
- UI 显示空对话
- 用户困惑（明明有对话，刷新后消失）

### 5.3 数据消失的时序图

```
用户发送消息
    ↓
SSE 流式传输
    ├─ delta frames: 显示流式文本
    └─ finish frame: { saved: true/false }
    ↓
if (saved === true) {
    添加新 turn 到 turns 数组
    1秒后重新获取历史记录
} else {
    设置 sendError = "save_failed"
}
    ↓
用户刷新页面
    ↓
localStorage 恢复投票上下文
    ↓
useEffect #3: 获取历史记录
    ↓
数据库查询
    ├─ 成功 → 恢复对话轮次
    ├─ 失败 → 数据消失 ❌
    └─ 空数据 → 数据消失 ❌
```

### 5.4 数据消失的防御机制

#### 现有防御机制

1. **localStorage 过期检查**：30天自动过期
2. **数据完整性验证**：检查 session_id, winnerSide, timestamp
3. **错误处理**：historyError 状态 + 重试按钮
4. **SSE finish frame 验证**：saved 字段验证
5. **去重机制**：dedupTurns 函数

#### 缺失的防御机制

1. **本地缓存对话轮次**：没有将 turns 存储到 localStorage 或 IndexedDB
2. **离线支持**：没有 Service Worker 或 PWA 支持
3. **数据备份**：没有定期备份到本地存储
4. **冲突解决**：没有多标签页并发控制
5. **版本控制**：没有数据版本号或时间戳

---

## 6. 改进建议

### 6.1 短期改进（快速修复）

#### 建议 1：将对话轮次缓存到 localStorage

```typescript
// 在 setTurns 时同步写入 localStorage
useEffect(() => {
  if (!localStorageKey || turns.length === 0) return;
  try {
    localStorage.setItem(`${localStorageKey}_turns`, JSON.stringify({
      turns,
      timestamp: Date.now(),
    }));
  } catch {
    // localStorage unavailable
  }
}, [turns, localStorageKey]);

// 在组件挂载时恢复对话轮次
useEffect(() => {
  if (!localStorageKey) return;
  try {
    const saved = localStorage.getItem(`${localStorageKey}_turns`);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    const { turns: savedTurns, timestamp } = parsed;

    // 检查过期（1天）
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(`${localStorageKey}_turns`);
      return;
    }

    setTurns(savedTurns);
  } catch {
    localStorage.removeItem(`${localStorageKey}_turns`);
  }
}, [localStorageKey]);
```

**优点**：
- 快速实现，无需后端改动
- 页面刷新后立即显示缓存数据
- 数据库查询失败时有备用数据源

**缺点**：
- localStorage 容量限制（5-10MB）
- 长对话可能超出容量
- 多标签页并发问题

#### 建议 2：增加重试机制和指数退避

```typescript
const [retryCount, setRetryCount] = useState(0);
const MAX_RETRIES = 3;

useEffect(() => {
  if (!resolvedSessionId || !voteId || historyLoaded || fetchingRef.current || isChatting) return;

  fetchingRef.current = true;

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams({ session_id: resolvedSessionId });
      params.set("vote_id", voteId);
      const res = await fetch(`/api/proxy/api/arena/chat/history?${params.toString()}`);

      if (!res.ok) {
        if (retryCount < MAX_RETRIES) {
          // 指数退避：1s, 2s, 4s
          const delay = Math.pow(2, retryCount) * 1000;
          setTimeout(() => {
            setRetryCount(retryCount + 1);
            setHistoryLoaded(false);
          }, delay);
        } else {
          setHistoryError("http_error");
        }
        return;
      }

      // ... 处理成功响应
      setRetryCount(0);  // 重置重试计数
    } catch (err) {
      console.warn("Failed to fetch post-vote chat history:", err);
      setHistoryError("fetch_exception");
    } finally {
      fetchingRef.current = false;
    }
  };

  fetchHistory();
}, [resolvedSessionId, voteId, historyLoaded, isChatting, retryCount]);
```

**优点**：
- 自动重试，减少用户手动操作
- 指数退避避免服务器压力
- 提高成功率

**缺点**：
- 增加复杂度
- 可能延长加载时间

#### 建议 3：优化 SSE finish frame 处理

```typescript
case "finish": {
  if (json.saved === true) {
    // 服务器确认持久化成功
    const newTurn: PostVoteTurn = {
      turn_index: json.turn_index ?? 0,
      user_message: message,
      assistant_message: reply,
      created_at: new Date().toISOString(),
    };
    setTurns(prev => dedupTurns([...prev, newTurn]));
    setPendingMessage(null);
    setCurrentReply("");

    // 立即重新获取历史记录（而不是1秒后）
    setHistoryLoaded(false);
  } else if (json.saved === false) {
    // 服务器明确未持久化
    setSendError("save_failed");
  } else {
    // saved 字段缺失（兼容旧版本）
    // 假设成功，但标记为未验证
    const newTurn: PostVoteTurn = {
      turn_index: json.turn_index ?? 0,
      user_message: message,
      assistant_message: reply,
      created_at: new Date().toISOString(),
      verified: false,  // 新增字段
    };
    setTurns(prev => dedupTurns([...prev, newTurn]));
    setPendingMessage(null);
    setCurrentReply("");
    setHistoryLoaded(false);
  }
  break;
}
```

**优点**：
- 兼容旧版本后端
- 提供更好的用户体验
- 标记未验证的数据

**缺点**：
- 可能显示未验证的数据
- 需要后端配合

### 6.2 长期改进（架构优化）

#### 建议 1：使用 IndexedDB 存储对话轮次

**优点**：
- 容量大（数百 MB）
- 异步操作，不阻塞主线程
- 支持复杂查询
- 更适合存储大量对话数据

**缺点**：
- API 复杂
- 需要封装库（如 Dexie.js）
- 兼容性问题（旧浏览器）

#### 建议 2：实现 Service Worker 和 PWA

**优点**：
- 离线支持
- 后台同步
- 推送通知
- 更好的用户体验

**缺点**：
- 开发复杂度高
- 需要 HTTPS
- 需要维护 Service Worker 生命周期

#### 建议 3：实现多标签页同步

**优点**：
- 避免数据竞争
- 实时同步
- 更好的用户体验

**缺点**：
- 需要使用 BroadcastChannel 或 localStorage 事件
- 增加复杂度
- 可能影响性能

#### 建议 4：实现数据版本控制和冲突解决

**优点**：
- 避免数据不一致
- 支持离线编辑
- 更好的数据完整性

**缺点**：
- 需要后端支持
- 增加复杂度
- 需要设计冲突解决策略

---

## 7. 结论

### 7.1 核心问题

1. **localStorage 不存储对话轮次**：页面刷新后必须依赖数据库获取历史记录
2. **数据库查询是单点故障**：如果数据库查询失败，数据永久丢失
3. **缺乏本地缓存机制**：没有将对话轮次缓存到本地存储
4. **双重持久化缺乏同步**：localStorage 和数据库独立管理，无同步机制

### 7.2 数据消失的根本原因

```
数据消失 = (localStorage 为空或过期) OR (数据库查询失败) OR (数据库返回空数据)
```

### 7.3 改进优先级

| 优先级 | 改进项 | 难度 | 影响 |
|--------|--------|------|------|
| **P0** | 将对话轮次缓存到 localStorage | 低 | 高 |
| **P1** | 增加重试机制和指数退避 | 中 | 中 |
| **P2** | 优化 SSE finish frame 处理 | 中 | 中 |
| **P3** | 使用 IndexedDB 存储对话轮次 | 高 | 高 |
| **P4** | 实现 Service Worker 和 PWA | 高 | 高 |
| **P5** | 实现多标签页同步 | 高 | 中 |
| **P6** | 实现数据版本控制和冲突解决 | 高 | 低 |

### 7.4 建议实施路径

1. **第一阶段（1-2天）**：实现 P0 和 P1
   - 将对话轮次缓存到 localStorage
   - 增加重试机制和指数退避

2. **第二阶段（3-5天）**：实现 P2 和 P3
   - 优化 SSE finish frame 处理
   - 使用 IndexedDB 存储对话轮次

3. **第三阶段（1-2周）**：实现 P4 和 P5
   - 实现 Service Worker 和 PWA
   - 实现多标签页同步

4. **第四阶段（长期）**：实现 P6
   - 实现数据版本控制和冲突解决

---

## 附录

### A. 相关文件清单

| 文件 | 描述 |
|------|------|
| `web/hooks/usePostVoteChat.ts` | 前端持久化逻辑核心 |
| `web/app/chat/[id]/page.tsx` | 聊天详情页面 |
| `arena/routes/chat.py` | 后端聊天路由 |
| `arena/services/chat.py` | 后端聊天服务（SSE 流） |
| `arena/db/post_vote.py` | 后端数据库操作 |

### B. 关键函数清单

| 函数 | 描述 |
|------|------|
| `usePostVoteChat` | 前端持久化 Hook |
| `setVoteContext` | 设置投票上下文（写入 localStorage） |
| `clearVoteState` | 清除投票状态（清除 localStorage） |
| `sendMessage` | 发送消息（SSE 流） |
| `retryHistory` | 重试获取历史记录 |
| `build_post_vote_context` | 构建后端上下文 |
| `post_vote_event_stream` | 后端 SSE 流生成器 |
| `_insert_post_vote_turn_supabase` | 插入对话轮次到数据库 |
| `_fetch_post_vote_turns_supabase` | 从数据库获取对话轮次 |

### C. 关键状态清单

| 状态 | 描述 | 存储位置 |
|------|------|----------|
| `voteId` | 投票 ID | React state + localStorage |
| `winnerSide` | 获胜方 | React state + localStorage |
| `turns` | 对话轮次 | React state（仅） |
| `currentReply` | 当前流式回复 | React state（仅） |
| `isChatting` | 是否正在聊天 | React state（仅） |
| `pendingMessage` | 待发送消息 | React state（仅） |
| `historyLoaded` | 历史记录是否已加载 | React state（仅） |
| `historyError` | 历史记录错误 | React state（仅） |
| `sendError` | 发送错误 | React state（仅） |
| `isVoted` | 是否已投票 | React state（仅） |
| `preVoteConversation` | 投票前对话 | React state（仅） |
| `storedSessionId` | 存储的会话 ID | React state（仅） |

### D. 关键常量清单

| 常量 | 值 | 描述 |
|------|-----|------|
| `EXPIRY_MS` | 30 * 24 * 60 * 60 * 1000 | localStorage 过期时间（30天） |
| `SSE_HEARTBEAT_SEC` | 15 | SSE 心跳间隔（秒） |
| `REQUEST_TIMEOUT` | 30 | HTTP 请求超时（秒） |
| `MAX_TURN_INDEX_RETRIES` | 8 | turn_index 重试次数 |
| `MAX_CONTEXT_TOKENS` | 4096 | 最大上下文 token 数 |
| `RESERVED_TOKENS` | 1000 | 预留 token 数 |

---

**报告生成时间**：2026-02-12
**分析工具**：GitHub Copilot
**分析深度**：完整代码审查 + 架构分析
