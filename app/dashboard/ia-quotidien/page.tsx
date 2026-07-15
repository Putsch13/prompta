"use client";

/**
 * « IA du quotidien » — présente le concept d'assistant qui voit ce que tu as
 * ouvert et prend la main sur tes apps, puis configure Prompta PARTOUT.
 * Trois voies : bookmarklet universel (recommandé), extension navigateur, PWA.
 */

import { useEffect, useRef, useState } from "react";
import {
  Sparkles, MousePointerClick, Puzzle, Smartphone, Plus,
  Eye, Hand, PencilLine, Layers, ShieldCheck,
} from "lucide-react";

function buildBookmarklet(origin: string): string {
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

interface Conn {
  connectorId: string;
  usable: boolean;
}

export default function IaQuotidienPage() {
  const [origin, setOrigin] = useState("");
  const [os, setOs] = useState<OS>("other");
  const [conns, setConns] = useState<Conn[] | null>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setOs(detectOS());
    fetch("/api/extension/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConns(d.connections ?? []))
      .catch(() => setConns([]));
  }, []);

  useEffect(() => {
    if (origin && bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute("href", buildBookmarklet(origin));
    }
  }, [origin]);

  const isMobile = os === "ios" || os === "android";
  const usable = (conns ?? []).filter((c, i, a) =>
    c.usable && a.findIndex((x) => x.connectorId.replace(/[^a-z0-9]/gi, "") === c.connectorId.replace(/[^a-z0-9]/gi, "")) === i,
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero — le concept */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-accent" />
          <h1 className="font-display text-3xl font-bold text-ink">Ton assistant du quotidien</h1>
        </div>
        <p className="text-lg text-ink-soft">
          Un assistant qui te suit <strong>partout dans ton navigateur</strong>, voit ce que tu as ouvert
          — tes onglets, un article, un PDF, une fiche produit — et <strong>prend la main sur tes apps</strong> pour toi.
        </p>
        <p className="mt-2 text-ink-soft">
          Tu lui donnes une mission en une phrase. Il lit ce qu&apos;il faut, puis agit&nbsp;: crée un Google&nbsp;Sheets,
          envoie un email, ajoute des produits sur Shopify, met à jour Notion… via tes <strong>1000+ apps connectables</strong>.
        </p>
      </div>

      {/* Comment ça marche */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-ink-faint">Comment ça marche</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Layers, t: "1. Tu travailles", d: "15 onglets ouverts, un PDF, une page produit — comme d'habitude." },
            { icon: PencilLine, t: "2. Tu demandes", d: "« Compare ces 3 offres et fais-moi un tableau », « Ajoute ces produits sur mon Shopify »." },
            { icon: Hand, t: "3. Il prend la main", d: "Il lit tes onglets, croise l'info, et agit sur tes apps. Tu valides les envois." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-line bg-card p-4">
              <Icon className="mb-2 h-5 w-5 text-accent" />
              <p className="font-semibold text-ink">{t}</p>
              <p className="mt-1 text-sm text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ce qu'il voit / ce qu'il fait */}
      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <Eye className="h-5 w-5 text-accent" />
            <p className="font-semibold text-ink">Il voit ce que tu as ouvert</p>
          </div>
          <p className="text-sm text-ink-soft">
            Avec l&apos;extension, il a la vue d&apos;ensemble de tous tes onglets et peut lire n&apos;importe
            lequel à la demande. Rien n&apos;est lu tant que tu ne lui confies pas une mission.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <p className="font-semibold text-ink">Il agit, mais tu gardes le contrôle</p>
          </div>
          <p className="text-sm text-ink-soft">
            Tout envoi ou publication (email, Shopify, message…) passe par ta <strong>validation</strong>.
            Le contenu des pages est une donnée : il ne peut jamais donner d&apos;ordre à l&apos;assistant.
          </p>
        </div>
      </section>

      {/* Apps connectées + connecter plus */}
      <section className="mb-8 rounded-2xl border border-line bg-card2 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Les apps sur lesquelles il peut agir</h2>
          <a href="/dashboard/connexions" className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> Connecter une app
          </a>
        </div>
        {conns === null ? (
          <p className="text-sm text-ink-faint">Chargement…</p>
        ) : usable.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Aucune app connectée pour l&apos;instant. <a href="/dashboard/connexions" className="text-accent underline">Connecte Gmail, Notion, Shopify…</a> pour que l&apos;assistant puisse agir.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {usable.map((c) => (
                <span key={c.connectorId} className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs text-ink-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {c.connectorId}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              Besoin d&apos;une autre app parmi les 1000+&nbsp;? <a href="/dashboard/connexions" className="text-accent underline">Ajoute-la ici</a> — l&apos;assistant la mobilisera automatiquement.
            </p>
          </>
        )}
      </section>

      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-ink-faint">Installer l&apos;assistant</h2>

      {/* 1. Bookmarklet — recommandé, universel */}
      <section className="mb-6 rounded-2xl border-2 border-accent/30 bg-accent/5 p-6">
        <div className="mb-2 flex items-center gap-2">
          <MousePointerClick className="h-5 w-5 text-accent" />
          <h3 className="font-display text-lg font-semibold text-ink">Le plus simple — « Prompta partout »</h3>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-white">recommandé</span>
        </div>
        <p className="mb-4 text-sm text-ink-soft">
          Zéro installation, marche sur <strong>tous les navigateurs</strong> (Mac, Windows, et même iPhone).
          Glisse ce bouton dans ta barre de favoris — ensuite, sur n&apos;importe quelle page, un clic dessus ouvre l&apos;assistant.
          <span className="text-ink-faint"> (Pour la vue de tous les onglets, utilise l&apos;extension ci-dessous.)</span>
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
            <li>Sur mobile, le glisser-déposer n&apos;existe pas.</li>
            <li>Utilise plutôt l&apos;<strong>écran d&apos;accueil</strong> (section Mobile ci-dessous) — c&apos;est le geste natif sur téléphone.</li>
          </ol>
        )}
      </section>

      {/* 2. Extension navigateur */}
      <section className="mb-6 rounded-2xl border border-line bg-card p-6">
        <div className="mb-2 flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-ink-soft" />
          <h3 className="font-display text-lg font-semibold text-ink">Extension navigateur (Chrome, Edge, Brave)</h3>
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-soft">vue tous onglets</span>
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          Un bouton « P » permanent dans la barre d&apos;outils (comme Joko), et la <strong>vue d&apos;ensemble de tous tes onglets</strong>.
          Idéal sur ordinateur (Mac &amp; Windows).
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Ouvre <code className="rounded bg-card2 px-1">chrome://extensions</code> et active le <strong>Mode développeur</strong> (en haut à droite).</li>
          <li><strong>Charger l&apos;extension non empaquetée</strong> → choisis le dossier <code className="rounded bg-card2 px-1">extension/</code> du projet.</li>
          <li>Clique l&apos;icône <strong>puzzle 🧩</strong> de Chrome, puis la <strong>punaise</strong> à côté de « Prompta Everywhere » : l&apos;icône « P » reste visible en haut.</li>
          <li>Un clic sur « P » ouvre l&apos;assistant. <span className="text-ink-faint">(Publication sur le Chrome Web Store — install en 1 clic — à venir.)</span></li>
        </ol>
      </section>

      {/* 3. Mobile */}
      <section className="mb-6 rounded-2xl border border-line bg-card p-6">
        <div className="mb-2 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-ink-soft" />
          <h3 className="font-display text-lg font-semibold text-ink">Sur mobile (iPhone &amp; Android)</h3>
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
          Ouvrir l&apos;assistant maintenant →
        </a>
      </section>

      {/* Honnêteté : le bureau natif */}
      <section className="mb-6 rounded-xl border border-dashed border-line bg-card2 p-4">
        <p className="text-sm text-ink-soft">
          <strong>Et les apps du bureau (hors navigateur) ?</strong> Aujourd&apos;hui l&apos;assistant voit tout ton
          <strong> navigateur</strong> (onglets, PDF ouverts dans un onglet). Pour qu&apos;il voie aussi les logiciels
          natifs de ton Mac/PC (un PDF sur le bureau, une app qui tourne), il faudrait une petite <strong>app compagnon</strong>
          à installer — un chantier à part. Dis-le si tu veux que je le chiffre.
        </p>
      </section>

      <p className="text-center text-xs text-ink-faint">
        Astuce : sur ordinateur, l&apos;extension donne à l&apos;assistant la vue de tous tes onglets — c&apos;est là qu&apos;il est le plus puissant.
      </p>
    </div>
  );
}
