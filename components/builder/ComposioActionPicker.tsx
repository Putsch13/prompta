"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { ComposioToolEntry } from "@/lib/composio/catalog";

interface Props {
  onAdd: (toolkit: string, tool: ComposioToolEntry) => void;
}

export function ComposioActionPicker({ onAdd }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [toolkits, setToolkits] = useState<{ id: string; label: string }[]>([]);
  const [toolkit, setToolkit] = useState("");
  const [tools, setTools] = useState<ComposioToolEntry[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [open, setOpen] = useState(false);

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-2 text-sm text-accent hover:bg-accent-light"
      >
        <Plus className="h-4 w-4" /> Action Composio
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-xl border border-line bg-card p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium text-ink-soft">Toolkit</p>
          <select
            value={toolkit}
            onChange={(e) => setToolkit(e.target.value)}
            className="mb-3 h-9 w-full rounded-lg border border-line bg-card2 px-2 text-sm"
          >
            <option value="">Choisir…</option>
            {toolkits.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          {loadingTools && (
            <p className="flex items-center gap-1 text-xs text-ink-faint">
              <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
            </p>
          )}

          {!loadingTools && toolkit && tools.length === 0 && (
            <p className="text-xs text-ink-faint">Aucune action trouvée</p>
          )}

          <div className="max-h-48 space-y-1 overflow-y-auto">
            {tools.slice(0, 30).map((tool) => (
              <button
                key={tool.slug}
                type="button"
                onClick={() => {
                  onAdd(toolkit, tool);
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-card2"
              >
                <span className="font-medium text-ink">{tool.name}</span>
                <span className="block font-mono text-[10px] text-ink-faint">{tool.slug}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
