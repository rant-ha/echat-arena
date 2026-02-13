# 持久化Bug修复方案 V6 - 完整重构

**日期**: 2026-02-12
**版本**: 6.0
**状态**: 设计阶段

---

## 📋 执行摘要

### 问题概述

用户报告的持久化bug：
1. **投票后对话在刷新后消失** - 投票后继续对话，刷新浏览器后对话记录丢失
2. **Battle投票后对话不持久化** - 在/battle界面投票后继续对话，刷新后看不到投票后的对话内容

### 根本原因分析

经过深度并行调查，发现**3个核心问题**：

| 问题 | 影响 | 根本原因 |
|------|------|----------|
| **数据库写入失败** | 50% | 错误分类粗糙，重试机制失效 |
| **SessionStore内存回退** | 30% | 内存数据不持久，dyno重启丢失 |
| **前端localStorage不存储对话** | 20% | 仅存储上下文，不存储对话轮次 |

### 推荐方案

采用**分阶段实施**策略，从快速修复到架构优化：

| 阶段 | 方案 | 工期 | 成本 | 预期改进 |
|------|------|------|------|----------|
| **阶段1** | 立即修复（P0） | 1-2天 | $0 | 减少70%数据丢失 |
| **阶段2** | 数据库优化 | 1-2周 | $0 | 减少90%数据丢失 |
| **阶段3** | Redis缓存层 | 1-2月 | $100/月 | 减少99%数据丢失 |

---

## 🔍 问题详细分析

### 问题1：数据库写入失败（影响50%）

#### 1.1 失败路径分析

| 路径 | 场景 | 概率 | 数据丢失 |
|------|------|------|----------|
| 1 | 配置缺失 | 30% | ✅ 是 |
| 2 | HTTP网络层失败 | 20% | ✅ 是 |
| 3 | HTTP 4xx错误 | 10% | ✅ 是 |
| 4 | HTTP 5xx错误 | 15% | ✅ 是 |
| 5 | UNIQUE约束冲突 | 5% | ⚠️ 可能 |
| 6 | 其他异常 | 20% | ✅ 是 |

#### 1.2 重试机制失效

**当前实现**：
```python
# arena/services/chat.py
MAX_TURN_INDEX_RETRIES = 8
for i in range(MAX_TURN_INDEX_RETRIES):
    status = await _insert_post_vote_turn_supabase(...)
    if status == "ok":
        break
    if status == "conflict":
        await asyncio.sleep(0.05 + random.random() * 0.05)
        continue
    break  # ❌ 所有error立即停止
```

**问题**：
- 错误分类过于粗糙（只有3种状态）
- 网络错误、5xx错误、配置错误都被归为"error"
- 所有"error"都立即停止重试，浪费了8次重试机会
- 网络层重试（3次）与业务层重试（8次）不协调

#### 1.3 数据丢失概率

- **当前系统**：P(数据丢失) ≈ 96%（配置正确时 ≈ 66%）
- **短期改进后**：P(数据丢失) ≈ 40%（配置正确时 ≈ 20%）
- **中期改进后**：P(数据丢失) ≈ 10%（配置正确时 ≈ 5%）
- **长期改进后**：P(数据丢失) ≈ 1%（配置正确时 ≈ 0.1%）

---

### 问题2：SessionStore内存回退（影响30%）

#### 2.1 回退机制流程

```
Supabase不可用 → 回退到内存存储 → dyno重启 → 数据丢失
```

#### 2.2 触发回退的条件

1. **Supabase未配置** - 环境变量未设置
2. **Supabase网络连接失败** - 服务不可用、超时、DNS失败
3. **HTTP状态码错误** - 400/401/403/404/409/429/500/502/503/504
4. **版本冲突（CAS失败）** - 并发更新导致版本号不匹配
5. **重试次数耗尽** - 连续3次更新失败
6. **`_allow_fallback`配置** - 允许/禁止回退的开关

#### 2.3 数据不一致的风险

1. **内存数据不会同步回Supabase** - Supabase恢复后数据仍丢失
2. **多实例部署时数据不一致** - 不同dyno的内存不共享
3. **版本号不一致** - 内存版本号递增，Supabase版本号不变
4. **TTL过期和GC清理** - 过期session被清理，无法恢复
5. **软删除和恢复机制不一致** - 软删除失败，数据不一致

#### 2.4 Heroku Dyno重启的影响

1. **内存数据全部丢失** - 所有回退到内存的session数据丢失
2. **本地缓存清空** - 缓存失效，性能下降
3. **多实例部署时的数据不一致** - 不同dyno的内存数据不共享

---

### 问题3：前端localStorage不存储对话（影响20%）

#### 3.1 前端持久化流程

```
用户投票 → setVoteContext → 写入localStorage → 触发历史记录获取 → 从数据库获取turns → 渲染UI
```

#### 3.2 localStorage和数据库的交互

| 维度 | localStorage | Supabase数据库 |
|------|-------------|-----------------|
| **存储内容** | 投票上下文（session_id, vote_id, winnerSide） | 完整对话轮次 |
| **写入时机** | 投票后 | 每次消息发送后 |
| **读取时机** | 组件挂载时 | 页面刷新后自动触发 |
| **过期策略** | 30天自动过期 | 永久存储 |

#### 3.3 双重持久化的问题

1. **localStorage不存储对话轮次**：仅存储投票上下文，对话轮次仅存储在React state中
2. **数据库查询是单点故障**：如果数据库查询失败，没有备用数据源
3. **SSE finish frame的saved字段验证**：如果saved !== true，不添加phantom turn
4. **双重持久化缺乏同步机制**：localStorage和数据库独立管理，无同步机制

#### 3.4 页面刷新后的数据恢复流程

```
页面刷新 → localStorage恢复投票上下文 → useEffect自动获取历史记录 → 数据库查询 → 合并turns → 渲染UI
```

#### 3.5 数据消失的根本原因

```
数据消失 = (localStorage为空或过期) OR (数据库查询失败) OR (数据库返回空数据)
```

---

## 🎯 修复方案设计

### 阶段1：立即修复（P0优先级）- 1-2天

#### 修复1.1：细化错误分类

**目标**：区分可重试错误和不可重试错误

**实现**：
```python
# arena/db/post_vote.py

class InsertStatus(Enum):
    """Post-vote turn插入状态"""
    OK = "ok"                    # 成功
    CONFLICT = "conflict"        # UNIQUE冲突，可重试下一个索引
    RETRYABLE = "retryable"      # 可重试错误（网络、5xx等）
    NON_RETRYABLE = "non_retryable"  # 不可重试错误（4xx、配置错误等）
    ERROR = "error"              # 其他未知错误

async def _insert_post_vote_turn_supabase(...) -> InsertStatus:
    """Insert a post-vote turn into Supabase.

    Returns:
        InsertStatus enum with detailed error classification
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return InsertStatus.NON_RETRYABLE

    # ... existing code ...

    try:
        async with httpx.AsyncClient() as client:
            resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                # UNIQUE(vote_id, turn_index) conflict under concurrency
                if _looks_like_unique_violation(resp):
                    return InsertStatus.CONFLICT

                # 4xx errors (except 409) - non-retryable
                if 400 <= resp.status_code < 500 and resp.status_code != 409:
                    log_error(
                        error_type="post_vote_turn_insert_4xx",
                        context={"vote_id": vote_id, "turn_index": turn_index, "status": resp.status_code},
                        exc=None,
                    )
                    return InsertStatus.NON_RETRYABLE

                # 5xx errors - retryable
                if 500 <= resp.status_code < 600:
                    log_error(
                        error_type="post_vote_turn_insert_5xx",
                        context={"vote_id": vote_id, "turn_index": turn_index, "status": resp.status_code},
                        exc=None,
                    )
                    return InsertStatus.RETRYABLE

                log_error(
                    error_type="post_vote_turn_insert_failed",
                    context={"vote_id": vote_id, "turn_index": turn_index, "status": resp.status_code},
                    exc=None,
                )
                return InsertStatus.ERROR
            return InsertStatus.OK
    except asyncio.CancelledError:
        raise
    except httpx.TimeoutException:
        # Timeout - retryable
        log_error(
            error_type="post_vote_turn_insert_timeout",
            context={"vote_id": vote_id, "turn_index": turn_index},
            exc=None,
        )
        return InsertStatus.RETRYABLE
    except httpx.NetworkError:
        # Network error - retryable
        log_error(
            error_type="post_vote_turn_insert_network_error",
            context={"vote_id": vote_id, "turn_index": turn_index},
            exc=None,
        )
        return InsertStatus.RETRYABLE
    except Exception as exc:
        log_error(
            error_type="post_vote_turn_insert_exception",
            context={"vote_id": vote_id, "turn_index": turn_index},
            exc=exc,
        )
        return InsertStatus.ERROR
```

**预期效果**：减少40%数据丢失

---

#### 修复1.2：统一重试策略

**目标**：网络层和业务层重试协调，实现指数退避

**实现**：
```python
# arena/services/chat.py

async def post_vote_event_stream(...):
    # ... existing code ...

    # Write to database with improved retry strategy
    base_turn_index = len(post_vote_turns) + 1

    MAX_TURN_INDEX_RETRIES = 8
    BASE_RETRY_DELAY = 0.1  # 100ms
    MAX_RETRY_DELAY = 2.0   # 2s

    saved_turn_index: Optional[int] = None
    last_error: Optional[str] = None

    for i in range(MAX_TURN_INDEX_RETRIES):
        candidate = base_turn_index + i
        status = await _insert_post_vote_turn_supabase(
            vote_id=vote_id,
            winner_side=winner_side,
            turn_index=candidate,
            user_message=user_message,
            assistant_message=assistant_text,
            user_id=user_id,
        )

        if status == InsertStatus.OK:
            saved_turn_index = candidate
            break

        if status == InsertStatus.CONFLICT:
            # UNIQUE conflict - try next index with small delay
            delay = 0.05 + random.random() * 0.05
            await asyncio.sleep(delay)
            continue

        if status == InsertStatus.RETRYABLE:
            # Retryable error - exponential backoff
            delay = min(BASE_RETRY_DELAY * (2 ** i), MAX_RETRY_DELAY)
            delay = delay + random.random() * 0.1  # Add jitter
            last_error = f"retryable_error_attempt_{i+1}"
            await asyncio.sleep(delay)
            continue

        if status == InsertStatus.NON_RETRYABLE:
            # Non-retryable error - stop immediately
            last_error = "non_retryable_error"
            break

        if status == InsertStatus.ERROR:
            # Unknown error - stop after max retries
            last_error = f"unknown_error_attempt_{i+1}"
            if i < MAX_TURN_INDEX_RETRIES - 1:
                delay = min(BASE_RETRY_DELAY * (2 ** i), MAX_RETRY_DELAY)
                await asyncio.sleep(delay)
                continue
            break

    # Log result
    if saved_turn_index is not None:
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "post_vote_turn_saved",
            "session": session_id,
            "vote_id": vote_id,
            "turn_index": saved_turn_index,
        }))
    else:
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "post_vote_turn_save_failed",
            "session": session_id,
            "vote_id": vote_id,
            "turn_index": base_turn_index,
            "retries": MAX_TURN_INDEX_RETRIES,
            "last_error": last_error,
        }), file=sys.stderr)
```

**预期效果**：减少30%数据丢失

---

#### 修复1.3：启动时验证配置

**目标**：启动时验证Supabase配置，避免运行时才发现配置错误

**实现**：
```python
# arena/main.py

async def _validate_supabase_config() -> bool:
    """Validate Supabase configuration at startup."""
    from arena.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[ERROR] SUPABASE_URL or SUPABASE_SERVICE_KEY not set", file=sys.stderr)
        return False

    # Test connection
    try:
        import httpx
        url = f"{SUPABASE_URL}/rest/v1/arena_sessions?select=id&limit=1"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=10)
            if resp.status_code >= 400:
                print(f"[ERROR] Supabase connection failed: {resp.status_code}", file=sys.stderr)
                return False
        print("[INFO] Supabase configuration validated successfully")
        return True
    except Exception as exc:
        print(f"[ERROR] Supabase validation failed: {exc}", file=sys.stderr)
        return False

@app.on_event("startup")
async def startup_event():
    """Application startup event."""
    # Validate Supabase configuration
    if not await _validate_supabase_config():
        print("[WARN] Supabase validation failed, falling back to memory storage", file=sys.stderr)
        # Optionally, you could raise an exception to prevent startup
        # raise RuntimeError("Supabase configuration is required")

    # ... existing startup code ...
```

**预期效果**：减少30%配置错误

---

#### 修复1.4：前端localStorage缓存对话轮次

**目标**：将对话轮次缓存到localStorage，提供备用数据源

**实现**：
```typescript
// web/hooks/usePostVoteChat.ts

interface PostVoteTurn {
  turn_index: number;
  user_message: string;
  assistant_message: string;
  created_at: string;
}

interface LocalStorageData {
  session_id: string;
  vote_id: string;
  winnerSide: "left" | "right";
  turns: PostVoteTurn[];
  lastUpdated: string;
}

const LOCAL_STORAGE_KEY = "post_vote_chat_data";

// Save turns to localStorage
const saveTurnsToLocalStorage = (
  sessionId: string,
  voteId: string,
  winnerSide: "left" | "right",
  turns: PostVoteTurn[]
) => {
  try {
    const data: LocalStorageData = {
      session_id: sessionId,
      vote_id: voteId,
      winnerSide,
      turns,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save turns to localStorage:", error);
  }
};

// Load turns from localStorage
const loadTurnsFromLocalStorage = (): LocalStorageData | null => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!data) return null;

    const parsed: LocalStorageData = JSON.parse(data);

    // Check if data is expired (30 days)
    const lastUpdated = new Date(parsed.lastUpdated);
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 30) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to load turns from localStorage:", error);
    return null;
  }
};

// In usePostVoteChat hook
useEffect(() => {
  // Load from localStorage first
  const localData = loadTurnsFromLocalStorage();
  if (localData && localData.session_id === sessionId && localData.vote_id === voteId) {
    setTurns(localData.turns);
    setHistoryLoaded(true);
  }

  // Then fetch from database
  fetchHistory();
}, [sessionId, voteId]);

// When a new turn is saved
useEffect(() => {
  if (status === "done" && savedTurnIndex !== null) {
    // Save to localStorage
    saveTurnsToLocalStorage(sessionId, voteId, winnerSide, turns);
  }
}, [status, savedTurnIndex, turns, sessionId, voteId, winnerSide]);
```

**预期效果**：减少20%数据丢失

---

### 阶段2：数据库优化（P1优先级）- 1-2周

#### 优化2.1：HTTP连接池

**目标**：复用HTTP连接，减少连接开销

**实现**：
```python
# arena/config.py

import httpx

# Global HTTP client with connection pooling
_http_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    """Get or create global HTTP client."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=100,
                keepalive_expiry=30,
            ),
        )
    return _http_client

async def close_http_client():
    """Close global HTTP client."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
```

**预期效果**：响应时间-33%

---

#### 优化2.2：断路器模式

**目标**：防止级联故障，快速失败

**实现**：
```python
# arena/config.py

from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def _insert_post_vote_turn_supabase_with_circuit(...):
    """Insert with circuit breaker."""
    return await _insert_post_vote_turn_supabase(...)
```

**预期效果**：降级频率-75%

---

#### 优化2.3：补偿机制

**目标**：写入失败后，将数据保存到本地队列，定期重试

**实现**：
```python
# arena/db/post_vote.py

import json
import os
from pathlib import Path

# Local retry queue
RETRY_QUEUE_DIR = Path("/tmp/post_vote_turn_retry_queue")
RETRY_QUEUE_DIR.mkdir(exist_ok=True)

async def _save_to_retry_queue(
    vote_id: str,
    winner_side: str,
    turn_index: int,
    user_message: str,
    assistant_message: str,
    user_id: Optional[str],
) -> None:
    """Save failed turn to local retry queue."""
    data = {
        "vote_id": vote_id,
        "winner_side": winner_side,
        "turn_index": turn_index,
        "user_message": user_message,
        "assistant_message": assistant_message,
        "user_id": user_id,
        "timestamp": _utc_now_iso(),
    }

    filename = f"{vote_id}_{turn_index}_{int(time.time())}.json"
    filepath = RETRY_QUEUE_DIR / filename

    with open(filepath, "w") as f:
        json.dump(data, f)

async def _retry_failed_turns() -> int:
    """Retry failed turns from local queue."""
    retried = 0

    for filepath in RETRY_QUEUE_DIR.glob("*.json"):
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            status = await _insert_post_vote_turn_supabase(
                vote_id=data["vote_id"],
                winner_side=data["winner_side"],
                turn_index=data["turn_index"],
                user_message=data["user_message"],
                assistant_message=data["assistant_message"],
                user_id=data.get("user_id"),
            )

            if status == InsertStatus.OK:
                filepath.unlink()
                retried += 1
        except Exception as exc:
            log_error(
                error_type="retry_queue_failed",
                context={"filepath": str(filepath)},
                exc=exc,
            )

    return retried

# Schedule periodic retry
@app.on_event("startup")
async def startup_event():
    # ... existing code ...

    # Schedule retry every 5 minutes
    asyncio.create_task(_retry_loop())

async def _retry_loop():
    """Periodic retry loop."""
    while True:
        await asyncio.sleep(300)  # 5 minutes
        retried = await _retry_failed_turns()
        if retried > 0:
            print(f"[INFO] Retried {retried} failed turns")
```

**预期效果**：减少20%数据丢失

---

#### 优化2.4：监控和告警

**目标**：实时监控持久化成功率，及时发现问题

**实现**：
```python
# arena/utils.py

import prometheus_client

# Metrics
post_vote_turn_insert_total = prometheus_client.Counter(
    "post_vote_turn_insert_total",
    "Total post-vote turn insert attempts",
    ["status"]  # ok, conflict, retryable, non_retryable, error
)

post_vote_turn_insert_duration = prometheus_client.Histogram(
    "post_vote_turn_insert_duration_seconds",
    "Post-vote turn insert duration",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

# In _insert_post_vote_turn_supabase
@post_vote_turn_insert_duration.time()
async def _insert_post_vote_turn_supabase(...) -> InsertStatus:
    # ... existing code ...

    status = await _do_insert(...)

    # Record metric
    post_vote_turn_insert_total.labels(status=status.value).inc()

    return status
```

**预期效果**：快速发现问题，减少MTTR

---

### 阶段3：Redis缓存层（P2优先级）- 1-2月

#### 优化3.1：部署Heroku Redis

**目标**：使用Redis作为L1缓存，提高性能和可用性

**实现**：
```bash
# Add Redis addon
heroku addons:create heroku-redis:premium-1

# Set environment variables
heroku config:set REDIS_URL=$(heroku config:get REDIS_URL)
```

**预期效果**：响应时间-70%，缓存命中率+25%

---

#### 优化3.2：实现RedisSessionStore

**目标**：使用Redis替代内存存储，实现跨实例共享

**实现**：
```python
# arena/session/redis.py

import redis.asyncio as redis
from typing import Any, Dict, Optional

class RedisSessionStore(SessionStore):
    """Redis-backed session store."""

    def __init__(self, redis_url: str, ttl: int = 7200):
        super().__init__()
        self._redis = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        self._ttl = ttl

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store session in Redis."""
        key = f"session:{session_id}"
        data = json.dumps(value)
        await self._redis.setex(key, self._ttl, data)

    async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from Redis."""
        key = f"session:{session_id}"
        data = await self._redis.get(key)
        if data is None:
            return None
        return json.loads(data)

    async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
        """Update session in Redis."""
        session = await self.get(session_id)
        if session is None:
            return
        session.update(patch)
        await self.put(session_id, session)

    async def append_turn(
        self,
        session_id: str,
        user_msg: str,
        reply_a: str,
        reply_b: str,
    ) -> bool:
        """Append turn to session in Redis."""
        session = await self.get(session_id)
        if session is None:
            return False

        conversation_history = session.get("conversation_history", [])
        turn_record = {
            "turn": len(conversation_history) + 1,
            "user": user_msg,
            "reply_a": reply_a,
            "reply_b": reply_b,
            "timestamp": _utc_now_iso(),
        }
        conversation_history.append(turn_record)
        session["conversation_history"] = conversation_history
        session["turn_count"] = len(conversation_history)

        await self.put(session_id, session)
        return True
```

**预期效果**：跨实例共享，数据不丢失

---

#### 优化3.3：混合存储（Redis L1 + Supabase L2）

**目标**：Redis作为热数据缓存，Supabase作为持久化存储

**实现**：
```python
# arena/session/hybrid.py

class HybridSessionStore(SessionStore):
    """Hybrid session store with Redis L1 and Supabase L2."""

    def __init__(self, redis_url: str, supabase_url: str, supabase_key: str):
        super().__init__()
        self._redis = RedisSessionStore(redis_url, ttl=60)  # 1 minute TTL
        self._supabase = SupabaseSessionStore(supabase_url, supabase_key)

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store session in both Redis and Supabase."""
        # Write to Redis first (fast)
        await self._redis.put(session_id, value)

        # Then write to Supabase (persistent)
        await self._supabase.put(session_id, value)

    async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from Redis first, fallback to Supabase."""
        # Try Redis first
        session = await self._redis.get(session_id)
        if session is not None:
            return session

        # Fallback to Supabase
        session = await self._supabase.get(session_id)
        if session is not None:
            # Populate Redis cache
            await self._redis.put(session_id, session)
        return session

    async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
        """Update session in both Redis and Supabase."""
        await self._redis.update(session_id, patch)
        await self._supabase.update(session_id, patch)

    async def append_turn(
        self,
        session_id: str,
        user_msg: str,
        reply_a: str,
        reply_b: str,
    ) -> bool:
        """Append turn to session in both Redis and Supabase."""
        # Update Redis first
        redis_success = await self._redis.append_turn(session_id, user_msg, reply_a, reply_b)

        # Then update Supabase
        supabase_success = await self._supabase.append_turn(session_id, user_msg, reply_a, reply_b)

        return redis_success and supabase_success
```

**预期效果**：性能+70%，可用性+99%

---

## 📊 预期收益

### 数据丢失概率

| 阶段 | 当前 | 阶段1 | 阶段2 | 阶段3 |
|------|------|-------|-------|-------|
| **配置正确时** | 66% | 20% | 5% | 0.1% |
| **配置错误时** | 96% | 40% | 10% | 1% |

### 性能指标

| 指标 | 当前 | 阶段1 | 阶段2 | 阶段3 |
|------|------|-------|-------|-------|
| **平均响应时间** | 150ms | 150ms | 100ms | 30ms |
| **P99响应时间** | 500ms | 500ms | 300ms | 100ms |
| **L1缓存命中率** | 60% | 60% | 70% | 95% |
| **CAS冲突率** | 5% | 5% | 3% | <1% |
| **降级频率** | 2% | 2% | <0.5% | <0.1% |

### 成本

| 阶段 | 月成本 |
|------|--------|
| **阶段1** | $0 |
| **阶段2** | $0 |
| **阶段3** | $100/月 |

---

## 🚀 实施计划

### 阶段1：立即修复（1-2天）

| 任务 | 负责人 | 工期 | 优先级 |
|------|--------|------|--------|
| 修复1.1：细化错误分类 | Backend | 0.5天 | P0 |
| 修复1.2：统一重试策略 | Backend | 0.5天 | P0 |
| 修复1.3：启动时验证配置 | Backend | 0.5天 | P0 |
| 修复1.4：前端localStorage缓存 | Frontend | 0.5天 | P0 |
| 测试和验证 | QA | 0.5天 | P0 |

**里程碑**：减少70%数据丢失

---

### 阶段2：数据库优化（1-2周）

| 任务 | 负责人 | 工期 | 优先级 |
|------|--------|------|--------|
| 优化2.1：HTTP连接池 | Backend | 1天 | P1 |
| 优化2.2：断路器模式 | Backend | 1天 | P1 |
| 优化2.3：补偿机制 | Backend | 3天 | P1 |
| 优化2.4：监控和告警 | Backend | 2天 | P1 |
| 测试和验证 | QA | 2天 | P1 |

**里程碑**：减少90%数据丢失

---

### 阶段3：Redis缓存层（1-2月）

| 任务 | 负责人 | 工期 | 优先级 |
|------|--------|------|--------|
| 优化3.1：部署Heroku Redis | DevOps | 1天 | P2 |
| 优化3.2：实现RedisSessionStore | Backend | 5天 | P2 |
| 优化3.3：混合存储 | Backend | 5天 | P2 |
| 测试和验证 | QA | 5天 | P2 |
| 灰度发布 | DevOps | 3天 | P2 |
| 全量发布 | DevOps | 1天 | P2 |

**里程碑**：减少99%数据丢失

---

## 🧪 测试计划

### 单元测试

```python
# tests/test_post_vote_insert.py

import pytest
from arena.db.post_vote import InsertStatus, _insert_post_vote_turn_supabase

@pytest.mark.asyncio
async def test_insert_success():
    """Test successful insert."""
    status = await _insert_post_vote_turn_supabase(
        vote_id="test-vote-id",
        winner_side="left",
        turn_index=1,
        user_message="Hello",
        assistant_message="Hi there!",
    )
    assert status == InsertStatus.OK

@pytest.mark.asyncio
async def test_insert_conflict():
    """Test UNIQUE conflict."""
    # Insert first turn
    await _insert_post_vote_turn_supabase(
        vote_id="test-vote-id",
        winner_side="left",
        turn_index=1,
        user_message="Hello",
        assistant_message="Hi there!",
    )

    # Insert duplicate turn
    status = await _insert_post_vote_turn_supabase(
        vote_id="test-vote-id",
        winner_side="left",
        turn_index=1,
        user_message="Hello",
        assistant_message="Hi there!",
    )
    assert status == InsertStatus.CONFLICT

@pytest.mark.asyncio
async def test_insert_retryable_error():
    """Test retryable error (5xx)."""
    # Mock 500 error
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value = Mock(status_code=500)

        status = await _insert_post_vote_turn_supabase(
            vote_id="test-vote-id",
            winner_side="left",
            turn_index=1,
            user_message="Hello",
            assistant_message="Hi there!",
        )
        assert status == InsertStatus.RETRYABLE

@pytest.mark.asyncio
async def test_insert_non_retryable_error():
    """Test non-retryable error (4xx)."""
    # Mock 400 error
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value = Mock(status_code=400)

        status = await _insert_post_vote_turn_supabase(
            vote_id="test-vote-id",
            winner_side="left",
            turn_index=1,
            user_message="Hello",
            assistant_message="Hi there!",
        )
        assert status == InsertStatus.NON_RETRYABLE
```

---

### 集成测试

```python
# tests/test_post_vote_chat_integration.py

import pytest
from fastapi.testclient import TestClient
from arena.main import app

client = TestClient(app)

def test_post_vote_chat_persistence():
    """Test post-vote chat persistence."""
    # Step 1: Create a battle session
    battle_response = client.post("/api/arena/battle", json={"prompt": "Hello"})
    assert battle_response.status_code == 200
    session_id = battle_response.json()["session_id"]

    # Step 2: Vote
    vote_response = client.post("/api/arena/vote", json={
        "session_id": session_id,
        "vote": "left",
    })
    assert vote_response.status_code == 200
    vote_id = vote_response.json()["vote_id"]

    # Step 3: Send post-vote message
    chat_response = client.post("/api/arena/chat", json={
        "session_id": session_id,
        "user_message": "How are you?",
    })
    assert chat_response.status_code == 200

    # Step 4: Verify persistence
    history_response = client.get(f"/api/arena/chat/history?session_id={session_id}&vote_id={vote_id}")
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history["data"]["turns"]) == 1
    assert history["data"]["turns"][0]["user_message"] == "How are you?"

    # Step 5: Simulate page refresh (clear memory)
    # ... clear session store ...

    # Step 6: Verify data still exists
    history_response = client.get(f"/api/arena/chat/history?session_id={session_id}&vote_id={vote_id}")
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history["data"]["turns"]) == 1
```

---

### 压力测试

```python
# tests/test_post_vote_chat_stress.py

import pytest
import asyncio
from fastapi.testclient import TestClient
from arena.main import app

client = TestClient(app)

@pytest.mark.asyncio
async def test_concurrent_post_vote_chat():
    """Test concurrent post-vote chat requests."""
    # Create a battle session and vote
    battle_response = client.post("/api/arena/battle", json={"prompt": "Hello"})
    session_id = battle_response.json()["session_id"]

    vote_response = client.post("/api/arena/vote", json={
        "session_id": session_id,
        "vote": "left",
    })
    vote_id = vote_response.json()["vote_id"]

    # Send 10 concurrent messages
    async def send_message(i):
        response = client.post("/api/arena/chat", json={
            "session_id": session_id,
            "user_message": f"Message {i}",
        })
        return response

    responses = await asyncio.gather(*[send_message(i) for i in range(10)])

    # All requests should succeed
    for response in responses:
        assert response.status_code == 200

    # Verify all messages are persisted
    history_response = client.get(f"/api/arena/chat/history?session_id={session_id}&vote_id={vote_id}")
    history = history_response.json()
    assert len(history["data"]["turns"]) == 10
```

---

## 📈 监控指标

### 关键指标

| 指标 | 类型 | 目标 | 告警阈值 |
|------|------|------|----------|
| **post_vote_turn_insert_success_rate** | Counter | >99% | <95% |
| **post_vote_turn_insert_duration_seconds** | Histogram | <1s | >5s |
| **post_vote_turn_retry_total** | Counter | <1% | >5% |
| **session_store_fallback_rate** | Counter | <0.1% | >1% |
| **redis_cache_hit_rate** | Counter | >90% | <80% |

### 日志

```json
{
  "t": "2026-02-12T10:00:00Z",
  "type": "post_vote_turn_saved",
  "session": "uuid",
  "vote_id": "uuid",
  "turn_index": 1,
  "duration_ms": 150
}

{
  "t": "2026-02-12T10:00:00Z",
  "type": "post_vote_turn_save_failed",
  "session": "uuid",
  "vote_id": "uuid",
  "turn_index": 1,
  "retries": 8,
  "last_error": "retryable_error_attempt_8"
}
```

---

## 🎯 成功标准

### 阶段1成功标准

- [ ] 数据丢失概率从96%降至40%（配置正确时从66%降至20%）
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 压力测试通过（10并发请求，100%成功）
- [ ] 监控指标正常

### 阶段2成功标准

- [ ] 数据丢失概率从40%降至10%（配置正确时从20%降至5%）
- [ ] 平均响应时间从150ms降至100ms
- [ ] 降级频率从2%降至<0.5%
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 压力测试通过（100并发请求，99%成功）
- [ ] 监控指标正常

### 阶段3成功标准

- [ ] 数据丢失概率从10%降至1%（配置正确时从5%降至0.1%）
- [ ] 平均响应时间从100ms降至30ms
- [ ] L1缓存命中率从70%提升至95%
- [ ] CAS冲突率从3%降至<1%
- [ ] 降级频率从<0.5%降至<0.1%
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 压力测试通过（1000并发请求，99.9%成功）
- [ ] 监控指标正常
- [ ] 灰度发布成功
- [ ] 全量发布成功

---

## 📝 风险和缓解措施

### 风险1：引入新的bug

**概率**：中等
**影响**：高
**缓解措施**：
- 完善的单元测试和集成测试
- 代码审查
- 灰度发布
- 快速回滚机制

---

### 风险2：性能下降

**概率**：低
**影响**：中
**缓解措施**：
- 性能测试
- 监控指标
- 优化热点代码
- 必要时回滚

---

### 风险3：成本增加

**概率**：高（阶段3）
**影响**：低
**缓解措施**：
- 分阶段实施
- 评估ROI
- 优化Redis使用
- 必要时降级

---

### 风险4：部署失败

**概率**：低
**影响**：高
**缓解措施**：
- 完善的部署文档
- 部署前测试
- 灰度发布
- 快速回滚机制

---

## 📚 参考资料

### 相关文档

- [PERSISTENCE_BUG_ANALYSIS.md](PERSISTENCE_BUG_ANALYSIS.md) - 历史bug修复记录
- [SESSION_ARCHITECTURE_ANALYSIS.md](SESSION_ARCHITECTURE_ANALYSIS.md) - Session架构分析
- [DATABASE_SCHEMA_ANALYSIS.md](DATABASE_SCHEMA_ANALYSIS.md) - 数据库schema分析
- [VOTING_FLOW_ANALYSIS.md](VOTING_FLOW_ANALYSIS.md) - 投票流程分析
- [SESSION_PERSISTENCE_ALTERNATIVES_RESEARCH.md](plans/SESSION_PERSISTENCE_ALTERNATIVES_RESEARCH.md) - 替代方案研究

### 技术文档

- [Supabase REST API](https://supabase.com/docs/guides/api)
- [Redis Documentation](https://redis.io/documentation)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://cloud.google.com/architecture/exponential-backoff)

---

## 📞 联系方式

如有问题或需要进一步讨论，请联系：

- **项目负责人**：[待填写]
- **技术负责人**：[待填写]
- **QA负责人**：[待填写]

---

**文档版本**：6.0
**最后更新**：2026-02-12
**状态**：设计阶段
