import { ensureCategories } from "@/lib/categories/bootstrap";
import { CreateWizard } from "@/components/builder/CreateWizard";

export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const categories = await ensureCategories();

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-ink">
          Nouveau contenu
        </h1>
        <p className="mt-2 text-ink-soft">
          Créez et testez votre prompt, agent ou workflow étape par étape.
        </p>
      </div>
      <CreateWizard categories={categories} />
    </div>
  );
}
