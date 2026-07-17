"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { UserSetupWizard } from "@/components/onboarding/UserSetupWizard";
import { ComposioCatalog } from "@/components/connections/ComposioCatalog";
import type { ComposioToolkitEntry } from "@/lib/composio/catalog";

interface KeyRecord {
  id: string;
  provider: string;
  last4: string;
  is_valid: boolean;
  last_checked_at: string | null;
}

interface ConnectionRecord {
  connectorId: string;
  status: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  mistral: "Mistral",
  serper: "Serper.dev",
};

function ConnexionsContent() {
  const searchParams = useSearchParams();
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [toolkits, setToolkits] = useState<ComposioToolkitEntry[]>([]);
  const [composioEnabled, setComposioEnabled] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [rotateProvider, setRotateProvider] = useState<string | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [keysRes, connRes, tkRes] = await Promise.all([
      fetch("/api/keys"),
      fetch("/api/connectors"),
      fetch("/api/composio/toolkits"),
    ]);
    if (keysRes.ok) {
      const data = await keysRes.json();
      setKeys(data.keys ?? []);
    }
    if (connRes.ok) {
      const data = await connRes.json();
      setConnections(data.connections ?? []);
    }
    if (tkRes.ok) {
      const data = await tkRes.json();
      setComposioEnabled(Boolean(data.enabled));
      setToolkits(data.toolkits ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      showToast(`${connected} connecté — vérification de l'accès…`);
      // Diagnostic AUTOMATIQUE post-OAuth : détecte tout de suite les
      // connexions « actives mais vides » (aucune page/board/ressource
      // partagée avec l'intégration) au lieu de laisser le 1er run échouer.
      (async () => {
        try {
          const res = await fetch(`/api/connectors/${encodeURIComponent(connected)}/diagnose`, { method: "POST" });
          const diag = await res.json();
          if (diag?.ok) {
            showToast(`${connected} connecté — accès vérifié ✓`);
          } else if (diag?.message) {
            showToast(`⚠️ ${connected} : ${diag.message}`);
          }
        } catch {
          /* diagnostic best-effort */
        }
      })();
    }
    // Message d'erreur réel (ex. app sans credentials gérés) plutôt qu'un
    // générique « Échec de connexion ».
    if (error) showToast(error.length > 12 ? error : "Échec de connexion");
    if (searchParams.get("connect") === "telegram") {
      showToast("Ajoutez votre token bot Telegram ci-dessous");
    }
  }, [searchParams]);

  function showToast(msg: string) {
    setToast(msg);
    // Les messages longs (erreurs de connexion détaillées) restent lisibles.
    setTimeout(() => setToast(null), msg.length > 60 ? 10000 : 4000);
  }

  async function handleDelete(provider: string) {
    await fetch(`/api/keys?provider=${provider}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadAll();
    showToast("Clé supprimée");
  }

  async function saveTelegram() {
    if (!telegramToken.trim()) return;
    setSavingTelegram(true);
    try {
      const res = await fetch("/api/connectors/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: "telegram", apiKey: telegramToken.trim() }),
      });
      if (res.ok) {
        setTelegramToken("");
        loadAll();
        showToast("Bot Telegram enregistré");
      } else {
        showToast("Erreur enregistrement Telegram");
      }
    } finally {
      setSavingTelegram(false);
    }
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-line bg-card2 px-4 py-2 text-sm text-ink shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Mes connexions</h1>
          <p className="mt-2 text-ink-soft">
            Catalogue 360° — connectez Gmail, Notion, HubSpot, Slack, Shopify et 1000+ apps via Composio.
          </p>
        </div>
        <button
          onClick={() => {
            setRotateProvider(undefined);
            setShowWizard(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow-sm hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" />
          Ajouter une clé LLM
        </button>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Clés API LLM (BYOK)</h2>
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-[72px] rounded-xl border border-line bg-card2" />
            <div className="h-[72px] rounded-xl border border-line bg-card2" />
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-8 text-center">
            <p className="text-ink-soft">Aucune clé configurée</p>
            <button
              onClick={() => setShowWizard(true)}
              className="mt-4 rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-accent-ink shadow-glow-sm hover:bg-accent-hover"
            >
              Configurer mes clés
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-xl border border-line bg-card p-4"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-ink">{PROVIDER_LABELS[key.provider] ?? key.provider}</p>
                    <p className="font-mono text-sm text-ink-soft">sk-…{key.last4}</p>
                  </div>
                  {key.is_valid ? (
                    <span className="flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
                      <Check className="h-3 w-3" /> Valide
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" /> Invalide
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setRotateProvider(key.provider);
                      setShowWizard(true);
                    }}
                    className="rounded-lg border border-line p-2 text-ink-soft hover:bg-card2"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  {deleteConfirm === key.provider ? (
                    <button
                      onClick={() => handleDelete(key.provider)}
                      className="rounded-lg bg-destructive/90 px-3 py-1.5 text-xs font-semibold text-[#1a0505] hover:bg-destructive"
                    >
                      Supprimer
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(key.provider)}
                      className="rounded-lg border border-line p-2 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Apps & intégrations</h2>
        <p className="mb-4 text-sm text-ink-soft">
          {composioEnabled
            ? "Recherchez, connectez et testez vos applications."
            : "Configurez COMPOSIO_API_KEY pour débloquer le catalogue complet."}
        </p>

        <div className="mb-6 rounded-xl border border-line bg-card2 p-4">
          <p className="text-sm font-medium text-ink">Telegram (token bot — natif)</p>
          <p className="mb-2 text-xs text-ink-faint">Créez un bot via @BotFather, puis collez le token ici.</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="123456:ABC..."
              className="h-10 flex-1 rounded-lg border border-line bg-card px-3 font-mono text-sm"
            />
            <button
              onClick={saveTelegram}
              disabled={savingTelegram}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
          {connections.some((c) => c.connectorId === "telegram" && c.status === "connected") && (
            <p className="mt-2 flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" /> Telegram connecté
            </p>
          )}
        </div>

        {composioEnabled ? (
          <ComposioCatalog toolkits={toolkits} connections={connections} onRefresh={loadAll} />
        ) : (
          <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
            Ajoutez COMPOSIO_API_KEY dans vos variables d&apos;environnement pour afficher le catalogue.
          </div>
        )}
      </section>

      {showWizard && (
        <UserSetupWizard
          mode={rotateProvider ? "rotate" : "setup"}
          initialProvider={rotateProvider}
          onClose={() => {
            setShowWizard(false);
            setRotateProvider(undefined);
            loadAll();
            showToast(rotateProvider ? "Clé mise à jour" : "Clé ajoutée");
          }}
        />
      )}
    </div>
  );
}

export default function ConnexionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink-soft">Chargement…</div>}>
      <ConnexionsContent />
    </Suspense>
  );
}
