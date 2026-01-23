# web/app/chat/ - History Chat Pages

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 Client Components (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `chat/` directory contains dynamic routes for displaying individual conversation history details. Each route fetches a specific conversation by ID from Supabase and displays the full multi-turn conversation with voting results.

**Key Responsibility:** Render detailed view of past conversations with vote results, emotion classification, and post-vote chat history.

---

## Directory Structure

```
chat/
└── [id]/
    └── page.tsx           # Dynamic route handler for chat/:id
```

---

## Routing

### Dynamic Route Pattern

**Route:** `/chat/[id]`

**Example URLs:**
- `/chat/uuid-1234` → Displays chat with ID uuid-1234
- `/chat/another-uuid` → Displays chat with ID another-uuid

**Parameters:**
```typescript
interface Props {
  params: { id: string };
}
```

The `[id]` segment captures the URL parameter and passes it as `params.id` to the page component.

---

## Key File: [id]/page.tsx

**Location:** `/home/ranthaha1/echat-arena/web/app/chat/[id]/page.tsx`

**Type:** Client Component (`'use client'`)

**Size:** ~250 lines (fetch, display, and layout)

**Dependencies:**
- React hooks (useEffect, useState, useCallback, useParams, useRouter)
- Next.js navigation (useParams, useRouter)
- Lucide React icons (Menu, X, ArrowLeft)
- Custom components (Sidebar, ConversationTurnBlock)
- Supabase client (createSupabaseBrowserClient)

---

## Core Types

### VoteChoice

```typescript
type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;
```

Represents user's voting choice.

### ConversationHistoryTurn

```typescript
type ConversationHistoryTurn = {
  turn: number;                 // Turn number (1, 2, 3, ...)
  user: string;                 // User's message for this turn
  reply_a: string;              // Model A's response
  reply_b: string;              // Model B's response
  timestamp?: string;           // ISO-8601 timestamp
};
```

Single turn in the conversation. Matches backend schema in `conversation_history` JSONB field.

### VoteRow

```typescript
type VoteRow = {
  id: string;                   // Vote record UUID
  created_at: string;           // ISO-8601 timestamp of vote
  session_id: string;           // Original session ID
  prompt: string;               // Original prompt (optional/deprecated)
  reply_a: string;              // First response (optional/deprecated)
  reply_b: string;              // Second response (optional/deprecated)
  user_vote: VoteChoice | null; // User's vote choice
  conversation_history?: ConversationHistoryTurn[]; // Multi-turn history
  turn_count?: number;          // Number of turns in conversation
};
```

The complete vote record from Supabase `votes` table.

### PostVoteTurn

```typescript
type PostVoteTurn = {
  id: string;                   // Post-vote turn UUID
  turn_index: number;           // Turn number in post-vote chat
  user_message: string;         // User's follow-up message
  assistant_message: string;    // Winning model's response
  winner_side: string;          // Which model won
  created_at: string;           // ISO-8601 timestamp
};
```

Single turn from post-vote chat continuation. From `post_vote_turns` table.

---

## Component Structure

### Page Layout

```
ChatDetailPage
├─ Sidebar (navigation)
├─ Main Content
│  ├─ Header
│  │  ├─ Back button
│  │  └─ Menu toggle (mobile)
│  ├─ Vote Info
│  │  ├─ Vote choice displayed
│  │  ├─ Timestamp
│  │  └─ Turn count
│  ├─ Conversation History
│  │  ├─ ConversationTurnBlock × N (for each turn)
│  │  └─ All turns rendered in order
│  └─ Post-Vote Chat (if exists)
│     ├─ "Post-Vote Chat" header
│     └─ ConversationTurnBlock × M (for each post-vote turn)
└─ Mobile Menu Toggle
```

---

## Data Fetching

### useEffect Hook

```typescript
useEffect(() => {
  async function fetchVote() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;

      setVote(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
      setLoading(false);
    }
  }

  if (params.id) {
    fetchVote();
  }
}, [params.id]);
```

**Flow:**
1. Component mounts
2. Extract ID from params
3. Create Supabase client
4. Query `votes` table for this ID
5. Set vote data in state
6. Handle errors

### Post-Vote Chat Fetching

```typescript
useEffect(() => {
  async function fetchPostVoteTurns() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('post_vote_turns')
        .select('*')
        .eq('vote_id', params.id)
        .order('turn_index', { ascending: true });

      if (error) throw error;

      setPostVoteTurns(data || []);
    } catch (err) {
      console.error('Failed to fetch post-vote turns:', err);
    }
  }

  if (params.id && vote) {
    fetchPostVoteTurns();
  }
}, [params.id, vote]);
```

**Flow:**
1. After vote data loaded
2. Fetch all post-vote turns for this vote
3. Order by turn_index ascending
4. Display turns in order

---

## Utility Functions

### formatTime(iso: string): string

```typescript
function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
```

**Purpose:** Convert ISO-8601 timestamp to locale string

**Example:**
```
"2026-01-23T15:30:45.000Z" → "1/23/2026, 3:30:45 PM" (US locale)
```

**Fallback:** Returns original string if invalid date

---

## State Management

```typescript
export default function ChatDetailPage() {
  const params = useParams();
  const router = useRouter();

  // Vote data
  const [vote, setVote] = useState<VoteRow | null>(null);
  const [postVoteTurns, setPostVoteTurns] = useState<PostVoteTurn[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ...
}
```

---

## UI Components Used

### ConversationTurnBlock

**Purpose:** Display single conversation turn

**Props:**
```typescript
interface ConversationTurnBlockProps {
  turn: ConversationHistoryTurn;
  turnNumber?: number;
}
```

**Renders:**
- User message
- Left AI response
- Right AI response

### Sidebar

**Purpose:** Navigation menu

**Props:**
```typescript
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
}
```

### Mobile Menu Toggle

```typescript
<button
  onClick={() => setSidebarOpen(!sidebarOpen)}
  className="md:hidden"
>
  {sidebarOpen ? <X /> : <Menu />}
</button>
```

---

## Display Logic

### Loading State

```typescript
if (loading) {
  return <div>Loading...</div>;
}
```

### Error State

```typescript
if (error) {
  return <div>Error: {error}</div>;
}
```

### No Data State

```typescript
if (!vote) {
  return <div>Vote not found</div>;
}
```

### Vote Information Display

```typescript
<div className="p-4 bg-gray-100 rounded">
  <p>Vote: {vote.user_vote}</p>
  <p>Created: {formatTime(vote.created_at)}</p>
  <p>Turns: {vote.turn_count || 1}</p>
</div>
```

### Conversation History Display

```typescript
{vote.conversation_history && vote.conversation_history.length > 0 ? (
  <div>
    <h2>Conversation History</h2>
    {vote.conversation_history.map((turn) => (
      <ConversationTurnBlock
        key={turn.turn}
        turn={turn}
        turnNumber={turn.turn}
      />
    ))}
  </div>
) : (
  <div>No conversation history</div>
)}
```

### Post-Vote Chat Display

```typescript
{postVoteTurns.length > 0 && (
  <div>
    <h2>Post-Vote Chat</h2>
    {postVoteTurns.map((turn) => (
      <div key={turn.id}>
        <p>User: {turn.user_message}</p>
        <p>Assistant: {turn.assistant_message}</p>
      </div>
    ))}
  </div>
)}
```

---

## Navigation Features

### Back Button

```typescript
<button onClick={() => router.back()}>
  <ArrowLeft /> Back
</button>
```

Navigate back to history listing page.

### Home Navigation

```typescript
<button onClick={() => router.push('/')}>
  Home
</button>
```

### History Link

```typescript
<Link href="/history">
  View All Conversations
</Link>
```

---

## Responsive Design

### Mobile vs Desktop

```typescript
// Mobile: Sidebar hidden by default
<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

// Desktop: Menu toggle hidden
<button className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
  {sidebarOpen ? <X /> : <Menu />}
</button>

// Layout
<div className="flex">
  <div className="md:w-1/3">
    {/* Sidebar content */}
  </div>
  <div className="md:w-2/3">
    {/* Main content */}
  </div>
</div>
```

---

## Data Schema Reference

### Votes Table

```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY,
  session_id TEXT,
  user_id UUID,
  user_vote TEXT,
  conversation_history JSONB,  -- Array of ConversationHistoryTurn
  turn_count INTEGER,
  created_at TIMESTAMPTZ,
  -- ... other fields
);
```

### Post Vote Turns Table

```sql
CREATE TABLE post_vote_turns (
  id UUID PRIMARY KEY,
  vote_id UUID REFERENCES votes(id),
  turn_index INTEGER,
  user_message TEXT,
  assistant_message TEXT,
  winner_side TEXT,
  created_at TIMESTAMPTZ
);
```

---

## Error Handling

### Supabase Errors

```typescript
const { data, error } = await supabase.from('votes').select('*').single();

if (error) {
  if (error.code === 'PGRST116') {
    // Not found
    setError('Vote not found');
  } else {
    setError(error.message);
  }
}
```

### Network Errors

Caught in try/catch and displayed to user.

### Missing Data

Handled gracefully with conditional rendering.

---

## Performance Considerations

### Lazy Rendering

Vote is fetched in useEffect, not server-side.

Pros:
- Faster page navigation
- Client-side only request

Cons:
- Loading state visible to user
- Extra request to Supabase

### Cached Data

Could optimize with:
- SWR hook for automatic caching
- Service Worker for offline support
- Local state persistence

---

## Testing & Verification

### Local Testing

```bash
npm run dev
# Navigate to /history
# Click on a conversation to view detail
# Verify conversation_history displays correctly
# Verify post-vote turns display if they exist
```

### Test Scenarios

1. **With multi-turn history:**
   - Load `/chat/[vote-id]`
   - Should display all turns in ConversationTurnBlock

2. **With post-vote chat:**
   - Load `/chat/[vote-id]`
   - Should display post-vote turns after conversation history

3. **Without post-vote chat:**
   - Load `/chat/[vote-id]` (vote with no post-vote turns)
   - Should hide post-vote section

4. **Vote not found:**
   - Load `/chat/invalid-id`
   - Should show "Vote not found"

---

## Security Considerations

### Authentication

Protected via middleware.ts - only authenticated users can access `/chat/*`

### Data Access

Supabase RLS policies ensure users can only see their own votes.

### No Mutation

This page displays data only - no delete/edit operations.

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/AGENTS.md` - App router overview
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend guide

**Related Page:**
- `/home/ranthaha1/echat-arena/web/app/history/page.tsx` - History listing (links to this page)

**Related Components:**
- `/home/ranthaha1/echat-arena/web/components/ConversationTurnBlock.tsx`
- `/home/ranthaha1/echat-arena/web/components/Sidebar.tsx`

**Database Schema:**
- `/home/ranthaha1/echat-arena/migrations/` - Database migrations

---

## Quick Reference

### Route Pattern
```
/chat/:id → Displays vote with ID matching :id
```

### Key Types
- `VoteRow` - Vote record with conversation_history
- `ConversationHistoryTurn` - Single turn (user + reply_a + reply_b)
- `PostVoteTurn` - Post-vote chat turn

### Key State
- `vote` - Main vote record
- `postVoteTurns` - Post-vote chat turns
- `loading` - Data loading state
- `error` - Error message

### Key Functions
- `formatTime()` - Format ISO timestamp
- Component initialization via useEffect

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Dynamic route with [id] parameter
- Multi-turn conversation display
- Post-vote chat continuation display
- Supabase data fetching
- Responsive mobile UI
- Back navigation

---

**Maintain Clarity:** Update this guide when:
- Modifying data display format
- Adding new fields to vote or post-vote turns
- Changing fetching logic
- Adding new navigation features
- Updating error handling
