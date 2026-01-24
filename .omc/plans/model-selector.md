# Model Selector Implementation Plan (Revised v2)

## Context

### Original Request
Add a model selector dropdown to the Battle page header, allowing users to choose different AI models for conversations. The selector should be similar to ChatGPT's model picker.

### Interview Summary
Based on the provided requirements:
- **Location**: Header area, replacing the current "Model Arena" button (line 556-562 in page.tsx)
- **UI Reference**: ChatGPT-style dropdown with model name and description
- **Behavior**: Both battle sides use the same underlying model, only differing in prompt strategy (empathy vs baseline)
- **Data Source**: model_configs table, only is_enabled=true models
- **Default Model**: Admin-designated default model (requires new field)
- **Persistence**: localStorage for user preference

### Research Findings
- **Frontend**: Battle page uses `useBattleStream` hook, currently sends only `{ prompt }` to battle API
- **Backend**: `_battle_sse()` hardcodes model selection via `REPLY_MODEL_NAME` or `BASELINE_MODEL_ID`
- **Database**: model_configs table exists but lacks `is_default` field
- **Admin API**: GET `/api/arena/admin/models` exists but requires admin-token auth
- **UI Components**: No Select/Dropdown component exists in `web/components/ui.tsx`

### Critic Feedback (Addressed)

| Issue | Severity | Resolution |
|-------|----------|------------|
| `_get_endpoint()` uses JSON file, not database | BLOCKER | Option C: Keep _get_endpoint unchanged, use model_key for routing; document that models must have matching _MODEL_CONFIG entry or env vars |
| Session model_id storage for continue flow | HIGH | Session already stores `left.model_id` and `right.model_id`; add `base_model_key` field for clarity |
| Fallback to default model unclear | MEDIUM-HIGH | Use `default_model_key` from API response; cache in state; fall back to env var if not set |
| Public API rate limiting | MINOR | Add simple IP-based rate limit (60 req/min) |
| localStorage key versioning | MINOR | Use versioned key `echat-arena-v1-selected-model` |
| Task 5 variable scope | MINOR | Clarified in updated plan |
| ModelSelector loading/error UI | MINOR | Detailed states added |

---

## Architecture Decision

### Model Resolution Strategy (Critical)

**Decision**: Use `model_key` as the bridge between database and runtime.

```
User selects model → model_key stored → _get_endpoint(model_key) → API call
```

**How it works**:
1. Public API returns `model_key` from database (e.g., "gpt-4o", "claude-3-sonnet")
2. Frontend stores `model_key` (not UUID) in localStorage and sends to backend
3. Backend uses `model_key` directly in `_get_endpoint()`
4. `_get_endpoint()` finds config in `_MODEL_CONFIG` dict (loaded from JSON) or uses env vars

**Constraint**: Models in database MUST have matching `model_key` in `_MODEL_CONFIG` JSON file or environment variables.

**Fallback Chain**:
1. User-selected `model_key` from localStorage
2. `default_model_key` from API response
3. `REPLY_MODEL_NAME` environment variable
4. `BASELINE_MODEL_ID` environment variable

---

## Work Objectives

### Core Objective
Enable users to select their preferred AI model on the Battle page, with the selection persisting across sessions.

### Deliverables
1. Database migration adding `is_default` column to model_configs
2. Public API endpoint for listing enabled models (with rate limiting)
3. ModelSelector React component with dropdown UI (with loading/error states)
4. Modified useBattleStream hook to accept modelKey
5. Modified backend battle API to accept and use model_key parameter
6. localStorage persistence for model selection (versioned key)

### Definition of Done
- [ ] User can see and interact with model selector dropdown in Battle header
- [ ] Dropdown shows model name with description subtitle
- [ ] Selecting a model persists to localStorage
- [ ] Battle API uses the selected model for both sides
- [ ] Default model is used when no selection exists
- [ ] Continue conversation uses the same model from session
- [ ] All existing functionality remains intact

---

## Guardrails

### Must Have
- Model selector must be visible and functional on all screen sizes
- Must handle case when no models are enabled
- Must gracefully fall back to default when selected model becomes unavailable
- Must not break existing battle functionality
- Selected model_key must be stored in session for continue flow

### Must NOT Have
- Must NOT expose sensitive fields (api_key_encrypted, api_base) in public API
- Must NOT allow invalid model_key to be passed to battle
- Must NOT require authentication for model list retrieval
- Must NOT modify `_get_endpoint()` core logic

---

## Task Flow and Dependencies

```
[Task 1: DB Migration] ──┐
                         │
[Task 2: Public API] ────┼──> [Task 4: useBattleStream] ──> [Task 6: Integration]
                         │            │
[Task 3: ModelSelector] ─┘            │
                                      v
                         [Task 5: Backend battle API]
```

---

## Detailed TODOs

### Task 1: Database Migration - Add is_default Column

**File**: `migrations/add_model_is_default.sql` (NEW)

**Changes**:
```sql
-- Add is_default column to model_configs
ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Create unique partial index to ensure only one default model
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_configs_single_default
ON model_configs (is_default)
WHERE is_default = true AND deleted_at IS NULL;

-- Create trigger to ensure at least one default when models exist
-- (Optional: can be handled at application layer instead)
```

**Acceptance Criteria**:
- [ ] Migration runs without errors
- [ ] is_default column exists with DEFAULT false
- [ ] Only one model can have is_default=true at a time
- [ ] Existing models remain unaffected

---

### Task 2: Public API Endpoint for Model List

**File**: `app.py`

**Add new endpoint** at approximately line 2980 (before battle endpoint):

```python
# Rate limiting for public models endpoint
_MODELS_RATE_LIMIT: Dict[str, List[float]] = {}
_MODELS_RATE_LIMIT_WINDOW = 60  # seconds
_MODELS_RATE_LIMIT_MAX = 60  # requests per window

def _check_models_rate_limit(client_ip: str) -> bool:
    """Check if client is within rate limit for /models endpoint."""
    now = time.time()
    if client_ip not in _MODELS_RATE_LIMIT:
        _MODELS_RATE_LIMIT[client_ip] = []

    # Clean old entries
    _MODELS_RATE_LIMIT[client_ip] = [
        t for t in _MODELS_RATE_LIMIT[client_ip]
        if now - t < _MODELS_RATE_LIMIT_WINDOW
    ]

    if len(_MODELS_RATE_LIMIT[client_ip]) >= _MODELS_RATE_LIMIT_MAX:
        return False

    _MODELS_RATE_LIMIT[client_ip].append(now)
    return True


@app.get(f"{API_PREFIX}/models")
async def list_public_models(req: Request) -> JSONResponse:
    """
    List enabled models for public selection.
    No authentication required. Rate limited to 60 req/min per IP.

    Returns:
    - models: List of {model_key, model_name, description, is_default}
    - default_model_key: model_key of the default model (or first enabled if none marked)
    """
    # Rate limiting
    client_ip = req.client.host if req.client else "unknown"
    if not _check_models_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        # Fallback: return empty list with env var default
        return JSONResponse({
            "ok": True,
            "data": {
                "models": [],
                "default_model_key": REPLY_MODEL_NAME or BASELINE_MODEL_ID or None
            }
        })

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/model_configs",
                params={
                    "select": "model_key,model_name,description,is_default,weight",
                    "is_enabled": "eq.true",
                    "deleted_at": "is.null",
                    "order": "weight.desc,is_default.desc,created_at.asc"
                },
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=5.0
            )

            if resp.status_code != 200:
                raise RuntimeError(f"DB query failed: {resp.status_code}")

            models = resp.json()

            # Find default model_key
            default_model_key = None
            for m in models:
                if m.get("is_default"):
                    default_model_key = m.get("model_key")
                    break

            # Fallback to first enabled model or env var
            if not default_model_key:
                if models:
                    default_model_key = models[0].get("model_key")
                else:
                    default_model_key = REPLY_MODEL_NAME or BASELINE_MODEL_ID

            # Remove weight from response (internal field)
            safe_models = [
                {
                    "model_key": m.get("model_key"),
                    "model_name": m.get("model_name"),
                    "description": m.get("description"),
                    "is_default": m.get("is_default", False)
                }
                for m in models
            ]

            return JSONResponse({
                "ok": True,
                "data": {
                    "models": safe_models,
                    "default_model_key": default_model_key
                }
            })
    except Exception as e:
        log_error("list_models_error", {"error": str(e)}, e)
        # Fallback to env var
        return JSONResponse({
            "ok": True,
            "data": {
                "models": [],
                "default_model_key": REPLY_MODEL_NAME or BASELINE_MODEL_ID or None
            }
        })
```

**Response Schema**:
```json
{
  "ok": true,
  "data": {
    "models": [
      {
        "model_key": "gpt-4o",
        "model_name": "GPT-4o",
        "description": "Most capable model",
        "is_default": true
      }
    ],
    "default_model_key": "gpt-4o"
  }
}
```

**Acceptance Criteria**:
- [ ] GET /api/arena/models returns 200 without auth
- [ ] Response includes only safe fields (NO api_key, api_base)
- [ ] Response includes default_model_key
- [ ] Empty array returned if no enabled models (with env var fallback)
- [ ] Rate limited to 60 requests per minute per IP

---

### Task 3: ModelSelector React Component

**File**: `web/components/ModelSelector.tsx` (NEW)

**Props Interface**:
```typescript
interface Model {
  model_key: string;
  model_name: string;
  description: string | null;
  is_default: boolean;
}

interface ModelSelectorProps {
  selectedModelKey: string | null;
  onModelChange: (modelKey: string) => void;
  onDefaultLoaded?: (defaultKey: string | null) => void;  // Callback when default is loaded from API
  disabled?: boolean;
}

type LoadingState = 'loading' | 'success' | 'error';
```

**Component State**:
```typescript
const [models, setModels] = useState<Model[]>([]);
const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
const [loadingState, setLoadingState] = useState<LoadingState>('loading');
const [error, setError] = useState<string | null>(null);
const [isOpen, setIsOpen] = useState(false);
```

**Features**:
- Fetches models from `/api/proxy/api/arena/models` on mount
- Dropdown button showing current model name
- Dropdown menu with model options (name + description)
- Keyboard navigation support (ArrowUp, ArrowDown, Enter, Escape)
- Click-outside to close
- Loading state: skeleton/spinner while fetching
- Error state: retry button with error message
- Empty state: "No models available" message

**UI States**:

```
Loading State:
[Loading models...          ]  <- Shimmer/skeleton

Error State:
[Failed to load models  ↻]     <- Retry button

Empty State:
[No models available        ]  <- Disabled appearance

Success State (Collapsed):
[GPT-4o                    v]  <- Chevron icon

Success State (Expanded):
[GPT-4o                    v]
+---------------------------+
| GPT-4o             ✓      |  <- Checkmark for selected
|   Most capable model      |
+---------------------------+
| GPT-4o Mini              |
|   Fast and efficient      |
+---------------------------+
| Claude 3.5 Sonnet        |
|   Balanced performance    |
+---------------------------+
```

**Styling**:
- Match existing design system (dark theme, rounded corners)
- Use Tailwind classes consistent with `web/components/ui.tsx`
- ChevronDown icon for indicator
- Checkmark icon for selected item

**Acceptance Criteria**:
- [ ] Component renders without errors
- [ ] Shows loading state during fetch (skeleton/shimmer)
- [ ] Shows error state with retry button on fetch failure
- [ ] Shows "No models available" when list is empty
- [ ] Shows selected model name when collapsed
- [ ] Opens dropdown on click
- [ ] Closes dropdown on selection or click-outside
- [ ] Keyboard navigation works (Arrow keys, Enter, Escape)
- [ ] Calls onModelChange when selection changes
- [ ] Checkmark indicates current selection

---

### Task 4: Modify useBattleStream Hook

**File**: `web/hooks/useBattleStream.ts`

**Changes**:

1. Add `modelKey` parameter to `startBattle`:
```typescript
const startBattle = useCallback(async (
  prompt: string,
  modelKey?: string,  // NEW: model_key from selector
  retryCount = 0
) => {
  // ...
  const res = await fetch("/api/proxy/api/arena/battle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model_key: modelKey  // NEW: send model_key
    }),
    signal: controller.signal,
  });
  // ...

  // IMPORTANT: When retrying, preserve the modelKey parameter!
  // In the retry logic (around line 273), update:
  // FROM: return startBattle(prompt, retryCount + 1);
  // TO:   return startBattle(prompt, modelKey, retryCount + 1);
}, [options]);
```

2. **NOTE**: `continueConversation` does NOT need modelKey parameter.
   - The model is already stored in the session (`left.model_id`, `right.model_id`)
   - Continue flow retrieves model from session, not from frontend
   - This ensures consistency within a conversation

3. Update return type to expose startBattle with new signature

**Acceptance Criteria**:
- [ ] startBattle accepts optional modelKey parameter
- [ ] model_key is included in request body when provided
- [ ] Existing callers without modelKey continue to work
- [ ] continueConversation remains unchanged (uses session's model)

---

### Task 5: Modify Backend Battle API

**File**: `app.py`

**Changes to `battle()` endpoint (line ~2985)**:

1. Accept `model_key` in request body:
```python
@app.post(f"{API_PREFIX}/battle")
async def battle(req: Request, body: Dict[str, Any] = Body(...)) -> StreamingResponse:
    prompt = (body.get("prompt") or "").strip()
    model_key = (body.get("model_key") or "").strip() or None  # NEW

    # ... validation ...
```

2. Pass model_key to `_battle_sse`:
```python
async for chunk in _battle_sse(req, prompt, session_id, model_key):  # Add param
```

**Changes to `_battle_sse()` function (line ~2681)**:

1. Add `model_key` parameter:
```python
async def _battle_sse(
    req: Request,
    prompt: str,
    session_id: str,
    model_key: Optional[str] = None  # NEW
) -> AsyncIterator[bytes]:
```

2. Validate and use the model_key:
```python
# Resolve model to use - IMPORTANT: Use model_key directly with _get_endpoint
# model_key must exist in _MODEL_CONFIG or have matching env vars
if model_key:
    # Validate model_key exists and is usable
    try:
        # Test if _get_endpoint can resolve this model_key
        _get_endpoint(model_key)
        base_model_id = model_key
    except RuntimeError:
        # model_key not found in config, fall back to default
        log_error("invalid_model_key", {
            "model_key": model_key,
            "session": session_id,
            "fallback": "default"
        }, None)
        model_key = None

if not model_key:
    # Fallback to environment variables
    base_model_id = REPLY_MODEL_NAME or BASELINE_MODEL_ID or EMPATHY_MODEL_ID

left_model_id = base_model_id
right_model_id = base_model_id
```

3. Store base_model_key in session_data (line ~2864):
```python
session_data = {
    # ... existing fields ...
    "base_model_name": base_model_id,
    "base_model_key": base_model_id,  # NEW: explicit field for model_key
    # ... rest of fields ...
}
```

**Changes to `continue_battle()` endpoint**:

NO CHANGES NEEDED. The continue flow already:
1. Retrieves session from store
2. Gets `left.model_id` and `right.model_id` from session (line 3127-3128)
3. Uses those values for generation

This ensures consistency: once a battle starts with a model, all turns use the same model.

**Acceptance Criteria**:
- [ ] Battle API accepts model_key in request body
- [ ] Invalid model_key (not in _MODEL_CONFIG) falls back to default with warning log
- [ ] Valid model_key is used for both battle sides
- [ ] base_model_key is stored in session data for reference
- [ ] Continue endpoint uses model from session (no changes needed)

---

### Task 6: Integration in Battle Page

**File**: `web/app/battle/page.tsx`

**Changes**:

1. Add state for selected model:
```typescript
const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
```

2. Add localStorage persistence with versioned key:
```typescript
const STORAGE_KEY = "echat-arena-v1-selected-model";  // Versioned key

// Load on mount
useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    setSelectedModelKey(stored);
  }
}, []);

// Handler for model change
const handleModelChange = useCallback((modelKey: string) => {
  setSelectedModelKey(modelKey);
  try {
    localStorage.setItem(STORAGE_KEY, modelKey);
  } catch (e) {
    // localStorage might be unavailable in private mode
    console.warn("Failed to save model preference:", e);
  }
}, []);

// Callback to receive default from ModelSelector
const handleDefaultModelKey = useCallback((defaultKey: string | null) => {
  setDefaultModelKey(defaultKey);
  // If no selection yet, use default
  if (!selectedModelKey && defaultKey) {
    setSelectedModelKey(defaultKey);
  }
}, [selectedModelKey]);
```

3. Replace "Model Arena" button (lines 556-562) with ModelSelector:
```tsx
<ModelSelector
  selectedModelKey={selectedModelKey}
  onModelChange={handleModelChange}
  onDefaultLoaded={handleDefaultModelKey}  // NEW: callback for default
  disabled={status === "streaming"}
/>
```

4. Update handleSubmit to pass modelKey:
```typescript
const handleSubmit = useCallback(async (prompt: string) => {
  if (status === "streaming") return;

  // Use selected model, fall back to default, then null (backend will use env var)
  const modelToUse = selectedModelKey || defaultModelKey || undefined;

  await startBattle(prompt, modelToUse);
  // ...
}, [status, startBattle, selectedModelKey, defaultModelKey]);
```

5. **NOTE**: Continue conversation does NOT pass modelKey:
```typescript
// Model is already stored in session, backend will use session's model
await continueConversation(meta.session_id, prompt);
```

**Acceptance Criteria**:
- [ ] ModelSelector appears in header
- [ ] Selection persists across page refreshes (localStorage)
- [ ] Selected model is used when starting NEW battle
- [ ] Continue conversation uses session's original model (consistent)
- [ ] Selector is disabled during streaming
- [ ] Reset does not clear model selection
- [ ] Fallback works when localStorage unavailable

---

### Task 7: Admin UI Updates (Optional Enhancement)

**File**: `web/app/admin/models/page.tsx`

**Changes**:
- Add "Set as Default" button/toggle for each model
- Show indicator for current default model
- Ensure only one default at a time (unset others when setting new)

**Note**: This can be deferred to a follow-up task if timeline is tight.

---

## Commit Strategy

### Commit 1: Database Migration
```
feat(db): add is_default column to model_configs

- Add is_default boolean column with default false
- Add unique partial index for single default constraint
```

### Commit 2: Public API Endpoint
```
feat(api): add public models endpoint for user selection

- Add GET /api/arena/models endpoint (no auth required)
- Returns enabled models with safe fields only
- Includes default_model_key in response
- Add IP-based rate limiting (60 req/min)
```

### Commit 3: Frontend ModelSelector Component
```
feat(ui): add ModelSelector dropdown component

- Create ModelSelector component with ChatGPT-style design
- Support keyboard navigation
- Fetch models from public API
- Add loading, error, and empty states
```

### Commit 4: Hook and API Integration
```
feat(battle): integrate model selection into battle flow

- Add modelKey parameter to useBattleStream.startBattle
- Modify backend to accept and validate model_key
- Store base_model_key in session data
- Add localStorage persistence with versioned key
- Update Battle page to use ModelSelector
```

---

## Success Criteria

1. **Functional**
   - User can see available models in dropdown
   - User can select a model
   - Selection persists across sessions
   - NEW battle uses selected model
   - CONTINUE conversation uses session's original model (consistency)

2. **Performance**
   - Model list loads in < 500ms
   - No additional latency in battle start

3. **UX**
   - Dropdown matches existing dark theme
   - Clear indication of selected model
   - Disabled state during streaming is obvious
   - Loading/error states are informative

4. **Robustness**
   - Handles no enabled models gracefully
   - Falls back to default if selected model invalid
   - Error states are informative with retry option
   - Works even if localStorage unavailable

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| No models enabled | Low | High | Show "No models available" message; use env var fallback |
| Model deleted mid-session | Low | Medium | Session stores model_key; continue uses stored value |
| localStorage unavailable | Low | Low | Fall back to API default on each visit |
| API timeout | Medium | Low | Use cached default, show retry option |
| model_key not in _MODEL_CONFIG | Medium | Medium | Validate at battle start; fall back with warning log |

---

## Verification Steps

After implementation:

1. **Manual Testing**
   - [ ] Visit /battle page
   - [ ] Verify ModelSelector appears in header
   - [ ] Verify loading state shows briefly
   - [ ] Click to open dropdown
   - [ ] Select different model
   - [ ] Refresh page, verify selection persisted
   - [ ] Start battle, verify model_key in request body
   - [ ] Continue conversation, verify same model used (from session)
   - [ ] Start NEW battle, verify new model selection applied

2. **Edge Cases**
   - [ ] Disable all models in admin, verify "No models available"
   - [ ] Select model, then delete it in admin, verify fallback on next battle
   - [ ] Clear localStorage, verify default model used
   - [ ] Rapid model list requests (test rate limiting)
   - [ ] Private/incognito mode (localStorage might fail)

3. **Build Verification**
   - [ ] `npm run build` passes
   - [ ] `npm run lint` passes
   - [ ] No TypeScript errors

---

## Estimated Effort

| Task | Complexity | Estimated Time |
|------|------------|----------------|
| Task 1: DB Migration | Low | 15 min |
| Task 2: Public API | Medium | 45 min |
| Task 3: ModelSelector | Medium | 1.5 hours |
| Task 4: Hook Changes | Low | 20 min |
| Task 5: Backend Changes | Medium | 45 min |
| Task 6: Integration | Medium | 45 min |
| Task 7: Admin UI | Low | 30 min (optional) |
| **Total** | | **~4.5-5.5 hours** |
