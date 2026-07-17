"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { X, ChevronDown, Search } from "lucide-react";

interface BaseCatalogEntry {
  id: string;
  label: string;
  popular: boolean;
}

interface Props {
  catalog: BaseCatalogEntry[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  groupByKey?: string;
  placeholder?: string;
}

export function CatalogMultiSelect({
  catalog,
  selected,
  onChange,
  label,
  groupByKey,
  placeholder = "Rechercher…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const popularItems = useMemo(() => catalog.filter((c) => c.popular), [catalog]);

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter((c) => {
      const item = c as unknown as Record<string, unknown>;
      return (
        c.label.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (groupByKey && String(item[groupByKey] ?? "").toLowerCase().includes(q))
      );
    });
  }, [catalog, search, groupByKey]);

  const grouped = useMemo(() => {
    if (!groupByKey) return null;
    const map = new Map<string, BaseCatalogEntry[]>();
    for (const item of filteredCatalog) {
      const record = item as unknown as Record<string, unknown>;
      const key = String(record[groupByKey] ?? "Autre");
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [filteredCatalog, groupByKey]);

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedItems = useMemo(
    () => catalog.filter((c) => selected.includes(c.id)),
    [catalog, selected]
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2.5 py-1 text-xs font-medium text-accent"
            >
              {item.label}
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Popular chips + see all button */}
      <div className="flex flex-wrap items-center gap-2">
        {popularItems
          .filter((p) => !selected.includes(p.id))
          .slice(0, 6)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:border-accent hover:bg-accent-light"
            >
              {item.label}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent"
        >
          + Voir tout <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 z-20 mt-2 max-h-80 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-4 w-4 text-ink-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
              autoFocus
            />
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto p-2">
            {grouped ? (
              Array.from(grouped.entries()).map(([group, items]) => (
                <div key={group} className="mb-3">
                  <p className="mb-1 px-2 text-xs font-semibold uppercase text-ink-faint">
                    {group}
                  </p>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {items.map((item) => {
                      const isSelected = selected.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggle(item.id)}
                          className={`rounded-lg px-2 py-1.5 text-left text-sm ${
                            isSelected
                              ? "bg-accent text-accent-ink"
                              : "text-ink hover:bg-accent-light"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {filteredCatalog.map((item) => {
                  const isSelected = selected.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`rounded-lg px-2 py-1.5 text-left text-sm ${
                        isSelected ? "bg-accent text-accent-ink" : "text-ink hover:bg-accent-light"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredCatalog.length === 0 && (
              <p className="py-4 text-center text-sm text-ink-faint">Aucun résultat</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
