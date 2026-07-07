import { ensureCategories } from "@/lib/categories/bootstrap";
import { CreateWizard } from "@/components/builder/CreateWizard";

export const dynamic = "force-dynamic";

export default async function NewListingPage(props: {
  searchParams: Promise<{ objectif?: string }>;
}) {
  const categories = await ensureCategories();
  const { objectif } = await props.searchParams;

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          Nouvel agent
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Décris ton agent, on le construit
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Explique en une phrase ce que ton agent doit faire. On génère le flux,
          tu le branches à tes outils, tu le lances et tu le débugges — le tout
          au même endroit.
        </p>
      </div>
      <CreateWizard categories={categories} initialObjective={objectif} />
    </div>
  );
}
