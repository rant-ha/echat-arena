# web/app - Next.js App Router Pages & API Routes

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 App Router (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `app/` directory contains all Next.js 14 App Router pages, layouts, and API routes for the echat-arena frontend. It defines the routing structure, page rendering logic, and backend API proxying for the application.

**Key Responsibility:** Serve page routes, manage global layout/providers, and proxy backend API requests while maintaining type safety and server/client component separation.

---

## Directory Structure

```
app/
├── page.tsx                   # Home page (server component)
├── layout.tsx                 # Root layout with global providers and metadata
├── globals.css                # Global Tailwind CSS styles
├── HomeClient.tsx             # Client-side home page component
├── battle/
│   └── page.tsx               # Main arena battle page
├── chat/
│   └── [id]/
│       └── page.tsx           # History chat detail view (dynamic route)
├── history/
│   └── page.tsx               # User conversation history listing
├── login/
│   ├── page.tsx               # Login page wrapper
│   └── LoginClient.tsx        # Client-side login logic
├── register/
│   └── page.tsx               # User registration page
└── api/
    └── proxy/
        └── [...path]/
            └── route.ts       # Catch-all proxy for backend API requests
```

---

## Core Technologies

| Technology | Purpose |
|-----------|---------|
| Next.js 14 App Router | Server-first routing with nested layouts |
| React 18 Server Components | Default server rendering with streaming |
| TypeScript | Type safety across routes and components |
| Tailwind CSS | Utility-first styling via globals.css |
| Supabase Auth | Authentication integration |
| Vercel Analytics | Production monitoring |

---

## Key Files & Responsibilities

### `layout.tsx` - Root Layout

**Responsibility:** Define application-wide layout and metadata

**Key Features:**
- Exports `metadata` for SEO (title, description)
- Sets up HTML structure with language and theme
- Integrates Vercel Analytics and SpeedInsights
- Renders children pages

**Pattern:** Server component that wraps all pages

**Example:**
```typescript
export const metadata: Metadata = {
  title: "Model Arena",
  description: "Model Arena (Next.js 14)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" className="dark h-full">
      <body className="h-full bg-surface-primary text-text-primary antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

**AI Instructions:**
- Avoid putting interactive elements here; keep it layout only
- Add providers (Context, Suspense boundaries) as needed
- Global CSS loaded via `globals.css` import

### `globals.css` - Global Styles

**Responsibility:** Define application-wide CSS and Tailwind configuration

**Key Features:**
- Tailwind CSS directives (@tailwind, @layer)
- Custom CSS variables for design tokens
- Typography and animation styles
- Color scheme and theme variables

**AI Instructions:**
- Use Tailwind's @layer directive for custom components
- Keep semantic color variables in Tailwind config, not here
- Global resets only (avoid styling specific components)

### `page.tsx` - Home Page

**Responsibility:** Render the home/landing page

**Pattern:**
- Server component by default
- Fetches user session via Supabase
- Renders client component with user context

**Example:**
```typescript
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <HomeClient userEmail={user?.email} />;
}
```

**AI Instructions:**
- Use `force-dynamic` if user-specific content needed
- Fetch auth state server-side for security
- Pass data to client component via props

### `HomeClient.tsx` - Home Page Client Component

**Responsibility:** Client-side interactivity for home page

**Features:**
- Conditional rendering (logged-in vs. guest)
- Navigation to /battle or login
- Optional email domain checking

**AI Instructions:**
- Mark with "use client" directive
- Keep server auth check in `page.tsx`, render here

### `/battle/page.tsx` - Main Arena Page

**Responsibility:** Render the AI comparison battle interface

**Type:** Protected route (redirects to login if unauthenticated)

**Pattern:**
- Server component with layout
- Imports BattleClient for interactivity
- Manages multi-turn conversation state

**AI Instructions:**
- Protect via middleware.ts, not in component
- BattleClient handles all user interaction
- Streaming via useBattleStream hook

### `/chat/[id]/page.tsx` - History Detail Page

**Responsibility:** Display full conversation history for a specific chat session

**Pattern:**
- Dynamic route with `[id]` parameter
- Fetches conversation data from Supabase
- Displays all turns with voting result

**Example:**
```typescript
interface Props {
  params: { id: string };
}

export default async function ChatDetailPage({ params }: Props) {
  // Fetch conversation by ID
  // Render with ConversationTurnBlock components
}
```

**AI Instructions:**
- Use dynamic params to fetch session data
- Display archived/immutable conversation (no editing)
- Show winner indicator and vote metadata

### `/history/page.tsx` - History Listing Page

**Responsibility:** Display user's list of all past conversations

**Features:**
- Lists all votes with timestamps
- Vote metadata (emotion, intensity, winner)
- Links to individual conversation details

**AI Instructions:**
- Fetch all votes for current user
- Display in reverse chronological order
- Include pagination if large dataset

### `/login/page.tsx` - Login Page

**Responsibility:** Render Supabase authentication form

**Pattern:**
- Server component wrapper
- Client component handles form logic
- Redirects to /battle on successful auth

**AI Instructions:**
- Handle both email/password and OAuth flows
- Show email domain restriction if configured
- Store CAPTCHA completion before login

### `/register/page.tsx` - Registration Page

**Responsibility:** User registration interface

**Features:**
- Email/password registration
- Email verification
- Email domain allowlist validation

**AI Instructions:**
- Validate email domain against NEXT_PUBLIC_ALLOWED_DOMAINS
- Enforce password requirements
- Handle registration errors gracefully

### `/api/proxy/[...path]/route.ts` - API Proxy

**Responsibility:** Proxy all backend API requests through Next.js

**Pattern:**
- Catch-all route that intercepts `/api/proxy/*` requests
- Forwards to `ARENA_API_BASE` backend
- Preserves streaming responses (SSE)
- Maintains request headers and body

**Key Features:**
- Handles POST, GET, PUT, DELETE methods
- Preserves `Content-Type: text/event-stream` for SSE
- Error handling with proper HTTP status codes
- CORS headers if needed

**Example Flow:**
```
Client: POST /api/proxy/api/arena/battle
  ↓
Proxy Route: Forwards to ARENA_API_BASE + /api/arena/battle
  ↓
Backend: Processes request, returns SSE stream
  ↓
Proxy: Streams response back to client
```

**AI Instructions:**
- Do not modify request body or headers unnecessarily
- Preserve streaming responses for SSE (text/event-stream)
- Add authentication headers if backend requires them
- Log request/response errors for debugging

---

## Environment Variables

**Used by `app/` routes:**

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Login, auth flows | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side auth | Public authentication key |
| `NEXT_PUBLIC_ALLOWED_DOMAINS` | Register page | Email domain allowlist (optional) |
| `ARENA_API_BASE` | API proxy route | Backend URL for proxying |

**AI Instructions:**
- All `NEXT_PUBLIC_*` variables are exposed to browser
- Never commit `.env.local` to git
- Set production vars via Vercel Environment Variables

---

## Server vs. Client Components

### Server Components (Default)

All files are server components unless marked with `'use client'`.

**Use when:**
- Fetching data from Supabase
- Accessing secrets/service keys
- Reading environment variables
- Rendering layout structure

**Example:**
```typescript
// app/chat/[id]/page.tsx - Server Component
export default async function ChatDetailPage({ params }: Props) {
  const supabase = createSupabaseServerClient();
  const { data: votes } = await supabase.from('votes').select('*').eq('id', params.id);

  return <ChatDetail votes={votes} />;
}
```

### Client Components

Mark with `'use client'` directive for interactivity.

**Use when:**
- Adding event listeners (onClick, onChange)
- Using React hooks (useState, useEffect)
- Streaming data in real-time (useBattleStream)
- Accessing browser APIs

**Example:**
```typescript
'use client';

export function BattleClient() {
  const { stream, startBattle } = useBattleStream();

  return <div onClick={() => startBattle(prompt)}>Start Battle</div>;
}
```

**AI Instructions:**
- Keep client components small and focused
- Lift data fetching to server components
- Pass fetched data as props to client components

---

## Routing Patterns

### Static Routes

```
/                     → page.tsx
/battle               → battle/page.tsx
/history              → history/page.tsx
/login                → login/page.tsx
/register             → register/page.tsx
```

### Dynamic Routes

```
/chat/[id]            → chat/[id]/page.tsx (matches /chat/abc123)
```

**AI Instructions:**
- Dynamic segments in square brackets [id]
- Access via `params` prop in page component
- Validate param types and permissions

### API Routes

```
/api/proxy/api/arena/battle        → Proxied to ARENA_API_BASE
/api/proxy/api/arena/vote          → Proxied to ARENA_API_BASE
/api/proxy/...                      → Catch-all proxy pattern
```

**AI Instructions:**
- API routes are in `/api/` subdirectories
- Use [...path] catch-all for proxying
- Return proper HTTP status codes and Content-Type headers

---

## Authentication & Authorization

### Server-Side Auth Check

```typescript
// In server component
const supabase = createSupabaseServerClient();
const { data: { user }, error } = await supabase.auth.getUser();

if (!user) {
  redirect('/login'); // Redirect to login
}
```

### Middleware Protection

```typescript
// middleware.ts protects routes
export const config = {
  matcher: ['/battle', '/chat/:path*', '/history']
};

// Unauthenticated users redirected to /login
```

**AI Instructions:**
- Always fetch user on server side, not client
- Protect routes via middleware.ts, not page components
- Use Supabase server client for secure operations

---

## Common Development Patterns

### Adding a New Page

1. Create directory: `app/newpage/`
2. Add `page.tsx` with server/client component
3. Next.js automatically creates route `/newpage`
4. Add to middleware.ts if protected

**Example:**
```typescript
// app/newpage/page.tsx
export default function NewPage() {
  return <div>New Page</div>;
}
```

### Protecting a Route

Add to `middleware.ts`:
```typescript
export const config = {
  matcher: ['/protected-route']
};

// Middleware will check auth before rendering
```

### Fetching Backend Data

```typescript
// Server component
const response = await fetch('ARENA_API_BASE/api/arena/endpoint');
const data = await response.json();

return <Component data={data} />;
```

### Streaming Backend Response

```typescript
// API proxy handles streaming automatically
// Client calls: /api/proxy/api/arena/battle
// Proxy detects text/event-stream and streams back
```

---

## Error Handling

### Page-Level Errors

Use `error.tsx` for error boundaries:
```typescript
'use client';

export default function Error({ error, reset }: ErrorProps) {
  return <div>Error: {error.message}</div>;
}
```

### API Errors

Return proper HTTP status codes:
```typescript
// In route handler
if (!data) {
  return Response.json(
    { error: 'Not found' },
    { status: 404 }
  );
}
```

### Auth Errors

Middleware catches auth errors and redirects:
```typescript
// User not authenticated → redirected to /login by middleware
```

---

## Performance Optimization

### Static Generation

Use `revalidate` for incremental static regeneration:
```typescript
export const revalidate = 3600; // Revalidate every hour
```

### Dynamic Rendering

Force dynamic rendering for user-specific content:
```typescript
export const dynamic = "force-dynamic";
```

### Streaming

Server components automatically support streaming:
```typescript
// Components render as they load
<Suspense fallback={<Loading />}>
  <DataComponent />
</Suspense>
```

---

## Code Standards & Patterns

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Page files | `page.tsx` | `app/battle/page.tsx` |
| Dynamic segments | Square brackets | `[id]`, `[slug]` |
| Catch-all segments | Triple dots | `[...path]` |
| Layout files | `layout.tsx` | `app/layout.tsx` |
| Error boundaries | `error.tsx` | `app/error.tsx` |

### TypeScript Types

```typescript
// Page params
interface Props {
  params: { id: string };
  searchParams?: Record<string, string | string[]>;
}

// Response types
export const metadata: Metadata = { /* ... */ };
```

### Imports

```typescript
// Absolute imports using @ alias
import { createClient } from '@/utils/supabase/client';
import { BattleClient } from '@/components/BattleClient';

// Next.js imports
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
```

---

## Testing & Verification

### Build Verification

```bash
npm run build
# Catches TypeScript errors and rendering issues
```

### Development Testing

```bash
npm run dev
# Test routes at http://localhost:3000/
```

### Type Checking

```bash
npm run build
# Full TypeScript type checking
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Page not found (404) | Wrong directory structure | Check Next.js routing conventions |
| Middleware not protecting | Wrong route matcher | Update config.matcher in middleware.ts |
| SSE not streaming | API response not streamed | Check proxy route handles Content-Type |
| Auth state not updating | Server-side fetch | Use new Supabase client per request |
| Vercel build fails | TypeScript errors | Run `npm run build` locally to debug |

### Debug Tips

```typescript
// Log during build
console.log('Page rendering:', params);

// Check environment at runtime
console.log('ARENA_API_BASE:', process.env.ARENA_API_BASE);

// Verify route matching
// Next.js CLI shows matched routes: npm run dev
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend overview
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide

**Configuration Files:**
- `next.config.mjs` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `middleware.ts` - Route protection and redirects

**Related Directories:**
- `/home/ranthaha1/echat-arena/web/components/` - Reusable UI components
- `/home/ranthaha1/echat-arena/web/utils/` - Utility functions

---

## Quick Reference: Next.js App Router

```bash
# Development
npm run dev                 # Start dev server

# Building
npm run build              # TypeScript check + build

# Linting
npm run lint               # ESLint check
```

**Key Files:**
- `page.tsx` - Page component
- `layout.tsx` - Layout wrapper
- `route.ts` - API route handler
- `error.tsx` - Error boundary
- `loading.tsx` - Loading state

**Route Patterns:**
- `/path/page.tsx` → Route: `/path`
- `/[id]/page.tsx` → Route: `/123` (dynamic)
- `/api/route.ts` → API: `/api/` endpoint
- `/[...path]/route.ts` → Catch-all API

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent:** `../AGENTS.md`

**Recent Changes:**
- Next.js 14 App Router implementation
- Multi-turn conversation support
- SSE streaming via API proxy
- Supabase authentication integration

---

**Maintain Clarity:** Update this guide when adding new pages, routes, or changing routing patterns. Document any custom middleware or route behaviors.
