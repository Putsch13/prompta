/**
 * Crée (ou promeut) un compte ADMIN ILLIMITÉ : is_admin + unrestricted_usage.
 *
 * Usage :
 *   ADMIN_EMAIL=test2@gmail.com ADMIN_PASSWORD='...' ADMIN_USERNAME=test2 \
 *     npx tsx scripts/create-unlimited-admin.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const username = process.env.ADMIN_USERNAME ?? "test2";
const displayName = process.env.ADMIN_DISPLAY_NAME ?? "Compte test illimité";

if (!url || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}
if (!email || !password || password.length < 8) {
  console.error("❌ ADMIN_EMAIL et ADMIN_PASSWORD (≥ 8 car.) requis.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target: string) {
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data.users ?? []).find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if ((data.users?.length ?? 0) < 200) return null;
    page++;
  }
}

async function main() {
  let userId: string;
  const existing = await findUserByEmail(email!);

  if (existing) {
    userId = existing.id;
    await sb.auth.admin.updateUserById(userId, { password: password!, email_confirm: true });
    console.log("  Compte existant — mot de passe mis à jour.");
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: email!,
      password: password!,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("  Compte créé.");
  }

  await new Promise((r) => setTimeout(r, 400));

  // Username unique ?
  const { data: usernameOwner } = await sb
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  const finalUsername =
    !usernameOwner || usernameOwner.id === userId ? username : `${username}_${userId.slice(0, 4)}`;

  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const payload = {
    display_name: displayName,
    is_admin: true,
    unrestricted_usage: true,
    username: finalUsername,
  };

  if (!profile) {
    const { error } = await sb.from("profiles").insert({ id: userId, ...payload });
    if (error) throw error;
  } else {
    const { error } = await sb.from("profiles").update(payload).eq("id", userId);
    if (error) throw error;
  }

  console.log("✅ Admin illimité prêt.");
  console.log(`   Email : ${email}`);
  console.log(`   @${finalUsername}`);
  console.log(`   is_admin: true · unrestricted_usage: true`);
}

main().catch((err) => {
  console.error("❌", err?.message ?? err);
  process.exit(1);
});
