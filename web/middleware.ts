import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public paths that don't require user authentication
const PUBLIC_PATHS = new Set(["/login", "/register", "/auth/verify", "/auth/error", "/auth/callback"]);

// Admin paths - handled separately from user auth
const ADMIN_PREFIX = "/admin";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip next internals/static
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt")
  ) {
    return NextResponse.next();
  }

  // Admin routes - skip Supabase auth, let client-side handle admin auth
  // This allows the admin section to work independently of user auth
  if (pathname.startsWith(ADMIN_PREFIX)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabase = createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
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
        for (const cookie of res.cookies.getAll()) {
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
    return NextResponse.redirect(url);
  }

  // 未登录：仅允许 login/register
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
