"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/** Détecte Safari / Firefox : l'extension Chromium n'y tourne pas. */
export function BrowserCompatBanner() {
  const [kind, setKind] = useState<"safari" | "firefox" | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isFirefox = /Firefox\//i.test(ua);
    // Safari : contient Safari mais pas Chrome/Chromium/Edg/CriOS (Chrome iOS).
    const isSafari =
      /Safari\//i.test(ua) &&
      !/Chrome\//i.test(ua) &&
      !/Chromium\//i.test(ua) &&
      !/Edg\//i.test(ua) &&
      !/OPR\//i.test(ua) &&
      !/CriOS\//i.test(ua) &&
      !/FxiOS\//i.test(ua);
    if (isFirefox) setKind("firefox");
    else if (isSafari) setKind("safari");
  }, []);

  if (!kind) return null;

  const name = kind === "safari" ? "Safari" : "Firefox";

  return (
    <div
      role="alert"
      className="mb-8 flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3.5 text-sm text-ink sm:px-5"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div>
        <p className="font-semibold text-warning">
          Tu es sur {name} — l&apos;extension ne s&apos;installe pas ici.
        </p>
        <p className="mt-1 leading-relaxed text-ink-soft">
          Prompta partout tourne sur <strong className="text-ink">Chrome, Edge, Brave, Arc ou Opera</strong>.
          Ouvre ce guide dans l&apos;un de ces navigateurs pour installer le panneau
          latéral. En attendant, tu peux{" "}
          <a href="/quick" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
            essayer /quick
          </a>{" "}
          (même cerveau, sans panneau sur les autres sites).
        </p>
      </div>
    </div>
  );
}
