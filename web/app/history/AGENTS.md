# web/app/history/ - User Conversation History Listing Page

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 Client Component (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `history/` directory contains the page for displaying a user's complete list of past conversations and votes. Users can view all their previous battles, filter by vote choice, and navigate to individual conversation details.

**Key Responsibility:** Fetch user's vote history from Supabase, display in reverse chronological order with vote metadata, and enable navigation to conversation details.

---

## Directory Structure

```
history/
└── page.tsx               # History listing page component
```

---

## Key File: page.tsx

**Location:** `/home/ranthaha1/echat-arena/web/app/history/page.tsx`

**Type:** Client Component (`'use client'`)

**Size:** ~250 lines (fetch, display, and list management)

**Dependencies:**
- React hooks (useCallback, useEffect, useState)
- Next.js navigation (useRouter)
- Lucide React icons (History, Menu, X, ChevronRight, MessageSquare)
- Custom components (Sidebar)
- Supabase client (createSupabaseBrowserClient)

---

## Core Types

### VoteChoice

```typescript
type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;
```

Possible voting choices.

### VoteRow

```typescript
type VoteRow = {
  id: string;                   // Vote UUID
  created_at: string;           // ISO-8601 timestamp
  prompt: string;               // Original prompt
  user_vote: VoteChoice | null; // Vote choice (model_a, model_b, tie, both_bad)
};
```

Minimal vote record for listing view. Only includes essential display fields.

---

## Component Structure

### Page Layout

```
HistoryPage
├─ Sidebar (navigation)
├─ Main Content
│  ├─ Header
│  │  ├─ History icon
│  │  ├─ Title "My Conversations"
│  │  └─ Menu toggle (mobile)
│  └─ Vote List
│     ├─ Loading state
│     ├─ Error state
│     └─ Vote rows
│        ├─ Clickable row
│        ├─ Prompt preview (truncated)
│        ├─ Vote choice label (Chinese)
│        ├─ Timestamp
│        └─ ChevronRight icon
└─ Mobile Menu Toggle
```

---

## State Management

```typescript
export default function HistoryPage() {
  const router = useRouter();

  // Vote list
  const [rows, setRows] = useState<VoteRow[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Sidebar toggle
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  // ...
}
```

---

## Data Fetching

### useEffect Hook

```typescript
useEffect(() => {
  async function fetchVotes() {
    try {
      const supabase = createSupabaseBrowserClient();

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        return;
      }

      // Fetch user's votes
      const { data, error } = await supabase
        .from('votes')
        .select('id, created_at, prompt, user_vote')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRows(data || []);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch votes';
      setError(message);
      setLoading(false);
    }
  }

  fetchVotes();
}, []);
```

**Flow:**
1. Component mounts
2. Create Supabase client
3. Get current authenticated user
4. Query `votes` table for this user
5. Order by created_at descending (newest first)
6. Set rows in state

### User Email

```typescript
useEffect(() => {
  async function fetchUserEmail() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    } catch (err) {
      console.error('Failed to fetch user email:', err);
    }
  }

  fetchUserEmail();
}, []);
```

---

## Utility Functions

### truncate(text: string, maxLen: number): string

```typescript
function truncate(text: string, maxLen: number) {
  const t = (text || "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}
```

**Purpose:** Truncate prompt preview to max length with ellipsis

**Example:**
```
truncate("这是一个很长的提示词用来测试截断功能", 20)
→ "这是一个很长的提示词用来…"
```

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
"2026-01-23T15:30:45.000Z" → "1/23/2026, 3:30:45 PM"
```

### voteLabel(v: VoteChoice | null): string

```typescript
function voteLabel(v: VoteChoice | null): string {
  if (!v) return "未投票";
  if (v === "model_a") return "选了 Reply A";
  if (v === "model_b") return "选了 Reply B";
  if (v === "tie") return "平局";
  if (v === "both_bad") return "都不行";
  return String(v);
}
```

**Purpose:** Convert vote choice to user-friendly Chinese label

**Possible Values:**
| Vote | Label |
|------|-------|
| null | 未投票 (Not voted) |
| model_a | 选了 Reply A (Chose Reply A) |
| model_b | 选了 Reply B (Chose Reply B) |
| tie | 平局 (Tie) |
| both_bad | 都不行 (Both bad) |

---

## UI Components

### Vote Row

```typescript
{rows.map((row) => (
  <div
    key={row.id}
    onClick={() => router.push(`/chat/${row.id}`)}
    className="p-4 border-b hover:bg-gray-50 cursor-pointer"
  >
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <p className="font-medium text-sm">
          {truncate(row.prompt, 80)}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {formatTime(row.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm bg-blue-100 px-2 py-1 rounded">
          {voteLabel(row.user_vote)}
        </span>
        <ChevronRight size={20} className="text-gray-400" />
      </div>
    </div>
  </div>
))}
```

**Components:**
- Prompt preview (truncated to 80 chars)
- Timestamp formatted
- Vote choice badge
- ChevronRight icon for navigation

### Loading State

```typescript
if (loading) {
  return (
    <div className="flex justify-center items-center h-64">
      <p>Loading...</p>
    </div>
  );
}
```

### Error State

```typescript
if (error) {
  return (
    <div className="p-4 bg-red-50 rounded">
      <p className="text-red-600">Error: {error}</p>
    </div>
  );
}
```

### Empty State

```typescript
if (rows.length === 0) {
  return (
    <div className="text-center p-8">
      <MessageSquare size={48} className="mx-auto text-gray-400" />
      <p className="text-gray-600 mt-4">No conversations yet</p>
      <button onClick={() => router.push('/battle')}>
        Start a Battle
      </button>
    </div>
  );
}
```

---

## Navigation Features

### Navigate to Battle

```typescript
<button onClick={() => router.push('/battle')}>
  <Swords /> New Battle
</button>
```

Start a new conversation.

### Navigate to Chat Detail

```typescript
onClick={() => router.push(`/chat/${row.id}`)}
```

View specific conversation.

### Sidebar Links

- Home
- Battle
- History (current page)
- Logout

---

## Responsive Design

### Mobile Menu

```typescript
<button
  onClick={() => setSidebarOpen(!sidebarOpen)}
  className="md:hidden"
>
  {sidebarOpen ? <X /> : <Menu />}
</button>
```

### Layout

```typescript
<div className="flex">
  <div className="md:w-1/3">
    <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
  </div>
  <div className="md:w-2/3">
    {/* Main content */}
  </div>
</div>
```

### Vote Row Responsive

```typescript
<div className="flex justify-between items-start">
  <div className="flex-1">
    {/* Prompt and timestamp */}
  </div>
  <div className="flex items-center gap-2">
    {/* Vote badge and arrow */}
  </div>
</div>
```

---

## Data Schema Reference

### Votes Table

```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ,
  prompt TEXT,                 -- Original prompt (optional)
  user_vote TEXT,              -- model_a, model_b, tie, both_bad
  conversation_history JSONB,  -- Full conversation for detail view
  -- ... other fields
);
```

**Indices:**
- `user_id` - Fast filtering by user
- `created_at` - Fast sorting

---

## Performance Considerations

### Pagination

**Currently:** No pagination - loads all votes

**TODO:** Implement pagination for users with many votes

```typescript
// Suggested implementation
const PAGE_SIZE = 20;
const { data, error, count } = await supabase
  .from('votes')
  .select('id, created_at, prompt, user_vote', { count: 'exact' })
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .range(0, PAGE_SIZE - 1);
```

### Data Fetching

- Minimal fields selected (id, created_at, prompt, user_vote)
- Not fetching full conversation_history (use in detail view)
- Single query per load

### Sorting

- `order('created_at', { ascending: false })` - Newest first
- Efficient with database index

---

## Error Handling

### Auth Error

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  setError('Not authenticated');
  return;
}
```

### Fetch Error

```typescript
const { data, error } = await supabase.from('votes').select(...);
if (error) throw error;
```

### Network Error

Caught in try/catch and displayed.

### Graceful Degradation

- Empty state if no votes
- Error message displayed
- Can retry or navigate elsewhere

---

## Testing & Verification

### Local Testing

```bash
npm run dev
# Navigate to /history
# Should display list of past votes
# Click on vote to navigate to detail page
```

### Test Scenarios

1. **With existing votes:**
   - Load `/history`
   - Should display all user's votes
   - Should be ordered newest first
   - Should show prompt preview
   - Should show vote label

2. **Without votes:**
   - New user with no votes
   - Should show empty state
   - Should have "Start Battle" button

3. **Vote selection:**
   - Click on row
   - Should navigate to `/chat/[id]`
   - Detail page should load

4. **Error handling:**
   - Simulate network error
   - Should show error message
   - Should recover when retrying

---

## Security Considerations

### Authentication

Protected via middleware.ts - only authenticated users can access `/history`

### Data Access

Supabase RLS policies ensure users can only see their own votes.

**Policy:**
```sql
-- Users can only select their own votes
create policy "Users can view their own votes"
  on public.votes for select
  using (auth.uid() = user_id);
```

### No Sensitive Data

- Conversation history not loaded in this view
- Emotion classification not displayed
- Only vote choice and timestamp shown

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/AGENTS.md` - App router overview
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend guide

**Related Pages:**
- `/home/ranthaha1/echat-arena/web/app/battle/page.tsx` - Battle page (link from "New Battle")
- `/home/ranthaha1/echat-arena/web/app/chat/[id]/page.tsx` - Detail page (link from rows)

**Related Components:**
- `/home/ranthaha1/echat-arena/web/components/Sidebar.tsx`

**Database Schema:**
- `/home/ranthaha1/echat-arena/migrations/` - Database migrations

---

## Quick Reference

### Route
```
/history → User's conversation list
```

### Key Types
- `VoteRow` - Vote record (id, created_at, prompt, user_vote)
- `VoteChoice` - Vote options (model_a, model_b, tie, both_bad, null)

### Key State
- `rows` - List of votes
- `loading` - Data loading state
- `error` - Error message
- `sidebarOpen` - Mobile sidebar visibility

### Key Functions
- `truncate()` - Truncate prompt preview
- `formatTime()` - Format timestamp
- `voteLabel()` - Convert vote to label

### Vote Labels (Chinese)
| Vote | Label |
|------|-------|
| null | 未投票 |
| model_a | 选了 Reply A |
| model_b | 选了 Reply B |
| tie | 平局 |
| both_bad | 都不行 |

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Display user's vote history
- Reverse chronological ordering
- Prompt preview with truncation
- Vote choice labels in Chinese
- Clickable rows navigate to detail
- Responsive mobile UI
- Empty and error states
- Sidebar navigation

**TODO:**
- Implement pagination for large vote counts
- Add filtering/search by prompt
- Add vote count statistics
- Add export functionality

---

**Maintain Clarity:** Update this guide when:
- Adding pagination
- Modifying vote display format
- Changing data fetching logic
- Adding new vote choices
- Updating Chinese text labels
