export const runtime = "nodejs";

import { createServerClient } from "@supabase/ssr";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function buildUpstreamUrl(req: Request, pathParts: string[]): string {
  const base = requiredEnv("ARENA_API_BASE").replace(/\/$/, "");
  const joinedPath = pathParts.map((p) => encodeURIComponent(p)).join("/");

  const inUrl = new URL(req.url);
  const outUrl = new URL(`${base}/${joinedPath}`);
  outUrl.search = inUrl.search; // preserve query string

  return outUrl.toString();
}

function filterRequestHeaders(headers: Headers): Headers {
  const out = new Headers();

  // Copy-through, but drop hop-by-hop / unsafe headers.
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (
      k === "host" ||
      k === "connection" ||
      k === "content-length" ||
      k === "accept-encoding" ||
      k === "transfer-encoding"
    ) {
      return;
    }
    out.set(key, value);
  });

  return out;
}

function filterResponseHeaders(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    // Let the platform compute these; also avoids buffering issues with SSE.
    if (k === "content-encoding" || k === "content-length") {
      return;
    }
    out.set(key, value);
  });
  return out;
}

type RouteContext = { params: { path?: string[] } };

async function proxy(request: Request, ctx: RouteContext) {
  const { path = [] } = ctx.params;

  const upstreamUrl = buildUpstreamUrl(request, path);
  const upstreamHeaders = filterRequestHeaders(request.headers);

  // Forward Supabase JWT to backend for authentication
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      const cookieHeader = request.headers.get("cookie") || "";
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get(name: string) {
            const match = cookieHeader.match(
              new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
            );
            return match ? decodeURIComponent(match[1]) : undefined;
          },
          set() {},
          remove() {},
        },
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        upstreamHeaders.set(
          "Authorization",
          `Bearer ${session.access_token}`
        );
      }
    }
  } catch {
    // Auth extraction failed — continue without auth header
    // Backend will return 401 if auth is required
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort);

  try {
    const method = request.method.toUpperCase();
    const hasBody = !(method === "GET" || method === "HEAD");

    // Node.js fetch requires duplex for streaming request bodies.
    const resp = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body: hasBody ? request.body : undefined,
      // @ts-expect-error - duplex is required in Node runtime for streaming bodies
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });

    const resHeaders = filterResponseHeaders(resp.headers);

    // Force SSE anti-buffering headers when upstream is SSE.
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      resHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
      resHeaders.set("Cache-Control", "no-cache, no-transform");
      resHeaders.set("Connection", "keep-alive");
      resHeaders.set("X-Accel-Buffering", "no");
    }

    // Critical: return upstream body directly (no buffering) to support SSE.
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resHeaders,
    });
  } finally {
    request.signal.removeEventListener("abort", onAbort);
  }
}

export async function GET(request: Request, ctx: RouteContext) {
  return proxy(request, ctx);
}
export async function POST(request: Request, ctx: RouteContext) {
  return proxy(request, ctx);
}
export async function PUT(request: Request, ctx: RouteContext) {
  return proxy(request, ctx);
}
export async function PATCH(request: Request, ctx: RouteContext) {
  return proxy(request, ctx);
}
export async function DELETE(request: Request, ctx: RouteContext) {
  return proxy(request, ctx);
}
export async function OPTIONS(request: Request, ctx: RouteContext) {
  return proxy(request, ctx);
}
