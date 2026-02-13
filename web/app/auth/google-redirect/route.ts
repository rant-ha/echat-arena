import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;

  // 1. 解析 Google POST 的 form data
  const formData = await request.formData();
  const credential = formData.get("credential") as string;
  const csrfTokenBody = formData.get("g_csrf_token") as string;

  // 2. CSRF 双重验证（Google 设置的 cookie vs POST body）
  const csrfTokenCookie = request.cookies.get("g_csrf_token")?.value;
  if (!csrfTokenBody || !csrfTokenCookie || csrfTokenBody !== csrfTokenCookie) {
    return NextResponse.redirect(
      new URL("/auth/error?message=" + encodeURIComponent("CSRF 验证失败"), origin)
    );
  }

  if (!credential) {
    return NextResponse.redirect(
      new URL("/auth/error?message=" + encodeURIComponent("缺少 Google 凭证"), origin)
    );
  }

  // 3. 读取 nonce cookie（必须存在，否则拒绝）和 redirect 目标
  const rawNonceCookie = request.cookies.get("google_nonce")?.value;
  if (!rawNonceCookie) {
    return NextResponse.redirect(
      new URL("/auth/error?message=" + encodeURIComponent("登录超时或 nonce 丢失，请重试"), origin)
    );
  }
  const rawNonce = decodeURIComponent(rawNonceCookie);
  const next = request.nextUrl.searchParams.get("next") || "/battle";

  try {
    const supabase = createSupabaseServerClient();

    // 4. 用 ID Token + nonce 登录 Supabase
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: credential,
      nonce: rawNonce,
    });

    if (error) {
      return NextResponse.redirect(
        new URL("/auth/error?message=" + encodeURIComponent(error.message), origin)
      );
    }

    // 5. Gmail-only 检查
    const email = data.user?.email || "";
    const domain = email.split("@")[1]?.toLowerCase();
    const providers: string[] = data.user?.app_metadata?.providers || [];
    if (providers.includes("google") && domain && domain !== "gmail.com") {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/auth/error?message=" + encodeURIComponent("仅允许 Gmail 邮箱通过 Google 登录"), origin)
      );
    }

    // 6. 重定向到目标页，清理临时 cookie
    const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/battle";
    const response = NextResponse.redirect(new URL(safePath, origin));
    response.cookies.delete("google_nonce");
    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/auth/error?message=" + encodeURIComponent("Google 登录失败，请重试"), origin)
    );
  }
}
