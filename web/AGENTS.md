<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

# web/ - Next.js 14 Frontend

## Purpose

Next.js 14 frontend for eChat Arena, a dual-model A/B testing platform for empathic AI support. Provides real-time SSE streaming chat interface, vote collection UI, admin dashboard, and Supabase auth integration. Communicates with FastAPI backend via proxy route at `/api/proxy/`.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Dependencies: Next.js 14, React 18, Tailwind CSS, Supabase, framer-motion, react-markdown |
| `tsconfig.json` | Strict TypeScript config; path aliases `@/*`, `@/app/*`, `@/utils/*` |
| `next.config.mjs` | Minimal config; strict mode enabled |
| `tailwind.config.ts` | Custom Zinc-based theme with CSS variables for dark mode |
| `app/layout.tsx` | Root layout; dark mode, global styles, Vercel Analytics/Speed Insights |
| `app/page.tsx` | Home page (server component); checks user auth, renders HomeClient |
| `app/globals.css` | Global styles; CSS variable definitions for theme |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js 14 App Router; pages, layouts, API routes (see `app/AGENTS.md`) |
| `components/` | Reusable React components for chat, voting, markdown rendering (see `components/AGENTS.md`) |
| `hooks/` | Custom React hooks: `useBattleStream`, `useAdminAuth` (see `hooks/AGENTS.md`) |
| `utils/` | Utility modules: Supabase client/server factories (see `utils/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- **TypeScript Strict Mode**: All files must pass `tsc` type checking. Path aliases are configured in `tsconfig.json`.
- **Client vs. Server Components**: Use `"use client"` directive for interactive components. Server-only code in `app/` layout/page files.
- **Tailwind CSS**: Use custom CSS variable colors (`surface-primary`, `text-primary`, `interactive-accent`, etc.) from `tailwind.config.ts`.
- **Next.js 14 App Router**: Routes map to `app/` directory structure. Dynamic routes use `[param]` or `[...path]` syntax.
- **Supabase Auth**: Use `createSupabaseServerClient()` on server, `createSupabaseBrowserClient()` on client. Auth state is session-based via cookies.
- **API Proxy**: All backend requests route through `/api/proxy/` catch-all handler. No direct fetch to `ARENA_API_BASE`.
- **SSE Streaming**: Battle responses stream via Server-Sent Events. Hook: `useBattleStream` parses frames with schema `{side, delta, finish, ...meta}`.

### Testing Requirements

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build (verifies no runtime errors)
npm run build

# Dev server
npm run dev   # http://localhost:3000
```

### Common Patterns

- **Dark Mode**: All UI must respect `html.dark` class and use Tailwind dark variants.
- **Markdown + Math**: ResponseCard uses MarkdownRenderer which handles LaTeX (`$...$`, `$$...$$`) and code highlighting.
- **Virtualized Lists**: ResponseCard uses react-window for long conversation histories; large responses may scroll.
- **Animation**: Framer-motion wraps card reveals, vote buttons, and transitions.
- **Error Boundaries**: Not implemented yet; frontend relies on try-catch in hooks and fallback UI.

## Dependencies

### Internal

- `@/utils/supabase/*` -- Supabase client factories
- `@/components/*` -- Shared UI components
- `@/hooks/*` -- Custom React hooks
- `@/app/*` -- Pages and layout structure

### External

- **Next.js 14**: Framework, SSR, routing
- **React 18**: UI library
- **Tailwind CSS 3.4**: Styling with dark mode
- **@supabase/ssr 0.4**: Auth and client factory (handles cookie sync)
- **framer-motion 11**: Animations
- **react-markdown 9**: Markdown rendering
- **lucide-react 0.452**: Icon library
- **@marsidev/react-turnstile**: CAPTCHA widget (Cloudflare)
- **@vercel/analytics**, **@vercel/speed-insights**: Performance monitoring
- **rehype-highlight, rehype-katex, remark-gfm, remark-math**: Markdown plugins

### Build & Dev

- **TypeScript 5.9**: Language
- **ESLint 8 + next**: Linting
- **Tailwind CSS plugins**: typography
- **PostCSS, Autoprefixer**: CSS processing
