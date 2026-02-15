<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 | Updated: 2026-02-15 -->

# web/app/ - Pages, Layouts & API Routes

## Purpose

Next.js 14 App Router directory containing all user-facing pages, auth routes, admin dashboard, and the critical API proxy that bridges frontend to FastAPI backend. Handles SSE streaming chat, voting flow, post-vote chat, conversation history, and admin model/session management.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Root layout: dark theme, global styles, Vercel analytics/speed insights |
| `page.tsx` | Home page server component; fetches user auth, renders HomeClient |
| `HomeClient.tsx` | Client component; conditional nav to `/battle` or `/login` |
| `globals.css` | Tailwind directives + CSS variables (design tokens for theme colors) |
| `battle/page.tsx` | Main dual-model A/B battle page; SSE streaming, multi-turn, voting |
| `chat/[id]/page.tsx` | Post-vote chat continuation with winning model |
| `draft/[session_id]/page.tsx` | Resume unfinished draft conversations |
| `history/page.tsx` | User conversation history list |
| `login/page.tsx` | Supabase email auth entry point |
| `login/LoginClient.tsx` | Email login form with signup link |
| `register/page.tsx` | User registration with optional domain allowlist |
| `auth/verify/page.tsx` | Email verification callback |
| `auth/error/page.tsx` | Auth error display page |
| `admin/page.tsx` | Admin dashboard home |
| `admin/layout.tsx` | Admin layout with sidebar, auth guard, I18nProvider |
| `admin/login/page.tsx` | Admin login (separate from user auth) |
| `admin/models/page.tsx` | List all AI models |
| `admin/models/new/page.tsx` | Create new model config |
| `admin/models/[id]/page.tsx` | Edit existing model |
| `admin/users/page.tsx` | List all users |
| `admin/sessions/page.tsx` | List all battle sessions |
| `admin/statistics/page.tsx` | Dashboard stats and charts (recharts) |
| `admin/conversations/page.tsx` | Conversation viewer with search, filter, CSV export |
| `admin/leaderboard/page.tsx` | Strategy ranking with Elo ratings, statistical significance |
| `admin/analytics/page.tsx` | Combined analytics dashboard (leaderboard + detailed stats) |
| `error.tsx` | Global error boundary page |
| `not-found.tsx` | 404 page |
| `providers.tsx` | Client providers wrapper (I18nProvider) |
| `api/proxy/[...path]/route.ts` | Catch-all proxy handler; forwards all methods to `ARENA_API_BASE` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `admin/` | Admin dashboard: models CRUD, user management, session analytics, conversations, leaderboard, analytics (see `admin/AGENTS.md`) |
| `admin/login/` | Admin authentication (separate from user auth) |
| `admin/models/` | Model CRUD pages: list, new, edit |
| `admin/users/` | User management page |
| `admin/sessions/` | Battle session analytics page |
| `admin/statistics/` | Overall platform statistics with recharts |
| `admin/conversations/` | Conversation viewer with search, filter, Markdown, CSV export |
| `admin/leaderboard/` | Strategy ranking table with Elo ratings and statistical significance |
| `admin/analytics/` | Combined analytics dashboard (leaderboard + detailed stats) |
| `auth/` | Auth callback routes: OAuth, email verify, Google redirect, error (see `auth/AGENTS.md`) |
| `battle/` | Battle page client component |
| `chat/[id]/` | Post-vote chat continuation |
| `draft/[session_id]/` | Draft conversation resume |
| `history/` | User conversation history |
| `login/` | Login page and client |
| `register/` | Registration page |
| `api/proxy/` | Backend proxy route (see `api/proxy/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- **Server vs. Client Components**: Pages are server components by default. Add `"use client"` only for interactive components needing hooks or event listeners.
- **Dynamic Routes**: Use `params` prop to access route segments. Example: `params.id` from `[id]`, `params.session_id` from `[session_id]`.
- **Auth Flow**: `page.tsx` server component fetches user via `createSupabaseServerClient()`, then passes to `HomeClient` to decide navigation.
- **API Proxy**: All backend requests route through `/api/proxy/[...path]/route.ts`. Never fetch `ARENA_API_BASE` directly from client or server.
- **SSE Streaming**: `battle/page.tsx` uses `useBattleStream` hook to consume streaming frames from `/api/proxy/api/arena/battle`.
- **Admin Auth**: Admin routes use `useAdminAuth` hook (separate header-based auth) independent of Supabase user auth.
- **Design Tokens**: `globals.css` defines CSS variables consumed by `tailwind.config.ts` for dark mode theming.

### Testing Requirements

```bash
# Type check
npx tsc --noEmit

# Build (includes route validation)
npm run build

# Dev server with hot reload
npm run dev

# Lint
npm run lint
```

### Common Patterns

- **Server -> Client Split**: Server page fetches auth or data, passes immutable props to `*Client.tsx` component.
- **SSE Consumption**: Battle page opens EventSource to `/api/proxy/api/arena/battle`; hook parses frames: `{side, delta, finish, ...meta}`.
- **Navigation**: Use `redirect()` (server) or `useRouter().push()` (client) to navigate.
- **Error Pages**: `auth/error/page.tsx` displays error messages from auth callback.
- **Admin Separation**: Admin pages require `admin-token` header, separate from user Supabase auth.

## Dependencies

### Internal

- `@/components/*` -- Shared UI components (ResponseCard, VoteButtons, PromptInput, etc.)
- `@/hooks/*` -- Custom hooks (useBattleStream, useAdminAuth)
- `@/utils/supabase/*` -- Supabase client factories

### External

- **next 14**: App Router, server/client components, routing, redirect
- **react 18**: Hooks, client components
- **@supabase/ssr**: Auth, client factory with cookie sync
- **framer-motion**: Animations
- **lucide-react**: Icons
- **@vercel/analytics, @vercel/speed-insights**: Monitoring
