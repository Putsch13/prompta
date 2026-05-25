/**
 * Crée (ou promeut) le compte administrateur Prompta.
 *
 * Usage :
 *   ADMIN_EMAIL=admin@prompta.fr ADMIN_PASSWORD='MotDePasseSecur1!' ADMIN_USERNAME=admin npx tsx scripts/seed-admin.ts
 *
 * Variables requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Variables optionnelles : ADMIN_DISPLAY_NAME (défaut: "Admin Prompta")
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const username = process.env.ADMIN_USERNAME ?? "admin";
const displayName = process.env.ADMIN_DISPLAY_NAME ?? "Admin Prompta";

if (!url || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

if (!email || !password) {
  console.error("❌ ADMIN_EMAIL et ADMIN_PASSWORD requis.");
  console.error("   Ex: ADMIN_EMAIL=admin@prompta.fr ADMIN_PASSWORD='xxx' npx tsx scripts/seed-admin.ts");
  process.exit(1);
}

if (password.length < 8) {
  console.error("❌ ADMIN_PASSWORD doit faire au moins 8 caractères.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const adminEmail = email!;
  const adminPassword = password!;
  const adminUsername = username;

  console.log(`→ Compte admin : ${adminEmail} (@${adminUsername})`);

  const { data: existingUsers } = await sb.auth.admin.listUsers();
  const found = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === adminEmail.toLowerCase()
  );

  let userId: string;

  if (found) {
    userId = found.id;
    console.log("  Utilisateur existant — mise à jour mot de passe + admin");
    const { error } = await sb.auth.admin.updateUserById(userId, {
      password: adminPassword,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    console.log("  Création du compte…");
    const { data, error } = await sb.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  // Attendre le trigger profil
  await new Promise((r) => setTimeout(r, 500));

  const { data: profile } = await sb
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    const { error } = await sb.from("profiles").insert({
      id: userId,
      username: adminUsername,
      display_name: displayName,
      is_admin: true,
    });
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("profiles")
      .update({
        username: adminUsername,
        display_name: displayName,
        is_admin: true,
      })
      .eq("id", userId);
    if (error) throw error;
  }

  console.log("✅ Admin prêt.");
  console.log(`   Login : ${adminEmail}`);
  console.log(`   URL   : /login → /admin`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
