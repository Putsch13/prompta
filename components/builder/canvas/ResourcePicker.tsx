"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug } from "lucide-react";
import type { ParamScope } from "@/lib/connectors/types";
import { resourcePlaceholder } from "@/lib/connectors/param-bindings";

interface ResourceItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface Props {
  connectorId: string;
  resourceType: string;
  value: string;
  scope: ParamScope;
  onChange: (value: string, scope: ParamScope) => void;
  dependsOnValue?: string;
  label?: string;
  /** Masque le switch de portée — sélection builder uniquement */
  pinOnly?: boolean;
}

const SCOPE_OPTIONS: { id: ParamScope; label: string; hint: string }[] = [
  { id: "builder_test", label: "Fixer (test)", hint: "Mes données — retirées à la vente" },
  { id: "end_user", label: "Abonné choisira", hint: "Placeholder au run" },
  { id: "dynamic", label: "Dynamique", hint: "Binding {{variable}}" },
];

export function ResourcePicker({
  connectorId,
  resourceType,
  value,
  scope,
  onChange,
  dependsOnValue,
  label,
  pinOnly = false,
}: Props) {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [query, setQuery] = useState("");

  const effectiveScope: ParamScope = pinOnly ? "builder_test" : scope;

  const load = useCallback(async () => {
    if (effectiveScope !== "builder_test") return;
    setLoading(true);
    setNeedsConnection(false);
    try {
      const params = new URLSearchParams({ resourceType });
      if (dependsOnValue) params.set("parent", dependsOnValue);
      if (query) params.set("q", query);
      const res = await fetch(`/api/connectors/${connectorId}/resources?${params}`);
      const data = await res.json();
      if (res.status === 409 && data.needsConnection) {
        setNeedsConnection(true);
        setItems([]);
        return;
      }
      if (res.ok) setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [connectorId, resourceType, dependsOnValue, query, effectiveScope]);

  useEffect(() => {
    if (effectiveScope === "builder_test") load();
  }, [effectiveScope, load]);

  useEffect(() => {
    if (!pinOnly && scope === "end_user" && !value.startsWith("{{resource:")) {
      onChange(resourcePlaceholder(resourceType), "end_user");
    }
  }, [scope, resourceType, value, onChange, pinOnly]);

  return (
    <div className="space-y-2 rounded-lg border border-line bg-card2 p-2">
      {label && <p className="text-[10px] font-medium text-ink-soft">{label}</p>}
      {!pinOnly && (
      <div className="flex flex-wrap gap-1">
        {SCOPE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            title={opt.hint}
            onClick={() => {
              if (opt.id === "end_user") {
                onChange(resourcePlaceholder(resourceType), opt.id);
              } else if (opt.id === "builder_test") {
                onChange("", opt.id);
              } else {
                onChange("", opt.id);
              }
            }}
            className={`rounded px-2 py-0.5 text-[10px] ${
              scope === opt.id ? "bg-accent text-white" : "bg-card text-ink-soft"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      )}

      {(pinOnly || scope === "builder_test") && (
        <>
          {needsConnection ? (
            <a
              href={`/api/connectors/${connectorId}/connect?returnUrl=${encodeURIComponent("/dashboard/new")}`}
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <Plug className="h-3 w-3" /> Connecter {connectorId}
            </a>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="h-8 w-full rounded border border-line px-2 text-xs"
              />
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
              ) : (
                <select
                  value={value}
                  onChange={(e) => onChange(e.target.value, "builder_test")}
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
        </>
      )}

      {!pinOnly && scope === "end_user" && (
        <p className="text-[10px] text-ink-faint">
          L&apos;abonné choisira dans son compte : {resourcePlaceholder(resourceType)}
        </p>
      )}

      {!pinOnly && scope === "dynamic" && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value, "dynamic")}
          placeholder="{{variable}} ou {{step_output}}"
          className="h-8 w-full rounded border border-line px-2 font-mono text-xs"
        />
      )}
    </div>
  );
}
