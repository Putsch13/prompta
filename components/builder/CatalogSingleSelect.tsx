"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

interface Entry {
  id: string;
  label: string;
  popular?: boolean;
  [key: string]: unknown;
}

interface Props {
  catalog: Entry[];
  value: string;
  onChange: (id: string) => void;
  groupByKey?: string;
  placeholder?: string;
}

export function CatalogSingleSelect({
  catalog,
  value,
  onChange,
  groupByKey = "provider",
  placeholder = "Rechercher…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = catalog.find((c) => c.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        String(c[groupByKey] ?? "").toLowerCase().includes(q)
    );
  }, [catalog, search, groupByKey]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const item of filtered) {
      const key = String(item[groupByKey] ?? "Autre");
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [filtered, groupByKey]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-line bg-card px-3 text-sm"
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-4 w-4 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-2">
            {Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="mb-1 px-2 text-xs font-semibold uppercase text-ink-faint">{group}</p>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                      item.id === value ? "bg-accent text-accent-ink" : "hover:bg-accent-light"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
