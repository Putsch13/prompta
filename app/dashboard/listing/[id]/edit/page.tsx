import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentManifestSchema } from "@/lib/agent/schema";
import { CreateWizard } from "@/components/builder/CreateWizard";
import { LegacyEditForm } from "./LegacyEditForm";

export const dynamic = "force-dynamic";

/**
 * Modifier un agent : rouvre le builder complet (arborescence + copilote IA)
 * sur le manifeste courant. Les prompts et contenus sans manifeste restent sur
 * le formulaire simple.
 */
export default async function EditListingPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("listings")
    .select("id, title, description, status, creator_id, current_version_id")
    .eq("id", id)
    .single();

  if (!listing || listing.creator_id !== user.id) redirect("/dashboard/contenus");

  let manifest: ReturnType<typeof AgentManifestSchema.safeParse>["data"] | undefined;
  let promptBody = "";
  if (listing.current_version_id) {
    const { data: version } = await admin
      .from("listing_versions")
      .select("prompt_body, env")
      .eq("id", listing.current_version_id)
      .single();
    promptBody = version?.prompt_body ?? "";
    const rawManifest = (version?.env as { manifest?: unknown } | null)?.manifest;
    if (rawManifest) {
      const parsed = AgentManifestSchema.safeParse(rawManifest);
      if (parsed.success && parsed.data.steps.length > 0) manifest = parsed.data;
    }
  }

  if (!manifest) return <LegacyEditForm />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/dashboard/contenus"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à mes agents
      </Link>
      <h1 className="mb-1 font-display text-2xl font-bold text-ink">
        Modifier : {listing.title}
      </h1>
      <p className="mb-6 text-sm text-ink-soft">
        L&apos;arborescence de ton agent est rechargée dans le builder — modifie les étapes avec
        le copilote, teste, puis enregistre : chaque sauvegarde crée une nouvelle version.
      </p>
      <CreateWizard
        categories={[]}
        edit={{
          listingId: listing.id,
          title: listing.title,
          description: listing.description ?? "",
          status: listing.status,
          promptBody,
          manifest,
        }}
      />
    </div>
  );
}
