"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { CONNECTORS } from "@/lib/connectors/registry";
import { connectionMatchesConnector } from "@/lib/connectors/resolve-id";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  mistral: "Mistral",
  serper: "Serper.dev",
};

interface KeyStatus {
  provider: string;
  last4: string;
  is_valid: boolean;
}

interface ConnectionStatus {
  connectorId: string;
  status: string;
  accountEmail?: string | null;
  accountName?: string | null;
  workspaceName?: string | null;
}

function connectionAccountLabel(conn: ConnectionStatus): string | null {
  if (conn.accountEmail) return conn.accountEmail;
  if (conn.workspaceName && conn.accountName) return `${conn.accountName} · ${conn.workspaceName}`;
  if (conn.workspaceName) return conn.workspaceName;
  if (conn.accountName) return conn.accountName;
  return null;
}

interface Props {
  requiredSecrets?: string[];
  requiredConnectors?: string[];
  onReadyChange?: (ready: boolean) => void;
}

function connectorLabel(id: string, composioLabels: Record<string, string>): string {
  return (
    composioLabels[id] ??
    CONNECTORS.find((c) => connectionMatchesConnector(c.id, id))?.label ??
    id.replace(/_/g, " ")
  );
}

function isConnectorLinked(id: string, connections: ConnectionStatus[]): boolean {
  return connections.some(
    (x) => x.status === "connected" && connectionMatchesConnector(x.connectorId, id)
  );
}

export function ConnectionsMasque({
  requiredSecrets = [],
  requiredConnectors = [],
  onReadyChange,
}: Props) {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [composioLabels, setComposioLabels] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadConnections = useCallback(async () => {
    setRefreshing(true);
    try {
      const [connRes, tkRes] = await Promise.all([
        fetch("/api/connectors"),
        fetch("/api/composio/toolkits"),
      ]);
      if (connRes.ok) {
        const d = await connRes.json();
        setKeys(d.keys ?? []);
        setConnections(d.connections ?? []);
      }
      if (tkRes.ok) {
        const d = await tkRes.json();
        const map: Record<string, string> = {};
        for (const t of d.toolkits ?? []) map[t.id] = t.label;
        setComposioLabels(map);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadConnections();
    };
    window.addEventListener("focus", loadConnections);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", loadConnections);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadConnections]);

  const missingSecrets = requiredSecrets.filter(
    (p) => !keys.some((k) => k.provider === p && k.is_valid)
  );
  const missingConnectors = requiredConnectors.filter(
    (c) => !isConnectorLinked(c, connections)
  );
  const ready = missingSecrets.length === 0 && missingConnectors.length === 0;

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  if (requiredSecrets.length === 0 && requiredConnectors.length === 0) return null;

  const returnUrl =
    typeof window !== "undefined" ? encodeURIComponent(window.location.href) : "";

  return (
    <div className="rounded-xl border border-line bg-card2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-ink">Préparer votre environnement</h4>
        <button
          type="button"
          onClick={loadConnections}
          disabled={refreshing}
          className="flex items-center gap-1 text-[11px] text-accent hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        Connectez vos comptes — vous reviendrez automatiquement sur cette page après OAuth.
      </p>

      <div className="mt-4 space-y-3">
        {requiredSecrets.map((p) => {
          const key = keys.find((k) => k.provider === p);
          const ok = key?.is_valid;
          return (
            <div key={p} className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
              <div>
                <p className="text-sm font-medium">{PROVIDER_LABELS[p] ?? p}</p>
                <p className="text-xs text-ink-faint">Clé API — pour les appels LLM</p>
              </div>
              {ok ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3 w-3" /> …{key.last4}
                </span>
              ) : (
                <Link href="/dashboard/connexions" className="text-xs text-accent hover:underline">
                  Configurer
                </Link>
              )}
            </div>
          );
        })}

        {requiredConnectors.map((id) => {
          const meta = CONNECTORS.find((c) => connectionMatchesConnector(c.id, id));
          const conn = connections.find(
            (x) => x.status === "connected" && connectionMatchesConnector(x.connectorId, id),
          );
          const ok = Boolean(conn);
          const accountLabel = conn ? connectionAccountLabel(conn) : null;
          const label = connectorLabel(id, composioLabels);
          return (
            <div key={id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-ink-faint">
                  {ok && accountLabel
                    ? `Compte utilisé : ${accountLabel}`
                    : meta?.why ?? "Connexion OAuth requise"}
                </p>
              </div>
              {ok ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3 w-3" /> Connecté
                </span>
              ) : (
                <a
                  href={`/api/connectors/${id}/connect?returnUrl=${returnUrl}`}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  Se connecter <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {!ready && (
        <p className="mt-3 flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          {missingConnectors.length > 0
            ? `Il reste à connecter : ${missingConnectors.map((id) => connectorLabel(id, composioLabels)).join(", ")}`
            : `Il reste à configurer : ${missingSecrets.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")}`}
        </p>
      )}
    </div>
  );
}
