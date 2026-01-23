# web/app/register/ - User Registration Page

**Parent:** `../AGENTS.md`
**Type:** Next.js 14 Client Component (TypeScript, React 18)
**Version:** 0.0.1
**Last Updated:** 2026-01-23

---

## Purpose

The `register/` directory contains the user registration page. It provides email/password registration with optional CAPTCHA verification and enforces domain allowlist restrictions to limit registrations to specific email domains.

**Key Responsibility:** Register new users via Supabase Auth, validate email domain against allowlist, handle CAPTCHA verification, and redirect to battle page after successful registration.

---

## Directory Structure

```
register/
└── page.tsx               # Registration form component
```

---

## Key File: page.tsx

**Location:** `/home/ranthaha1/echat-arena/web/app/register/page.tsx`

**Type:** Client Component (`'use client'`)

**Size:** ~200 lines

**Dependencies:**
- React hooks (useMemo, useState)
- Next.js navigation (useRouter)
- Supabase (createSupabaseBrowserClient)
- Custom components (TurnstileCaptcha, UI components)

---

## Core Functionality

### Domain Allowlist Parsing

**Function:** `parseAllowedDomains(raw: string | undefined): string[]`

```typescript
function parseAllowedDomains(raw: string | undefined): string[] {
  const v = (raw || "").trim();
  if (!v) {
    // default allowlist example (spec mentions .edu.cn)
    return [".edu.cn"];
  }
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s.toLowerCase() : `.${s.toLowerCase()}`));
}
```

**Purpose:** Parse domain allowlist from environment variable

**Process:**
1. Get env var value (default empty string)
2. Trim whitespace
3. If empty, use `.edu.cn` as default
4. Split by comma
5. Trim each domain
6. Ensure each starts with `.`
7. Lowercase all domains

**Examples:**
```
Input: "edu.cn,ac.uk"
Output: [".edu.cn", ".ac.uk"]

Input: ".edu.cn, .ac.uk"
Output: [".edu.cn", ".ac.uk"]

Input: ""
Output: [".edu.cn"]  // default
```

### Email Domain Validation

**Function:** `isEmailDomainAllowed(email: string, allowed: string[]): boolean`

```typescript
function isEmailDomainAllowed(email: string, allowed: string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;

  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;

  const normalizedAllowed = allowed
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s.slice(1) : s));

  return normalizedAllowed.some((s) => domain === s || domain.endsWith(`.${s}`));
}
```

**Purpose:** Check if email domain is in allowlist

**Process:**
1. Find `@` in email
2. Extract domain part
3. Normalize allowlist (remove leading dots)
4. Check if domain matches exactly or ends with `.domain`

**Examples:**
```
isEmailDomainAllowed("user@tsinghua.edu.cn", [".edu.cn"])
→ true  // domain "tsinghua.edu.cn" ends with ".edu.cn"

isEmailDomainAllowed("user@example.com", [".edu.cn"])
→ false  // domain doesn't match

isEmailDomainAllowed("user@edu.cn", [".edu.cn"])
→ true  // exact match

isEmailDomainAllowed("invalid-email", [".edu.cn"])
→ false  // no @ symbol
```

---

## Component State

```typescript
export default function RegisterPage() {
  const router = useRouter();

  // Parse allowed domains at mount time
  const allowed = useMemo(
    () => parseAllowedDomains(process.env.NEXT_PUBLIC_ALLOWED_DOMAINS),
    []
  );

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CAPTCHA enabled?
  const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  // ...
}
```

---

## Form Submission Logic

### onSubmit Handler

**Flow:**
1. Prevent default form submission
2. Validate email domain
3. Validate CAPTCHA if enabled
4. Set loading state
5. Call Supabase signUp
6. Handle errors
7. Redirect on success
8. Clean up loading state

```typescript
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);

  // 1. Validate email domain
  if (!isEmailDomainAllowed(email, allowed)) {
    setError(`该邮箱域名不在允许列表：${allowed.join(", ")}`);
    return;
  }

  // 2. Validate CAPTCHA if enabled
  if (captchaEnabled && !captchaToken) {
    setError("请先完成验证码校验");
    return;
  }

  setLoading(true);
  try {
    const supabase = createSupabaseBrowserClient();

    // 3. Call signUp
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: captchaEnabled ? { captchaToken } : undefined,
    });
    if (authError) throw authError;

    // 4. Success - redirect to battle
    router.replace("/battle");
    router.refresh();
  } catch (err: any) {
    // 5. Handle errors
    const message = err?.message || "注册失败";
    setError(message);
  } finally {
    // 6. Clear loading
    setLoading(false);
  }
}
```

---

## Email Domain Validation

### Why Domain Validation?

Restricts registration to specific institutions/organizations:
- Universities (`.edu.cn`, `.ac.uk`)
- Companies (`.example.com`)
- Government (`*.gov.cn`)

### Configuration

**Environment Variable:**
```bash
NEXT_PUBLIC_ALLOWED_DOMAINS=.edu.cn,.ac.uk,.example.com
```

**Default:**
```bash
# If not set, defaults to .edu.cn
NEXT_PUBLIC_ALLOWED_DOMAINS=.edu.cn
```

### Usage

```typescript
const allowed = useMemo(
  () => parseAllowedDomains(process.env.NEXT_PUBLIC_ALLOWED_DOMAINS),
  []
);

if (!isEmailDomainAllowed(email, allowed)) {
  setError(`该邮箱域名不在允许列表：${allowed.join(", ")}`);
  return;
}
```

### Error Message (Chinese)

```
该邮箱域名不在允许列表：.edu.cn, .ac.uk
(This email domain is not in the allowlist: .edu.cn, .ac.uk)
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

Passes token to Supabase.auth.signUp when enabled.

### Validate Before Submit

```typescript
if (captchaEnabled && !captchaToken) {
  setError("请先完成验证码校验");
  return;
}
```

Prevents form submission without CAPTCHA.

---

## Form UI Components

### Email Input

```typescript
<Label htmlFor="email">邮箱 (Email Domain: {allowed.join(", ")})</Label>
<Input
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  required
/>
```

Displays allowed domains to user.

### Password Input

```typescript
<Label htmlFor="password">密码 (Password)</Label>
<Input
  id="password"
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  required
/>
```

### CAPTCHA Component

```typescript
{captchaEnabled && (
  <TurnstileCaptcha
    onToken={(token) => setCaptchaToken(token)}
  />
)}
```

### Error Display

```typescript
{error && <ErrorText>{error}</ErrorText>}
```

### Submit Button

```typescript
<Button type="submit" disabled={loading}>
  {loading ? "注册中..." : "注册"}
</Button>
```

Shows loading text during submission.

### Links

```typescript
<p>
  已有账户？<Link href="/login">登录</Link>
</p>
```

Link to login page for existing users.

---

## Error Handling

### Domain Validation Error

```typescript
if (!isEmailDomainAllowed(email, allowed)) {
  setError(`该邮箱域名不在允许列表：${allowed.join(", ")}`);
  return;
}
```

User-friendly message showing allowed domains.

### CAPTCHA Validation Error

```typescript
if (captchaEnabled && !captchaToken) {
  setError("请先完成验证码校验");
  return;
}
```

Tells user to complete CAPTCHA first.

### Registration Errors

Common Supabase signup errors:
- `User already registered` - Email exists
- `Password too weak` - Password requirements not met
- `Invalid email` - Email format invalid (shouldn't happen with domain check)

### Catch-All Error

```typescript
catch (err: any) {
  const message = err?.message || "注册失败";
  setError(message);
}
```

Generic error message.

### Finally Block

```typescript
finally {
  setLoading(false);
}
```

Always clears loading state.

---

## User Flow

```
User navigates to /register
  ↓
Allowed domains loaded from env
  ↓
User enters email (e.g., user@tsinghua.edu.cn)
  ↓
User enters password
  ↓
User completes CAPTCHA (if enabled)
  ↓
User clicks "注册" button
  ↓
Validate email domain
  ↓
  └─ If not allowed: Show error "域名不在允许列表"
  └─ If allowed: Continue
  ↓
Validate CAPTCHA (if enabled)
  ↓
  └─ If not completed: Show error
  └─ If completed: Continue
  ↓
Call supabase.auth.signUp(email, password, captchaToken?)
  ↓
Success: Router redirects to /battle
  ↓
User can now access protected pages
  ↓
Error: Display error message, stay on register page
  ↓
User can retry or go to login
```

---

## Environment Configuration

### Required Variables

None - registration works without additional config.

### Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_ALLOWED_DOMAINS` | `.edu.cn` | Email domain allowlist |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | (none) | Enable CAPTCHA |

### Example .env.local

```bash
# Allow specific email domains
NEXT_PUBLIC_ALLOWED_DOMAINS=.edu.cn,.ac.uk,.example.com

# Enable CAPTCHA verification
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-key
```

---

## Security Considerations

### Password Handling

- Never logged or stored
- Only sent to Supabase in HTTPS request
- Masked in UI with `type="password"`
- Supabase enforces password strength

### Email Validation

- `type="email"` provides browser validation
- Domain allowlist enforces organizational restrictions
- Supabase validates format server-side

### Domain Allowlist

Prevents:
- Generic email providers (gmail.com, hotmail.com)
- Typosquatting domains
- Unauthorized registrations

Example:
```
Only .edu.cn addresses can register
→ user@gmail.com → rejected
→ user@tsinghua.edu.cn → accepted
```

### CAPTCHA

- Optional but recommended
- Prevents bot registrations
- Cloudflare Turnstile integration

---

## Accessibility

### Label Usage

```typescript
<Label htmlFor="email">邮箱</Label>
<Input id="email" type="email" ... />
```

Links labels to inputs.

### Required Attributes

```typescript
<Input required />
```

Marks fields as required.

### Error Messages

Clear, specific error messages in Chinese.

### Input Types

```typescript
<Input type="email" />      // Email validation
<Input type="password" />   // Password masking
```

---

## Testing & Verification

### Local Testing

```bash
npm run dev
# Navigate to http://localhost:3000/register
# Enter email with allowed domain (default: .edu.cn)
# Enter password
# Should register successfully
# Should redirect to /battle
```

### Test Domain Validation

```bash
# Try email with disallowed domain (e.g., user@gmail.com)
# Should show error: "域名不在允许列表"

# Try email with allowed domain (e.g., user@example.edu.cn)
# Should proceed with registration
```

### Test CAPTCHA

If CAPTCHA enabled:
```bash
# Form should show CAPTCHA component
# Submit button disabled until CAPTCHA completed
# After CAPTCHA, submit button enabled
```

### Test Errors

```bash
# Try registering with existing email
# Should show "User already registered"

# Try weak password
# Should show password requirements error
```

---

## Customization

### Change Allowed Domains

Update environment variable:
```bash
# Allow only university emails
NEXT_PUBLIC_ALLOWED_DOMAINS=.edu.cn,.ac.uk,.edu.au

# Allow company emails
NEXT_PUBLIC_ALLOWED_DOMAINS=.example.com

# Allow multiple organizations
NEXT_PUBLIC_ALLOWED_DOMAINS=.tsinghua.edu.cn,.pku.edu.cn,.fudan.edu.cn
```

### Change Form Labels

Edit Chinese text in JSX (currently all labels in Chinese).

### Add Password Requirements Display

Could display:
- Minimum length
- Complexity requirements
- Real-time validation

### Add Email Verification

Currently registration may not require email verification. Could add:
- Send verification email
- Require confirmation before access

---

## Related Documentation

**Parent Directory:**
- `/home/ranthaha1/echat-arena/web/app/AGENTS.md` - App router overview
- `/home/ranthaha1/echat-arena/web/AGENTS.md` - Frontend guide

**Related Pages:**
- `/home/ranthaha1/echat-arena/web/app/login/page.tsx` - Login page

**Related Components:**
- `/home/ranthaha1/echat-arena/web/components/TurnstileCaptcha.tsx` - CAPTCHA component
- `/home/ranthaha1/echat-arena/web/components/ui.tsx` - UI components

**Authentication:**
- `/home/ranthaha1/echat-arena/web/utils/supabase/client.ts` - Supabase client
- `/home/ranthaha1/echat-arena/web/middleware.ts` - Auth middleware

---

## Quick Reference

### Route
```
/register → Registration form
```

### Form Fields
| Field | Type | Required |
|-------|------|----------|
| Email | email | Yes |
| Password | password | Yes |
| CAPTCHA | token | Conditional (if enabled) |

### Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_ALLOWED_DOMAINS` | `.edu.cn` | Email domain allowlist |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | (none) | CAPTCHA site key |

### Helper Functions
- `parseAllowedDomains()` - Parse domain allowlist from env
- `isEmailDomainAllowed()` - Validate email against allowlist

### UI Components
- `Card` - Form container
- `Label` - Field labels
- `Input` - Email/password inputs
- `Button` - Submit button
- `ErrorText` - Error display
- `TurnstileCaptcha` - CAPTCHA

---

## Version & Updates

**Version:** 0.0.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Key Features:**
- Email/password registration via Supabase
- Email domain allowlist validation
- Optional CAPTCHA verification
- Domain configuration via environment variables
- Error handling and display
- Loading states
- Links to login page
- All text in Chinese

---

**Maintain Clarity:** Update this guide when:
- Modifying domain validation logic
- Changing allowed domains configuration
- Adding new form fields
- Updating error messages
- Adding/removing CAPTCHA
- Modifying Chinese text labels
