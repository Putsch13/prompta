"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FlaskConical } from "lucide-react";

/**
 * Détecte le navigateur du visiteur :
 *  - Safari  → l'extension n'y est pas encore distribuée (conversion en cours) ;
 *  - Firefox → supporté en bêta (ZIP dédié) : bandeau informatif, pas bloquant.
 */
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

  if (kind === "firefox") {
    return (
      <div
        role="status"
        className="mb-8 flex gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3.5 text-sm text-ink sm:px-5"
      >
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="font-semibold text-accent">
            Tu es sur Firefox — le support est en bêta.
          </p>
          <p className="mt-1 leading-relaxed text-ink-soft">
            Télécharge le{" "}
            <a
              href="/downloads/prompta-firefox.zip"
              download="prompta-firefox.zip"
              className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              ZIP Firefox
            </a>{" "}
            et suis la section « Installation sur Firefox » plus bas. C&apos;est
            une bêta : si quelque chose coince,{" "}
            <a href="/quick" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
              /quick
            </a>{" "}
            reste toujours dispo (même cerveau, sans extension).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mb-8 flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3.5 text-sm text-ink sm:px-5"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div>
        <p className="font-semibold text-warning">
          Tu es sur Safari — l&apos;extension n&apos;y est pas encore disponible.
        </p>
        <p className="mt-1 leading-relaxed text-ink-soft">
          La version Safari est en préparation (conversion prête, distribution
          App Store à venir). En attendant, Prompta partout tourne sur{" "}
          <strong className="text-ink">Chrome, Edge, Brave, Arc, Opera</strong> et
          Firefox (bêta). Tu peux aussi{" "}
          <a href="/quick" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
            essayer /quick
          </a>{" "}
          (même cerveau, sans panneau sur les autres sites).
        </p>
      </div>
    </div>
  );
}
