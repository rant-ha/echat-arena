# web/app/battle/ - AI Model Battle Arena Page

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 Client Component (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `battle/` directory contains the main arena page where users engage in multi-turn conversations comparing two AI models. This is the core interactive experience of the echat-arena application.

**Key Responsibility:** Display real-time AI responses, manage multi-turn conversation state, collect user votes with emotion classification, and enable post-vote chat continuation with the winning model.

---

## Directory Structure

```
battle/
└── page.tsx               # Main battle page component
```

---

## Key File: page.tsx

**Location:** `/home/ranthaha1/echat-arena/web/app/battle/page.tsx`

**Type:** Client Component (`'use client'`)

**Approximate Lines:** 400+ (multi-turn conversation logic)

**Dependencies:**
- React hooks (useState, useCallback, useEffect, useMemo, useRef)
- Next.js navigation (useRouter)
- Framer Motion (animations)
- Lucide React icons (Swords, RotateCcw, Menu, X, ChevronDown)
- Custom hooks (useBattleStream)
- Custom components (ConversationTurnBlock, VoteButtons, PromptInput, Sidebar)

---

## Core Types

### VoteResult

```typescript
type VoteResult = {
  revealed_left?: { arm?: string; model_id?: string };
  revealed_right?: { arm?: string; model_id?: string };
  ai_scores?: {
    model_a?: AiJudgeScores;
    model_b?: AiJudgeScores;
  };
  winner?: 'left' | 'right' | null;
};
```

**Fields:**
- `revealed_left` - Reveals left model name/ID after vote
- `revealed_right` - Reveals right model name/ID after vote
- `ai_scores` - Judge scores for both models (optional)
- `winner` - Vote winner (left, right, or null for tie)

### VoteState

```typescript
interface VoteState {
  choice: VoteChoice | null;           // User's selected vote (model_a, model_b, tie, both_bad)
  isSubmitting: boolean;               // Submission in progress
  isRevealed: boolean;                 // Vote result revealed
  error: string | null;                // Vote submission error
  result: VoteResult | null;           // Vote result data
}
```

Tracks the complete state of a vote throughout submission and revelation.

### PostVoteTurn

```typescript
interface PostVoteTurn {
  turn_index: number;                  // Turn number in post-vote chat
  user_message: string;                // User's follow-up message
  assistant_message: string;           // Winner model's response
  created_at: string;                  // ISO-8601 timestamp
}
```

Represents a single turn in the post-vote continuation chat.

### VoteChoice

```typescript
type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;
```

Possible voting options exported from VoteButtons component.

---

## Key UI Components

### Main Layout

```
BattleClient
├─ Sidebar (navigation)
├─ Main Content Area
│  ├─ Header (battle icon, reset button)
│  ├─ ConversationTurnBlock × N (display turns)
│  │  ├─ UserMessageBubble
│  │  ├─ AIResponseCard (left model)
│  │  └─ AIResponseCard (right model)
│  ├─ PromptInput (user input)
│  ├─ VoteButtons (if not voted yet)
│  ├─ Vote Result Reveal (if voted)
│  └─ PostVoteChat (if post-vote turns exist)
└─ Mobile Menu Toggle
```

---

## State Management

### Main State Variables

```typescript
'use client';

function BattleClient() {
  const router = useRouter();

  // Session & streaming
  const [sessionId, setSessionId] = useState<string>('');
  const [turns, setTurns] = useState<any[]>([]);

  // Current turn streaming
  const [currentLeftResponse, setCurrentLeftResponse] = useState('');
  const [currentRightResponse, setCurrentRightResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Voting
  const [voteState, setVoteState] = useState<VoteState>({
    choice: null,
    isSubmitting: false,
    isRevealed: false,
    error: null,
    result: null
  });

  // Post-vote chat
  const [postVoteTurns, setPostVoteTurns] = useState<PostVoteTurn[]>([]);

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ...
}
```

---

## Key Features

### 1. Multi-Turn Conversation Flow

**Turn 1:**
1. User enters prompt in PromptInput
2. Both models receive same prompt
3. Responses stream via useBattleStream hook
4. Real-time display in AIResponseCard components

**Turns 2+:**
1. User enters follow-up prompt
2. Each model uses its own context history
3. New turn appended to turns array
4. ConversationTurnBlock renders all turns

**Vote:**
1. User clicks VoteButtons (model_a, model_b, tie, both_bad)
2. Full conversation history sent to backend
3. Vote recorded with turn_count
4. Model names revealed via VoteResult

**Post-Vote Chat:**
1. User can continue chatting with winning model
2. Stored in postVoteTurns (separate table)
3. Does not affect original vote data
4. Optional - user can skip

### 2. SSE Streaming Integration

```typescript
const { stream, loading, error, restart } = useBattleStream(prompt, sessionId);

stream?.addEventListener('message', (e: Event) => {
  const data = safeJsonParse((e as MessageEvent).data);
  if (data?.type === 'stream') {
    // delta: chunk of text
    if (data.arm === 'left') {
      setCurrentLeftResponse(prev => prev + data.delta);
    } else if (data.arm === 'right') {
      setCurrentRightResponse(prev => prev + data.delta);
    }
  } else if (data?.type === 'done') {
    // Full response complete
    if (data.arm === 'left') {
      // Finalize left response
    }
  }
});
```

### 3. Vote Submission

```typescript
async function handleVote(choice: VoteChoice) {
  setVoteState(prev => ({ ...prev, isSubmitting: true }));

  try {
    const response = await fetch('/api/proxy/api/arena/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        winner: choice,
        conversation_history: turns,
        turn_count: turns.length,
        emotion: 'neutral',
        intensity: 'medium',
        support_type: 'both'
      })
    });

    const data = await response.json();

    setVoteState(prev => ({
      ...prev,
      choice,
      isRevealed: true,
      result: data.result
    }));
  } catch (err) {
    setVoteState(prev => ({
      ...prev,
      error: err instanceof Error ? err.message : 'Vote failed'
    }));
  }
}
```

### 4. Post-Vote Chat

After voting, user can continue:
```typescript
async function handlePostVoteMessage(userMessage: string) {
  const response = await fetch('/api/proxy/api/arena/post-vote-chat', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      winner: voteState.choice,
      user_message: userMessage
    })
  });

  const data = await response.json();
  setPostVoteTurns(prev => [...prev, data.turn]);
}
```

### 5. Reset Functionality

```typescript
function handleReset() {
  setSessionId('');
  setTurns([]);
  setCurrentLeftResponse('');
  setCurrentRightResponse('');
  setVoteState({
    choice: null,
    isSubmitting: false,
    isRevealed: false,
    error: null,
    result: null
  });
  setPostVoteTurns([]);

  // Start new battle
}
```

---

## Component Integration

### PromptInput

**Purpose:** Collect user input for new turns

**Props:**
- `value`: Current input text
- `onChange`: Handle input change
- `onSubmit`: Handle form submission
- `disabled`: Disable during submission

**Example:**
```typescript
<PromptInput
  value={userInput}
  onChange={(val) => setUserInput(val)}
  onSubmit={() => handleStartBattle(userInput)}
  disabled={isStreaming || voteState.isSubmitting}
/>
```

### ConversationTurnBlock

**Purpose:** Display single turn with user message + two AI responses

**Props:**
- `turn`: Turn data with user + reply_a + reply_b
- `turnNumber`: Turn number for display

**Renders:**
- User message bubble
- Left AI response card
- Right AI response card

### VoteButtons

**Purpose:** Collect vote choice from user

**Props:**
- `onVote`: Callback when user selects choice
- `disabled`: Disable during submission

**Options:**
- model_a (左边赢)
- model_b (右边赢)
- tie (平局)
- both_bad (都不行)

### Sidebar

**Purpose:** Navigation and user menu

**Props:**
- `isOpen`: Sidebar visibility
- `onClose`: Close sidebar callback
- `userEmail`: Display user email

**Links:**
- Battle (current page)
- History (past conversations)
- Logout

---

## Animation & UI Effects

### Framer Motion

```typescript
import { motion, AnimatePresence } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
>
  {/* Content */}
</motion.div>
```

### Conditional Styling

Uses `cn()` utility from `@/components/ui`:

```typescript
<div className={cn(
  "p-4 rounded",
  isStreaming && "bg-blue-100",
  voteState.isRevealed && "opacity-50"
)}>
  {/* Content */}
</div>
```

---

## Error Handling

### Vote Submission Errors

```typescript
try {
  // Submit vote
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  setVoteState(prev => ({
    ...prev,
    error: message
  }));
}
```

### Network Errors

Displayed in UI with error state.

### Recovery

Users can retry or reset to start new battle.

---

## Responsive Design

### Mobile Menu

```typescript
const [sidebarOpen, setSidebarOpen] = useState(false);

// Header with menu toggle
<button onClick={() => setSidebarOpen(!sidebarOpen)}>
  {sidebarOpen ? <X /> : <Menu />}
</button>
```

### Responsive Layout

```typescript
<div className="md:flex">
  <div className="md:w-1/3">
    {/* Sidebar */}
  </div>
  <div className="md:w-2/3">
    {/* Main content */}
  </div>
</div>
```

---

## Data Flow Diagram

```
User enters prompt
    ↓
handleStartBattle()
    ↓
useBattleStream hook initialized
    ↓
SSE stream from /api/proxy/api/arena/battle
    ↓
stream.addEventListener('message', ...)
    ↓
type === 'stream': Update currentLeftResponse / currentRightResponse
    ↓
type === 'done': Finalize responses, add turn to turns array
    ↓
Display ConversationTurnBlock
    ↓
User can vote or continue (next turn)
    ↓
handleVote()
    ↓
POST /api/proxy/api/arena/vote
    ↓
Vote submitted with conversation_history
    ↓
Reveal model names and vote result
    ↓
Optional: handlePostVoteMessage() for post-vote chat
    ↓
Display post-vote turns
    ↓
User can reset to start new battle
```

---

## Common Development Tasks

### Adding New Vote Option

1. Update `VoteChoice` type
2. Add button to VoteButtons component
3. Update vote submission logic
4. Update backend vote schema

### Adding Emotion Classification

Currently placeholder values:
```typescript
emotion: 'neutral',
intensity: 'medium',
support_type: 'both'
```

Replace with user-selected values or ML classification.

### Styling Changes

Modify Tailwind classes in JSX or update `tailwind.config.ts`

### Adding Analytics

Track events:
```typescript
function handleVote(choice: VoteChoice) {
  analytics.track('vote_submitted', { choice, turn_count: turns.length });
  // ...
}
```

---

## Performance Considerations

### Streaming Optimization

- Updates state per chunk (not buffered)
- Real-time display of responses
- No memory buildup from large responses

### Render Optimization

- ConversationTurnBlock memoized to prevent unnecessary re-renders
- useCallback for event handlers to maintain referential equality
- useMemo for computed values

### Large Conversations

- All turns stored in state
- May cause slowdown with 50+ turns
- Consider pagination or virtualization for large histories

---

## Testing & Verification

### Local Testing

```bash
npm run dev
# Navigate to http://localhost:3000/battle
# Enter prompt and observe streaming responses
```

### SSE Streaming Test

Verify responses stream in real-time (not buffered):
1. Start battle
2. Watch left/right responses appear character-by-character
3. Verify responses complete within reasonable time

### Vote Test

```bash
# Enter prompt, get responses, click vote
# Verify vote submitted successfully
# Verify model names revealed
```

### Post-Vote Chat Test

```bash
# After voting, enter follow-up message
# Verify response from winning model
# Verify turn added to postVoteTurns
```

---

## Security Considerations

### User Authentication

Protected via middleware.ts - only authenticated users can access `/battle`

### Data Validation

- Input validated before sending to backend
- Response data validated before rendering

### No Sensitive Data

- All user input sent to backend (not stored in browser state permanently)
- Session ID used for tracking (not PII)

---

## Environment Variables

**None required** - All config via parent layout and global env vars

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/AGENTS.md` - App router overview
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend guide

**Related Components:**
- `/home/ranthaha1/echat-arena/web/components/ConversationTurnBlock.tsx`
- `/home/ranthaha1/echat-arena/web/components/VoteButtons.tsx`
- `/home/ranthaha1/echat-arena/web/components/PromptInput.tsx`
- `/home/ranthaha1/echat-arena/web/components/Sidebar.tsx`

**Related Hooks:**
- `/home/ranthaha1/echat-arena/web/hooks/useBattleStream.ts` - SSE streaming hook

**Backend Integration:**
- `/home/ranthaha1/echat-arena/app.py` - FastAPI backend
- `/home/ranthaha1/echat-arena/web/app/api/proxy/AGENTS.md` - API proxy

---

## Quick Reference

### Key State Variables
- `sessionId` - Current battle session
- `turns` - All conversation turns
- `currentLeftResponse` - Streaming left response
- `currentRightResponse` - Streaming right response
- `voteState` - Vote status and result
- `postVoteTurns` - Post-vote chat turns

### Key Functions
- `handleStartBattle()` - Initiate new turn
- `handleVote()` - Submit vote
- `handlePostVoteMessage()` - Send post-vote message
- `handleReset()` - Start new battle

### Key Events
- User submits prompt → handleStartBattle
- User selects vote → handleVote
- User sends post-vote message → handlePostVoteMessage
- User clicks reset → handleReset

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Multi-turn conversation support
- Real-time SSE streaming
- Vote collection with emotion classification
- Post-vote chat continuation
- Responsive mobile UI with sidebar
- Framer Motion animations

---

**Maintain Clarity:** Update this guide when:
- Adding new vote options
- Modifying streaming logic
- Changing state structure
- Adding new features to battle flow
- Updating component integrations
