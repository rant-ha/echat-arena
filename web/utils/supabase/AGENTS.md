# web/utils/supabase/ - Supabase Client Configuration

**Parent:** `../AGENTS.md`
**Type:** TypeScript Utilities
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `supabase/` directory contains Supabase client initialization code for both browser and server environments. These utilities provide properly configured clients for the respective contexts, handling authentication cookies and environment variable loading.

**Key Responsibility:** Provide Supabase client instances configured for browser (anonymous key) and server (service role key) environments with proper cookie handling.

---

## Directory Structure

```
supabase/
├── client.ts              # Browser-side Supabase client
└── server.ts              # Server-side Supabase client
```

---

## Key File 1: client.ts

**Location:** `/home/ranthaha1/echat-arena/web/utils/supabase/client.ts`

**Purpose:** Create Supabase client for browser (client-side) code

**Type:** Client-safe utility function

**Size:** ~16 lines

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
```

### Function: createSupabaseBrowserClient()

**Return Type:** SupabaseClient

**Usage:**
```typescript
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

const supabase = createSupabaseBrowserClient();
const { data, error } = await supabase.auth.getUser();
```

### Environment Variables Required

| Variable | Purpose | Visibility |
|----------|---------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public (browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anonymous key for auth | Public (browser) |

**Why NEXT_PUBLIC_*:**
- These are exposed to browser (public keys only)
- Never put secrets in NEXT_PUBLIC_ variables
- Anon key has limited permissions via RLS policies

### Error Handling

Throws `Error` if required env vars missing:
```typescript
if (!supabaseUrl) {
  throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
}
```

Fails fast at client creation time - catches config issues immediately.

### When to Use

Use `client.ts` in:
- Client components (`'use client'`)
- Browser-side event handlers
- Client-side data fetching (useEffect, etc.)

**Example:**
```typescript
'use client';

import { createSupabaseBrowserClient } from "@/utils/supabase/client";

export function LoginClient() {
  const supabase = createSupabaseBrowserClient();
  // Use for auth, data fetching, etc.
}
```

---

## Key File 2: server.ts

**Location:** `/home/ranthaha1/echat-arena/web/utils/supabase/server.ts`

**Purpose:** Create Supabase client for server-side code

**Type:** Server-only utility function

**Size:** ~30 lines

```typescript
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}
```

### Function: createSupabaseServerClient()

**Return Type:** SupabaseClient

**Usage:**
```typescript
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function getUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### Cookie Management

The server client manages cookies for auth session persistence:

```typescript
cookies: {
  get(name: string) {
    return cookieStore.get(name)?.value;
  },
  set(name: string, value: string, options: any) {
    cookieStore.set({ name, value, ...options });
  },
  remove(name: string, options: any) {
    cookieStore.set({ name, value: "", ...options, maxAge: 0 });
  },
}
```

**How it works:**
1. Supabase stores auth session in cookies
2. Next.js server reads/writes cookies
3. Auth state persists across requests
4. User stays logged in

### Environment Variables Required

Same as client:
| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anonymous key |

### Error Handling

Same as client - throws if env vars missing.

### When to Use

Use `server.ts` in:
- Server components (no `'use client'`)
- Server actions
- API route handlers
- Middleware
- Server-side data fetching

**Example:**
```typescript
// page.tsx (Server Component)
import { createSupabaseServerClient } from "@/utils/supabase/server";

export default async function Page() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <div>Welcome, {user?.email}</div>;
}
```

---

## Comparison: Browser vs Server Client

| Aspect | Browser (client.ts) | Server (server.ts) |
|--------|-------------------|------------------|
| **Used in** | Client components | Server components, API routes |
| **Cookie handling** | Automatic (browser) | Manual (via Next.js) |
| **Environment variables** | `NEXT_PUBLIC_*` required | Can use `NEXT_PUBLIC_*` |
| **Auth persistence** | Via browser cookies | Via Next.js cookie store |
| **RLS enforcement** | Yes (anon key) | Yes (anon key) |
| **Latency** | Direct (client→Supabase) | Via server |

---

## Authentication Flow

### Browser Client Flow

```
User clicks "Login" button
  ↓
LoginClient.tsx creates browser client
  ↓
client.signInWithPassword(email, password)
  ↓
Supabase returns session token
  ↓
Browser stores session in cookie
  ↓
Subsequent requests include cookie
  ↓
User authenticated
```

### Server Client Flow

```
User navigates to protected page
  ↓
page.tsx creates server client
  ↓
server.getUser() (uses cookie from Next.js)
  ↓
Supabase validates session
  ↓
User authenticated
  ↓
Page renders with user data
```

---

## Environment Configuration

### .env.local (Development)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from:
1. Supabase Dashboard
2. Settings → API
3. Copy Project URL and anon key

### .env.production (Vercel)

Set via Vercel Environment Variables:
1. Project Settings → Environment Variables
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Mark as "Secret" if desired (optional for public keys)

---

## Usage Patterns

### Pattern 1: Browser Data Fetching

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';

export function VotesList() {
  const [votes, setVotes] = useState([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase
      .from('votes')
      .select('*')
      .then(({ data }) => setVotes(data || []));
  }, []);

  return <div>{votes.length} votes</div>;
}
```

### Pattern 2: Server-Side Auth Check

```typescript
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <div>Welcome, {user.email}</div>;
}
```

### Pattern 3: Server Action

```typescript
'use server';

import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function submitVote(voteData: any) {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('votes')
    .insert([voteData]);

  if (error) throw error;
  return data;
}
```

### Pattern 4: Browser Auth Check

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';

export function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email || null);
    });
  }, []);

  return <div>{email || 'Not logged in'}</div>;
}
```

---

## Error Handling

### Missing Environment Variables

Both clients throw if env vars missing:

```typescript
if (!supabaseUrl) {
  throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
}
```

**Best Practice:** Let errors propagate - they indicate configuration issues that must be fixed.

### Failed Requests

Handle errors from Supabase operations:

```typescript
const { data, error } = await supabase.from('votes').select('*');

if (error) {
  console.error('Query failed:', error);
  // Handle error (show toast, retry, etc.)
}
```

---

## Security Considerations

### Keys Exposed to Browser

The anon key is intentionally exposed (it's public):
- Used for authentication only
- Row Level Security (RLS) policies enforce permissions
- Users can only access their own data

### Service Role Key Not Exposed

Never expose service role key to browser:
- Would bypass RLS policies
- Only use on server
- Could be compromised

**This codebase uses anon key everywhere - correct!**

### Cookie Security

Server client manages cookies:
- Supabase sets secure, httpOnly cookies
- Browser cannot access via JavaScript
- Automatically included in cross-origin requests (with CORS)

---

## Troubleshooting

### "Missing env: NEXT_PUBLIC_SUPABASE_URL"

**Cause:** Environment variable not set

**Solution:**
1. Create `.env.local` in project root
2. Add `NEXT_PUBLIC_SUPABASE_URL=...`
3. Restart dev server

### "Unauthorized" or "Unverified" Errors

**Cause:** User not authenticated or token expired

**Solution:**
1. Check if user is logged in
2. Verify cookie is being sent
3. Check Supabase RLS policies

### Server Client Not Finding Cookies

**Cause:** Using client.ts in server component or vice versa

**Solution:**
- Use `server.ts` in server components
- Use `client.ts` in client components
- Check `'use client'` directive

---

## Best Practices

### 1. Use Correct Client Type

```typescript
// ✓ Correct
'use client';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';

// ✗ Wrong
'use client';
import { createSupabaseServerClient } from '@/utils/supabase/server';
```

### 2. Create Client When Needed

```typescript
// ✓ Good - Create when function called
export async function fetchVotes() {
  const supabase = createSupabaseServerClient();
  return await supabase.from('votes').select('*');
}

// ✗ Avoid - Create at module level
const supabase = createSupabaseServerClient();
export async function fetchVotes() {
  return await supabase.from('votes').select('*');
}
```

### 3. Handle Errors

```typescript
// ✓ Good
const { data, error } = await supabase.from('votes').select('*');
if (error) {
  console.error('Failed:', error);
  throw error;
}

// ✗ Avoid
const { data } = await supabase.from('votes').select('*');
// Silently fails if error
```

### 4. Use RLS Policies

Rely on Row Level Security for permissions, not client-side checks:
```sql
-- Example RLS policy
create policy "Users can view their own votes"
  on public.votes for select
  using (auth.uid() = user_id);
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/utils/AGENTS.md` - Utils directory

**Frontend Code Using These Clients:**
- `/home/ranthaha1/echat-arena/web/app/login/LoginClient.tsx` - Uses browser client for auth
- `/home/ranthaha1/echat-arena/web/app/chat/[id]/page.tsx` - Uses browser client for data fetch
- `/home/ranthaha1/echat-arena/web/app/history/page.tsx` - Uses browser client for votes list

**Supabase Documentation:**
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side-rendering)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## Quick Reference

### Browser Client (client.ts)

```typescript
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

const supabase = createSupabaseBrowserClient();
```

**Use in:** Client components, browser code
**Auth:** Via browser cookies

### Server Client (server.ts)

```typescript
import { createSupabaseServerClient } from "@/utils/supabase/server";

const supabase = createSupabaseServerClient();
```

**Use in:** Server components, API routes, middleware
**Auth:** Via Next.js cookie store

### Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Common Operations

```typescript
// Get user
const { data: { user } } = await supabase.auth.getUser();

// Query data
const { data, error } = await supabase.from('votes').select('*');

// Insert data
const { data, error } = await supabase.from('votes').insert([{ ... }]);

// Sign in
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Sign up
const { error } = await supabase.auth.signUp({ email, password });

// Sign out
await supabase.auth.signOut();
```

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Browser client for client-side code
- Server client for server-side code
- Automatic cookie handling
- Environment variable validation
- Error handling
- Authentication support

---

**Maintain Clarity:** Update this guide when:
- Changing Supabase configuration
- Adding new client features
- Modifying cookie handling
- Updating environment variable names
