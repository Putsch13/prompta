"use client";

import { useState } from "react";

/**
 * Démo visuelle du panneau style HUD : glisse depuis la droite.
 * Permet de voir le comportement attendu même sans extension (ex. Safari).
 */
export function ExtensionPanelDemo() {
  const [open, setOpen] = useState(true);

  return (
    <div className="relative mx-auto mt-12 w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-card shadow-glow-sm">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-2 flex-1 truncate rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/40">
          n&apos;importe-quelle-page.com
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#67D0FF] to-[#1E7FC2] text-[11px] font-bold text-accent-ink shadow-glow-sm transition hover:scale-105"
          title="Clic sur l'icône P"
          aria-pressed={open}
        >
          P
        </button>
      </div>

      <div className="relative h-[320px] sm:h-[380px]">
        <div className="absolute inset-0 p-6 text-left">
          <div className="h-3 w-2/5 rounded bg-white/10" />
          <div className="mt-4 space-y-2">
            <div className="h-2.5 w-full rounded bg-white/[0.06]" />
            <div className="h-2.5 w-[92%] rounded bg-white/[0.06]" />
            <div className="h-2.5 w-[78%] rounded bg-white/[0.06]" />
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="h-20 rounded-xl bg-white/[0.04]" />
            <div className="h-20 rounded-xl bg-white/[0.04]" />
          </div>
          <p className="absolute bottom-5 left-6 text-xs text-white/35">
            Clique le <span className="font-semibold text-white/55">P</span> en haut à droite →
          </p>
        </div>

        <div
          className={`absolute inset-0 bg-black/35 transition-opacity duration-300 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setOpen(false)}
          aria-hidden
        />

        <aside
          className={`absolute inset-y-0 right-0 flex w-[min(100%,280px)] flex-col border-l border-accent/35 bg-card2/95 shadow-[-12px_0_40px_rgba(0,0,0,.5)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] sm:w-[300px] ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
          aria-hidden={!open}
        >
          <header className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#67D0FF] to-[#1E7FC2] text-[11px] font-bold text-accent-ink">
              P
            </span>
            <span className="flex-1 text-sm font-semibold text-ink">
              Prompta <span className="font-normal text-white/40">· partout</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/10 px-2 py-0.5 text-xs text-white/50 hover:text-ink"
            >
              ✕
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 text-left">
            <p className="text-center text-[12px] leading-relaxed text-white/45">
              <span className="font-medium text-white/70">Ton assistant, partout.</span>
              <br />
              Réponse immédiate ou mission sur tes apps.
            </p>
            <button
              type="button"
              className="mx-auto rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/55"
            >
              Résume cette page en 5 points
            </button>
          </div>
          <div className="border-t border-white/10 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <div className="h-8 flex-1 rounded text-[11px] leading-8 text-white/30">
                Demande ou mission…
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#67D0FF] to-[#1E7FC2] text-sm text-accent-ink">
                ↑
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
