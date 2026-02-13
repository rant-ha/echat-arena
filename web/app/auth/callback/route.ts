import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/battle";

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/error?message=" + encodeURIComponent("缺少授权码"), origin)
    );
  }

  try {
    const supabase = createSupabaseServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth/error?message=${encodeURIComponent(error.message)}`, origin)
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || "";
    const domain = email.split("@")[1]?.toLowerCase();

    const providers: string[] = user?.app_metadata?.providers || [];
    if (providers.includes("google") && domain !== "gmail.com") {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/auth/error?message=" + encodeURIComponent("仅允许 Gmail 邮箱通过 Google 登录"), origin)
      );
    }

    const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/battle";

    return NextResponse.redirect(new URL(safePath, origin));
  } catch (err) {
    return NextResponse.redirect(
      new URL("/auth/error?message=" + encodeURIComponent("登录失败，请重试"), origin)
    );
  }
}
