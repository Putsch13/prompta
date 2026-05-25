"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CreateWizard } from "@/components/builder/CreateWizard";

export default function NewListingPage() {
  const [categories, setCategories] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("categories").select("id, name, slug");
      setCategories(data ?? []);
    }
    load();
  }, []);

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
