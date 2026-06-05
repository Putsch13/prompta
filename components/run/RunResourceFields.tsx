"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug } from "lucide-react";
import type { RunResourceField } from "@/lib/connectors/extract-run-resources";
import { resourceInputKey } from "@/lib/connectors/extract-run-resources";

interface Props {
  fields: RunResourceField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

function ResourceSelect({
  field,
  value,
  parentValue,
  onSelect,
}: {
  field: RunResourceField;
  value: string;
  parentValue?: string;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<{ id: string; label: string; subLabel?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (field.dependsOnKey && !parentValue) {
      setItems([]);
      return;
    }
    setLoading(true);
    setNeedsConnection(false);
    try {
      const params = new URLSearchParams({ resourceType: field.resourceType });
      if (parentValue) params.set("parent", parentValue);
      if (query) params.set("q", query);
      const res = await fetch(`/api/connectors/${field.connectorId}/resources?${params}`);
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
  }, [field.connectorId, field.resourceType, field.dependsOnKey, parentValue, query]);

  useEffect(() => {
    load();
  }, [load]);

  if (field.dependsOnKey && !parentValue) {
    return (
      <p className="text-[10px] text-ink-faint">
        Choisissez d&apos;abord la ressource parente.
      </p>
    );
  }

  if (needsConnection) {
    return (
      <a
        href={`/api/connectors/${field.connectorId}/connect?returnUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/dashboard/connexions")}`}
        className="flex items-center gap-1 text-xs text-accent hover:underline"
      >
        <Plug className="h-3 w-3" /> Connecter {field.connectorId}
      </a>
    );
  }

  return (
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
          onChange={(e) => onSelect(e.target.value)}
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
  );
}

export function RunResourceFields({ fields, values, onChange }: Props) {
  if (fields.length === 0) return null;

  function setFieldValue(field: RunResourceField, id: string) {
    onChange({ ...values, [resourceInputKey(field)]: id });
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-card2 p-3">
      <p className="text-xs font-medium text-ink-soft">Ressources à choisir</p>
      {fields.map((field) => {
        const parentField = field.dependsOnKey
          ? fields.find(
              (f) => f.stepIndex === field.stepIndex && f.paramKey === field.dependsOnKey,
            )
          : undefined;
        const parentValue = parentField ? values[resourceInputKey(parentField)] : undefined;
        return (
          <div key={field.id}>
            <label className="text-[10px] text-ink-faint">{field.label}</label>
            <div className="mt-1 space-y-1">
              <ResourceSelect
                field={field}
                value={values[resourceInputKey(field)] ?? ""}
                parentValue={parentValue}
                onSelect={(id) => setFieldValue(field, id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
