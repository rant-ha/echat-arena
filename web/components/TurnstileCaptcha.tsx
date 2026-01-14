"use client";

import { Turnstile } from "@marsidev/react-turnstile";

export type TurnstileCaptchaProps = {
  onSuccess: (token: string) => void;
  onReset: () => void;
};

export default function TurnstileCaptcha(props: TurnstileCaptchaProps) {
  const { onSuccess, onReset } = props;

  // Explicit env access as required (avoid process.env[name])
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) return null;

  return (
    <div className="flex justify-center">
      <Turnstile
        siteKey={siteKey}
        options={{ theme: "dark" }}
        onSuccess={onSuccess}
        onExpire={onReset}
        onError={onReset}
      />
    </div>
  );
}
