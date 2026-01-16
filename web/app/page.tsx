import { createSupabaseServerClient } from "@/utils/supabase/server";
import { HomeClient } from "@/app/HomeClient";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <HomeClient userEmail={user?.email} />;
}
