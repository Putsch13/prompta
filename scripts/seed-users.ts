/**
 * Générateur de faux comptes utilisateurs pour démo/staging.
 * 
 * ⚠️ AVERTISSEMENT : Ce script crée de faux utilisateurs pour simuler un
 * marketplace actif. Il est interdit de l'utiliser en production avec de
 * vrais clients (directive Omnibus, pratique commerciale trompeuse).
 * 
 * Usage: npx tsx scripts/seed-users.ts
 */

import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// PARAMÈTRES CONFIGURABLES
// ──────────────────────────────────────────────────────────────────────────────
const USER_COUNT = 1200;

// Prénoms variés (FR + EN)
const FIRST_NAMES = [
  "Marie", "Jean", "Pierre", "Sophie", "Lucas", "Emma", "Thomas", "Léa",
  "Nicolas", "Julie", "Alexandre", "Camille", "Antoine", "Sarah", "Paul",
  "Chloé", "Maxime", "Laura", "Hugo", "Manon", "Arthur", "Charlotte",
  "Louis", "Anaïs", "Théo", "Inès", "Nathan", "Clara", "Raphaël", "Alice",
  "James", "Emily", "Michael", "Jessica", "David", "Sarah", "Chris", "Amanda",
  "Daniel", "Ashley", "Matthew", "Jennifer", "Andrew", "Lauren", "Joshua", "Megan",
  "Ryan", "Rachel", "Brandon", "Samantha", "Kevin", "Brittany", "Jason", "Nicole",
  "Marc", "Caroline", "François", "Nathalie", "Philippe", "Isabelle", "Olivier",
  "Sandrine", "Laurent", "Céline", "Bruno", "Audrey", "Julien", "Stéphanie",
];

const LAST_NAMES = [
  "Martin", "Bernard", "Thomas", "Petit", "Robert", "Richard", "Durand",
  "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy",
  "Roux", "David", "Bertrand", "Morel", "Fournier", "Girard", "Bonnet",
  "Dupont", "Lambert", "Fontaine", "Rousseau", "Vincent", "Muller", "Lefevre",
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
  "Anderson", "Taylor", "Moore", "Jackson", "Lee", "Thompson", "White",
];

const HEADLINES = [
  "Product Manager | AI enthusiast",
  "Full-stack Developer",
  "Marketing Manager @ startup",
  "Data Scientist",
  "UX Designer",
  "Entrepreneur",
  "Content Creator",
  "Freelance Consultant",
  "Growth Hacker",
  "CTO @ Scale-up",
  "Head of Marketing",
  "AI/ML Engineer",
  "Business Analyst",
  "Digital Strategist",
  "Brand Manager",
  "SEO Specialist",
  "Community Manager",
  "Sales Director",
  "Tech Lead",
  "Indie Maker",
  "",
  "",
  "",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUsername(first: string, last: string, index: number): string {
  const base = `${first.toLowerCase()}${last.toLowerCase()}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return `${base}${index % 1000}`;
}

function randomDateInPast(months: number): string {
  const now = new Date();
  const past = new Date(now.getTime() - Math.random() * months * 30 * 24 * 60 * 60 * 1000);
  return past.toISOString();
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    console.error("❌ Refus de seed en production sans ALLOW_SEED=true");
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Erreur: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`🌱 Génération de ${USER_COUNT} utilisateurs seed...`);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < USER_COUNT; i++) {
    const first = randomItem(FIRST_NAMES);
    const last = randomItem(LAST_NAMES);
    const username = generateUsername(first, last, i);
    const email = `${username}@seed.prompta.local`;
    const headline = randomItem(HEADLINES);
    const createdAt = randomDateInPast(12);

    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      skipped++;
      continue;
    }

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: `SeedPwd!${i}${Date.now()}`,
      email_confirm: true,
      user_metadata: {
        full_name: `${first} ${last}`,
        is_seed: true,
      },
    });

    if (authError || !authUser.user) {
      console.warn(`  ⚠️ Erreur création auth ${email}:`, authError?.message);
      continue;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        username,
        full_name: `${first} ${last}`,
        headline: headline || null,
        is_seed: true,
        created_at: createdAt,
      })
      .eq("id", authUser.user.id);

    if (profileError) {
      console.warn(`  ⚠️ Erreur update profile ${email}:`, profileError.message);
    } else {
      created++;
    }

    if (created % 100 === 0) {
      console.log(`  ${created} utilisateurs créés...`);
    }
  }

  console.log("\n--- Résumé ---");
  console.log(`Utilisateurs créés: ${created}`);
  console.log(`Utilisateurs ignorés (déjà existants): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
