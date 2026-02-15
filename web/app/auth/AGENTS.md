<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# web/app/auth/ — Authentication Callback Routes

## Purpose
Server-side auth callback routes handling Supabase email verification, Google OAuth redirects, and auth error display. These routes process auth tokens from external providers and establish user sessions via Supabase cookies.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `callback/` | OAuth callback handler (`route.ts`): exchanges auth code for session, sets cookies, redirects to home |
| `error/` | Auth error display page (`page.tsx`): shows error messages from failed auth attempts |
| `google-redirect/` | Google OAuth redirect handler (`route.ts`): processes Google GSI credential, exchanges for Supabase session |
| `verify/` | Email verification handler (`route.ts`): confirms email verification tokens |

## For AI Agents

### Working In This Directory
- All route handlers use `createSupabaseServerClient()` for server-side auth operations.
- `callback/route.ts` and `google-redirect/route.ts` are POST handlers that MUST redirect with status 303 (not default 307) to avoid POST method preservation on redirects.
- Google GSI `login_uri` must exactly match Google Console Authorized redirect URIs (no query params).
- Cookie handling: `cookies()` in Route Handlers auto-merges to response (including redirects).

### Common Patterns
- POST → 303 redirect pattern for auth callbacks.
- Error handling: redirect to `/auth/error?message=...` on failure.
- Supabase token exchange: `supabase.auth.exchangeCodeForSession(code)`.

## Dependencies

### Internal
- `@/utils/supabase/server` — Server-side Supabase client factory

### External
- **@supabase/ssr** — Server-side auth with cookie sync
- **next/headers** — Cookie access in Route Handlers
