<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

# web/hooks/ - Custom React Hooks

## Purpose

Custom React hooks encapsulating reusable stateful logic for the eChat Arena frontend. Handles Server-Sent Events (SSE) streaming for real-time battle responses, conversation state management, and admin authentication.

---

## Directory Structure

```
hooks/
├── AGENTS.md               # This file
├── useBattleStream.ts      # SSE streaming hook with retry logic
└── useAdminAuth.ts         # Admin authentication hook
```

## Key Files

| File | Description |
|------|-------------|
| `useBattleStream.ts` | SSE streaming for `/api/arena/battle` and `/api/arena/continue` endpoints; state accumulation; retry with exponential backoff |
| `useAdminAuth.ts` | Admin session management via `admin-token` header; separate from user Supabase auth |

## Hooks Overview

### `useBattleStream.ts` - Battle Streaming Hook

**Responsibility:** Manage Server-Sent Events (SSE) streaming for battle endpoint with automatic retry logic and state management

**Type Exports:**

```typescript
// Stream frame side type
export type BattleStreamSide = "meta" | "left" | "right" | "error" | "warning";

// Battle metadata
export interface BattleMeta {
  session_id: string;
  left_model: string;
  right_model: string;
  template_id?: string | null;
  strategy_name?: string | null;
  template_emotion?: string;
  template_intensity?: string;
  emotion?: string;
  intensity?: string;
  support_type?: string;
  classifier_comment?: string;
  ts?: string;
  turn?: number;
}

// Individual SSE frame
export interface BattleStreamFrame {
  side: BattleStreamSide;
  delta?: string;                // Text chunk for streaming
  finish?: boolean;              // Last frame for this side
  error?: string;                // Error message if side="error"

  // Meta frame fields
  session_id?: string;
  left_model?: string;
  right_model?: string;
  template_id?: string | null;
  strategy_name?: string | null;
  template_emotion?: string;
  template_intensity?: string;
  emotion?: string;
  intensity?: string;
  support_type?: string;
  classifier_comment?: string;
  ts?: string;
  turn?: number;

  // Warning/turn frame fields
  type?: "warning" | "meta";
  message?: string;
}

// Complete battle state
export interface BattleState {
  status: "idle" | "streaming" | "done" | "error";
  meta: BattleMeta | null;
  leftText: string;              // Accumulated left response
  rightText: string;             // Accumulated right response
  leftDone: boolean;             // Left response complete
  rightDone: boolean;            // Right response complete
  error: string | null;
}

// Hook options
export interface UseBattleStreamOptions {
  onWarning?: (message: string) => void;
  onTurnUpdate?: (turn: number) => void;
}
```

**Hook API:**

```typescript
export function useBattleStream(options?: UseBattleStreamOptions) {
  return {
    // State (from BattleState interface)
    status: "idle" | "streaming" | "done" | "error";
    meta: BattleMeta | null;
    leftText: string;
    rightText: string;
    leftDone: boolean;
    rightDone: boolean;
    error: string | null;

    // Methods
    startBattle: (prompt: string, retryCount?: number) => Promise<void>;
    continueConversation: (sessionId: string, prompt: string, retryCount?: number) => Promise<void>;
    reset: () => void;
    abort: () => void;
  };
}
```

### Usage Example

```typescript
'use client';

import { useBattleStream } from '@/hooks/useBattleStream';

export function BattleClient() {
  const {
    status,
    meta,
    leftText,
    rightText,
    leftDone,
    rightDone,
    error,
    startBattle,
    continueConversation,
    reset
  } = useBattleStream({
    onWarning: (message) => console.warn(message),
    onTurnUpdate: (turn) => console.log('Turn:', turn)
  });

  const handleStartBattle = async (prompt: string) => {
    await startBattle(prompt);
  };

  return (
    <div>
      <div>Status: {status}</div>
      <div>Left: {leftText} {leftDone && '✓'}</div>
      <div>Right: {rightText} {rightDone && '✓'}</div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button onClick={() => handleStartBattle('Your prompt')}>
        Start Battle
      </button>
    </div>
  );
}
```

---

## Hook Implementation Details

### State Management

```typescript
const [state, setState] = useState<BattleState>(initialState);
const abortRef = useRef<AbortController | null>(null);

const initialState: BattleState = {
  status: "idle",
  meta: null,
  leftText: "",
  rightText: "",
  leftDone: false,
  rightDone: false,
  error: null,
};
```

**Pattern:** Single state object with clear initial state, abortRef for cancellation

### SSE Stream Parsing

The hook parses Server-Sent Events according to SSE spec:

```
data: {...JSON frame...}\n
\n
data: {...another frame...}\n
\n
```

**Parser Logic:**
```typescript
function parseSseEventBlock(block: string): string[] {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  return [dataLines.join("\n")]; // Concatenate multi-line data
}
```

### Frame Types

The hook handles different frame types:

1. **Meta Frame** (`side: "meta"`):
   - Contains session info, model names, emotion classification
   - Received once at start of streaming
   - Updates local meta state

2. **Stream Frames** (`side: "left"` or `side: "right"`):
   - Contains `delta` (text chunk) and `finish` (boolean)
   - Accumulates into leftText or rightText
   - Marked done when finish=true

3. **Error Frame** (`side: "error"`):
   - Contains `error` message
   - Sets status to "error"

4. **Warning Frame** (`type: "warning"`):
   - Calls optional `onWarning` callback
   - Does not change status

### Retry Logic

**Exponential Backoff Pattern:**
```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // Base delay

// Retry delays: 2s → 4s → 8s
const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
```

**Conditions for Retry:**
- Request fails (network error, HTTP error)
- Retry count < MAX_RETRIES
- Request not explicitly aborted

**Conditions for No Retry:**
- User clicked abort
- Max retries exceeded
- Request was successful

### Streaming Flow

1. **startBattle(prompt)**
   - Clear previous state
   - Create AbortController
   - POST to `/api/proxy/api/arena/battle`
   - Parse SSE stream
   - Accumulate responses

2. **Frame Processing**
   ```
   Receive meta frame → Update meta state
   Receive left delta → Accumulate leftText
   Receive left finish → Set leftDone=true
   Receive right delta → Accumulate rightText
   Receive right finish → Set rightDone=true
   → Status changes to "done" when both done
   ```

3. **Stream End**
   - Reader returns `done: true`
   - Set status to "done" (or "error" if error occurred)

### Conversation Continuation

**continueConversation(sessionId, prompt)**
- Similar to startBattle but for follow-up turns
- Sends `/api/proxy/api/arena/continue` endpoint
- Reuses same frame handling logic
- Keeps meta state from previous turn

---

## Error Handling

### Error States

1. **Network Error**: Connection failed
   - Triggers retry with exponential backoff
   - After 3 retries, sets error state

2. **HTTP Error**: Non-200 status code
   - Reads response text for error details
   - Throws error (triggers retry)

3. **Invalid Content Type**: Not text/event-stream
   - Throws error immediately
   - No retry (configuration error)

4. **Malformed Frame**: JSON parse error
   - Silently ignores frame
   - Continues processing stream
   - Resilient to minor data corruption

5. **Stream Interrupted**: User aborts
   - AbortController stops reading
   - Clears error and resets state

### Error Message Format

```typescript
// User-friendly error message with original error
const message = err instanceof Error ? err.message : String(err);
setState(prev => ({
  ...prev,
  status: "error",
  error: `連接失敗，請刷新頁面重試 (${message})` // Chinese + error detail
}));
```

---

## Performance Optimization

### Memory Management

```typescript
// Use useRef for cleanup
const abortRef = useRef<AbortController | null>(null);

// Cleanup on abort
const abort = useCallback(() => {
  if (abortRef.current) {
    abortRef.current.abort();
    abortRef.current = null;
  }
  setState(prev => ({
    ...prev,
    status: prev.status === "streaming" ? "done" : prev.status
  }));
}, []);
```

### Callback Memoization

```typescript
const startBattle = useCallback(async (prompt: string) => {
  // Function body only recreated if dependencies change
}, [options]); // Only depends on options

const continueConversation = useCallback(async (sessionId: string, prompt: string) => {
  // Separate function for better control
}, [options]);
```

### Streaming Efficiency

- **Incremental Updates**: setText accumulates chunks, doesn't re-parse
- **Lazy State**: Only update state on new frames (no unnecessary renders)
- **Buffer Management**: Properly handle partial SSE blocks

---

## Testing Patterns

### Mock SSE Stream

```typescript
// For unit testing, mock fetch response
const mockResponse = {
  ok: true,
  headers: new Headers({ 'content-type': 'text/event-stream' }),
  body: {
    getReader: () => ({
      read: async () => ({ value: encoder.encode('data: {"side":"meta"...}\n\n'), done: false })
    })
  }
};

global.fetch = jest.fn(() => Promise.resolve(mockResponse));
```

### Test Cases

1. **Successful Stream**: meta → left chunks → left finish → right chunks → right finish
2. **Error Handling**: Network error → retry → success
3. **Abort**: Stream → abort → state resets
4. **Malformed Frame**: Invalid JSON → silently continues

---

## Common Usage Patterns

### Pattern 1: Basic Battle

```typescript
const { startBattle, status, leftText, rightText, error } = useBattleStream();

const handleSubmit = async (prompt: string) => {
  await startBattle(prompt);
};

// Use in render: status, leftText, rightText, error
```

### Pattern 2: With Callbacks

```typescript
const { startBattle } = useBattleStream({
  onWarning: (msg) => toast.warn(msg),
  onTurnUpdate: (turn) => console.log(`Turn ${turn}`),
});

await startBattle(prompt);
```

### Pattern 3: Multi-Turn Conversation

```typescript
const { startBattle, continueConversation, meta } = useBattleStream();

// Turn 1: Start battle
await startBattle("Initial prompt");

// Turn 2+: Continue conversation
if (meta?.session_id) {
  await continueConversation(meta.session_id, "Follow-up");
}
```

### Pattern 4: Abort on Cleanup

```typescript
useEffect(() => {
  return () => {
    abort(); // Cleanup: abort stream if component unmounts
  };
}, [abort]);
```

---

## Best Practices

### Do's

- Use `useCallback()` for memoization
- Handle all three stream sides (meta, left, right)
- Implement proper error states
- Cleanup with AbortController
- Parse SSE according to spec

### Don'ts

- Don't accumulate entire response in memory
- Don't block UI during streaming (use async/await properly)
- Don't ignore parse errors completely
- Don't re-create fetch requests unnecessarily
- Don't forget to abort on component unmount

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Expected SSE stream" error | Backend not returning correct content-type | Check ARENA_API_BASE configuration |
| Responses not accumulating | Frame handler not updating state | Verify side="left"/"right" in frames |
| Status stuck at "streaming" | Finish frame never arrives | Check backend sends finish:true |
| Memory leak warning | AbortController not cleaned up | Add cleanup in useEffect |
| Retry loops forever | MAX_RETRIES not respected | Check retryCount increments correctly |

### Debug Tips

```typescript
// Log all frames
const handleFrame = (frame: BattleStreamFrame) => {
  console.log('Frame:', frame);
  // ... rest of handling
};

// Monitor stream consumption
console.log('Streaming:', { leftDone, rightDone, leftText, rightText });

// Check error details
console.error('Stream error:', error);
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend overview
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide

**Related Directories:**
- `/home/ranthaha1/echat-arena/web/components/` - Components using this hook
- `/home/ranthaha1/echat-arena/web/app/` - Pages using this hook

**Backend API:**
- Backend `/api/arena/battle` endpoint (SSE streaming)
- Backend `/api/arena/continue` endpoint (continuation)

---

## Quick Reference: useBattleStream

```typescript
// Import and use
import { useBattleStream } from '@/hooks/useBattleStream';

// Basic usage
const { status, leftText, rightText, startBattle } = useBattleStream();
await startBattle('prompt');

// With options
const { ... } = useBattleStream({
  onWarning: (msg) => console.warn(msg),
  onTurnUpdate: (turn) => console.log(turn)
});

// State values
status: "idle" | "streaming" | "done" | "error"
meta: { session_id, left_model, right_model, ... }
leftText: string    // Accumulated left response
rightText: string   // Accumulated right response
leftDone: boolean   // Left response complete
rightDone: boolean  // Right response complete
error: string | null

// Methods
startBattle(prompt)                         // Start new battle
continueConversation(sessionId, prompt)     // Continue multi-turn
reset()                                     // Reset to initial state
abort()                                     // Stop streaming
```

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent:** `../AGENTS.md`

**Recent Changes:**
- SSE streaming with exponential backoff retry
- Multi-turn conversation support
- Warning event handling
- Turn number tracking

---

**Maintain Clarity:** Update this guide when adding new hooks or modifying streaming logic. Document all exported types and interface changes.
