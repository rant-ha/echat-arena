<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

# web/components/ - Reusable React Components

## Purpose

Reusable client-side React components for eChat Arena UI. All use `"use client"` directive, TypeScript interfaces, and Tailwind CSS. Handles battle rendering (dual responses, voting), chat UI (markdown, code, mermaid), and admin dashboard elements.

## Key Files

| File | Description |
|------|-------------|
| `AIResponseCard.tsx` | Dual-face response card: anonymous side + revealed side with 3D flip animation, winner highlight, streaming cursor |
| `ResponseCard.tsx` | Generic response wrapper: markdown rendering, copy button, thinking block, post-vote conversation history |
| `ConversationTurnBlock.tsx` | Single turn layout: UserMessageBubble + two AIResponseCards in responsive grid |
| `PromptInput.tsx` | Textarea input with auto-grow, Shift+Enter newline, Ctrl+Enter submit, disabled during streaming |
| `VoteButtons.tsx` | Four vote options: "A is better", "B is better", "tie", "both are bad" |
| `UserMessageBubble.tsx` | Right-aligned user message bubble with light background |
| `Sidebar.tsx` | Navigation sidebar: route links, user email display, logout button |
| `ModelSelector.tsx` | Dropdown selector for AI models; fetches from `/api/proxy/api/arena/models` |
| `MarkdownRenderer.tsx` | react-markdown wrapper: remark-gfm, remark-math, rehype-katex, rehype-highlight, mermaid support |
| `CodeBlock.tsx` | Syntax-highlighted code block with language badge and copy button |
| `MermaidBlock.tsx` | Mermaid diagram renderer with error isolation and fallback |
| `ThinkingIndicator.tsx` | Animated loading spinner for thinking/processing states |
| `TurnstileCaptcha.tsx` | Cloudflare Turnstile CAPTCHA widget wrapper |
| `ui.tsx` | Utility module: `cn()` class merger, base Button/Card primitives |
| `admin/AdminSidebar.tsx` | Admin navigation sidebar |
| `admin/StatsCard.tsx` | Reusable stats display card |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `admin/` | Admin-specific components: sidebar, stats cards, tables (reused across admin pages) |

## For AI Agents

### Working In This Directory

- **All files use `"use client"`**: These are React client components; use hooks, event listeners, state freely.
- **Design System**: Use `cn()` from `ui.tsx` to merge Tailwind classes. Custom colors defined in `tailwind.config.ts`: `surface-primary`, `text-primary`, `border-faint`, `interactive-accent`.
- **AIResponseCard is complex**: Has two faces (anonymous/revealed) with 3D flip animation via framer-motion. Props include streaming state, metadata, post-vote turns.
- **Markdown Stack**: ResponseCard delegates to MarkdownRenderer which uses: react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight + custom CodeBlock/MermaidBlock renderers.
- **Component Hierarchy in Battle**: `BattleClient -> ConversationTurnBlock[] -> (UserMessageBubble + AIResponseCard x2) + PromptInput + VoteButtons`.
- **Vote Encoding**: VoteButtons emits `"left" | "right" | "tie" | "both_bad"`. Backend internally maps to model IDs.

### Testing Requirements

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build

# Visual testing in dev mode
npm run dev
```

### Common Patterns

- **Streaming Cursor**: `isStreaming` prop triggers animated cursor in AIResponseCard; disables input/voting.
- **Winner/Loser Styling**: Winner gets green border ring + glow; loser gets `grayscale opacity-60`.
- **Thinking Block**: ThinkingIndicator animates during generation.
- **Copy Button**: CodeBlock and AIResponseCard both offer copy-to-clipboard via lucide-react Copy icon.
- **Markdown Math**: LaTeX preprocessor converts GPT-style delimiters (`\[`, `\(`) to remark-math format.
- **Dark Theme Only**: Code assumes `html.dark` class; no light mode support.

## Dependencies

### Internal

- `@/utils/*` -- No dependencies on utils currently
- `ui.tsx` -- `cn()` utility for class merging

### External

- **react 18**: Hooks, components
- **framer-motion 11**: 3D flip animations, smooth transitions
- **lucide-react 0.452**: Icons (Copy, Send, ChevronDown, etc.)
- **react-markdown 9**: Markdown parsing
- **remark-gfm, remark-math**: Markdown plugins (tables, footnotes, LaTeX)
- **rehype-katex, rehype-highlight**: HTML rendering (LaTeX, syntax highlighting)
- **mermaid 11**: Diagram rendering
- **katex 0.16**: LaTeX math rendering
- **@marsidev/react-turnstile**: CAPTCHA widget
