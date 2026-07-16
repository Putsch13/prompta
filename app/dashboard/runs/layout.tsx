import { BuilderOnboardingChecklist } from "@/components/onboarding/BuilderOnboardingChecklist";
import { createClient } from "@/lib/supabase/server";

export default async function RunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      {user ? <BuilderOnboardingChecklist userId={user.id} /> : null}
      {children}
    </>
  );
}
