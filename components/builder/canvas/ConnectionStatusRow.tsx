"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug } from "lucide-react";

interface Props {
  connectorId: string;
  returnUrl?: string;
}

export function ConnectionStatusRow({ connectorId, returnUrl }: Props) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!connectorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/connectors/${connectorId}/status`);
      const data = await res.json();
      setConnected(!!data.connected);
      setAccount(data.account);
    } finally {
      setLoading(false);
    }
  }, [connectorId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (!connectorId) return null;

  const href = `/api/connectors/${connectorId}/connect?returnUrl=${encodeURIComponent(
    returnUrl ?? (typeof window !== "undefined" ? window.location.pathname : "/dashboard/new"),
  )}`;

  if (loading) {
    return (
      <p className="flex items-center gap-1 text-[10px] text-ink-faint">
        <Loader2 className="h-3 w-3 animate-spin" /> Vérification connexion…
      </p>
    );
  }

  if (connected) {
    return (
      <p className="text-[10px] text-green-700">
        ✅ Connecté{account ? ` · ${account}` : ""}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-[10px] text-amber-700">⚠️ Non connecté</p>
      {/* Nouvel onglet : la création en cours n'est pas perdue — le statut se
          rafraîchit automatiquement au retour (listener focus). */}
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1 rounded border border-accent px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/5"
      >
        <Plug className="h-3 w-3" /> Se connecter
      </a>
    </div>
  );
}
