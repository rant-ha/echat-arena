<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# web/components/admin/ — Shared Admin UI Components

## Purpose
Reusable React components shared across the admin dashboard pages. Provides consistent navigation and metric display patterns.

## Key Files
| File | Description |
|------|-------------|
| `AdminSidebar.tsx` | Admin navigation sidebar with 9 nav items (dashboard, users, sessions, models, statistics, conversations, leaderboard, analytics), i18n support via `useI18n`, active route highlighting, collapsible on mobile |
| `StatsCard.tsx` | Reusable metric card component with icon, title, value (auto-formatted with `toLocaleString`), optional description, trend indicator, and accent color prop |

## For AI Agents

### Working In This Directory
- Both components use `"use client"` directive and `useI18n()` hook.
- `StatsCard` accepts `LucideIcon` as `icon` prop — import icons from `lucide-react`.
- `AdminSidebar` nav items are defined inline; add new admin pages here.
- All user-visible text must go through `t()` translation function.
- Components use Tailwind CSS with project's custom design tokens (`text-text-primary`, `bg-surface-secondary`, etc.).

## Dependencies

### Internal
- `@/components/ui` — `cn()` utility for class merging
- `@/utils/i18n-context` — `useI18n` hook for translations

### External
- **lucide-react** — Icon components
