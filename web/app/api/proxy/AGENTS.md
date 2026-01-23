# web/app/api/proxy/ - Catch-All Proxy Route

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 API Route Handler (TypeScript)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `proxy/` directory contains the catch-all proxy route handler that forwards all API requests from the frontend to the backend Heroku server. This is the critical integration point between the Next.js frontend and the FastAPI backend.

**Key Responsibility:** Forward all HTTP requests to `ARENA_API_BASE` backend while preserving request/response integrity and SSE streaming.

---

## Directory Structure

```
proxy/
└── [...path]/
    └── route.ts           # Catch-all route handler for all HTTP methods
```

---

## Key File: route.ts

**Location:** `/home/ranthaha1/echat-arena/web/app/api/proxy/[...path]/route.ts`

**Purpose:** Handle all HTTP requests and proxy them to the backend

**Size:** 125 lines of TypeScript

**Runtime:** Node.js (configured via `export const runtime = "nodejs"`)

---

## Route Pattern: [...path]

The `[...path]` catch-all segment matches any path after `/api/proxy/`:

```
/api/proxy/api/arena/battle
          ↑ matched as [...path]
/api/proxy/api/arena/vote
/api/proxy/api/arena/sessions/123
/api/proxy/...any/path/here
```

**How it works:**
```typescript
type RouteContext = { params: { path?: string[] } };

async function proxy(request: Request, ctx: RouteContext) {
  const { path = [] } = ctx.params;
  // path = ['api', 'arena', 'battle']
}
```

---

## HTTP Methods Supported

```typescript
export async function GET(request: Request, ctx: RouteContext) { return proxy(request, ctx); }
export async function POST(request: Request, ctx: RouteContext) { return proxy(request, ctx); }
export async function PUT(request: Request, ctx: RouteContext) { return proxy(request, ctx); }
export async function PATCH(request: Request, ctx: RouteContext) { return proxy(request, ctx); }
export async function DELETE(request: Request, ctx: RouteContext) { return proxy(request, ctx); }
export async function OPTIONS(request: Request, ctx: RouteContext) { return proxy(request, ctx); }
```

All methods delegate to the same `proxy()` function.

---

## Core Functions

### 1. requiredEnv(name: string): string

**Lines:** 3-7

**Purpose:** Safely retrieve required environment variables

```typescript
function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
```

**Throws:** Error if variable not set (fails fast at startup)

**Used for:** `ARENA_API_BASE`

---

### 2. buildUpstreamUrl(request, pathParts): string

**Lines:** 9-18

**Purpose:** Construct the upstream backend URL

```typescript
function buildUpstreamUrl(req: Request, pathParts: string[]): string {
  const base = requiredEnv("ARENA_API_BASE").replace(/\/$/, "");
  const joinedPath = pathParts.map((p) => encodeURIComponent(p)).join("/");

  const inUrl = new URL(req.url);
  const outUrl = new URL(`${base}/${joinedPath}`);
  outUrl.search = inUrl.search; // preserve query string

  return outUrl.toString();
}
```

**Process:**
1. Get `ARENA_API_BASE` (e.g., `https://example.com/`)
2. Remove trailing slash
3. Encode each path segment (URL-safe encoding)
4. Join with `/`
5. Create URL with base + path
6. Append original query string
7. Convert to string

**Example:**
```
Input:  req.url = "http://localhost:3000/api/proxy/api/arena/battle?session_id=123"
        ARENA_API_BASE = "https://backend.com/"
        pathParts = ["api", "arena", "battle"]

Output: "https://backend.com/api/arena/battle?session_id=123"
```

---

### 3. filterRequestHeaders(headers): Headers

**Lines:** 20-39

**Purpose:** Remove hop-by-hop headers from request before forwarding

```typescript
function filterRequestHeaders(headers: Headers): Headers {
  const out = new Headers();

  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (
      k === "host" ||
      k === "connection" ||
      k === "content-length" ||
      k === "accept-encoding" ||
      k === "transfer-encoding"
    ) {
      return; // Skip these headers
    }
    out.set(key, value);
  });

  return out;
}
```

**Headers Removed:**
- `host` - Platform computes based on upstream URL
- `connection` - Platform manages connection state
- `content-length` - Platform computes for the response
- `accept-encoding` - Prevent server-side decompression interference
- `transfer-encoding` - Platform manages chunking

**Headers Preserved:**
- `content-type` - Needed by backend to parse body
- `authorization` - Passed through for backend auth
- All other headers

**Why:** These are "hop-by-hop" headers that are specific to each HTTP hop. We must remove them to avoid conflicts with the platform's HTTP handling.

---

### 4. filterResponseHeaders(headers): Headers

**Lines:** 41-52

**Purpose:** Remove response headers that interfere with streaming

```typescript
function filterResponseHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    // Let the platform compute these; also avoids buffering issues with SSE.
    if (k === "content-encoding" || k === "content-length") {
      return;
    }
    out.set(key, value);
  });
  return out;
}
```

**Headers Removed:**
- `content-encoding` - Prevents double-encoding/decompression issues
- `content-length` - Allows chunked transfer-encoding for streaming

**Why:** These headers can cause buffering issues with SSE. The platform should compute them based on actual chunked response.

---

### 5. proxy(request, ctx): Promise<Response>

**Lines:** 56-105

**Purpose:** Main proxy logic - forward request and handle response

```typescript
async function proxy(request: Request, ctx: RouteContext) {
  const { path = [] } = ctx.params;

  const upstreamUrl = buildUpstreamUrl(request, path);
  const upstreamHeaders = filterRequestHeaders(request.headers);

  // Abort signal handling
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort);

  try {
    const method = request.method.toUpperCase();
    const hasBody = !(method === "GET" || method === "HEAD");

    const resp = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body: hasBody ? request.body : undefined,
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });

    const resHeaders = filterResponseHeaders(resp.headers);

    // SSE detection and header injection
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      resHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
      resHeaders.set("Cache-Control", "no-cache, no-transform");
      resHeaders.set("Connection", "keep-alive");
      resHeaders.set("X-Accel-Buffering", "no");
    }

    // Return response with streaming body
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resHeaders,
    });
  } finally {
    request.signal.removeEventListener("abort", onAbort);
  }
}
```

**Steps:**
1. Extract path from dynamic route segment
2. Build upstream URL
3. Filter request headers
4. Set up abort signal handling
5. Determine if request has body (not GET/HEAD)
6. Fetch from upstream with streaming support
7. Filter response headers
8. Detect SSE and add anti-buffering headers
9. Return response with unmodified body (streaming)
10. Clean up abort listener in finally

---

## SSE Streaming Support

### Why SSE Needs Special Handling

Server-Sent Events send continuous data streams. Standard HTTP response handling buffers the entire response, which defeats the purpose of streaming.

### SSE Detection

```typescript
const contentType = resp.headers.get("content-type") || "";
if (contentType.includes("text/event-stream")) {
  // This is an SSE response, add anti-buffering headers
}
```

Checks if `Content-Type` header contains `text/event-stream`.

### Anti-Buffering Headers

```typescript
resHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
resHeaders.set("Cache-Control", "no-cache, no-transform");
resHeaders.set("Connection", "keep-alive");
resHeaders.set("X-Accel-Buffering", "no");
```

| Header | Purpose |
|--------|---------|
| `Content-Type` | Ensures client recognizes SSE format |
| `Cache-Control` | Prevents caching and chunked transformation |
| `Connection` | Maintains persistent connection |
| `X-Accel-Buffering` | Tells nginx/Heroku to not buffer (critical for Heroku) |

### Direct Body Streaming

```typescript
return new Response(resp.body, {
  status: resp.status,
  statusText: resp.statusText,
  headers: resHeaders,
});
```

**Critical:** Return `resp.body` directly without consuming/re-encoding it.

**Never do this:**
```typescript
// DON'T: This buffers entire response in memory
const text = await resp.text();
return new Response(text, { headers: resHeaders });
```

---

## Request Body Streaming

### Node.js duplex Option

```typescript
const resp = await fetch(upstreamUrl, {
  body: hasBody ? request.body : undefined,
  duplex: hasBody ? "half" : undefined,
  // ...
});
```

**Why needed:** Node.js fetch requires `duplex: "half"` to support readable stream bodies.

**When applied:** Only when `hasBody` is true (POST, PUT, PATCH, DELETE)

**Effect:** Allows streaming request bodies without buffering in memory.

---

## Abort Signal Handling

### Resource Cleanup

```typescript
const controller = new AbortController();
const onAbort = () => controller.abort();
request.signal.addEventListener("abort", onAbort);

try {
  // fetch with signal: controller.signal
} finally {
  request.signal.removeEventListener("abort", onAbort);
}
```

**Purpose:**
- If client cancels request, immediately abort upstream fetch
- Clean up listener to prevent memory leaks

**Scenario:**
1. Client closes connection early
2. `request.signal` fires abort event
3. `onAbort()` calls `controller.abort()`
4. Upstream fetch is terminated
5. Finally block removes listener

---

## Error Handling

### Fetch Errors

If upstream fetch fails:
```typescript
try {
  const resp = await fetch(...);
} finally {
  // Cleanup happens
}
// Error propagates to Next.js
```

Next.js will:
1. Catch the error
2. Return 500 Internal Server Error to client
3. Log error in server logs

### Common Errors

| Error | Cause |
|-------|-------|
| `Missing env: ARENA_API_BASE` | Environment variable not set |
| Network timeout | Backend unreachable or slow |
| 502 Bad Gateway | Backend returned error |
| `signal: aborted` | Client disconnected early |

---

## Testing Patterns

### 1. Basic Proxy Test

```bash
curl -X POST http://localhost:3000/api/proxy/api/arena/vote \
  -H "Content-Type: application/json" \
  -d '{"session_id":"123","winner":"left"}'
```

Should forward to: `ARENA_API_BASE/api/arena/vote`

### 2. SSE Streaming Test

```bash
curl -N -X POST http://localhost:3000/api/proxy/api/arena/battle \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","use_sse":true}'
```

Should receive streamed events in real-time (not buffered).

### 3. Query String Test

```bash
curl "http://localhost:3000/api/proxy/api/arena/sessions/123?detailed=true"
```

Should forward with query string intact: `ARENA_API_BASE/api/arena/sessions/123?detailed=true`

---

## Common Issues & Debugging

### SSE Stream Stops After 30 Seconds

**Cause:** Heroku router timeout (default 30s)

**Solution:** Backend sends heartbeat every 25 seconds (configured in `app.py`)

**Verify:** Check `ARENA_SSE_HEARTBEAT_SEC` in backend config

### 502 Bad Gateway

**Cause:** `ARENA_API_BASE` incorrect or backend unreachable

**Debug:**
```bash
echo $ARENA_API_BASE  # Check env var
curl $ARENA_API_BASE/api/arena/health  # Test backend
```

### Response Buffered (Not Streaming)

**Cause:** Missing `X-Accel-Buffering: no` or using buffering method

**Check:** Verify SSE detection is working
```typescript
// In route.ts, add logging:
console.log('Content-Type:', contentType, 'isSSE:', contentType.includes('text/event-stream'));
```

---

## Performance Notes

### Memory Usage

- **Request body:** Streamed directly (no buffer)
- **Response body:** Streamed directly (no buffer)
- **Headers:** Filtered in O(n) where n = number of headers

### Latency

- URL construction: O(m) where m = path depth
- Header filtering: O(n) where n = header count
- Fetch: Depends on backend response time

---

## Security Considerations

### Header Filtering

Removes headers that could cause issues:
- `host` - Prevents host-based attacks
- `content-length` - Platform recalculates
- `transfer-encoding` - Platform manages

### Authorization

Preserves `Authorization` header for backend auth:
```typescript
// Authorization is NOT in the removal list
// Passed through to backend as-is
```

### No Request Modification

Request body is passed through unchanged - no injection attacks possible.

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/api/AGENTS.md` - API routes overview

**Backend:**
- `/home/ranthaha1/echat-arena/app.py` - FastAPI backend implementation

**Frontend Integration:**
- `/home/ranthaha1/echat-arena/web/app/battle/page.tsx` - Uses proxy for battles
- `/home/ranthaha1/echat-arena/web/hooks/useBattleStream.ts` - SSE streaming hook

---

## Code Standards

### Function Naming
- `requiredEnv()` - Env var helper
- `buildUpstreamUrl()` - URL construction
- `filterRequestHeaders()` - Request cleanup
- `filterResponseHeaders()` - Response cleanup
- `proxy()` - Main logic
- HTTP method handlers: `GET()`, `POST()`, etc.

### TypeScript Types
```typescript
type RouteContext = { params: { path?: string[] } };
```

---

## Quick Reference

### Environment Variable
```bash
ARENA_API_BASE=https://your-backend.herokuapp.com
```

### Request Pattern
```
Frontend → /api/proxy/[path] → ARENA_API_BASE/[path]
```

### Supported Methods
GET, POST, PUT, PATCH, DELETE, OPTIONS

### Response Handling
- SSE: Anti-buffering headers added
- Other: Response passed through as-is

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Catch-all proxy pattern with dynamic route matching
- SSE detection and anti-buffering header injection
- Request/response body streaming without buffering
- Hop-by-hop header filtering for security
- Abort signal cleanup for resource management

---

**Maintain Clarity:** Update this guide when modifying:
- Header filtering logic
- SSE detection rules
- Upstream URL construction
- Error handling behavior
- Environment variable requirements
