/**
 * Crée (ou promeut) le compte administrateur Prompta.
 *
 * Usage :
 *   ADMIN_EMAIL=admin@prompta.fr ADMIN_PASSWORD='MotDePasseSecur1!' ADMIN_USERNAME=admin npm run seed:admin
 *
 * Si ADMIN_USERNAME existe déjà (ex: florent), met à jour l'email/mot de passe de CE compte.
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
  process.exit(1);
}

if (password.length < 8) {
  console.error("❌ ADMIN_PASSWORD doit faire au moins 8 caractères.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...(data.users ?? []));
    if ((data.users?.length ?? 0) < 200) break;
    page++;
  }
  return users;
}

async function main() {
  const adminEmail = email!.toLowerCase();
  const adminPassword = password!;
  const adminUsername = username;

  console.log(`→ Compte admin : ${adminEmail} (@${adminUsername})`);

  const allUsers = await listAllUsers();
  const userByEmail = allUsers.find((u) => u.email?.toLowerCase() === adminEmail);

  const { data: profileByUsername } = await sb
    .from("profiles")
    .select("id, username")
    .eq("username", adminUsername)
    .maybeSingle();

  let userId: string;
  let orphanEmailUserId: string | null = null;

  if (profileByUsername && userByEmail && profileByUsername.id !== userByEmail.id) {
    userId = profileByUsername.id;
    orphanEmailUserId = userByEmail.id;
    console.log("  Compte @username existant — fusion avec le nouvel email");
    console.log("  Suppression du doublon avant transfert email…");
    await sb.auth.admin.deleteUser(orphanEmailUserId);
    orphanEmailUserId = null;
  } else if (userByEmail) {
    userId = userByEmail.id;
    console.log("  Compte trouvé par email — mise à jour");
  } else if (profileByUsername) {
    userId = profileByUsername.id;
    console.log("  Compte trouvé par username — mise à jour email + mot de passe");
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

  // Mettre à jour auth (email + password)
  const { error: authError } = await sb.auth.admin.updateUserById(userId, {
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });
  if (authError) throw authError;

  if (orphanEmailUserId) {
    console.log("  Suppression du compte doublon (ancien email)…");
    await sb.auth.admin.deleteUser(orphanEmailUserId);
  }

  // Supprimer autres doublons même email
  for (const u of allUsers) {
    if (u.id !== userId && u.email?.toLowerCase() === adminEmail) {
      console.log("  Suppression doublon auth…");
      await sb.auth.admin.deleteUser(u.id);
    }
  }

  await new Promise((r) => setTimeout(r, 500));

  const { data: profile } = await sb
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();

  const { data: usernameOwner } = await sb
    .from("profiles")
    .select("id")
    .eq("username", adminUsername)
    .maybeSingle();

  const canSetUsername = !usernameOwner || usernameOwner.id === userId;

  if (!profile) {
    const { error } = await sb.from("profiles").insert({
      id: userId,
      username: canSetUsername ? adminUsername : adminUsername + "_admin",
      display_name: displayName,
      is_admin: true,
    });
    if (error) throw error;
  } else {
    const updates: {
      display_name: string;
      is_admin: boolean;
      username?: string;
    } = {
      display_name: displayName,
      is_admin: true,
    };
    if (canSetUsername) updates.username = adminUsername;

    const { error } = await sb.from("profiles").update(updates).eq("id", userId);
    if (error) throw error;
  }

  const { data: finalProfile } = await sb
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();

  console.log("✅ Admin prêt.");
  console.log(`   Login : ${adminEmail}`);
  console.log(`   @${finalProfile?.username ?? adminUsername}`);
  console.log(`   URL   : /login → /admin`);
}

main().catch((err) => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
