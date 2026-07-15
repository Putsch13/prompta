"use client";

/**
 * « IA du quotidien » — explique et configure Prompta PARTOUT (web, fichiers
 * locaux, mobile). Trois voies, de la plus universelle à la plus intégrée :
 *   1. Bookmarklet « Prompta partout » : zéro installation, marche sur tous les
 *      navigateurs (Chrome, Safari, Firefox) y compris iOS. La voie recommandée.
 *   2. Extension navigateur (Chrome/Edge/Brave) : bouton dans la barre d'outils.
 *   3. Écran d'accueil mobile (PWA) + partage.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkles, MousePointerClick, Puzzle, Smartphone, FileText, Globe, ShieldCheck } from "lucide-react";

function buildBookmarklet(origin: string): string {
  // Capture la page courante puis ouvre /quick et lui transmet le contexte via
  // postMessage (pas de limite d'URL, cross-origin sécurisé par l'origine).
  const src = `(function(){var P='${origin}';function cap(){var isPdf=document.contentType==='application/pdf';var sel=String(getSelection()||'').trim().slice(0,4000);var c='';try{var b=document.body.cloneNode(true);b.querySelectorAll('script,style,noscript,svg,nav,footer,aside,header,iframe').forEach(function(n){n.remove()});c=isPdf?'':(b.innerText||'').replace(/[ \\t]+/g,' ').replace(/\\n\\s*\\n+/g,'\\n').trim().slice(0,15000)}catch(e){}var links=[],seen={};if(!isPdf){var as=document.querySelectorAll('a[href]');for(var i=0;i<as.length&&links.length<40;i++){try{var h=new URL(as[i].getAttribute('href'),location.href).toString();if(!/^https?:/.test(h)||h===location.href||seen[h])continue;seen[h]=1;var l=(as[i].innerText||'').replace(/\\s+/g,' ').trim().slice(0,70);links.push(l?l+' \\u2192 '+h:h)}catch(e){}}}return{url:location.href,title:document.title||'',selection:sel||undefined,content:c,links:links,isPdf:isPdf}}var ctx=cap();var mini={url:ctx.url,title:ctx.title,selection:ctx.selection,isPdf:ctx.isPdf};var q=P+'/quick#'+encodeURIComponent(JSON.stringify(mini));var w=window.open(q,'prompta_quick','width=440,height=640');if(!w){location.href=q;return}function m(e){if(e.origin===P&&e.data==='prompta:ready'){w.postMessage({type:'prompta:ctx',ctx:ctx},P);window.removeEventListener('message',m)}}window.addEventListener('message',m)})();`;
  return "javascript:" + encodeURIComponent(src);
}

type OS = "mac" | "windows" | "ios" | "android" | "other";
function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "other";
}

export default function IaQuotidienPage() {
  const [origin, setOrigin] = useState("");
  const [os, setOs] = useState<OS>("other");
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setOs(detectOS());
  }, []);

  // React neutralise les href "javascript:" — on le pose via setAttribute.
  useEffect(() => {
    if (origin && bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute("href", buildBookmarklet(origin));
    }
  }, [origin]);

  const isMobile = os === "ios" || os === "android";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold text-ink">IA du quotidien</h1>
        </div>
        <p className="text-ink-soft">
          Mets Prompta <strong>partout</strong> : sur n&apos;importe quelle page web, un PDF, un site.
          Tu décris ce que tu veux, Prompta crée l&apos;agent et l&apos;exécute — sans revenir ici.
        </p>
      </div>

      {/* Ce que ça fait */}
      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Globe, t: "Sur le web", d: "Résume un produit, extrais des données, remplis un Sheets — depuis la page où tu es." },
          { icon: FileText, t: "Sur un PDF", d: "Ouvre le PDF dans le navigateur, lance Prompta : il le lit et agit dessus." },
          { icon: ShieldCheck, t: "En sécurité", d: "Rien n'est envoyé à des tiers sans ta validation. Le contenu des pages ne commande jamais l'agent." },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-xl border border-line bg-card p-4">
            <Icon className="mb-2 h-5 w-5 text-accent" />
            <p className="font-semibold text-ink">{t}</p>
            <p className="mt-1 text-sm text-ink-soft">{d}</p>
          </div>
        ))}
      </section>

      {/* 1. Bookmarklet — recommandé, universel */}
      <section className="mb-6 rounded-2xl border-2 border-accent/30 bg-accent/5 p-6">
        <div className="mb-2 flex items-center gap-2">
          <MousePointerClick className="h-5 w-5 text-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">Le plus simple — « Prompta partout »</h2>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-white">recommandé</span>
        </div>
        <p className="mb-4 text-sm text-ink-soft">
          Zéro installation, marche sur <strong>tous les navigateurs</strong> (Mac, Windows, et même iPhone).
          Glisse ce bouton dans ta barre de favoris — ensuite, sur n&apos;importe quelle page, un clic dessus ouvre Prompta.
        </p>

        {!isMobile ? (
          <>
            <a
              ref={bookmarkletRef}
              href="#"
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex cursor-grab items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm active:cursor-grabbing"
              title="Glisse-moi dans ta barre de favoris"
            >
              <Sparkles className="h-4 w-4" /> Prompta partout
            </a>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>Affiche ta barre de favoris ({os === "mac" ? "⌘⇧B" : "Ctrl+Maj+B"}).</li>
              <li><strong>Glisse</strong> le bouton violet ci-dessus dans cette barre.</li>
              <li>Sur n&apos;importe quel site ou PDF, clique le favori « Prompta partout ».</li>
            </ol>
          </>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>Copie ce lien : sur mobile, le glisser-déposer n&apos;existe pas.</li>
            <li>Utilise plutôt l&apos;<strong>écran d&apos;accueil</strong> (section Mobile ci-dessous) — c&apos;est le geste natif sur téléphone.</li>
          </ol>
        )}
      </section>

      {/* 2. Extension navigateur */}
      <section className="mb-6 rounded-2xl border border-line bg-card p-6">
        <div className="mb-2 flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-ink-soft" />
          <h2 className="font-display text-lg font-semibold text-ink">Extension navigateur (Chrome, Edge, Brave)</h2>
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          Un bouton « P » permanent dans la barre d&apos;outils, comme Joko. Idéal sur ordinateur (Mac &amp; Windows).
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Ouvre <code className="rounded bg-card2 px-1">chrome://extensions</code> et active le <strong>Mode développeur</strong> (en haut à droite).</li>
          <li><strong>Charger l&apos;extension non empaquetée</strong> → choisis le dossier <code className="rounded bg-card2 px-1">extension/</code> du projet.</li>
          <li>Clique l&apos;icône <strong>puzzle 🧩</strong> de Chrome, puis la <strong>punaise</strong> à côté de « Prompta Everywhere » : l&apos;icône « P » reste alors visible en haut.</li>
          <li>Un clic sur « P » ouvre la barre. <span className="text-ink-faint">(La publication sur le Chrome Web Store — install en 1 clic — arrive.)</span></li>
        </ol>
      </section>

      {/* 3. Mobile */}
      <section className="mb-6 rounded-2xl border border-line bg-card p-6">
        <div className="mb-2 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-ink-soft" />
          <h2 className="font-display text-lg font-semibold text-ink">Sur mobile (iPhone &amp; Android)</h2>
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          Ajoute Prompta à ton écran d&apos;accueil : tu l&apos;ouvres comme une appli, tu colles une URL ou tu écris ton ordre.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-card2 p-4 text-sm">
            <p className="font-semibold text-ink">iPhone (Safari)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-ink-soft">
              <li>Ouvre <code className="rounded bg-card px-1">{origin || "prompta"}/quick</code></li>
              <li>Bouton Partager → <strong>Sur l&apos;écran d&apos;accueil</strong></li>
            </ol>
          </div>
          <div className="rounded-xl border border-line bg-card2 p-4 text-sm">
            <p className="font-semibold text-ink">Android (Chrome)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-ink-soft">
              <li>Ouvre <code className="rounded bg-card px-1">{origin || "prompta"}/quick</code></li>
              <li>Menu ⋮ → <strong>Ajouter à l&apos;écran d&apos;accueil</strong></li>
            </ol>
          </div>
        </div>
        <a href="/quick" target="_blank" rel="noopener" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Ouvrir la barre Prompta maintenant →
        </a>
      </section>

      <p className="text-center text-xs text-ink-faint">
        Astuce : sur ordinateur, le bookmarklet « Prompta partout » est le moyen le plus rapide et le plus fiable.
      </p>
    </div>
  );
}
