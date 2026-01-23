# web/components - Reusable React Components

**Parent:** `../AGENTS.md`
**Type:** React 18 Client Components (TypeScript)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `components/` directory contains reusable React components that power the echat-arena UI. All components are client components and use TypeScript for type safety, Tailwind CSS for styling, and Framer Motion for animations.

**Key Responsibility:** Provide modular, reusable UI building blocks that compose into complete pages and features.

---

## Directory Structure

```
components/
├── AIResponseCard.tsx         # AI model response display with streaming support
├── ResponseCard.tsx           # Generic response container wrapper
├── UserMessageBubble.tsx      # User message display bubble
├── ConversationTurnBlock.tsx  # Reusable turn display (user + AI responses)
├── PromptInput.tsx            # Text input area for user prompts
├── VoteButtons.tsx            # Vote collection interface (left/right/tie)
├── Sidebar.tsx                # Navigation and menu sidebar
├── TurnstileCaptcha.tsx       # Cloudflare Turnstile CAPTCHA component
└── ui.tsx                     # Base UI primitives and utilities
```

---

## Core Technologies

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.2.0 | UI library |
| TypeScript | 5.4.5 | Type safety |
| Tailwind CSS | 3.4.3 | Utility-first styling |
| Framer Motion | 11.0.0 | Animation library |
| Lucide React | 0.452.0 | Icon components |
| React Markdown | - | Markdown rendering |

---

## Key Components & Responsibilities

### `AIResponseCard.tsx` - AI Response Display

**Responsibility:** Render individual AI model response with streaming support and flip animation

**Props Interface:**
```typescript
interface AIResponseCardProps {
  side: "left" | "right";
  anonymousLabel: string;           // "Model A" or "Model B"
  revealed?: ResponseCardReveal;    // Actual model name when revealed
  content: string;                  // Response text (markdown)
  isStreaming: boolean;             // True while streaming
  isRevealed: boolean;              // Flip card to show real model name
  isWinner?: boolean;               // Highlight if voted winner
  isLoser?: boolean;                // Grayscale if voted loser
  judgeScores?: AiJudgeScores;     // Judge evaluation scores
  judgeLoading?: boolean;           // Judge is evaluating
  postVoteTurns?: PostVoteTurn[];  // Post-vote chat continuation
  postVoteCurrentReply?: string;   // Current post-vote response
  isPostVoteChatting?: boolean;    // Streaming post-vote chat
}
```

**Key Features:**
- 3D flip animation between anonymous and revealed views
- Markdown rendering of response content
- Streaming cursor animation (pulse)
- Copy-to-clipboard button
- Green border highlight for winning response
- Grayscale + opacity for losing response
- Post-vote chat display below main response

**Styling:**
- Default: Blue (A) or Purple (B) color scheme
- Winner: Green border ring
- Loser: Grayscale 60% opacity
- Dark mode with prose typography styling

**AI Instructions:**
- Component handles both initial response and post-vote chat
- Streaming state managed by parent via `isStreaming` prop
- All markdown rendering uses react-markdown with custom prose styling
- Copy button uses navigator.clipboard API

### `ResponseCard.tsx` - Response Container

**Responsibility:** Generic wrapper for response display

**Pattern:** Base card component with border, background, and conditional styling

**Use Case:** Generic response containers (not AI-specific)

**AI Instructions:**
- Keep styling generic and reusable
- Accept className prop for customization
- Base component for other card types

### `UserMessageBubble.tsx` - User Message

**Responsibility:** Display user-sent messages in chat

**Features:**
- Right-aligned bubble layout
- Message text wrapped in bubble shape
- Markdown support for user input
- Light background color

**AI Instructions:**
- Simple component, minimal logic
- Accept message text as prop
- Style as right-aligned bubble

### `ConversationTurnBlock.tsx` - Multi-Turn Display

**Responsibility:** Render single conversation turn with user message and both AI responses

**Props Interface:**
```typescript
interface ConversationTurnBlockProps {
  turn: number;
  userMessage: string;
  leftResponse: string;
  rightResponse: string;
  leftDone: boolean;
  rightDone: boolean;
  isStreaming: boolean;
  revealed?: boolean;
  leftWinner?: boolean;
  rightWinner?: boolean;
  // ... other props
}
```

**Key Features:**
- Displays user message at top
- Two-column layout for left/right AI responses
- Each response is AIResponseCard
- Handles multi-turn conversation history
- Responsive grid layout

**Layout:**
```
┌─────────────────────────────────┐
│ User Message (right-aligned)    │
├──────────────────┬──────────────┤
│ Left AI Response │ Right Response│
└──────────────────┴──────────────┘
```

**AI Instructions:**
- Children components (AIResponseCard) handle individual responses
- Container manages layout and spacing
- Pass through reveal state to children

### `PromptInput.tsx` - User Input Area

**Responsibility:** Text input for user prompts with multi-turn support

**Features:**
- Textarea with auto-grow
- Send button (enabled when text present)
- Placeholder text
- Submit on Ctrl+Enter or button click

**Props Interface:**
```typescript
interface PromptInputProps {
  placeholder?: string;
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}
```

**AI Instructions:**
- Handle multi-line input gracefully
- Clear input after submit
- Show loading state while streaming
- Prevent empty submissions

### `VoteButtons.tsx` - Vote Collection

**Responsibility:** Interface for voting on model comparison

**Features:**
- Three buttons: Left, Right, Tie
- Mutually exclusive selection
- Visual indication of selected vote
- Optional voting metadata (emotion, intensity, support)

**Props Interface:**
```typescript
interface VoteButtonsProps {
  onVote: (winner: "left" | "right" | "tie") => void;
  disabled?: boolean;
  selectedVote?: string;
}
```

**UI Pattern:**
```
┌─────────────┬─────────────┬─────────────┐
│ Left Wins   │  It's a Tie │ Right Wins  │
└─────────────┴─────────────┴─────────────┘
```

**AI Instructions:**
- Highlight selected vote
- Disable during submission
- Show loading spinner during voting

### `Sidebar.tsx` - Navigation Sidebar

**Responsibility:** Application navigation and menu

**Features:**
- Links to pages (/battle, /history, /login)
- User info display
- Logout functionality
- Responsive mobile menu (optional)

**AI Instructions:**
- Use Next.js Link for navigation
- Show current page highlight
- Handle responsive breakpoints

### `TurnstileCaptcha.tsx` - CAPTCHA Component

**Responsibility:** Cloudflare Turnstile CAPTCHA verification

**Features:**
- Embed Turnstile widget
- Callback on verification
- Error handling
- Reset capability

**Props Interface:**
```typescript
interface TurnstileCaptchaProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError?: () => void;
}
```

**AI Instructions:**
- Load Turnstile library from CDN
- Store token for submission
- Handle verification expiration

### `ui.tsx` - UI Utilities & Primitives

**Responsibility:** Reusable utility functions and base components

**Common Exports:**

```typescript
// Class name utility for conditional Tailwind classes
export function cn(...classes: (string | undefined | false)[]): string

// Base Button component
export function Button({ ... }: ButtonProps): JSX.Element

// Base Card component
export function Card({ ... }: CardProps): JSX.Element

// Other primitives: Input, Select, Dialog, Dropdown, etc.
```

**Usage Pattern:**
```typescript
import { cn, Button, Card } from "@/components/ui";

<Button className={cn("px-4", isActive && "bg-blue-500")}>
  Click me
</Button>
```

**AI Instructions:**
- Keep primitives simple and composable
- Accept className prop for customization
- Use Tailwind classes, not inline styles
- Export reusable utility functions

---

## Component Composition Pattern

### Typical Page Structure

```typescript
// app/battle/page.tsx
export default function BattlePage() {
  return (
    <div>
      <Sidebar />
      <BattleClient>
        <ConversationTurnBlock />
        <PromptInput />
        <VoteButtons />
      </BattleClient>
    </div>
  );
}
```

### Component Hierarchy

```
Page (server component)
  ├── Sidebar (client)
  ├── BattleClient (client)
  │   ├── ConversationTurnBlock (client)
  │   │   ├── UserMessageBubble (client)
  │   │   ├── AIResponseCard (client)
  │   │   └── AIResponseCard (client)
  │   ├── PromptInput (client)
  │   └── VoteButtons (client)
```

---

## Styling Patterns

### Tailwind CSS

All components use Tailwind utility classes:

```typescript
<div className="flex h-full items-center justify-between bg-surface-primary text-text-primary">
  <span>Content</span>
</div>
```

### Conditional Styles

Use `cn()` utility for conditional classes:

```typescript
<div className={cn(
  "p-4 rounded-lg",
  isActive && "bg-blue-500 text-white",
  isError && "border-2 border-red-500"
)}>
  Conditional styling
</div>
```

### Dark Mode

Configured in `tailwind.config.ts` with forced dark mode:

```typescript
<html className="dark">
  <body className="bg-surface-primary text-text-primary">
    {/* All components inherit dark mode */}
  </body>
</html>
```

### Design Tokens

Custom Tailwind theme colors:
- `surface-primary`, `surface-secondary`, `surface-tertiary` - Backgrounds
- `text-primary`, `text-secondary`, `text-muted` - Text colors
- `border-faint`, `border-default` - Border colors
- `interactive-accent` - Interactive element colors
- `positive`, `negative`, `warning` - Status colors

---

## Animation & Interactions

### Framer Motion

Used for smooth animations:

```typescript
import { motion } from "framer-motion";

<motion.div
  animate={{ rotateY: isRevealed ? 180 : 0 }}
  transition={{ duration: 0.6 }}
  style={{ transformStyle: "preserve-3d" }}
>
  {/* 3D flip animation */}
</motion.div>
```

### Pulse Animation

Streaming cursor uses Tailwind pulse:

```typescript
<span className="animate-pulse bg-interactive-accent" />
```

### Hover States

Interactive elements use Tailwind hover classes:

```typescript
<button className="hover:bg-surface-elevated hover:text-text-primary transition-colors">
  Interactive
</button>
```

---

## Props & Type Safety

### Naming Conventions

All components export `Props` interface:

```typescript
interface MyComponentProps {
  title: string;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

export function MyComponent({ title, onClick, className, children }: MyComponentProps) {
  return <div className={className} onClick={onClick}>{children}</div>;
}
```

### Common Props Patterns

```typescript
// Optional className for customization
className?: string;

// Optional children for composition
children?: ReactNode;

// Event handlers
onClick?: () => void;
onSubmit?: (value: string) => void;

// Loading/disabled states
disabled?: boolean;
isLoading?: boolean;

// Conditional rendering
variant?: "primary" | "secondary";
size?: "sm" | "md" | "lg";
```

---

## Common Development Tasks

### Creating a New Component

1. Create file: `components/MyComponent.tsx`
2. Mark with `'use client'` directive
3. Define Props interface
4. Export component

**Template:**
```typescript
'use client';

import { ReactNode } from 'react';

interface MyComponentProps {
  title: string;
  children?: ReactNode;
}

export function MyComponent({ title, children }: MyComponentProps) {
  return <div className="p-4">{title}{children}</div>;
}
```

### Styling a Component

```typescript
<div className={cn(
  "p-4 rounded-lg border border-border-default",
  "bg-surface-secondary text-text-primary",
  "hover:bg-surface-tertiary transition-colors",
  className
)}>
  Content
</div>
```

### Adding Interactivity

```typescript
'use client';

import { useState } from 'react';

export function Interactive() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
```

### Passing Down Props

```typescript
interface ParentProps {
  title: string;
  isActive: boolean;
}

export function Parent({ title, isActive }: ParentProps) {
  return <Child title={title} isActive={isActive} />;
}
```

---

## Testing & Verification

### Build Verification

```bash
npm run build
# Catches TypeScript errors in components
```

### Linting

```bash
npm run lint
# Checks for unused imports, type errors, React best practices
```

### Visual Inspection

```bash
npm run dev
# Test components in browser at http://localhost:3000/
```

---

## Code Standards & Patterns

### File Organization

**One component per file:**
```
components/
├── MyComponent.tsx     # One component, one file
├── AnotherComponent.tsx
```

**File naming:**
- PascalCase for component files
- Matches component name: `MyComponent.tsx`

### Imports

Use absolute imports with `@/` alias:

```typescript
import { cn } from "@/components/ui";
import { useBattleStream } from "@/hooks/useBattleStream";
```

### Error Handling

Use try-catch for user interactions:

```typescript
try {
  await submitForm(data);
} catch (error) {
  setError(error instanceof Error ? error.message : 'Unknown error');
}
```

---

## Performance Optimization

### Memoization

Use `memo()` for components that don't need frequent re-renders:

```typescript
export const MyComponent = memo(function MyComponent({ title }: Props) {
  return <div>{title}</div>;
});
```

### Callback Optimization

Use `useCallback()` for event handlers:

```typescript
const handleSubmit = useCallback((data: FormData) => {
  // Only recreated if dependencies change
  submitForm(data);
}, [submitForm]);
```

### Lazy Loading

Use `dynamic()` for heavy components:

```typescript
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <p>Loading...</p>
});
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot find module" | Wrong import path | Use `@/components/MyComponent` |
| Component not updating | Missing dependency in useEffect | Add dependencies to array |
| Tailwind styles not applied | Class name string typo | Check exact spelling (e.g., `bg-blue-500`) |
| Animation janky | Too many animations | Use CSS animations instead of JS |
| Memory leak warning | useEffect cleanup missing | Add cleanup function return |

### Debug Tips

```typescript
// Log component renders
console.log('MyComponent rendered');

// Log prop changes
useEffect(() => {
  console.log('Props changed:', { title, isActive });
}, [title, isActive]);

// Inspect Tailwind classes
// Open DevTools and inspect element
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend overview
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide

**Related Directories:**
- `/home/ranthaha1/echat-arena/web/app/` - Pages using these components
- `/home/ranthaha1/echat-arena/web/hooks/` - Custom hooks for component logic

**Configuration:**
- `tailwind.config.ts` - Design token definitions
- `.eslintrc.json` - Linting rules for components

---

## Quick Reference: Component Patterns

```typescript
// Basic component
'use client';

interface Props {
  title: string;
}

export function Component({ title }: Props) {
  return <div>{title}</div>;
}

// With hooks
'use client';
import { useState } from 'react';

export function Interactive() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// With styling
<div className={cn("base-class", condition && "conditional-class")}>
  Content
</div>

// With children
interface Props { children: ReactNode; }
export function Layout({ children }: Props) {
  return <div>{children}</div>;
}
```

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent:** `../AGENTS.md`

**Recent Changes:**
- AIResponseCard with 3D flip animation
- ConversationTurnBlock for multi-turn display
- Framer Motion animations
- Tailwind CSS theme integration

---

**Maintain Clarity:** Update this guide when adding new components or significant changes to styling patterns. Document all exported types and interfaces.
