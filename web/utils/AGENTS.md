<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 | Updated: 2026-02-15 -->

# web/utils/ - Utility Functions & Service Clients

## Purpose

Utility functions and service clients providing shared functionality across the eChat Arena frontend. Includes Supabase authentication clients, internationalization (i18n) system with 221 translation keys in Chinese/English, and shared chart constants for admin dashboards.

---

## Directory Structure

```
utils/
├── AGENTS.md
├── i18n.ts              # 221 translation keys (zh + en), t() function
├── i18n-context.tsx     # React Context + localStorage for language switching
├── chart-constants.ts   # Shared chart colors, tooltip styles, confidence level helpers
└── supabase/
    ├── client.ts       # Browser Supabase client (anonymous key)
    └── server.ts       # Server Supabase client (session via cookies)
```

## Key Files

| File | Description |
|------|-------------|
| `i18n.ts` | Translation dictionary with 221 keys in Chinese (zh) and English (en). Exports `t(key, locale)` function. Covers admin dashboard, leaderboard, analytics, conversations, and common UI strings |
| `i18n-context.tsx` | React Context provider for i18n. `useI18n()` hook returns `{ t, locale, setLocale }`. Persists language choice in localStorage. Exported via `I18nProvider` |
| `chart-constants.ts` | Shared constants for recharts: `TOOLTIP_STYLE`, `ACCENT`, `GREEN`, `YELLOW`, `RED`, `BLUE`, `PIE_COLORS`, `CONFIDENCE_COLORS`, `confidenceLabelKey()` helper |
| `supabase/client.ts` | Browser Supabase client factory using anonymous key; enforces RLS policies |
| `supabase/server.ts` | Server Supabase client factory; manages session via Next.js cookies |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `supabase/` | Supabase client factories for browser and server environments (see `supabase/AGENTS.md` if created) |

---

## Core Technologies

| Technology | Purpose |
|-----------|---------|
| Supabase | PostgreSQL database and authentication |
| TypeScript | Type-safe utility functions |
| Next.js | Server vs. client environment detection |

## Subdirectories & Responsibilities

### `supabase/` - Authentication & Database Clients

**Purpose:** Provide Supabase client instances configured for browser and server environments

**Key Files:**

| File | Purpose | Environment | Permissions |
|------|---------|-------------|-------------|
| `client.ts` | Browser-side Supabase client | Client (Browser) | Read-only (anon key) |
| `server.ts` | Server-side Supabase client | Server (Next.js) | Read/Write (service role) |

---

## Supabase Client Details

### `client.ts` - Browser Client

**Responsibility:** Create and export Supabase client for browser-side operations

**Type Signature:**
```typescript
export function createClient(): SupabaseClient
```

**Configuration:**

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Key Characteristics:**
- Uses public (anonymous) key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Can be called from browser JavaScript
- Enforces Row Level Security (RLS) policies
- Limited to read-only or user-owned data

**Usage Pattern:**
```typescript
'use client';

import { createClient } from '@/utils/supabase/client';

export function MyComponent() {
  const supabase = createClient();

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();

  // Read data (subject to RLS)
  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('user_id', session?.user.id);

  return <div>{data?.length} votes</div>;
}
```

**Common Operations:**

1. **Authentication:**
```typescript
const supabase = createClient();

// Get current session
const { data: { session } } = await supabase.auth.getSession();

// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Sign in
const { error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

// Sign up
const { error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    emailRedirectTo: 'https://example.com/auth/callback'
  }
});

// Sign out
await supabase.auth.signOut();
```

2. **Read Data:**
```typescript
const { data, error } = await supabase
  .from('votes')
  .select('*');

// With filtering
const { data } = await supabase
  .from('votes')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

3. **Subscribe to Changes (Real-time):**
```typescript
const channel = supabase
  .channel('votes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'votes' },
    (payload) => console.log('Vote added:', payload)
  )
  .subscribe();

// Cleanup
supabase.removeChannel(channel);
```

**AI Instructions:**
- Use browser client in `'use client'` components
- All operations subject to RLS policies
- Cannot perform writes without user ownership (by design)
- Call once and reuse instance in component

### `server.ts` - Server Client

**Responsibility:** Create and export Supabase client for server-side operations

**Type Signature:**
```typescript
export function createSupabaseServerClient(): SupabaseClient
```

**Configuration:**

```typescript
import { createServerClient, CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete(name);
        },
      },
    }
  );
}
```

**Key Characteristics:**
- Uses public key like browser client
- Respects cookies for session management
- Works in Next.js Server Components
- Cannot use service role key in client code (security risk)

**Usage Pattern:**
```typescript
// In server component
import { createSupabaseServerClient } from '@/utils/supabase/server';

export default async function Page() {
  const supabase = createSupabaseServerClient();

  // Check user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <div>Welcome {user.email}</div>;
}
```

**Common Operations:**

1. **Get Current User:**
```typescript
const supabase = createSupabaseServerClient();
const { data: { user }, error } = await supabase.auth.getUser();

if (!user) {
  redirect('/login');
}
```

2. **Read User-Specific Data:**
```typescript
const { data: votes } = await supabase
  .from('votes')
  .select('*')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false });
```

3. **Server-Side Redirect:**
```typescript
import { redirect } from 'next/navigation';

if (!user) {
  redirect('/login');
}
```

**AI Instructions:**
- Use server client in server components only
- Cannot call from `'use client'` components
- Good for auth checks and protected pages
- Cannot use service role key (never expose secrets to browser)

---

## Authentication Flow

### Sign-Up Flow

```typescript
// 1. User submits email/password
const { error } = await supabase.auth.signUp({
  email: userEmail,
  password: userPassword,
  options: {
    emailRedirectTo: `${process.env.NEXT_PUBLIC_DOMAIN}/auth/callback`,
    data: { email_domain: extractDomain(userEmail) }
  }
});

// 2. Supabase sends confirmation email
// 3. User clicks link in email
// 4. Redirected to /auth/callback (handled by Supabase)
// 5. Session created, user logged in
```

### Login Flow

```typescript
// 1. User submits credentials
const { error } = await supabase.auth.signInWithPassword({
  email: userEmail,
  password: userPassword
});

// 2. Session created
// 3. Redirect to /battle
```

### Session Persistence

Supabase uses cookies to persist sessions:
- Cookie set on login
- Cookie sent with each request
- Server client reads cookie to get session
- Session expires (default: 1 week)

---

## Security Patterns

### Client vs. Server Keys

**Browser (Client):**
- Uses NEXT_PUBLIC_SUPABASE_ANON_KEY
- Public, safe to expose
- Limited by RLS policies
- Cannot bypass security rules

**Server (Backend):**
- Uses NEXT_PUBLIC_SUPABASE_ANON_KEY (not service key)
- Server Components process auth safely
- Never expose service role key to browser
- Service key would bypass RLS (NEVER use in client)

**Pattern:**
```typescript
// WRONG: Never do this in client
const supabase = createClient('url', 'SERVICE_ROLE_KEY'); // ❌

// CORRECT: Always use anonymous key in client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
); // ✓

// CORRECT: Server component uses anon key with cookie session
const supabase = createSupabaseServerClient(); // ✓
```

### Row Level Security (RLS)

All browser requests subject to RLS policies:
```sql
-- Example: User can only read own votes
CREATE POLICY "Users can read own votes"
  ON votes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

**AI Instructions:**
- Rely on RLS for data access control
- Never trust client-side filtering
- Define policies for all operations
- Test policies before deployment

### Authentication Checks

Always verify user on server side:
```typescript
// Server Component
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  redirect('/login');
}

// Don't trust client-side checks for security
```

---

## Common Patterns & Recipes

### Pattern 1: Protected Page

```typescript
// app/protected/page.tsx
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return <div>Welcome {user.email}</div>;
}
```

### Pattern 2: Fetch User Data

```typescript
// app/profile/page.tsx
import { createSupabaseServerClient } from '@/utils/supabase/server';

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user?.id)
    .single();

  return <div>
    <h1>{profile.name}</h1>
    <p>{profile.bio}</p>
  </div>;
}
```

### Pattern 3: Client-Side Auth State

```typescript
// components/MyComponent.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export function MyComponent() {
  const [user, setUser] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user);
    })();
  }, [supabase]);

  return <div>{user?.email}</div>;
}
```

### Pattern 4: Sign Out

```typescript
'use client';

import { createClient } from '@/utils/supabase/client';

export function SignOutButton() {
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return <button onClick={handleSignOut}>Sign Out</button>;
}
```

---

## Environment Variables

**Required:**

| Variable | Used In | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Both clients | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Both clients | Public authentication key |

**Example `.env.local`:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**AI Instructions:**
- Never commit `.env.local` to git
- Set via Vercel Environment Variables in production
- Keys are public (safe to expose)

---

## Testing & Verification

### Development Setup

```bash
# 1. Create Supabase project
# Visit https://supabase.com/dashboard

# 2. Get credentials
# Settings → API → URL and Key

# 3. Add to .env.local
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key

# 4. Test connection
npm run dev
```

### Manual Testing

```typescript
// Browser console
const supabase = window.supabaseClient;
const { data } = await supabase.auth.getSession();
console.log(data.session);
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid login credentials" | Wrong password | Check password or reset |
| "User not found" | Email not registered | Sign up first |
| "Email not confirmed" | Email verification pending | Click link in email |
| "Invalid claim in JWT" | Expired session | Sign in again |
| "CORS error" | Wrong origin | Check Supabase URL |

### Error Handling Pattern

```typescript
const { data, error } = await supabase
  .from('votes')
  .select('*');

if (error) {
  console.error('Database error:', error.message);
  // Handle error: show user message, retry, etc.
  return null;
}

return data;
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend overview
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide

**Configuration:**
- `web/.env.example` - Environment variables template

**Related Directories:**
- `/home/ranthaha1/echat-arena/web/app/` - Pages using Supabase clients

**External Resources:**
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## Quick Reference: Supabase Clients

```typescript
// Browser client
import { createClient } from '@/utils/supabase/client';
const supabase = createClient();

// Server client
import { createSupabaseServerClient } from '@/utils/supabase/server';
const supabase = createSupabaseServerClient();

// Auth operations
await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signOut();
const { data: { user } } = await supabase.auth.getUser();

// Data operations
const { data } = await supabase.from('table').select('*');
const { data } = await supabase.from('table').insert([row]);
const { data } = await supabase.from('table').update(changes).eq('id', id);
const { data } = await supabase.from('table').delete().eq('id', id);

// Filters
.eq('column', value)        // Equals
.neq('column', value)       // Not equals
.gt('column', value)        // Greater than
.gte('column', value)       // Greater than or equal
.lt('column', value)        // Less than
.lte('column', value)       // Less than or equal
.like('column', '%pattern%') // Pattern match

// Ordering
.order('column', { ascending: true })

// Limits
.limit(10)
.range(0, 9)
```

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent:** `../AGENTS.md`

**Recent Changes:**
- Supabase authentication integration
- Server and client Supabase clients
- Session management with cookies
- RLS-based security

---

**Maintain Clarity:** Update this guide when adding new utility functions or modifying Supabase client configurations. Document all new patterns and best practices.
