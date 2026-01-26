import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "signup" | "email" | "recovery" | "invite" | null;
  const redirect_to = searchParams.get("redirect_to") || "/";

  // 验证参数
  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL("/auth/error?message=无效的验证链接", origin)
    );
  }

  try {
    const supabase = createSupabaseServerClient();

    // 验证 OTP token
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (error) {
      console.error("Verification error:", error);
      return NextResponse.redirect(
        new URL(`/auth/error?message=${encodeURIComponent(error.message)}`, origin)
      );
    }

    // 验证成功，重定向到目标页面
    return NextResponse.redirect(new URL(redirect_to, origin));

  } catch (err) {
    console.error("Unexpected verification error:", err);
    return NextResponse.redirect(
      new URL("/auth/error?message=验证失败，请重试", origin)
    );
  }
}
