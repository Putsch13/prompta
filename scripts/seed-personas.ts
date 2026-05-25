/**
 * scripts/seed-personas.ts
 * ────────────────────────────────────────────────────────────
 * Crée les comptes personas : pour chaque persona, un compte
 * Supabase Auth (le trigger handle_new_user crée le profil),
 * puis on lie persona.profile_id et on passe is_persona = true.
 *
 * Lancer une seule fois :
 *   npx tsx scripts/seed-personas.ts
 *
 * Variables d'env requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Générateur de personas ──
// 30 personas de base ; duplique/varie pour monter à 150.
const SPECIALTIES = [
  { key: "Vente B2B", tones: ["analytique et direct", "orienté résultats"] },
  { key: "Copywriting", tones: ["créatif et percutant", "persuasif"] },
  { key: "Marketing", tones: ["stratégique", "data-driven"] },
  { key: "RH & Recrutement", tones: ["bienveillant", "professionnel"] },
  { key: "Développement", tones: ["technique et précis", "pédagogique"] },
  { key: "Data & Analyse", tones: ["rigoureux", "méthodique"] },
  { key: "SEO & Contenu", tones: ["pédagogique", "clair"] },
  { key: "Réseaux sociaux", tones: ["décontracté", "engageant"] },
  { key: "Finance", tones: ["formel", "précis"] },
  { key: "Opérations", tones: ["pragmatique", "structuré"] },
];

const FIRST_FR = ["Thomas","Sophie","Julien","Emma","Pierre","Clara","Maxime","Léa","Hugo","Camille","Alex","Nora","Rémi","Anne","Marc","Inès","Lucas","Sarah","Paul","Manon"];
const FIRST_EN = ["James","Emily","Ryan","Kate","Chris","Jennifer","Kevin","Robert","Mary","David","Lisa","Tom","Anna","Mike","Rachel","Daniel","Laura","Mark","Julia","Steve"];
const LASTS = ["R","M","D","L","G","B","F","S","T","K","N","C","V","P","H","W","O","J"];

function buildPersonas(count: number) {
  const out: {
    username: string;
    display_name: string;
    email: string;
    specialty: string;
    tone: string;
    language: string;
  }[] = [];

  for (let i = 0; i < count; i++) {
    const lang = i % 3 === 2 ? "en" : "fr"; // ~1/3 en anglais
    const first = (lang === "fr" ? FIRST_FR : FIRST_EN)[i % 20];
    const last = LASTS[i % LASTS.length];
    const spec = SPECIALTIES[i % SPECIALTIES.length];
    const tone = spec.tones[i % spec.tones.length];
    const username = `${first.toLowerCase()}_${spec.key.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6)}${i}`;

    out.push({
      username,
      display_name: `${first} ${last}.`,
      email: `${username}@personas.prompta.io`,
      specialty: spec.key,
      tone,
      language: lang,
    });
  }
  return out;
}

async function main() {
  const personas = buildPersonas(150);
  console.log(`Création de ${personas.length} personas…`);

  let created = 0;
  let skipped = 0;

  for (const p of personas) {
    // 1. Compte Auth (le trigger crée le profil automatiquement)
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: p.email,
      password: `Px_${p.username}_${Math.random().toString(36).slice(2, 10)}`,
      email_confirm: true,
      user_metadata: { full_name: p.display_name, is_persona: true },
    });

    if (authErr) {
      if (authErr.message.includes("already")) {
        skipped++;
        continue;
      }
      console.error(`✗ ${p.username}: ${authErr.message}`);
      continue;
    }

    const profileId = authData.user!.id;

    // 2. Marquer le profil comme persona + ajuster username
    await sb
      .from("profiles")
      .update({ is_persona: true, username: p.username, display_name: p.display_name,
                headline: `Expert ${p.specialty}` })
      .eq("id", profileId);

    // 3. Créer la ligne persona liée
    await sb.from("personas").insert({
      profile_id: profileId,
      username: p.username,
      display_name: p.display_name,
      email: p.email,
      specialty: p.specialty,
      tone: p.tone,
      language: p.language,
    });

    created++;
    if (created % 10 === 0) console.log(`  ${created} créés…`);
  }

  console.log(`\n✅ Terminé : ${created} créés, ${skipped} déjà existants.`);
}

main().catch(console.error);
