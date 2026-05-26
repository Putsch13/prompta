"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, AlertTriangle, ExternalLink } from "lucide-react";
import { CONNECTORS } from "@/lib/connectors/registry";

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
}

interface Props {
  requiredSecrets?: string[];
  requiredConnectors?: string[];
  onReadyChange?: (ready: boolean) => void;
}

export function ConnectionsMasque({
  requiredSecrets = [],
  requiredConnectors = [],
  onReadyChange,
}: Props) {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);

  useEffect(() => {
    fetch("/api/connectors")
      .then((r) => r.json())
      .then((d) => {
        setKeys(d.keys ?? []);
        setConnections(d.connections ?? []);
      })
      .catch(() => undefined);
  }, []);

  const missingSecrets = requiredSecrets.filter(
    (p) => !keys.some((k) => k.provider === p && k.is_valid)
  );
  const missingConnectors = requiredConnectors.filter(
    (c) => !connections.some((x) => x.connectorId === c && x.status === "connected")
  );
  const ready = missingSecrets.length === 0 && missingConnectors.length === 0;

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  if (requiredSecrets.length === 0 && requiredConnectors.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-card2 p-4">
      <h4 className="font-medium text-ink">Préparer votre environnement</h4>
      <p className="mt-1 text-xs text-ink-soft">
        Connectez vos comptes et clés pour que l&apos;agent puisse agir en votre nom.
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
          const meta = CONNECTORS.find((c) => c.id === id);
          const conn = connections.find((x) => x.connectorId === id);
          const ok = conn?.status === "connected";
          return (
            <div key={id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
              <div>
                <p className="text-sm font-medium">{meta?.label ?? id}</p>
                <p className="text-xs text-ink-faint">{meta?.why ?? "Connexion OAuth requise"}</p>
              </div>
              {ok ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3 w-3" /> Connecté
                </span>
              ) : (
                <a
                  href={`/api/connectors/${id}/connect`}
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
            ? `Il reste à connecter : ${missingConnectors.map((id) => CONNECTORS.find((c) => c.id === id)?.label ?? id).join(", ")}`
            : `Il reste à configurer : ${missingSecrets.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")}`}
        </p>
      )}
    </div>
  );
}
