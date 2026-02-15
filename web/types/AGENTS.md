<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# web/types/ — Shared TypeScript Type Definitions

## Purpose
Centralized TypeScript interfaces shared across multiple admin pages. Eliminates type duplication between leaderboard, analytics, and statistics pages.

## Key Files
| File | Description |
|------|-------------|
| `admin.ts` | 13 shared interfaces: `LeaderboardEntry`, `LeaderboardStatistics`, `LeaderboardData`, `Period`, `ModelPerformance`, `StrategyOverview`, `UserFunnel`, `AvgSession`, `HourlyItem`, `DayOfWeekItem`, `TopPrompt`, `DetailedStats`, `VoteDistribution` |

## For AI Agents

### Working In This Directory
- When adding new admin API response types, define them here and import from `@/types/admin`.
- Keep interfaces aligned with backend response shapes from `arena/routes/admin/`.
- `Period` type is `"1d" | "7d" | "30d" | "all"` — used by multiple pages.

## Dependencies

### Internal
- Used by: `web/app/admin/leaderboard/page.tsx`, `web/app/admin/analytics/page.tsx`, `web/app/admin/statistics/page.tsx`
