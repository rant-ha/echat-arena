# web/app/login/ - User Login Pages

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 Pages & Client Component (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `login/` directory contains the user authentication pages. It provides email/password login functionality with optional CAPTCHA verification and support for login redirects to protected pages.

**Key Responsibility:** Authenticate users via Supabase Auth, handle CAPTCHA verification, and redirect to requested page after successful login.

---

## Directory Structure

```
login/
├── page.tsx               # Server component wrapper
└── LoginClient.tsx        # Client component with form logic
```

---

## Architecture

### Server/Client Split

**page.tsx (Server Component):**
- Accepts `searchParams` from URL
- Extracts `next` query parameter
- Renders LoginClient with nextPath prop

**LoginClient.tsx (Client Component):**
- Handles form state and submission
- Manages error handling
- Integrates with Supabase Auth
- Handles CAPTCHA verification
- Redirects on success

This separation allows server-side query param handling while keeping interactive logic on the client.

---

## Key File 1: page.tsx

**Location:** `/home/ranthaha1/echat-arena/web/app/login/page.tsx`

**Type:** Server Component (no `'use client'`)

**Size:** ~10 lines

```typescript
import LoginClient from "./LoginClient";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = (searchParams?.next || "/").toString();
  return <LoginClient nextPath={nextPath} />;
}
```

**Purpose:**
1. Accept `searchParams` from URL
2. Extract `next` parameter (where to redirect after login)
3. Default to `/` if not provided
4. Pass to LoginClient component

**Example:**
```
/login?next=/battle
→ nextPath = "/battle"
→ After login, redirect to /battle
```

---

## Key File 2: LoginClient.tsx

**Location:** `/home/ranthaha1/echat-arena/web/app/login/LoginClient.tsx`

**Type:** Client Component (`'use client'`)

**Size:** ~150 lines

```typescript
"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TurnstileCaptcha from "@/components/TurnstileCaptcha";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";

export default function LoginClient(props: { nextPath: string }) {
  const { nextPath } = props;
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (captchaEnabled && !captchaToken) {
      setError("请先完成验证码校验");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaEnabled ? { captchaToken } : undefined,
      });
      if (authError) throw authError;

      const redirectTo = nextPath?.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : "/battle";

      router.replace(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "登录失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h1>登录</h1>
      <form onSubmit={onSubmit}>
        <Label>邮箱</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Label>密码</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {captchaEnabled && (
          <TurnstileCaptcha
            onToken={(token) => setCaptchaToken(token)}
          />
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <Button type="submit" disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>

      <p>
        还没有账户？<Link href="/register">注册</Link>
      </p>
    </Card>
  );
}
```

---

## State Management

### Component State

```typescript
const [email, setEmail] = useState("");          // Email input
const [password, setPassword] = useState("");    // Password input
const [captchaToken, setCaptchaToken] = useState<string>("");  // CAPTCHA token
const [loading, setLoading] = useState(false);   // Submission in progress
const [error, setError] = useState<string | null>(null);  // Error message
```

### Environment State

```typescript
const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
```

Checks if CAPTCHA is enabled via environment variable.

---

## Form Submission Logic

### onSubmit Handler

**Flow:**
1. Prevent default form submission
2. Clear previous errors
3. Check CAPTCHA if enabled
4. Set loading state
5. Call Supabase signInWithPassword
6. Handle errors
7. Redirect on success
8. Clean up loading state

### Step-by-Step

```typescript
async function onSubmit(e: React.FormEvent) {
  // 1. Prevent default
  e.preventDefault();
  setError(null);

  // 2. Validate CAPTCHA if enabled
  if (captchaEnabled && !captchaToken) {
    setError("请先完成验证码校验");
    return;
  }

  // 3. Set loading
  setLoading(true);

  try {
    // 4. Create Supabase client
    const supabase = createSupabaseBrowserClient();

    // 5. Call signInWithPassword
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaEnabled ? { captchaToken } : undefined,
    });

    // 6. Handle auth errors
    if (authError) throw authError;

    // 7. Determine redirect URL
    const redirectTo = nextPath?.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/battle";

    // 8. Redirect
    router.replace(redirectTo);
    router.refresh();
  } catch (err: unknown) {
    // 9. Handle errors
    const message = err instanceof Error ? err.message : "登录失败";
    setError(message);
  } finally {
    // 10. Clear loading
    setLoading(false);
  }
}
```

---

## CAPTCHA Integration

### Environment Variable

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
```

If set, enables CAPTCHA verification.

### Check CAPTCHA Enabled

```typescript
const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
```

### Render CAPTCHA Component

```typescript
{captchaEnabled && (
  <TurnstileCaptcha
    onToken={(token) => setCaptchaToken(token)}
  />
)}
```

### Include Token in Request

```typescript
options: captchaEnabled ? { captchaToken } : undefined
```

Passes token to Supabase.auth.signInWithPassword when enabled.

### Validate Before Submit

```typescript
if (captchaEnabled && !captchaToken) {
  setError("请先完成验证码校验");
  return;
}
```

Prevents form submission without CAPTCHA.

---

## Redirect Logic

### Extract nextPath

```typescript
// From page.tsx
const nextPath = (searchParams?.next || "/").toString();
return <LoginClient nextPath={nextPath} />;
```

### Validate Redirect URL

```typescript
const redirectTo = nextPath?.startsWith("/") && !nextPath.startsWith("//")
  ? nextPath
  : "/battle";
```

**Security:**
- Only allows absolute paths starting with `/`
- Rejects protocol-relative URLs (`//`)
- Prevents open redirect vulnerabilities
- Falls back to `/battle` if invalid

### Execute Redirect

```typescript
router.replace(redirectTo);  // Replace history entry (not back-button accessible)
router.refresh();            // Refresh server component tree
```

**Why replace:** Prevents users from going back to login page after successful auth.

---

## Form Components

### Input Fields

```typescript
<Input
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  required
/>

<Input
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  required
/>
```

### Submit Button

```typescript
<Button type="submit" disabled={loading}>
  {loading ? "登录中..." : "登录"}
</Button>
```

Shows loading text during submission.

### Error Display

```typescript
{error && <ErrorText>{error}</ErrorText>}
```

Displays error message if submission fails.

### Links

```typescript
<Link href="/register">注册</Link>  // Go to registration
<Link href="/">忘记密码</Link>     // Password reset (if needed)
```

---

## Error Handling

### Validation Errors

```typescript
if (captchaEnabled && !captchaToken) {
  setError("请先完成验证码校验");
  return;
}
```

### Authentication Errors

```typescript
const { error: authError } = await supabase.auth.signInWithPassword({...});
if (authError) throw authError;
```

Common errors:
- `Invalid login credentials` - Wrong email/password
- `Email not confirmed` - User hasn't verified email
- `User not found` - Email doesn't exist

### Catch-All Error

```typescript
catch (err: unknown) {
  const message = err instanceof Error ? err.message : "登录失败";
  setError(message);
}
```

### Finally Block

```typescript
finally {
  setLoading(false);
}
```

Always clears loading state, even on error.

---

## User Flow

```
User navigates to /login?next=/battle
  ↓
page.tsx extracts nextPath = "/battle"
  ↓
LoginClient rendered with nextPath prop
  ↓
User enters email and password
  ↓
User completes CAPTCHA (if enabled)
  ↓
User clicks "登录" button
  ↓
onSubmit handler
  ↓
Validate form (CAPTCHA if enabled)
  ↓
Call supabase.auth.signInWithPassword(email, password, captchaToken?)
  ↓
Success: router.replace("/battle")
  ↓
Redirect to /battle page
  ↓
User can now access protected pages
  ↓
Error: Display error message, stay on login page
  ↓
User can retry or go to registration
```

---

## Accessibility

### Label Usage

```typescript
<Label htmlFor="email">邮箱</Label>
<Input id="email" type="email" ... />
```

Links labels to inputs for screen readers.

### Required Attributes

```typescript
<Input required />
```

Marks fields as required.

### Type Attributes

```typescript
<Input type="email" />  // Email validation
<Input type="password" />  // Password masking
```

Proper input types for accessibility.

---

## Security Considerations

### Password Handling

- Never logged or stored in component state permanently
- Only sent to Supabase in HTTPS request
- Masked in UI with `type="password"`

### Email Validation

- `required` attribute enforces user input
- `type="email"` provides browser validation
- Supabase validates format server-side

### Redirect Validation

```typescript
const redirectTo = nextPath?.startsWith("/") && !nextPath.startsWith("//")
  ? nextPath
  : "/battle";
```

Prevents open redirect attacks.

### CAPTCHA

- Optional but recommended
- Prevents brute-force attacks
- Cloudflare Turnstile integration

### Error Messages

- Generic error for unknown errors
- Don't reveal whether email exists (prevents enumeration)
- Specific messages for recoverable errors (CAPTCHA required)

---

## Testing & Verification

### Local Testing

```bash
npm run dev
# Navigate to http://localhost:3000/login
# Enter test email and password
# Should login successfully
# Should redirect to /
```

### Test Redirect

```bash
# Navigate with next param
# http://localhost:3000/login?next=/history
# After login, should redirect to /history
```

### Test Errors

```bash
# Try with wrong password
# Should show "Invalid login credentials"

# Try with non-existent email
# Should show "Invalid login credentials"
```

### Test CAPTCHA

If CAPTCHA enabled:
```bash
# Form should show CAPTCHA component
# Submit button disabled until CAPTCHA completed
# After CAPTCHA, submit button enabled
```

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/AGENTS.md` - App router overview
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend guide

**Related Pages:**
- `/home/ranthaha1/echat-arena/web/app/register/page.tsx` - Registration page

**Related Components:**
- `/home/ranthaha1/echat-arena/web/components/TurnstileCaptcha.tsx` - CAPTCHA component
- `/home/ranthaha1/echat-arena/web/components/ui.tsx` - UI components (Button, Input, Label, etc.)

**Authentication:**
- `/home/ranthaha1/echat-arena/web/utils/supabase/client.ts` - Supabase client
- `/home/ranthaha1/echat-arena/web/middleware.ts` - Auth middleware

---

## Quick Reference

### Route
```
/login → Login form
/login?next=/battle → Login with redirect to /battle
```

### Query Parameters
| Param | Purpose |
|-------|---------|
| `next` | Where to redirect after successful login (default: `/`) |

### Form Fields
| Field | Type | Required |
|-------|------|----------|
| Email | email | Yes |
| Password | password | Yes |
| CAPTCHA | token | Conditional (if enabled) |

### Environment Variables
| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Enable/disable CAPTCHA |

### UI Components
- `Card` - Form container
- `Label` - Field labels
- `Input` - Email/password inputs
- `Button` - Submit button
- `ErrorText` - Error message display
- `TurnstileCaptcha` - CAPTCHA component

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Email/password authentication via Supabase
- Optional CAPTCHA verification
- Redirect support via `?next=` query param
- Server/client component split
- Error handling and display
- Loading states
- Links to registration

---

**Maintain Clarity:** Update this guide when:
- Modifying authentication flow
- Adding new login methods (OAuth, etc.)
- Changing CAPTCHA provider
- Updating form fields
- Modifying error messages
