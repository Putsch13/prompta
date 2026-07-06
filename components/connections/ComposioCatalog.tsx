"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, Search, Zap } from "lucide-react";
import type { ComposioToolkitEntry } from "@/lib/composio/catalog";

/** Méta-filtres épinglés en tête — le reste est dérivé des données réelles. */
const PINNED_FILTERS = ["Toutes", "Populaires", "Connectées", "Non connectées"];
/** Nombre max de catégories réelles affichées (le reste bascule dans « Autre »). */
const MAX_CATEGORY_CHIPS = 12;

interface Props {
  toolkits: ComposioToolkitEntry[];
  connections: { connectorId: string; status: string; usable?: boolean }[];
  onRefresh: () => void;
}

/** Logo de l'app (URL Composio) avec repli lettre-avatar si absent/cassé. */
function AppLogo({ logo, label }: { logo?: string; label: string }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-9 w-9 shrink-0 rounded-lg border border-line bg-white object-contain p-1"
      />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

export function ComposioCatalog({ toolkits, connections, onRefresh }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState(120);

  const connectedSet = useMemo(
    () =>
      new Set(
        connections
          // `usable` (serveur) inclut « expirée mais rafraîchissable au run ».
          .filter((c) => c.usable ?? c.status === "connected")
          .map((c) => c.connectorId),
      ),
    [connections]
  );

  // Catégories réelles, triées par volume — les petites basculent dans « Autre ».
  const { categoryChips, mainCategories } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of toolkits) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    const sorted = [...counts.entries()]
      .filter(([cat]) => cat !== "Autre")
      .sort((a, b) => b[1] - a[1]);
    const main = sorted.slice(0, MAX_CATEGORY_CHIPS);
    const mainSet = new Set(main.map(([cat]) => cat));
    const autreCount = toolkits.filter((t) => !mainSet.has(t.category)).length;
    const chips: Array<{ label: string; count?: number }> = [
      ...PINNED_FILTERS.map((label) => ({
        label,
        count:
          label === "Populaires"
            ? toolkits.filter((t) => t.popular).length
            : label === "Connectées"
              ? connectedSet.size
              : undefined,
      })),
      ...main.map(([cat, n]) => ({ label: cat, count: n })),
      ...(autreCount > 0 ? [{ label: "Autre", count: autreCount }] : []),
    ];
    return { categoryChips: chips, mainCategories: mainSet };
  }, [toolkits, connectedSet]);

  const filtered = useMemo(() => {
    let list = toolkits;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
      );
    }
    switch (category) {
      case "Populaires":
        list = list.filter((t) => t.popular);
        break;
      case "Connectées":
        list = list.filter((t) => connectedSet.has(t.id));
        break;
      case "Non connectées":
        list = list.filter((t) => !connectedSet.has(t.id));
        break;
      case "Autre":
        list = list.filter((t) => !mainCategories.has(t.category));
        break;
      default:
        if (category !== "Toutes") {
          list = list.filter((t) => t.category === category);
        }
    }
    // Connectées et populaires d'abord — l'utilisateur retrouve SES apps en tête.
    return [...list].sort((a, b) => {
      const ca = connectedSet.has(a.id) ? 0 : 1;
      const cb = connectedSet.has(b.id) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const pa = a.popular ? 0 : 1;
      const pb = b.popular ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.label.localeCompare(b.label, "fr");
    });
  }, [toolkits, search, category, connectedSet, mainCategories]);

  async function testConnection(toolkitId: string) {
    setTesting(toolkitId);
    try {
      const res = await fetch(`/api/connectors/${toolkitId}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult((prev) => ({
        ...prev,
        [toolkitId]: data.connected ? "✓ Connecté" : data.error ?? "Non connecté",
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, [toolkitId]: "Erreur test" }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une app (Gmail, Notion, HubSpot…)"
            className="h-10 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-card2"
        >
          Actualiser
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {categoryChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              setCategory(chip.label);
              setVisibleCount(120);
            }}
            className={`rounded-full px-3 py-1 text-xs ${
              category === chip.label ? "bg-accent text-white" : "border border-line text-ink-soft hover:bg-card2"
            }`}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span className={`ml-1 ${category === chip.label ? "text-white/70" : "text-ink-faint"}`}>
                {chip.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-ink-faint">
        {filtered.length} app{filtered.length > 1 ? "s" : ""} · {connectedSet.size} connectée{connectedSet.size > 1 ? "s" : ""}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, visibleCount).map((tk) => {
          const connected = connectedSet.has(tk.id);
          return (
            <div key={tk.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <AppLogo logo={tk.logo} label={tk.label} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{tk.label}</p>
                    <p className="text-[10px] text-ink-faint">{tk.category} · {tk.authType}</p>
                  </div>
                </div>
                {connected ? (
                  <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
                    <Check className="h-3 w-3" /> OK
                  </span>
                ) : (
                  <span className="rounded-full bg-line/50 px-2 py-0.5 text-[10px] text-ink-faint">—</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => testConnection(tk.id)}
                      disabled={testing === tk.id}
                      className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs hover:bg-card2"
                    >
                      {testing === tk.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Tester
                    </button>
                    <a
                      href={`/api/composio/tools?toolkit=${encodeURIComponent(tk.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-line px-2 py-1 text-xs text-accent hover:bg-accent-light"
                    >
                      Voir actions
                    </a>
                    <a
                      href={`/api/connectors/${tk.id}/connect?force=true`}
                      title="Refait l'OAuth pour obtenir les permissions à jour (ex. envoi d'email) — à utiliser si un run échoue en « autorisation manquante » alors que l'app est connectée."
                      className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft hover:bg-card2"
                    >
                      <RefreshCw className="h-3 w-3" /> Reconnecter
                    </a>
                  </>
                ) : (
                  <a
                    href={`/api/connectors/${tk.id}/connect`}
                    className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Connecter <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {testResult[tk.id] && (
                <p className="mt-2 text-[10px] text-ink-soft">{testResult[tk.id]}</p>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length > visibleCount && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 120)}
            className="rounded-lg border border-line px-5 py-2 text-sm text-ink-soft hover:bg-card2"
          >
            Afficher plus ({filtered.length - visibleCount} restantes)
          </button>
        </div>
      )}
    </div>
  );
}
