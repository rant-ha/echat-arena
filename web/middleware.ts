import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PUBLIC_PATHS = new Set(["/login", "/register", "/auth/verify", "/auth/error", "/auth/callback", "/auth/google-redirect"]);
const ADMIN_PREFIX = "/admin";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith(ADMIN_PREFIX)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: req.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Google 登录用户的 Gmail 域名检查（不影响邮箱密码用户）
  if (user) {
    const providers: string[] = user.app_metadata?.providers || [];
    if (providers.includes("google")) {
      const email = user.email || "";
      const domain = email.split("@")[1]?.toLowerCase();
      if (domain && domain !== "gmail.com") {
        await supabase.auth.signOut();
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "gmail_only");
        const redirectRes = NextResponse.redirect(url);
        for (const cookie of supabaseResponse.cookies.getAll()) {
          redirectRes.cookies.set(cookie);
        }
        return redirectRes;
      }
    }
  }

  const isPublic = PUBLIC_PATHS.has(pathname);

  // 已登录：不允许访问 login/register，重定向到对战页
  if (user && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/battle";
    const redirectRes = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectRes.cookies.set(cookie);
    }
    return redirectRes;
  }

  // 未登录：仅允许 login/register
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirectRes = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectRes.cookies.set(cookie);
    }
    return redirectRes;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
