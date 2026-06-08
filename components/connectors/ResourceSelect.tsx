"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug, List, Pencil } from "lucide-react";
import {
  resourceInputHint,
  resourceInputPlaceholder,
} from "@/lib/connectors/resource-input-hints";

interface ResourceItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface Props {
  connectorId: string;
  resourceType: string;
  value: string;
  /** Valeur de la ressource parente (ex. spreadsheetId pour lister les onglets). */
  parentValue?: string;
  onChange: (id: string) => void;
  /** Autorise le repli « coller un ID » (par défaut true). */
  allowManual?: boolean;
  /** Libellé utilisé dans le message de chargement. */
  label?: string;
}

/**
 * Sélecteur de ressource unifié (builder + run).
 *
 * - Liste automatiquement les ressources du compte connecté (Sheets, salons…).
 * - Repli « coller un ID » si l'utilisateur préfère, ou si le listing échoue / est vide.
 * - Affiche un bouton Connecter/Reconnecter si la connexion manque ou a perdu ses scopes.
 */
export function ResourceSelect({
  connectorId,
  resourceType,
  value,
  parentValue,
  onChange,
  allowManual = true,
  label,
}: Props) {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNeedsConnection(false);
    setNeedsReconnect(false);
    setReconnectMessage(null);
    try {
      const params = new URLSearchParams({ resourceType });
      if (parentValue) params.set("parent", parentValue);
      if (query) params.set("q", query);
      const res = await fetch(`/api/connectors/${connectorId}/resources?${params}`);
      const data = await res.json();
      if (res.status === 409 && data.needsConnection) {
        setNeedsConnection(true);
        setItems([]);
        return;
      }
      if (res.status === 409 && data.needsReconnect) {
        setNeedsReconnect(true);
        setReconnectMessage(data.message ?? null);
        setItems([]);
        return;
      }
      if (res.ok) {
        const list: ResourceItem[] = data.items ?? [];
        setItems(list);
        if (list.length === 0 && allowManual) setManual(true);
      } else if (allowManual) {
        setManual(true);
      }
    } catch {
      if (allowManual) setManual(true);
    } finally {
      setLoading(false);
    }
  }, [resourceType, connectorId, parentValue, query, allowManual]);

  useEffect(() => {
    if (!manual) load();
  }, [load, manual]);

  const connectHref = `/api/connectors/${connectorId}/connect?force=true&returnUrl=${encodeURIComponent(
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
  )}`;

  if (needsConnection || needsReconnect) {
    return (
      <div className="space-y-1">
        {reconnectMessage && <p className="text-[10px] text-amber-700">{reconnectMessage}</p>}
        <a
          href={connectHref}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <Plug className="h-3 w-3" />
          {needsReconnect ? `Reconnecter ${connectorId}` : `Connecter ${connectorId}`}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {allowManual && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setManual((m) => !m)}
            className="flex items-center gap-1 text-[10px] text-accent hover:underline"
          >
            {manual ? (
              <>
                <List className="h-3 w-3" /> Choisir dans la liste
              </>
            ) : (
              <>
                <Pencil className="h-3 w-3" /> Coller un ID
              </>
            )}
          </button>
        </div>
      )}

      {manual ? (
        <>
          <p className="text-[10px] text-ink-faint">{resourceInputHint(resourceType)}</p>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder={resourceInputPlaceholder(resourceType)}
            className="h-9 w-full rounded border border-line bg-card px-2 font-mono text-xs"
          />
        </>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="h-8 w-full rounded border border-line bg-card px-2 text-xs"
          />
          {loading ? (
            <div className="flex items-center gap-1 text-[10px] text-ink-faint">
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement{label ? ` — ${label}` : ""}…
            </div>
          ) : (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 w-full rounded border border-line bg-card px-2 text-xs"
            >
              <option value="">— Choisir —</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.subLabel ? ` (${item.subLabel})` : ""}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}
