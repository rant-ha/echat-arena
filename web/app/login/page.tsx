import LoginClient from "./LoginClient";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const nextPath = (searchParams?.next || "/").toString();
  const errorCode = searchParams?.error || "";
  return <LoginClient nextPath={nextPath} errorCode={errorCode} />;
}
