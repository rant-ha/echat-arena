import LoginClient from "./LoginClient";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = (searchParams?.next || "/").toString();
  return <LoginClient nextPath={nextPath} />;
}
