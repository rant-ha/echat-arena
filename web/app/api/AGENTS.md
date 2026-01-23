# web/app/api/ - Backend API Proxy Routes

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 API Routes (TypeScript)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `api/` directory contains Next.js API route handlers that proxy requests to the backend Heroku server. The primary responsibility is forwarding HTTP requests from the frontend to the upstream ARENA_API_BASE URL while preserving streaming responses (SSE) and maintaining header filtering for security and compatibility.

**Key Responsibility:** Proxy frontend API calls to backend while preserving request/response integrity, especially for Server-Sent Events (SSE) streaming.

---

## Directory Structure

```
api/
└── proxy/
    └── [...path]/
        └── route.ts           # Catch-all proxy route handler
```

---

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `proxy/` | Catch-all route that forwards all API requests to backend (see `proxy/AGENTS.md`) |

---

## Architecture Overview

### Request Flow

```
Frontend Client
  ↓
POST /api/proxy/api/arena/battle
  ↓
route.ts: buildUpstreamUrl() → ARENA_API_BASE + /api/arena/battle
  ↓
filterRequestHeaders() → Remove hop-by-hop headers
  ↓
fetch() with duplex: "half" for streaming
  ↓
filterResponseHeaders() → Remove encoding headers
  ↓
Detect SSE (text/event-stream) → Add anti-buffering headers
  ↓
Return Response with resp.body (no buffering)
  ↓
Client receives SSE stream
```

### Key Features

- **Catch-all routing:** `[...path]` captures all paths and forwards them
- **Method forwarding:** GET, POST, PUT, PATCH, DELETE, OPTIONS all supported
- **Header filtering:** Removes hop-by-hop headers (connection, content-length, etc.)
- **SSE support:** Detects `text/event-stream` responses and adds anti-buffering headers
- **Streaming support:** Uses `duplex: "half"` for Node.js runtime streaming bodies
- **Query preservation:** Maintains query strings from original request
- **Abort signal:** Respects client abort for cleanup

---

## Configuration & Environment

### Required Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `ARENA_API_BASE` | `buildUpstreamUrl()` | Backend URL (Heroku) |

**Example:**
```
ARENA_API_BASE=https://echat-arena-backend.herokuapp.com
```

**Error Handling:**
```typescript
function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
```

Throws at runtime if `ARENA_API_BASE` is not set.

---

## Request Handling

### URL Construction

**Function:** `buildUpstreamUrl(request, pathParts)`

**Process:**
1. Get `ARENA_API_BASE` from env (e.g., `https://example.com/`)
2. Remove trailing slash
3. Encode each path segment
4. Join with `/`
5. Append query string from original request
6. Return full upstream URL

**Example:**
```typescript
// Client: POST /api/proxy/api/arena/battle?session_id=123
// Upstream: https://backend.com/api/arena/battle?session_id=123
```

### Header Filtering

**Request Headers** - `filterRequestHeaders(headers)`

Removes these hop-by-hop headers:
- `host` - Platform computes this
- `connection` - Platform computes this
- `content-length` - Platform computes this
- `accept-encoding` - Prevent server-side decompression interference
- `transfer-encoding` - Platform computes this

**Reason:** These headers are managed by the platform and can interfere with proxying.

**Response Headers** - `filterResponseHeaders(headers)`

Removes these headers:
- `content-encoding` - Prevents buffering issues with SSE
- `content-length` - Allows chunked transfer-encoding for streaming

**Reason:** Allows streaming responses (SSE) to work correctly without buffering.

---

## Streaming & SSE Support

### SSE Detection & Headers

```typescript
const contentType = resp.headers.get("content-type") || "";
if (contentType.includes("text/event-stream")) {
  resHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
  resHeaders.set("Cache-Control", "no-cache, no-transform");
  resHeaders.set("Connection", "keep-alive");
  resHeaders.set("X-Accel-Buffering", "no");  // Critical for proxy buffering
}
```

**Headers Added:**
- `X-Accel-Buffering: no` - Tells reverse proxies (nginx, Heroku router) not to buffer
- `Cache-Control: no-cache, no-transform` - Prevents caching/transformation
- `Connection: keep-alive` - Maintains persistent connection

### Request Body Streaming

```typescript
const resp = await fetch(upstreamUrl, {
  method,
  headers: upstreamHeaders,
  body: hasBody ? request.body : undefined,
  duplex: hasBody ? "half" : undefined,  // Required for Node.js streaming
  redirect: "manual",
  cache: "no-store",
  signal: controller.signal,
});
```

**Node.js Streaming:**
- `duplex: "half"` required when passing `request.body` directly
- Allows streaming POST/PUT request bodies without buffering

### Response Streaming

```typescript
// Critical: return upstream body directly (no buffering)
return new Response(resp.body, {
  status: resp.status,
  statusText: resp.statusText,
  headers: resHeaders,
});
```

**Key:** Returns `resp.body` directly without buffering, preserving streaming.

---

## Error Handling

### Abort Signal Handling

```typescript
const controller = new AbortController();
const onAbort = () => controller.abort();
request.signal.addEventListener("abort", onAbort);

try {
  // fetch with signal
} finally {
  request.signal.removeEventListener("abort", onAbort);
}
```

**Purpose:** Clean up abort listener to prevent memory leaks

**Behavior:**
- If client aborts request, upstream fetch is also aborted
- Finally block removes listener on completion or error

### Network Errors

If upstream fetch fails:
1. Exception thrown
2. Caught by try/finally
3. Abort listener cleaned up
4. Error propagates to Next.js error handling
5. Returns 500 or appropriate error response

---

## HTTP Methods Supported

| Method | Handler | Purpose |
|--------|---------|---------|
| GET | `GET(request, ctx)` | Retrieve data from backend |
| POST | `POST(request, ctx)` | Submit data (battle, vote, post-vote-chat) |
| PUT | `PUT(request, ctx)` | Update resources |
| PATCH | `PATCH(request, ctx)` | Partial updates |
| DELETE | `DELETE(request, ctx)` | Delete resources |
| OPTIONS | `OPTIONS(request, ctx)` | CORS preflight |

**All methods use the same `proxy()` function.**

---

## Typical Request Patterns

### Battle Request (SSE Streaming)

```typescript
// Client
fetch('/api/proxy/api/arena/battle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: '用户提示',
    session_id: 'uuid',
    model_a: 'baseline-model',
    model_b: 'strategy-model',
    use_sse: true
  })
})
// Response: SSE stream with type="stream" and type="done" messages
```

### Vote Request

```typescript
// Client
fetch('/api/proxy/api/arena/vote', {
  method: 'POST',
  body: JSON.stringify({
    session_id: 'uuid',
    winner: 'left',
    conversation_history: [...],
    turn_count: 2
  })
})
// Response: JSON { success: true, vote_id: 'uuid' }
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| SSE stream stops after 30 seconds | Heroku router timeout (default) | Backend sends heartbeat every 25s |
| SSE response buffered | Missing `X-Accel-Buffering: no` | Proxy adds this header automatically |
| Query string lost | URL construction | `buildUpstreamUrl()` preserves search params |
| 502 Bad Gateway | Backend unreachable | Verify `ARENA_API_BASE` in env |
| Request body not forwarded | Missing `duplex: "half"` | Added for Node.js streaming support |
| Headers interfere with response | Hop-by-hop headers passed | `filterResponseHeaders()` removes them |

---

## Code Standards & Patterns

### Function Organization

1. **`requiredEnv()`** - Env var validation (lines 3-7)
2. **`buildUpstreamUrl()`** - URL construction (lines 9-18)
3. **`filterRequestHeaders()`** - Request header cleanup (lines 20-39)
4. **`filterResponseHeaders()`** - Response header cleanup (lines 41-52)
5. **`proxy()`** - Main proxy logic (lines 56-105)
6. **HTTP handlers** - Method wrappers (lines 107-125)

### Error Handling Pattern

```typescript
try {
  // Attempt fetch
} finally {
  // Always cleanup
}
```

### Type Safety

```typescript
type RouteContext = { params: { path?: string[] } };

async function proxy(request: Request, ctx: RouteContext) {
  const { path = [] } = ctx.params;
  // ...
}
```

---

## Performance Considerations

### Direct Body Streaming

**Without buffering:** Memory O(1) - streams chunks through
**With buffering:** Memory O(n) - entire response in memory

The proxy uses direct streaming: `return new Response(resp.body, ...)`

### Header Filtering Overhead

Minimal - only iterates headers once per request/response

### Query String Handling

Uses `URL` constructor for proper encoding:
```typescript
const outUrl = new URL(`${base}/${joinedPath}`);
outUrl.search = inUrl.search; // Preserve query string
```

---

## Testing & Verification

### Local Testing

```bash
# Start frontend dev server
npm run dev

# Make request to proxy
curl -X POST http://localhost:3000/api/proxy/api/arena/battle \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'

# Should forward to ARENA_API_BASE backend
```

### Verify SSE Streaming

```bash
# Should receive streamed events (not buffered)
curl -N -X POST http://localhost:3000/api/proxy/api/arena/battle \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "use_sse": true}'

# -N disables buffering to see real-time events
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/AGENTS.md` - App router overview

**Subdirectory:**
- `proxy/AGENTS.md` - Detailed proxy route documentation

**Backend:**
- `/home/ranthaha1/echat-arena/app.py` - Backend FastAPI implementation
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide

---

## Quick Reference

### Environment Setup

```bash
# .env.local
ARENA_API_BASE=https://your-backend.herokuapp.com
```

### Request Examples

```typescript
// Battle (with SSE)
/api/proxy/api/arena/battle (POST)

// Vote
/api/proxy/api/arena/vote (POST)

// Session data
/api/proxy/api/arena/sessions/{id} (GET)

// Post-vote chat
/api/proxy/api/arena/post-vote-chat (POST)

// Export
/api/proxy/api/arena/export (GET)
```

### Key Files

- `/home/ranthaha1/echat-arena/web/app/api/proxy/[...path]/route.ts` - Proxy implementation

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Catch-all proxy with header filtering
- SSE streaming support with anti-buffering headers
- Request body streaming for Node.js runtime
- Abort signal cleanup for resource management
- Query string preservation

---

**Maintain Clarity:** Keep this guide updated when modifying header filtering logic, SSE handling, or adding new request patterns. Document any environment variable changes.
