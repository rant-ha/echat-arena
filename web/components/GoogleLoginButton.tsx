"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { ErrorText } from "@/components/ui";

interface GoogleLoginButtonProps {
  redirectTo?: string;
}

export default function GoogleLoginButton({ redirectTo = "/battle" }: GoogleLoginButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hashedNonce, setHashedNonce] = useState("");
  const nonceRef = useRef<string>("");

  // 生成 nonce + SHA-256 哈希
  useEffect(() => {
    const rawNonce = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
    );
    nonceRef.current = rawNonce;

    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(rawNonce))
      .then((buf) => {
        const hash = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setHashedNonce(hash);
      });
  }, []);

  // Google 登录成功回调
  const handleSuccess = useCallback(
    async (response: CredentialResponse) => {
      setError(null);
      if (!response.credential) {
        setError("Google 登录未返回凭证");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();

        const { data, error: authError } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
          nonce: nonceRef.current,
        });

        if (authError) throw authError;

        // 客户端 Gmail-only 快速检查（middleware 有服务端双重检查）
        const email = data.user?.email || "";
        const domain = email.split("@")[1]?.toLowerCase();
        if (domain && domain !== "gmail.com") {
          await supabase.auth.signOut();
          setError("仅允许 Gmail 邮箱通过 Google 登录");
          return;
        }

        const safePath = redirectTo.startsWith("/") && !redirectTo.startsWith("//")
          ? redirectTo : "/battle";
        router.replace(safePath);
        router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Google 登录失败";
        setError(message);
      }
    },
    [redirectTo, router]
  );

  if (!hashedNonce) return null;

  return (
    <div>
      <GoogleLogin
        nonce={hashedNonce}
        onSuccess={handleSuccess}
        onError={() => setError("Google 登录失败")}
        use_fedcm_for_prompt
        width={400}
        text="signin_with"
        shape="rectangular"
        theme="filled_black"
      />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
