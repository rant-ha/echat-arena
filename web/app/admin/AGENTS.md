<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# web/app/admin/ — Admin Dashboard

## Purpose
Admin dashboard for managing and monitoring the eChat Arena platform. Provides model management, user oversight, session analytics, conversation viewing, strategy leaderboard, and comprehensive data analytics. Protected by header-based admin-token authentication (separate from user Supabase auth).

## Key Files
| File | Description |
|------|-------------|
| `layout.tsx` | Admin layout: sidebar navigation, auth guard (redirects to /admin/login if no token), I18nProvider wrapper |
| `page.tsx` | Admin home page; redirects to /admin/statistics |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `analytics/` | Combined analytics dashboard: leaderboard + detailed stats, recharts visualizations |
| `conversations/` | Conversation viewer: paginated list, search/filter, Markdown rendering, CSV export |
| `leaderboard/` | Strategy ranking table with Elo ratings, statistical significance, recompute trigger |
| `login/` | Admin login page (admin-token based, not Supabase) |
| `models/` | AI model CRUD: list, create new, edit existing (`[id]/` dynamic route) |
| `sessions/` | Battle session list with pagination and management |
| `statistics/` | Platform statistics dashboard with recharts charts (daily activity, model performance, user funnel) |
| `users/` | User management with details drawer |

## For AI Agents

### Working In This Directory
- All admin pages are client components (`"use client"`).
- Auth: `useAdminAuth()` hook provides `getToken()` — include as `admin-token` header on all API calls.
- API proxy: All backend calls go through `/api/proxy/api/arena/admin/*`.
- i18n: All user-visible text must use `t()` from `useI18n()`. Translation keys in `web/utils/i18n.ts`.
- Shared types: Import from `@/types/admin` (LeaderboardData, DetailedStats, Period, etc.).
- Shared components: `StatsCard` from `@/components/admin/StatsCard`, `SkeletonCard`/`SkeletonTable` from `@/components/Skeleton`.
- Chart constants: Import colors and styles from `@/utils/chart-constants`.
- Loading states: Use `SkeletonCard` and `SkeletonTable` during data fetching.
- Period selector pattern: `["1d", "7d", "30d", "all"]` tabs, consistent across pages.

### Testing Requirements
- `npx tsc --noEmit` — Type check all pages.
- `npm run build` — Verify no build errors.
- Manual: Visit each admin page, test period switching, search, pagination.

### Common Patterns
- Fetch pattern: `useCallback` + `useEffect` with `getToken()` guard, loading/error states.
- Period selector: Rounded button group with `cn()` for active styling.
- Data tables: `<table>` with `border-b border-border-faint` styling, responsive `overflow-x-auto`.
- StatsCards grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` layout.

## Dependencies

### Internal
- `@/hooks/useAdminAuth` — Admin token management
- `@/utils/i18n-context` — Translation system
- `@/types/admin` — Shared TypeScript interfaces
- `@/components/admin/*` — AdminSidebar, StatsCard
- `@/components/Skeleton` — Loading placeholders
- `@/utils/chart-constants` — Chart colors and styles
- `@/components/ui` — cn(), Card, Button

### External
- **recharts** — Charts (LineChart, BarChart, PieChart)
- **lucide-react** — Icons
