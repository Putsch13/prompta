"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { ComposioToolEntry } from "@/lib/composio/catalog";

interface Props {
  onAdd: (toolkit: string, tool: ComposioToolEntry) => void;
  /** Panneau intégré (modal) vs dropdown flottant */
  inline?: boolean;
}

export function ComposioActionPicker({ onAdd, inline = false }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [toolkits, setToolkits] = useState<{ id: string; label: string }[]>([]);
  const [toolkit, setToolkit] = useState("");
  const [tools, setTools] = useState<ComposioToolEntry[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [open, setOpen] = useState(inline);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/composio/toolkits")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(Boolean(d.enabled));
        const list = (d.toolkits ?? []).map((t: { id: string; label: string }) => ({
          id: t.id,
          label: t.label,
        }));
        setToolkits(list);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toolkit) {
      setTools([]);
      return;
    }
    setLoadingTools(true);
    fetch(`/api/composio/tools?toolkit=${encodeURIComponent(toolkit)}`)
      .then((r) => r.json())
      .then((d) => setTools(d.tools ?? []))
      .catch(() => setTools([]))
      .finally(() => setLoadingTools(false));
  }, [toolkit]);

  if (!enabled) return null;

  const filteredTools = tools.filter((tool) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return tool.name.toLowerCase().includes(q) || tool.slug.toLowerCase().includes(q);
  });

  const panel = (
    <div
      className={
        inline
          ? "w-full rounded-xl border border-line bg-card2 p-3"
          : "absolute left-0 top-full z-[60] mt-2 w-[min(100vw-2rem,24rem)] rounded-xl border border-line bg-card p-3 shadow-lg"
      }
    >
      <p className="mb-2 text-xs font-medium text-ink-soft">Toolkit</p>
      <select
        value={toolkit}
        onChange={(e) => {
          setToolkit(e.target.value);
          setQuery("");
        }}
        className="mb-3 h-9 w-full rounded-lg border border-line bg-card px-2 text-sm"
      >
        <option value="">Choisir…</option>
        {toolkits.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      {toolkit && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer les actions…"
            className="h-8 w-full rounded-lg border border-line bg-card pl-7 pr-2 text-xs"
          />
        </div>
      )}

      {loadingTools && (
        <p className="flex items-center gap-1 text-xs text-ink-faint">
          <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
        </p>
      )}

      {!loadingTools && toolkit && filteredTools.length === 0 && (
        <p className="text-xs text-ink-faint">Aucune action trouvée</p>
      )}

      <div className="max-h-[min(40vh,280px)] space-y-1 overflow-y-auto overscroll-contain">
        {filteredTools.map((tool) => (
          <button
            key={tool.slug}
            type="button"
            onClick={() => {
              onAdd(toolkit, tool);
              if (!inline) setOpen(false);
              setQuery("");
            }}
            className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-card"
          >
            <span className="font-medium text-ink">{tool.name}</span>
            <span className="block font-mono text-[10px] text-ink-faint">{tool.slug}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (inline) {
    return panel;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-2 text-sm text-accent hover:bg-accent-light"
      >
        Action Composio
      </button>
      {open && panel}
    </div>
  );
}
