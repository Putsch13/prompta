"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, X, Bell } from "lucide-react";

interface ApprovalItem {
  id: string;
  runId: string;
  agentTitle: string;
  /** Libellé de l'étape (ex. « Envoi de l'email au client ») + aperçu du contenu. */
  stepLabel?: string;
  preview?: string;
}

const POLL_MS = 15_000;

/**
 * Notifie l'utilisateur qu'un agent (qui tourne en fond) attend une validation
 * humaine — sans qu'il ait besoin d'être sur la page du run.
 * - bannière flottante persistante tant qu'il y a des validations en attente ;
 * - notification navigateur quand une NOUVELLE validation apparaît.
 */
export function ApprovalNotifier() {
  const pathname = usePathname();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const notifiedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: (ApprovalItem & { payload?: { label?: string; preview?: string } })[];
      };
      const next: ApprovalItem[] = (data.items ?? []).map((i) => ({
        id: i.id,
        runId: i.runId,
        agentTitle: i.agentTitle,
        stepLabel: i.payload?.label,
        preview: i.payload?.preview,
      }));
      setItems(next);

      // Notification navigateur sur toute NOUVELLE validation jamais vue.
      const fresh = next.filter((i) => !seenRef.current.has(i.id));
      if (fresh.length > 0 && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          for (const f of fresh) {
            const what = f.stepLabel ? ` — ${f.stepLabel}` : "";
            const snippet = f.preview ? `\n« ${f.preview.slice(0, 120)}… »` : "";
            new Notification(`Validation requise : ${f.agentTitle}`, {
              body: `${f.agentTitle}${what} attend votre feu vert.${snippet}`,
              tag: f.id,
            });
          }
        } else if (Notification.permission === "default" && !notifiedRef.current) {
          notifiedRef.current = true;
          Notification.requestPermission().catch(() => undefined);
        }
      }
      next.forEach((i) => seenRef.current.add(i.id));
    } catch {
      /* silencieux */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, pathname]);

  const visible = items.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[min(92vw,360px)] space-y-2">
      <div className="overflow-hidden rounded-2xl border border-amber-400/50 bg-slate-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 bg-amber-500/10 px-4 py-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
          <p className="flex-1 text-sm font-semibold text-white">
            {visible.length} validation{visible.length > 1 ? "s" : ""} en attente
          </p>
          <Bell className="h-3.5 w-3.5 text-amber-300/70" />
        </div>
        <ul className="max-h-56 divide-y divide-white/5 overflow-auto">
          {visible.slice(0, 4).map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white/85">{i.agentTitle}</span>
                {(i.stepLabel || i.preview) && (
                  <span className="block truncate text-[11px] text-white/50">
                    {i.stepLabel ?? i.preview?.slice(0, 80)}
                  </span>
                )}
              </span>
              <Link
                href={`/dashboard/validations?focus=${i.id}`}
                className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-400"
              >
                Ouvrir
              </Link>
              <button
                type="button"
                onClick={() => setDismissed((d) => new Set(d).add(i.id))}
                className="shrink-0 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
                aria-label="Masquer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-2">
          <Link
            href="/dashboard/validations"
            className="text-xs font-medium text-amber-300 hover:underline"
          >
            Voir toutes les validations →
          </Link>
          {typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "default" && (
              <button
                type="button"
                onClick={() => Notification.requestPermission().catch(() => undefined)}
                className="shrink-0 text-[11px] text-white/50 hover:text-white hover:underline"
              >
                Activer les notifs navigateur
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
