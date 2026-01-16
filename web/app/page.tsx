import { createSupabaseServerClient } from "@/utils/supabase/server";
import { HomeClient } from "@/app/HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <HomeClient userEmail={user?.email} />;
}
