# echat-arena-web (Next.js 14)

## Dev

```bash
cd web
npm install
npm run dev
```

## Env

See: [`.env.example`](./.env.example)

- `ARENA_API_BASE`: upstream backend base url (Heroku)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase auth
- `NEXT_PUBLIC_ALLOWED_DOMAINS`: comma-separated allowlist (e.g. `.edu.cn`)

## Proxy

- Local path: `/api/proxy/...`
- Example battle SSE: `/api/proxy/api/arena/battle`

The proxy returns upstream `resp.body` directly to preserve streaming.
