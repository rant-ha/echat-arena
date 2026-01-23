# web/ - Frontend Application

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 Frontend (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `web/` directory contains the Next.js 14 frontend application for the echat-arena project. It provides the user-facing UI for anonymous multi-turn AI chat comparisons with emotion classification and voting functionality.

**Key Responsibility:** Deliver responsive, real-time chat interface with SSE streaming support and Supabase authentication.

---

## Directory Structure

```
web/
├── app/                           # Next.js 14 App Router pages and layouts
│   ├── page.tsx                   # Home/landing page
│   ├── layout.tsx                 # Root layout with providers
│   ├── globals.css                # Global Tailwind CSS
│   ├── battle/
│   │   └── page.tsx               # Main arena battle page (LMArena UI)
│   ├── chat/[id]/
│   │   └── page.tsx               # History chat detail view
│   ├── history/
│   │   └── page.tsx               # User conversation history listing
│   ├── login/
│   │   ├── page.tsx               # Login page wrapper
│   │   └── LoginClient.tsx        # Client-side login logic
│   ├── register/
│   │   └── page.tsx               # User registration page
│   ├── api/proxy/
│   │   └── [...path]/route.ts     # Proxy for upstream backend API
│   └── HomeClient.tsx             # Home page client component
├── components/                    # Reusable React components
│   ├── AIResponseCard.tsx         # Model response display with streaming
│   ├── ResponseCard.tsx           # Generic response container
│   ├── UserMessageBubble.tsx      # User message display
│   ├── ConversationTurnBlock.tsx  # Reusable turn display (multi-turn)
│   ├── PromptInput.tsx            # User input area with multi-turn support
│   ├── VoteButtons.tsx            # Vote collection interface
│   ├── Sidebar.tsx                # Navigation sidebar
│   ├── TurnstileCaptcha.tsx       # CAPTCHA component
│   └── ui.tsx                     # UI utility components
├── hooks/                         # Custom React hooks
│   └── useBattleStream.ts         # SSE streaming for battle endpoint
├── utils/                         # Utility functions
│   └── supabase/
│       ├── client.ts              # Supabase client (browser)
│       └── server.ts              # Supabase client (server)
├── middleware.ts                  # Next.js middleware for auth/routing
├── package.json                   # Dependencies and scripts
├── package-lock.json              # Dependency lock file
├── tsconfig.json                  # TypeScript configuration
├── next.config.mjs                # Next.js configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── postcss.config.js              # PostCSS configuration
├── .env.example                   # Environment variables template
├── .eslintrc.json                 # ESLint configuration
├── .gitignore                     # Git ignore rules
├── next-env.d.ts                  # Next.js type definitions
├── README.md                       # Frontend README
└── AGENTS.md                       # This file
```

---

## Core Technologies

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14.2.8 | React framework with App Router |
| React | 18.2.0 | UI library |
| TypeScript | 5.4.5 | Type safety |
| Tailwind CSS | 3.4.3 | Utility-first CSS framework |
| Supabase | 2.45.4 | Authentication and database client |
| Framer Motion | 11.0.0 | Animation library |
| Lucide React | 0.452.0 | Icon library |
| SWR | 2.2.5 | Data fetching and caching |

---

## Key Subdirectories & Responsibilities

### `app/` - Pages & API Routes

**Responsibility:** Define page routes, layouts, and server-side API endpoints using Next.js 14 App Router

**Key Files:**

| File | Purpose |
|------|---------|
| `page.tsx` | Home page (landing or redirect to /battle) |
| `layout.tsx` | Root layout with global providers and styling |
| `battle/page.tsx` | Main arena comparison page |
| `chat/[id]/page.tsx` | History detail view for specific conversation |
| `history/page.tsx` | List all user conversations |
| `login/page.tsx` | Login page wrapper |
| `register/page.tsx` | Registration page |
| `api/proxy/[...path]/route.ts` | API proxy to backend |

**AI Instructions:**
- All pages are Server Components by default
- Use `'use client'` directive for client-side interactivity
- Keep API routes in `/api/` subdirectories
- Use `middleware.ts` for auth enforcement, not API routes

### `components/` - Reusable Components

**Responsibility:** Provide modular, reusable UI components

**Core Components:**

| Component | Purpose |
|-----------|---------|
| `AIResponseCard.tsx` | Displays model response with streaming support |
| `ConversationTurnBlock.tsx` | Renders single multi-turn conversation turn (user + two AI responses) |
| `PromptInput.tsx` | Text input area for user prompts and multi-turn support |
| `VoteButtons.tsx` | Vote collection interface (left/right/tie buttons) |
| `UserMessageBubble.tsx` | User message bubble display |
| `Sidebar.tsx` | Navigation and menu sidebar |
| `TurnstileCaptcha.tsx` | CAPTCHA verification component |

**Design Pattern:** All components accept props, avoid global state when possible. Use React hooks for local state.

### `hooks/` - Custom React Hooks

**Responsibility:** Encapsulate reusable logic for specific features

**Key Hook:**

| Hook | Purpose |
|------|---------|
| `useBattleStream.ts` | SSE streaming for battle endpoint with reconnection logic |

**Pattern:** Named `use*` following React conventions. Handle loading, error, and success states.

### `utils/supabase/` - Database Clients

**Responsibility:** Provide Supabase client instances for browser and server environments

| File | Purpose |
|------|---------|
| `client.ts` | Browser client (uses anonymous key) |
| `server.ts` | Server client (uses service role key for mutations) |

**Usage:**
- Import `createClient` from `client.ts` in browser components
- Use `server.ts` in Server Components for auth operations
- Never expose service role key to browser

---

## Environment Variables

**File:** `.env.example` and `.env.local` (not in git)

### Required Variables

```env
# Backend API
ARENA_API_BASE=https://echat-arena-backend.herokuapp.com

# Supabase Authentication
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Email domain allowlist
NEXT_PUBLIC_ALLOWED_DOMAINS=.edu.cn,.ac.uk

# Optional: CAPTCHA
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key

# Optional: Analytics
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=your-analytics-id
```

**AI Instructions:**
- All `NEXT_PUBLIC_*` variables are exposed to browser (safe for public keys only)
- Never put secret keys in `NEXT_PUBLIC_*` variables
- Use `.env.local` for local development (never commit)
- Deploy-time variables set via Vercel Environment Variables

---

## Configuration Files

### `next.config.mjs`

Next.js configuration for build and runtime behavior.

**Key Sections:**
- Redirects and rewrites for API proxy
- Image optimization
- TypeScript strict mode
- Bundle analysis (optional)

### `tailwind.config.ts`

Tailwind CSS configuration with custom colors, spacing, and typography plugins.

**AI Instructions:**
- Update `theme` section for custom design tokens
- Add plugins (e.g., `@tailwindcss/typography`) as needed
- Keep responsive breakpoints consistent

### `tsconfig.json`

TypeScript strict mode configuration.

**Key Settings:**
- `strict: true` - Full type checking
- `esModuleInterop: true` - CommonJS/ESM compatibility
- `paths: { "@/*": ["./"] }` - Path aliases

### `middleware.ts`

Next.js middleware for auth and routing logic.

**Responsibility:** Enforce authentication on protected routes before rendering

**Usage:**
- Protect `/battle`, `/chat`, `/history` routes
- Allow public access to `/`, `/login`, `/register`
- Redirect unauthenticated users to login

---

## API Integration & Streaming

### Backend Proxy

**Path:** `/api/proxy/[...path]`

**Purpose:** Proxy all upstream backend requests through Next.js

**Example Usage:**
```typescript
// Frontend calls proxy
fetch('/api/proxy/api/arena/battle', {
  method: 'POST',
  body: JSON.stringify({ prompt: '...', session_id: '...' })
})

// Proxy forwards to backend
// https://echat-arena-backend.herokuapp.com/api/arena/battle
```

**Key Feature:** Proxy preserves SSE streaming for real-time responses

### SSE Streaming Hook

**File:** `hooks/useBattleStream.ts`

**Usage:**
```typescript
const { stream, loading, error, restart } = useBattleStream(prompt, sessionId);

// Use stream for real-time model responses
stream.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  // Handle: type="stream" (delta), type="done" (final)
});
```

**AI Instructions:**
- Handle 3 event types: `stream` (delta), `done` (final), `error`
- Implement reconnection logic for dropped connections
- Set timeout for connection establishment (30s default)

---

## Design System & Styling

### Tailwind CSS

**File:** `tailwind.config.ts`

**Approach:** Utility-first CSS with custom theme extensions

**Common Patterns:**
```tsx
// Responsive design
<div className="w-full md:w-1/2 lg:w-1/3">

// Conditional styles
<div className={cn("p-4", isActive && "bg-blue-100")}>

// Dark mode (if configured)
<div className="bg-white dark:bg-gray-900">
```

### Component Organization

**Structure:**
- One component per file
- Lowercase filename matching component name
- Props interface defined at top
- Component export at bottom

**Example:**
```typescript
// components/MyComponent.tsx
interface MyComponentProps {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: MyComponentProps) {
  return <div onClick={onClick}>{title}</div>;
}
```

---

## State Management

### React Hooks (Primary)

**Approach:** Use React hooks for local component state

```typescript
'use client';

import { useState } from 'react';

export function MyComponent() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### SWR for Data Fetching

**Usage:**
```typescript
import useSWR from 'swr';

const { data, error, isLoading } = useSWR('/api/endpoint', fetcher);
```

**Pattern:** Use for GET requests with automatic caching and revalidation

---

## Building & Deployment

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# Access at http://localhost:3000

# Lint code
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

### Production Build

**File:** `.next/` (generated)

**Process:**
1. Run `npm run build` to compile TypeScript and bundle
2. Next.js generates optimized static/dynamic assets
3. Deploy `.next/` and dependencies to Vercel

### Vercel Deployment

**Configuration:**
- Connect GitHub repository to Vercel
- Set environment variables from `.env.example`
- Auto-deploy on push to main branch
- Access deployed app at `https://<project>.vercel.app`

**AI Instructions:**
- Keep `package.json` scripts consistent for build:
  - `npm run dev` - Local development
  - `npm run build` - Production build
  - `npm start` - Production server
  - `npm run lint` - Code quality check

---

## Code Standards & Patterns

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| React Components | PascalCase | `MyComponent.tsx` |
| Utility Functions | camelCase | `formatDate()` |
| Custom Hooks | `use*` Prefix | `useBattleStream.ts` |
| Constants | UPPER_CASE | `const MAX_RETRIES = 3;` |
| CSS Classes | kebab-case | `my-component-wrapper` |

### File Organization

**Component File Structure:**
```typescript
// Imports
import { ReactNode } from 'react';

// Types
interface Props {
  children: ReactNode;
  isActive?: boolean;
}

// Component
export function MyComponent({ children, isActive = false }: Props) {
  return <div className={isActive ? 'bg-blue-100' : ''}>{children}</div>;
}
```

### Error Handling

**Pattern:**
```typescript
try {
  const response = await fetch('/api/endpoint');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
} catch (error) {
  console.error('Request failed:', error);
  throw error; // Let component handle or show UI error state
}
```

### Type Safety

**Rules:**
- Use TypeScript strict mode (configured in `tsconfig.json`)
- Define interfaces for component props
- Avoid `any` type
- Use discriminated unions for complex state

---

## Multi-Turn Conversation Flow

### User Experience

1. **Turn 1:**
   - User enters prompt
   - Both models generate responses simultaneously
   - Responses stream via SSE

2. **Turns 2+:**
   - User can continue typing follow-up
   - Each model uses its own context history
   - Responses displayed as new turn block

3. **Voting:**
   - User selects winner (left/right/tie)
   - Full conversation history sent to backend
   - Vote recorded with `turn_count`

4. **Post-Vote Chat (Optional):**
   - User can continue chatting with winning model
   - Stored separately (doesn't affect vote data)

### Component Integration

**Flow:**
```
BattleClient (main page)
  ├─ PromptInput (collect user input)
  ├─ ConversationTurnBlock × N (display turns)
  │   ├─ UserMessageBubble
  │   ├─ AIResponseCard (left model)
  │   └─ AIResponseCard (right model)
  ├─ VoteButtons (collect vote)
  └─ PostVoteChat (optional continuation)
```

---

## Common Development Tasks

### Adding a New Page

1. Create directory under `app/` (e.g., `app/newpage/`)
2. Add `page.tsx` in that directory
3. Next.js automatically creates route `/newpage`
4. Use `middleware.ts` to protect if needed

### Adding a New Component

1. Create file in `components/` (e.g., `MyButton.tsx`)
2. Define Props interface
3. Export component as default or named export
4. Import in page or parent component

### Working with Supabase Auth

```typescript
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();
const { data, error } = await supabase.auth.getSession();
```

### Calling Backend API

```typescript
// Via proxy
const response = await fetch('/api/proxy/api/arena/battle', {
  method: 'POST',
  body: JSON.stringify({ prompt, session_id })
});

// Handle SSE streaming
const reader = response.body?.getReader();
// Read chunks as they arrive
```

---

## Testing & Linting

### ESLint

**Command:** `npm run lint`

**Configuration:** `.eslintrc.json`

**Fixes common issues:**
- Unused imports
- Type errors
- React best practices

### TypeScript Check

**Build:** `npm run build`

Catches type errors before deployment.

**AI Instructions:**
- Fix TypeScript errors before committing
- Use strict mode for maximum type safety
- Define types for all function parameters

---

## Performance Optimization

### Image Optimization

Use Next.js `Image` component for automatic optimization:

```typescript
import Image from 'next/image';

<Image
  src="/path/to/image.png"
  alt="Description"
  width={400}
  height={300}
/>
```

### Code Splitting

Next.js automatically splits code per route. Use dynamic imports for lazy loading:

```typescript
import dynamic from 'next/dynamic';

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>Loading...</p>
});
```

### Caching Strategy

**Static:** Use `generateStaticParams` for pre-rendering routes
**Dynamic:** Use SWR for client-side data fetching with caching

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot find module" | Import path incorrect | Check `tsconfig.json` paths alias |
| SSE connection drops | Network timeout | Increase timeout in `useBattleStream` |
| Build fails with TS errors | Type mismatch | Run `npm run build` to see errors |
| Supabase auth not working | Missing env vars | Check `.env.local` has correct keys |
| Proxy returns 404 | Backend URL wrong | Verify `ARENA_API_BASE` in env |

### Debug Tips

```typescript
// Check environment variables at runtime
console.log('ARENA_API_BASE:', process.env.NEXT_PUBLIC_SUPABASE_URL);

// Log component renders (dev only)
console.log('MyComponent rendered at', new Date().toISOString());

// Inspect SSE stream
stream.addEventListener('error', (e) => console.error('SSE error:', e));
```

---

## Related Documentation

**Root Project:**
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide
- `/home/ranthaha1/echat-arena/README.md` - Project overview

**Subdirectories:**
- `README.md` - Frontend-specific README
- `.env.example` - Environment variables template

**Backend & Database:**
- `/home/ranthaha1/echat-arena/app.py` - Backend API implementation
- `/home/ranthaha1/echat-arena/migrations/` - Database schema
- `/home/ranthaha1/echat-arena/plans/` - Implementation plans

---

## Quick Reference: Essential Commands

```bash
# Development
npm install                 # Install dependencies
npm run dev                 # Start dev server (http://localhost:3000)
npm run lint               # Check code quality
npm run build              # Build for production

# Production
npm start                  # Run production server
npm run build && npm start # Build then run

# Debugging
echo $NEXT_PUBLIC_SUPABASE_URL  # Check env vars
npm run build --debug          # Build with debug output
```

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Recent Changes:**
- Migrated to Next.js 14 App Router
- Added multi-turn conversation support
- Integrated Supabase authentication
- Implemented SSE streaming for real-time responses

---

**Maintain Clarity:** Keep this guide updated as new features are added. Document all new subdirectories and key components.
