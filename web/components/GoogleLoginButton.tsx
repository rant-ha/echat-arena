"use client";

import { useState, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { ErrorText } from "@/components/ui";

interface GoogleLoginButtonProps {
  redirectTo?: string;
}

export default function GoogleLoginButton({ redirectTo = "/battle" }: GoogleLoginButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hashedNonce, setHashedNonce] = useState("");
  const [loginUri, setLoginUri] = useState("");

  useEffect(() => {
    // 生成 nonce
    const rawNonce = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
    );

    // 存入 cookie（SameSite=None; Secure 保证跨站 POST 能读取；encodeURIComponent 避免 base64 的 +/= 破坏 cookie）
    document.cookie = `google_nonce=${encodeURIComponent(rawNonce)}; path=/; max-age=300; SameSite=None; Secure`;

    // redirect 目标也存 cookie（login_uri 不能带 query 参数，否则 Google 精确匹配会 400）
    const safePath = redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo : "/battle";
    document.cookie = `google_redirect_to=${encodeURIComponent(safePath)}; path=/; max-age=300; SameSite=None; Secure`;

    // login_uri 必须是干净的 URL，与 Google Console 注册的 Authorized redirect URI 完全一致
    setLoginUri(`${window.location.origin}/auth/google-redirect`);

    // SHA-256 哈希传给 Google（嵌入 ID token）— 全部就绪后才设 ready
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(rawNonce))
      .then((buf) => {
        const hash = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setHashedNonce(hash);
        setReady(true);
      })
      .catch(() => setError("安全初始化失败，请刷新页面重试"));
  }, [redirectTo]);

  if (!ready || !hashedNonce || !loginUri) return null;

  return (
    <div className="w-full overflow-hidden">
      <GoogleLogin
        nonce={hashedNonce}
        ux_mode="redirect"
        login_uri={loginUri}
        onSuccess={() => {}}
        onError={() => setError("Google 登录失败")}
        use_fedcm_for_prompt
        text="signin_with"
        shape="rectangular"
        theme="filled_black"
      />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
