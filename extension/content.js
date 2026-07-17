/**
 * Prompta partout — panneau latéral droit (content script), style « Joko ».
 *
 * Clic sur l'icône P de la barre Chrome → le panneau glisse depuis la droite
 * sur la page courante (partout sauf chrome://). Alt+P et le menu contextuel
 * font la même chose.
 *
 * UN cerveau, DEUX régimes :
 *  - TAC AU TAC : streaming SSE via le service worker ;
 *  - MISSION : pipeline agent (onglets + session, validations, replan).
 *
 * Shadow DOM (zéro fuite CSS). Réseau uniquement via le service worker.
 */

(() => {
  if (window.__promptaEverywhere) return;
  window.__promptaEverywhere = true;

  let baseUrl = "https://prompta-sjtf.onrender.com";
  let panelOpen = false;
  let pollTimer = null;
  let launching = false;
  let openTabs = [];      // [{title,url,checked}]
  let history = [];       // items serveur
  let session = [];       // échanges instantanés terminés (cette page)
  let current = null;     // échange en cours (instant ou mission)
  let pendingClarify = null; // { goal, questions } en attente de précisions
  let clarifyQ = null;    // questions à afficher
  let pendingConnect = null; // { goal, missing:[slug…], expired } mission en attente de connexion
  let connectTimer = null;   // poll des connexions (reprise auto)
  // lastError lu volontairement : sinon Chrome/Firefox loguent « Unchecked
  // runtime.lastError » quand le worker/event page est momentanément absent.
  const send = (type, extra) => new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, (r) => { void chrome.runtime.lastError; res(r || { ok: false, status: 0, body: {} }); }));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const slugLabel = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
  const connKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function extractAnswer(o) {
    if (!o || typeof o !== "object") return null;
    if (typeof o.reponse === "string") return o.reponse;
    if (typeof o.result === "string") return o.result;
    const v = Object.entries(o).filter(([k, x]) => !k.startsWith("__") && !k.endsWith("_output") && typeof x === "string");
    return v.length ? v[v.length - 1][1] : null;
  }

  // ── Capture ──────────────────────────────────────────────────────────────
  function extractPageText(maxChars) {
    try {
      const b = document.body.cloneNode(true);
      b.querySelectorAll("script,style,noscript,svg,nav,footer,aside,header,iframe").forEach((n) => n.remove());
      return (b.innerText || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, maxChars);
    } catch { return ""; }
  }
  function capturePage(allowExplore) {
    const isPdf = document.contentType === "application/pdf";
    const content = isPdf ? undefined : extractPageText(15000);
    let links;
    if (allowExplore && !isPdf) {
      const seen = new Set(); links = [];
      for (const a of document.querySelectorAll("a[href]")) {
        if (links.length >= 40) break;
        try {
          const h = new URL(a.getAttribute("href"), location.href).toString();
          if (!/^https?:/.test(h) || h === location.href || seen.has(h)) continue;
          seen.add(h);
          const l = (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
          links.push(l ? `${l} → ${h}` : h);
        } catch { /* */ }
      }
    }
    return { url: location.href, title: document.title || "", selection: String(window.getSelection() || "").trim().slice(0, 4000) || undefined, content, links, isPdf };
  }
  async function loadTabs() {
    const r = await send("prompta:tabs");
    openTabs = (r?.ok && Array.isArray(r.tabs) ? r.tabs : []).map((t) => ({ title: t.title, url: t.url, checked: true }));
  }

  // ── Pilotage (copilote visible) ──────────────────────────────────────────
  // L'agent AGIT dans CETTE page : snapshot des éléments interactifs, puis
  // exécution d'actions une à une, sous les yeux de l'utilisateur (toast +
  // halo sur l'élément). Les actions risquées exigent SA confirmation in-page.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RISKY_RE = /(envoyer|send|publier|publish|payer|payment|pay\b|acheter|buy|checkout|commander|order|supprimer|delete|remove|confirmer|confirm|valider|submit|poster|post\b|tweeter|tweet|répondre|reply|s'abonner|subscribe|transférer|transfer|signer|sign\b|enregistrer|save)/i;
  let pilotEls = new Map(); // id « eN » → élément (du DERNIER snapshot)

  function pilotSnapshot() {
    pilotEls = new Map();
    const elements = [];
    let n = 0;
    const nodes = document.querySelectorAll("a[href],button,input,textarea,select,[role='button'],[contenteditable='true']");
    for (const el of nodes) {
      if (elements.length >= 80) break;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const id = "e" + (++n);
      pilotEls.set(id, el);
      const item = { id, tag: el.tagName.toLowerCase() };
      const text = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      if (text) item.text = text.slice(0, 100);
      if (el.tagName === "A" && el.href) item.href = String(el.href).slice(0, 300);
      if (el.placeholder) item.placeholder = String(el.placeholder).slice(0, 80);
      if (el.tagName === "INPUT") {
        item.inputType = el.type;
        if (el.type !== "password" && el.value) item.value = String(el.value).slice(0, 80);
      }
      if (el.tagName === "TEXTAREA" && el.value) item.value = String(el.value).slice(0, 80);
      if (el.tagName === "SELECT") item.value = String(el.value).slice(0, 80);
      elements.push(item);
    }
    return { url: location.href, title: document.title || "", text: extractPageText(6000), elements };
  }

  function isRiskyAction(action, el) {
    if (action.type === "type" && action.submit) return true;
    if (action.type !== "click" || !el) return false;
    if (el.type === "submit") return true;
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").toLowerCase();
    return RISKY_RE.test(t);
  }

  function setNativeValue(el, value) {
    el.focus();
    if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return;
    }
    // Setter natif du prototype : indispensable pour les inputs contrôlés
    // (React & co ignorent une simple affectation el.value).
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function submitField(el) {
    if (el.form && typeof el.form.requestSubmit === "function") { el.form.requestSubmit(); return; }
    for (const type of ["keydown", "keypress", "keyup"]) {
      el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }
  }

  async function pilotAct(action, label) {
    const needsEl = ["click", "type", "select"].includes(action.type);
    const el = needsEl ? pilotEls.get(action.id) : null;
    if (needsEl && (!el || !document.contains(el))) {
      return { ok: false, error: "élément introuvable (la page a changé depuis le snapshot)", snapshot: pilotSnapshot() };
    }
    if (action.type === "type" && el && (el.type === "password" || /pass|pwd/i.test(el.name || ""))) {
      return { ok: false, error: "champ mot de passe — saisie refusée par sécurité", snapshot: pilotSnapshot() };
    }
    pilotToast(label || "action en cours…");
    if (el) {
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* iframe/pos exotique */ }
      await sleep(350);
      pilotHighlight(el);
    }
    if (isRiskyAction(action, el)) {
      const approved = await pilotConfirm(label || "cette action");
      if (!approved) {
        pilotClearHighlight();
        return { ok: false, declined: true, snapshot: pilotSnapshot() };
      }
    }
    try {
      if (action.type === "click") el.click();
      else if (action.type === "type") { setNativeValue(el, String(action.text ?? "")); if (action.submit) submitField(el); }
      else if (action.type === "select") {
        el.value = String(action.value ?? "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      else if (action.type === "scroll") window.scrollBy({ top: action.dir === "up" ? -600 : 600, behavior: "smooth" });
      else { pilotClearHighlight(); return { ok: false, error: `action inconnue « ${action.type} »`, snapshot: pilotSnapshot() }; }
      await sleep(1000); // laisser la page réagir (requêtes, re-render)
      pilotClearHighlight();
      return { ok: true, snapshot: pilotSnapshot() };
    } catch (err) {
      pilotClearHighlight();
      return { ok: false, error: String((err && err.message) || err).slice(0, 200), snapshot: pilotSnapshot() };
    }
  }

  // ── UI — panneau latéral pleine hauteur (droite), ouverture = icône P ───
  const host = document.createElement("div");
  host.id = "prompta-everywhere-host";
  host.style.cssText = "all:initial; position:fixed; z-index:2147483647; inset:0; pointer-events:none;";
  const root = host.attachShadow({ mode: "closed" });
  (document.documentElement || document.body).appendChild(host);
  root.innerHTML = `
    <style>
      * { box-sizing:border-box; font-family:-apple-system,"SF Pro Text","Segoe UI",Roboto,sans-serif; }
      :host { color-scheme: dark; }
      .scrim { position:fixed; inset:0; background:rgba(0,0,0,.28); opacity:0; pointer-events:none;
        transition:opacity .22s ease; }
      .scrim.on { opacity:1; pointer-events:auto; }
      .panel { position:fixed; top:0; right:0; bottom:0; width:min(400px,100vw); height:100vh;
        background:rgba(6,9,16,.97); backdrop-filter:blur(20px) saturate(1.25); -webkit-backdrop-filter:blur(20px) saturate(1.25);
        color:#E4EDF9; border-left:1px solid rgba(56,189,248,.25);
        box-shadow:-12px 0 48px rgba(0,0,0,.45), -2px 0 28px rgba(56,189,248,.12);
        display:flex; flex-direction:column; overflow:hidden; pointer-events:auto;
        transform:translateX(105%); transition:transform .28s cubic-bezier(.22,1,.36,1); }
      .panel.open { transform:translateX(0); }
      header { display:flex; align-items:center; gap:9px; padding:14px 14px 12px; border-bottom:1px solid rgba(56,189,248,.12); flex-shrink:0; }
      .logo { width:28px; height:28px; border-radius:9px; background:#0A0F1B; border:1px solid rgba(56,189,248,.5); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:#38BDF8; text-shadow:0 0 8px rgba(56,189,248,.8); box-shadow:0 0 14px rgba(56,189,248,.45); animation:pglow 2.6s ease-in-out infinite; }
      .logo:hover { animation:none; box-shadow:0 0 22px rgba(56,189,248,.75); }
      @keyframes pglow { 0%,100% { box-shadow:0 0 14px rgba(56,189,248,.45); } 50% { box-shadow:0 0 22px rgba(56,189,248,.65); } }
      header b { flex:1; font-size:11.5px; font-family:ui-monospace,monospace; text-transform:uppercase; letter-spacing:.18em; }
      header .sub { color:#5B6B85; font-weight:400; }
      select { appearance:none; background:rgba(14,21,36,.85); color:#E4EDF9; border:1px solid rgba(56,189,248,.18); border-radius:9px; padding:4px 9px; font-size:11px; cursor:pointer; max-width:122px; outline:none; }
      select:hover { border-color:rgba(56,189,248,.45); }
      .ico { background:none; border:1px solid rgba(56,189,248,.18); color:#8FA1BC; border-radius:9px; padding:4px 8px; font-size:11px; cursor:pointer; text-decoration:none; transition:border-color .15s,color .15s; }
      .ico:hover { border-color:#67D0FF; color:#E4EDF9; }
      .feed { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; scrollbar-width:thin; scrollbar-color:#172136 transparent; }
      .feed::-webkit-scrollbar { width:6px; } .feed::-webkit-scrollbar-thumb { background:#172136; border-radius:3px; }
      .empty { margin:auto 0; text-align:center; color:#5B6B85; font-size:13px; line-height:1.65; }
      .empty .big { font-size:15px; color:#8FA1BC; font-weight:600; }
      .sugg { display:block; margin:7px auto 0; background:rgba(14,21,36,.9); border:1px solid rgba(56,189,248,.16); color:#8FA1BC; border-radius:999px; font-size:11.5px; padding:6px 14px; cursor:pointer; transition:border-color .15s,color .15s,transform .12s; }
      .sugg:hover { border-color:#67D0FF; color:#E4EDF9; transform:translateY(-1px); }
      .req { margin-left:auto; max-width:85%; background:rgba(56,189,248,.14); color:#E4EDF9; border-radius:16px 16px 5px 16px; padding:9px 12px; font-size:13px; cursor:pointer; text-align:left; border:1px solid rgba(56,189,248,.35); line-height:1.45; }
      .req .re { opacity:0; margin-left:6px; transition:opacity .15s; } .req:hover .re { opacity:.75; }
      .res { max-width:94%; background:rgba(14,21,36,.85); border:1px solid rgba(56,189,248,.13); border-radius:16px 16px 16px 5px; padding:10px 12px; font-size:13px; line-height:1.5; }
      .ans { white-space:pre-wrap; color:#E4EDF9; word-break:break-word; }
      .caret { display:inline-block; width:7px; height:14px; background:#38BDF8; border-radius:2px; vertical-align:-2px; animation:pblink .9s steps(1) infinite; }
      @keyframes pblink { 50% { opacity:0; } }
      .step { display:flex; gap:8px; font-size:12px; color:#8FA1BC; padding:1.5px 0; } .step .k { width:14px; text-align:center; } .step .k.ok { color:#34D399; } .step .k.run { color:#FBBF24; }
      .think { display:flex; align-items:center; gap:8px; color:#8FA1BC; font-size:12.5px; }
      .think .orb { width:14px; height:14px; border-radius:50%; background:conic-gradient(from 0deg,#38BDF8,#1E7FC2,#38BDF8); animation:pspin 1.1s linear infinite; }
      @keyframes pspin { to { transform:rotate(360deg); } }
      .meta { display:flex; align-items:center; gap:7px; margin-top:8px; font-size:11px; color:#5B6B85; flex-wrap:wrap; }
      .dot { width:7px; height:7px; border-radius:50%; } .d-completed{background:#34D399;} .d-failed{background:#F87171;} .d-awaiting_approval,.d-needs_connect{background:#38BDF8;} .d-running,.d-pending,.d-streaming{background:#FBBF24;}
      .cbtn { background:rgba(56,189,248,.14); border:1px solid rgba(56,189,248,.5); color:#38BDF8; border-radius:9px; padding:6px 13px; font-size:12px; font-weight:600; cursor:pointer; transition:background .15s; }
      .cbtn:hover { background:rgba(56,189,248,.25); }
      .apyes { background:#38BDF8; color:#04121F; border:none; border-radius:9px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer; }
      .apno { background:none; border:1px solid rgba(248,113,113,.45); color:#F87171; border-radius:9px; padding:6px 12px; font-size:12px; cursor:pointer; }
      .apyes:disabled,.apno:disabled,.cbtn:disabled { opacity:.5; cursor:default; }
      .dot.pulse { animation:ppulse 1.2s ease-in-out infinite; } @keyframes ppulse { 0%,100%{opacity:1;} 50%{opacity:.3;} }
      .res a { color:#67D0FF; text-decoration:none; } .res a:hover { text-decoration:underline; }
      .mact { background:none; border:1px solid rgba(56,189,248,.22); color:#8FA1BC; border-radius:7px; font-size:10.5px; padding:2px 8px; cursor:pointer; transition:border-color .15s,color .15s; }
      .mact:hover { border-color:#67D0FF; color:#E4EDF9; }
      .err { margin-top:6px; font-size:11.5px; color:#F87171; white-space:pre-wrap; }
      .ctx { border-top:1px solid rgba(56,189,248,.12); padding:8px 13px 0; flex-shrink:0; }
      .ctxh { display:flex; align-items:center; gap:6px; font-size:11px; color:#8FA1BC; cursor:pointer; user-select:none; }
      .ctxh .cv { transition:transform .15s; } .ctxh.open .cv { transform:rotate(90deg); }
      .ctxbody { display:none; } .ctxbody.open { display:block; }
      .chip { display:inline-block; background:rgba(14,21,36,.85); border:1px solid rgba(56,189,248,.15); border-radius:999px; padding:2px 9px; font-size:11px; color:#8FA1BC; margin:5px 4px 0 0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tabs { max-height:120px; overflow-y:auto; border:1px solid rgba(56,189,248,.15); border-radius:10px; margin:6px 0; }
      .trow { display:flex; align-items:center; gap:8px; padding:5px 9px; font-size:12px; border-bottom:1px solid rgba(56,189,248,.09); }
      .trow:last-child { border-bottom:none; } .trow label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#8FA1BC; cursor:pointer; }
      .tact { display:flex; gap:10px; font-size:11px; padding:2px 0; } .tact button { background:none; border:none; color:#38BDF8; cursor:pointer; font-size:11px; padding:0; }
      .note { font-size:11px; color:#5B6B85; margin:5px 0; } .note a { color:#67D0FF; }
      .opts { display:flex; gap:14px; padding:4px 0 7px; font-size:11px; color:#8FA1BC; }
      .opts label { display:flex; align-items:center; gap:5px; cursor:pointer; }
      .composer { border-top:1px solid rgba(56,189,248,.12); padding:10px 13px 14px; flex-shrink:0; }
      .cbox { display:flex; align-items:flex-end; gap:8px; background:rgba(14,21,36,.9); border:1px solid rgba(56,189,248,.18); border-radius:15px; padding:8px; transition:border-color .15s, box-shadow .15s; }
      .cbox:focus-within { border-color:#38BDF8; box-shadow:0 0 0 3px rgba(56,189,248,.12); }
      textarea { flex:1; border:none; background:none; color:#E4EDF9; font-size:13px; resize:none; outline:none; max-height:110px; min-height:20px; line-height:1.45; }
      textarea::placeholder { color:#5B6B85; }
      .snd { width:34px; height:34px; border-radius:11px; background:linear-gradient(135deg,#38BDF8,#1E7FC2); color:#fff; border:none; font-size:15px; cursor:pointer; flex-shrink:0; transition:transform .12s, opacity .15s; box-shadow:0 3px 10px rgba(56,189,248,.35); }
      .snd:hover:not(:disabled) { transform:scale(1.06); }
      .snd:disabled { opacity:.4; cursor:default; box-shadow:none; }
      .ptoast { position:fixed; top:18px; left:50%; transform:translateX(-50%); display:none; align-items:center; gap:9px;
        background:rgba(10,15,27,.96); border:1px solid rgba(56,189,248,.4); color:#E4EDF9; font-size:12.5px;
        border-radius:999px; padding:8px 16px; box-shadow:0 8px 28px rgba(0,0,0,.55); max-width:70vw; pointer-events:none; }
      .ptoast span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .porb { width:12px; height:12px; border-radius:50%; flex-shrink:0; background:conic-gradient(from 0deg,#38BDF8,#1E7FC2,#38BDF8); animation:pspin 1.1s linear infinite; }
      .pring { position:fixed; display:none; border:2px solid #38BDF8; border-radius:8px; box-shadow:0 0 0 4px rgba(56,189,248,.35), 0 0 18px rgba(56,189,248,.4); pointer-events:none; transition:all .25s ease; }
      .pconfirm { position:fixed; top:64px; left:50%; transform:translateX(-50%); display:none; background:rgba(10,15,27,.97);
        border:1px solid rgba(56,189,248,.45); border-radius:14px; padding:13px 15px; color:#E4EDF9; font-size:13px;
        max-width:440px; box-shadow:0 16px 48px rgba(0,0,0,.65); line-height:1.5; pointer-events:auto; }
      .pcbtns { display:flex; gap:8px; margin-top:10px; justify-content:flex-end; }
      .pcbtns button { border:none; border-radius:9px; padding:6px 14px; font-size:12px; cursor:pointer; font-weight:600; }
      .pcyes { background:#38BDF8; color:#04121F; }
      .pcno { background:rgba(14,21,36,.9); color:#8FA1BC; border:1px solid rgba(56,189,248,.25) !important; }
    </style>
    <div class="scrim" data-r="scrim"></div>
    <div class="panel" data-r="panel">
      <header>
        <span class="logo">P</span>
        <b>Prompta <span class="sub">· partout</span></b>
        <select data-r="model"><option>…</option></select>
        <a class="ico" data-r="conns" target="_blank" title="Apps connectées">🔌</a>
        <button class="ico" data-r="close" title="Fermer">✕</button>
      </header>
      <div class="feed" data-r="feed"></div>
      <div class="ctx">
        <div class="ctxh" data-r="ctxh"><span class="cv">▸</span> 👁 <span data-r="ctxsum">Ce que je vois</span></div>
        <div class="ctxbody" data-r="ctxbody">
          <div data-r="chips"></div>
          <div class="tact" data-r="tact" style="display:none"><button data-r="tall">tout cocher</button><button data-r="tnone">tout décocher</button></div>
          <div class="tabs" data-r="tabs" style="display:none"></div>
          <div class="note">Je lis cette page et tes onglets cochés (même connectés).</div>
          <div class="opts">
            <label><input type="checkbox" data-r="alltabs" checked> voir mes onglets</label>
            <label><input type="checkbox" data-r="explore" checked> explorer les liens</label>
          </div>
        </div>
      </div>
      <div class="composer">
        <div class="cbox">
          <textarea data-r="goal" rows="1" placeholder="Demande simple ou grosse mission…  (Entrée)"></textarea>
          <button class="snd" data-r="send">↑</button>
        </div>
      </div>
    </div>
    <div class="ptoast" data-r="ptoast"><span class="porb"></span><span data-r="ptoastmsg"></span></div>
    <div class="pring" data-r="pring"></div>
    <div class="pconfirm" data-r="pconfirm">
      <div><b>Prompta veut :</b> <span data-r="pcmsg"></span></div>
      <div class="pcbtns"><button class="pcno" data-r="pcno">Refuser</button><button class="pcyes" data-r="pcyes">Autoriser</button></div>
    </div>`;

  const $ = (r) => root.querySelector(`[data-r="${r}"]`);
  const panel = $("panel");
  const scrim = $("scrim");
  const feed = $("feed"), goalEl = $("goal"), sendBtn = $("send"), modelEl = $("model");
  const ctxh = $("ctxh"), ctxbody = $("ctxbody"), ctxsum = $("ctxsum"), chips = $("chips"), tabsBox = $("tabs"), tact = $("tact");
  const alltabsEl = $("alltabs"), exploreEl = $("explore");

  send("prompta:baseUrl").then((r) => { if (r?.baseUrl) { baseUrl = r.baseUrl; $("conns").href = baseUrl + "/dashboard/connexions"; } });

  // ── Overlay copilote (toast d'action, halo, confirmation in-page) ───────
  const ptoast = $("ptoast"), ptoastmsg = $("ptoastmsg"), pring = $("pring"), pconfirm = $("pconfirm"), pcmsg = $("pcmsg");
  let toastTimer = null;
  function pilotToast(label) {
    ptoastmsg.textContent = "Prompta pilote — " + label;
    ptoast.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ptoast.style.display = "none"; }, 6000);
  }
  function pilotHighlight(el) {
    const r = el.getBoundingClientRect();
    pring.style.display = "block";
    pring.style.top = r.top - 4 + "px";
    pring.style.left = r.left - 4 + "px";
    pring.style.width = r.width + 8 + "px";
    pring.style.height = r.height + 8 + "px";
  }
  function pilotClearHighlight() { pring.style.display = "none"; }
  let confirmResolve = null;
  function pilotConfirm(label) {
    return new Promise((resolve) => {
      // Une seule confirmation à la fois : l'ancienne (zombie) est refusée.
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      pcmsg.textContent = label;
      pconfirm.style.display = "block";
      // Auto-refus avant l'expiration de la tâche serveur (60 s) : silence = non.
      setTimeout(() => { if (confirmResolve === resolve) settleConfirm(false); }, 40_000);
    });
  }
  function settleConfirm(value) {
    pconfirm.style.display = "none";
    if (confirmResolve) { confirmResolve(value); confirmResolve = null; }
  }
  $("pcyes").addEventListener("click", () => settleConfirm(true));
  $("pcno").addEventListener("click", () => settleConfirm(false));
  function pilotEnd() {
    ptoast.style.display = "none";
    pilotClearHighlight();
    settleConfirm(false);
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  function statusText(s) { return { completed: "terminé", failed: "échec", awaiting_approval: "à valider", running: "en cours", pending: "en file", streaming: "répond…", needs_connect: "connexion requise" }[s] || s; }
  function card(it, live) {
    const isMission = it.kind === "mission" || (it.planned?.length > 0) || (it.runId && !it.instant && it.kind !== "instant");
    const hasRun = it.runId && it.runId !== "…";
    let body = it.notice ? `<div style="color:#34D399;font-size:12px;margin-bottom:6px">${esc(it.notice)}</div>` : "";
    if (it.answer) body += `<div class="ans">${esc(it.answer).slice(0, 12000)}${it.status === "streaming" ? '<span class="caret"></span>' : ""}</div>`;
    else if (it.status === "streaming") body += `<div class="think"><span class="orb"></span> Prompta réfléchit…</div>`;
    if (isMission && it.planned?.length) body += `<div style="margin-top:${it.answer ? "8px" : "0"}">${it.planned.map((l, i) => { const d = it.stepsCompleted ?? it.stepsDone ?? 0; const k = i < d ? "✓" : i === d && (it.status === "running" || it.status === "pending") ? "▶" : "·"; return `<div class="step"><span class="k ${i < d ? "ok" : i === d && (it.status === "running" || it.status === "pending") ? "run" : ""}">${k}</span><span>${esc(l)}</span></div>`; }).join("")}</div>`;
    else if (isMission && (it.status === "running" || it.status === "pending")) body += `<div class="think"><span class="orb"></span> Prompta conçoit l'agent…</div>`;
    // Connexion manquante : carte avec un bouton OAuth par app + reprise auto.
    if (it.status === "needs_connect" && live) {
      const btns = (it.missing || []).map((s) => `<button class="cbtn" data-connect="${esc(s)}">🔌 Connecter ${esc(slugLabel(s))}</button>`).join("");
      body += `<div style="margin-top:${body ? "8px" : "0"}">
        <div style="font-weight:600;color:#E4EDF9;margin-bottom:3px">Connexion requise</div>
        <div style="color:#8FA1BC;font-size:12px;line-height:1.5">${esc(it.error || "Cette mission a besoin d'apps pas encore connectées.")}</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">${btns}</div>
        ${it.connectExpired
          ? `<button class="mact" data-resume="1" style="margin-top:9px">↻ Reprendre la mission</button>`
          : `<div style="margin-top:8px;font-size:11px;color:#5B6B85">⏳ Je surveille tes connexions — la mission repartira toute seule.</div>`}
      </div>`;
    }
    // Validation humaine : carte in-feed (contenu éditable, décision sans dashboard).
    if (it.status === "awaiting_approval" && live) {
      if (it.approval) {
        const p = it.approval.payload || {};
        body += `<div style="margin-top:${body ? "8px" : "0"};border:1px solid rgba(56,189,248,.35);border-radius:12px;padding:10px;background:rgba(10,15,27,.6)">
          <div style="font-weight:600;color:#E4EDF9;font-size:12.5px">✋ Validation requise${p.label ? ` — ${esc(p.label)}` : ""}</div>
          <textarea data-aptext style="width:100%;margin-top:8px;min-height:90px;max-height:200px;background:rgba(14,21,36,.9);border:1px solid rgba(56,189,248,.2);border-radius:9px;color:#E4EDF9;font-size:12px;padding:8px;resize:vertical;outline:none;line-height:1.45">${esc(p.full || p.preview || "")}</textarea>
          <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
            <button class="apno" data-apreject="1">Refuser</button>
            <button class="apyes" data-approve="1">Valider</button>
          </div>
          ${it.approvalError ? `<div class="err">${esc(it.approvalError)}</div>` : ""}
        </div>`;
      } else {
        body += `<div class="think" style="margin-top:${body ? "8px" : "0"}"><span class="orb"></span> Je récupère la demande de validation…</div>`;
      }
    }
    let link = "";
    if (it.status === "awaiting_approval") {
      const vUrl = it.approvalId ? `${baseUrl}/dashboard/validations?focus=${esc(it.approvalId)}` : `${baseUrl}/dashboard/validations`;
      link = `<a href="${vUrl}" target="_blank" rel="noopener">${live ? "ouvrir dans le dashboard ↗" : "⏸ valider"}</a>`;
    } else if (hasRun && (it.status === "completed" || it.status === "failed")) link = `<a href="${baseUrl}/dashboard/runs/${esc(it.runId)}" target="_blank" rel="noopener">dossier ↗</a>`;
    else if (live && hasRun && (it.status === "running" || it.status === "pending")) link = `<button class="mact" data-cancel="${esc(it.runId)}">■ stop</button>`;
    // « Réutiliser comme agent » : missions multi-étapes terminées.
    const multiStep = (it.stepsCompleted ?? 0) > 1 || (it.planned?.length ?? 0) > 1;
    const saveBtn = isMission && hasRun && it.status === "completed" && multiStep && !it.savedAgent
      ? `<button class="mact" data-save="${esc(it.runId)}">💾 garder comme agent</button>` : "";
    const savedNote = it.savedAgent ? `<a href="${esc(it.savedAgent)}" target="_blank" rel="noopener">agent enregistré ↗</a>` : "";
    const connectLink = it.status === "failed" && it.needsConnect ? ` <a href="${baseUrl}/dashboard/connexions" target="_blank" rel="noopener">connecter ↗</a>` : "";
    const err = it.status === "failed" && it.error ? `<div class="err">${esc(it.error).slice(0, 220)}${connectLink}</div>` : "";
    const pulse = live && !["completed", "failed", "awaiting_approval"].includes(it.status) ? " pulse" : "";
    return `<button class="req" data-reuse="${esc(it.goal)}">${esc(it.goal)}<span class="re">↺</span></button>
      <div class="res">${body}<div class="meta"><span class="dot d-${esc(it.status)}${pulse}"></span>${esc(statusText(it.status))}${it.model ? " · " + esc(it.model) : ""}${saveBtn}${savedNote}${link}</div>${err}</div>`;
  }
  let lastFeedSig = "";
  function renderFeed(force) {
    const seen = new Set(history.map((h) => (h.goal || "").slice(0, 200)));
    const localItems = session.filter((s) => !seen.has((s.goal || "").slice(0, 200)));
    const items = [...history].reverse().concat(localItems);
    const live = current && !history.some((h) => current.runId && h.runId === current.runId) ? current : null;
    // Signature : on ne reconstruit le DOM que si quelque chose a VRAIMENT changé
    // (sinon un tick de poll identique effacerait la sélection de texte de l'user).
    const sig = items.map((h) => (h.runId || h.goal) + h.status + (h.savedAgent || "")).join("|") + "#" + (live ? `${live.runId}:${live.status}:${live.stepsCompleted}:${(live.answer || "").length}:${(live.planned || []).length}:${live.approval ? live.approval.id : ""}:${live.approvalError || ""}:${live.connectExpired ? "x" : ""}:${(live.missing || []).join(",")}:${live.notice || ""}` : "") + "?" + (clarifyQ ? clarifyQ.join("|") : "");
    if (!force && sig === lastFeedSig) return;
    lastFeedSig = sig;
    // Ne pas ré-ancrer en bas si l'utilisateur a scrollé vers le haut pour lire.
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
    const clarifyHtml = clarifyQ && clarifyQ.length
      ? `<div class="res" style="border-color:#38BDF866"><div style="color:#E4EDF9;font-weight:600;margin-bottom:4px">Quelques précisions pour bien faire :</div><ul style="margin:0;padding-left:18px;color:#8FA1BC">${clarifyQ.map((q) => `<li>${esc(q)}</li>`).join("")}</ul><div style="color:#5B6B85;font-size:11px;margin-top:6px">Réponds ci-dessous, je m'occupe du reste.</div></div>`
      : "";
    const suggestions = ["Résume cette page en 5 points", "Compare mes onglets ouverts", "Rédige un email pro à partir de ma sélection"];
    const emptyHtml = `<div class="empty"><span class="big">Ton assistant, partout.</span><br>Réponse immédiate aux questions,<br>agent complet pour les missions sur tes apps.<br><br>${suggestions.map((s) => `<button class="sugg" data-reuse="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
    const html = items.map((it) => card(it)).join("") + (live ? card(live, true) : "") + clarifyHtml;
    feed.innerHTML = html || emptyHtml;
    feed.querySelectorAll("[data-reuse]").forEach((b) => b.addEventListener("click", () => { goalEl.value = b.dataset.reuse; goalEl.focus(); }));
    feed.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await send("prompta:cancel", { runId: b.dataset.cancel }); }));
    feed.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "…";
      const r = await send("prompta:save-agent", { runId: b.dataset.save });
      if (r?.ok && r.body?.url) {
        const target = [...history, ...session, current].find((x) => x && x.runId === b.dataset.save);
        if (target) target.savedAgent = baseUrl + r.body.url;
        renderFeed(true);
      } else { b.disabled = false; b.textContent = "💾 garder comme agent"; }
    }));
    // Connexion manquante : ouvrir l'OAuth dans un nouvel onglet (la reprise
    // est automatique : le poll des connexions relancera la mission).
    feed.querySelectorAll("[data-connect]").forEach((b) => b.addEventListener("click", () => {
      const slug = b.dataset.connect;
      window.open(`${baseUrl}/api/connectors/${encodeURIComponent(slug)}/connect?returnUrl=${encodeURIComponent(`${baseUrl}/dashboard/connexions?connected=${slug}`)}`, "_blank");
    }));
    feed.querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => {
      if (!pendingConnect) return;
      const g = pendingConnect.goal;
      pendingConnect = null; stopConnectPoll();
      launching = true; sendBtn.disabled = true;
      launchMission(g);
    }));
    // Validation in-feed : contenu éditable + décision, puis reprise du suivi.
    const apText = feed.querySelector("[data-aptext]");
    if (apText) apText.addEventListener("keydown", (e) => e.stopPropagation());
    feed.querySelectorAll("[data-approve],[data-apreject]").forEach((b) => b.addEventListener("click", async () => {
      if (!current || !current.approval) return;
      const decision = b.hasAttribute("data-approve") ? "approved" : "rejected";
      feed.querySelectorAll("[data-approve],[data-apreject]").forEach((x) => { x.disabled = true; });
      const r = await send("prompta:approve", {
        runId: current.runId,
        approvalId: current.approval.id,
        decision,
        modifiedContent: decision === "approved" && apText ? apText.value : undefined,
      });
      if (r?.ok) {
        current.decidedApprovalId = current.approval.id;
        current.approval = null; current.approvalError = null;
        current.status = "running"; // optimiste — le poll (toujours actif) corrige
        renderFeed(true);
      } else {
        current.approvalError = r?.body?.error || r?.body?.message || `Décision refusée (${r?.status || "réseau"}) — réessaie.`;
        renderFeed(true);
      }
    }));
    if (nearBottom) feed.scrollTop = feed.scrollHeight;
  }
  function renderCtx() {
    const checked = openTabs.filter((t) => t.checked).length;
    ctxsum.textContent = `Ce que je vois${openTabs.length ? ` · cette page + ${checked}/${openTabs.length} onglets` : " · cette page"}`;
    chips.innerHTML = `<span class="chip">📄 ${esc((document.title || location.hostname).slice(0, 40))}</span>` +
      (document.contentType === "application/pdf" ? `<span class="chip">PDF</span>` : "") +
      (String(window.getSelection() || "").trim() ? `<span class="chip">✂️ sélection</span>` : "");
    tact.style.display = openTabs.length ? "flex" : "none";
    tabsBox.style.display = openTabs.length ? "block" : "none";
    tabsBox.innerHTML = openTabs.map((t, i) => `<div class="trow"><input type="checkbox" data-i="${i}" ${t.checked ? "checked" : ""}><label title="${esc(t.url)}">${esc(t.title || t.url)}</label></div>`).join("");
    tabsBox.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", (e) => { openTabs[+e.target.dataset.i].checked = e.target.checked; renderCtx(); }));
  }

  async function loadModels() {
    const r = await send("prompta:models");
    const { promptaModel } = await chrome.storage.sync.get("promptaModel");
    const ms = r?.ok && Array.isArray(r.body.models) ? r.body.models : [];
    const firstUsable = ms.find((m) => m.usable);
    modelEl.innerHTML = (firstUsable ? "" : `<option value="">défaut</option>`) + ms.map((m) => `<option value="${esc(m.id)}" ${m.usable ? "" : "disabled"}>${esc(m.label)}${m.usable ? "" : " (clé)"}</option>`).join("");
    modelEl.value = ms.find((m) => m.id === promptaModel && m.usable) ? promptaModel : (firstUsable?.id ?? "");
  }
  async function loadHistory() { const r = await send("prompta:history"); if (r?.ok && Array.isArray(r.body.items)) { history = r.body.items; renderFeed(); } }

  // ── Exécution ────────────────────────────────────────────────────────────
  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
  function poll() {
    stopPoll(); let errs = 0;
    pollTimer = setInterval(async () => {
      // Panneau fermé : on ARRÊTE le poll (il reprendra à la réouverture si le
      // run est encore en vol) — évite un timer qui tourne indéfiniment.
      if (!panelOpen) { stopPoll(); return; }
      const r = await send("prompta:status", { runId: current.runId });
      if (!r?.ok || !r.body) { if (++errs >= 5) { stopPoll(); current.status = "failed"; current.error = "suivi interrompu"; renderFeed(); launching = false; sendBtn.disabled = false; } return; }
      errs = 0;
      current.status = r.body.status; current.stepsCompleted = r.body.steps_completed ?? 0;
      current.planned = r.body.planned_steps?.length ? r.body.planned_steps : current.planned;
      current.error = r.body.error_message; current.answer = extractAnswer(r.body.output);
      current.approvalId = r.body.approval_id ?? null;
      // Tâche de pilotage en attente : (ré)armer le service worker — couvre le
      // redémarrage du worker ET un plan réparé qui introduit du pilotage.
      if (r.body.browser_task) send("prompta:pilot-watch", { runId: current.runId });
      renderFeed();
      if (["completed", "failed", "cancelled"].includes(r.body.status)) {
        stopPoll(); launching = false; sendBtn.disabled = false; loadHistory();
      } else if (r.body.status === "awaiting_approval") {
        // La validation se fait ICI, dans le panneau : on récupère l'approval
        // du run et on CONTINUE de poller jusqu'au terme (plus de rupture).
        launching = false; sendBtn.disabled = false;
        ensureApproval();
      }
    }, 2500);
  }

  /** Charge la demande de validation du run courant (carte in-feed éditable). */
  async function ensureApproval() {
    const c = current;
    if (!c || c.approval || c.approvalLoading) return;
    if (c.approvalId && c.decidedApprovalId === c.approvalId) return; // décision déjà envoyée
    c.approvalLoading = true;
    try {
      const r = await send("prompta:approvals");
      if (!r?.ok || !Array.isArray(r.body?.items)) return;
      const item = r.body.items.find((a) => (c.approvalId && a.id === c.approvalId) || a.runId === c.runId || a.run_id === c.runId);
      if (item && current === c && item.id !== c.decidedApprovalId) {
        c.approval = { id: item.id, payload: item.payload || {} };
        renderFeed(true);
      }
    } finally { c.approvalLoading = false; }
  }

  // ── Connexion manquante : poll toutes les 5 s, reprise auto de la mission ──
  const CONNECT_POLL_MS = 5000;
  const CONNECT_MAX_MS = 10 * 60 * 1000;
  function stopConnectPoll() { clearInterval(connectTimer); connectTimer = null; }
  function startConnectPoll() {
    stopConnectPoll();
    const startedAt = Date.now();
    connectTimer = setInterval(async () => {
      if (!pendingConnect) { stopConnectPoll(); return; }
      if (Date.now() - startedAt > CONNECT_MAX_MS) {
        // Timeout : on garde la mission mémorisée, reprise MANUELLE via bouton.
        stopConnectPoll();
        pendingConnect.expired = true;
        if (current && current.status === "needs_connect") { current.connectExpired = true; renderFeed(true); }
        return;
      }
      const r = await send("prompta:connections");
      if (!r?.ok || !Array.isArray(r.body?.connections)) return;
      const usable = new Set(r.body.connections.filter((c) => c.usable).map((c) => connKey(c.connectorId)));
      const still = pendingConnect.missing.filter((s) => !usable.has(connKey(s)));
      if (still.length) return;
      // Tout est connecté : reprise automatique de la mission mémorisée.
      const { goal: g, missing } = pendingConnect;
      pendingConnect = null; stopConnectPoll();
      launching = true; sendBtn.disabled = true;
      launchMission(g, `✓ ${missing.map(slugLabel).join(", ")} connecté — je reprends la mission`);
    }, CONNECT_POLL_MS);
  }

  /** Bascule mission : capture des onglets cochés (session incluse) puis pipeline agent. */
  async function launchMission(goal, notice) {
    current = { kind: "mission", runId: "…", goal, model: modelEl.value || null, status: "pending", planned: [], stepsCompleted: 0, notice: notice || null };
    renderFeed();
    const page = capturePage(exploreEl.checked);
    const targeted = openTabs.filter((t) => t.checked).map((t) => ({ title: t.title, url: t.url }));
    if (targeted.length) {
      // Contenu réel des onglets, lu PAR le navigateur : c'est ce qui permet de
      // croiser des pages derrière login (dashboards, CRM, mails ouverts…).
      const cap = await send("prompta:tabcontents", { urls: targeted.map((t) => t.url), maxTabs: 8, maxChars: 8000 });
      page.openTabs = (cap?.ok && Array.isArray(cap.tabs) ? cap.tabs : targeted).filter((t) => t.url !== location.href);
    }
    const r = await send("prompta:execute", { payload: { goal, page, modelId: modelEl.value || undefined } });
    // L'agent demande des précisions : on affiche les questions, pas de run.
    if (r?.ok && Array.isArray(r.body?.clarify) && r.body.clarify.length) {
      launching = false; sendBtn.disabled = false;
      pendingClarify = { goal, questions: r.body.clarify }; clarifyQ = r.body.clarify; current = null;
      renderFeed(); goalEl.focus(); return;
    }
    if (!r?.ok) {
      launching = false; sendBtn.disabled = false;
      if (r?.status === 409 && r.body?.missingConnectors?.length) {
        // Mission MÉMORISÉE : carte « Connexion requise » + reprise automatique
        // dès que toutes les apps manquantes sont connectées (poll 5 s).
        current.status = "needs_connect";
        current.missing = r.body.missingConnectors;
        current.error = r.body.message || `Cette mission a besoin de : ${r.body.missingConnectors.join(", ")}.`;
        pendingConnect = { goal, missing: [...r.body.missingConnectors], expired: false };
        startConnectPoll();
      } else {
        current.status = "failed";
        current.error = r?.body?.message || (r?.status === 401 ? "Connecte-toi à Prompta." : `Erreur ${r?.status || "réseau"}`);
      }
      renderFeed(); return;
    }
    current.runId = r.body.runId; current.title = r.body.title; current.status = "running";
    // Mission avec pilotage : le service worker surveille la file de tâches
    // navigateur et les fait exécuter dans CET onglet.
    if (r.body.pilots) send("prompta:pilot-watch", { runId: current.runId });
    renderFeed(); poll();
  }

  /** Tac au tac streamé ; bascule automatiquement en mission si le modèle le décide. */
  function launchInstant(goal, page) {
    current = { kind: "instant", goal, model: modelEl.value || null, status: "streaming", answer: "" };
    renderFeed();
    // Continuité conversationnelle : les 3 derniers échanges textuels.
    const hist = [];
    for (const it of [...history].reverse().concat(session).slice(-6)) {
      if (it.goal && it.answer && it.status === "completed") {
        hist.push({ role: "user", content: it.goal }, { role: "assistant", content: it.answer });
      }
    }
    const port = chrome.runtime.connect({ name: "prompta:instant" });
    let closed = false;
    // Watchdog : aucun événement SSE pendant 90 s → coupure propre (fini le
    // « streaming » infini quand le serveur s'est tu sans fermer le flux).
    let watchdogT = null;
    const armWatchdog = () => {
      clearTimeout(watchdogT);
      watchdogT = setTimeout(() => {
        try { port.postMessage({ type: "abort" }); } catch { /* port fermé */ }
        finish(true, "La réponse a expiré — réessaie.");
      }, 90_000);
    };
    const finish = (fail, msg) => {
      if (closed) return; closed = true;
      clearTimeout(watchdogT);
      try { port.disconnect(); } catch { /* déjà fermé */ }
      launching = false; sendBtn.disabled = false;
      if (fail) { current.status = "failed"; current.error = msg || "Réponse interrompue."; }
      else if (current.answer) { current.status = "completed"; session.push(current); current = null; }
      else { current = null; }
      renderFeed(true);
    };
    port.onMessage.addListener((m) => {
      armWatchdog();
      if (m?.delta) { current.answer += m.delta; renderFeed(true); }
      else if (m?.mission) { closed = true; clearTimeout(watchdogT); try { port.disconnect(); } catch { /* */ } launchMission(goal); }
      else if (m?.done) finish(false);
      else if (m?.error) finish(true, m.error + (m.status === 401 ? " — connecte-toi à Prompta." : ""));
      else if (m?.closed && !closed) finish(current.answer ? false : true, "Connexion interrompue.");
    });
    port.onDisconnect.addListener(() => { if (!closed) finish(current?.answer ? false : true, "Connexion interrompue."); });
    armWatchdog();
    port.postMessage({ type: "start", payload: { goal, page, modelId: modelEl.value || undefined, history: hist.slice(-6) } });
  }

  async function launch() {
    if (launching) return;
    let goal = goalEl.value.trim();
    if (goal.length < 2) return;
    launching = true; sendBtn.disabled = true;
    goalEl.value = ""; goalEl.style.height = "auto";
    // Nouvelle demande explicite : la mission en attente de connexion est
    // abandonnée (sinon sa reprise auto écraserait le suivi de celle-ci).
    if (pendingConnect) { pendingConnect = null; stopConnectPoll(); }
    // Réponse à une demande de précisions : on recolle l'ordre initial, les
    // questions ET les réponses, puis on repart DIRECTEMENT en mission.
    if (pendingClarify) {
      goal = `${pendingClarify.goal}\n\nQuestions posées : ${(pendingClarify.questions || []).join(" | ")}\nRéponses de l'utilisateur : ${goal}`;
      pendingClarify = null; clarifyQ = null;
      launchMission(goal); return;
    }
    const page = capturePage(false);
    delete page.links; // le tac au tac n'explore pas — la mission le fera
    launchInstant(goal, page);
  }

  // ── Interactions ───────────────────────────────────────────────────────
  function toggle(force) {
    panelOpen = force !== undefined ? force : !panelOpen;
    panel.classList.toggle("open", panelOpen);
    scrim.classList.toggle("on", panelOpen);
    if (panelOpen) {
      renderCtx();
      goalEl.focus();
      // Reprend le suivi si un run est encore en vol (poll arrêté à la fermeture).
      if (current && ["running", "pending", "awaiting_approval"].includes(current.status) && !pollTimer) poll();
    }
  }
  $("close").addEventListener("click", () => toggle(false));
  scrim.addEventListener("click", () => toggle(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelOpen) { e.stopPropagation(); toggle(false); }
  }, true);
  sendBtn.addEventListener("click", launch);
  goalEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); launch(); } });
  goalEl.addEventListener("input", () => { goalEl.style.height = "auto"; goalEl.style.height = Math.min(110, goalEl.scrollHeight) + "px"; });
  modelEl.addEventListener("change", () => chrome.storage.sync.set({ promptaModel: modelEl.value }));
  ctxh.addEventListener("click", () => { const o = ctxh.classList.toggle("open"); ctxbody.classList.toggle("open", o); });
  $("tall").addEventListener("click", () => { openTabs.forEach((t) => (t.checked = true)); renderCtx(); });
  $("tnone").addEventListener("click", () => { openTabs.forEach((t) => (t.checked = false)); renderCtx(); });
  alltabsEl.addEventListener("change", async () => { if (alltabsEl.checked) await loadTabs(); else openTabs = []; renderCtx(); });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "prompta:toggle") { toggle(); return; }
    // Le service worker lit CET onglet (croisement d'onglets avec session).
    if (msg?.type === "prompta:capture") {
      sendResponse({ content: extractPageText(msg.maxChars || 8000), title: document.title || "", url: location.href });
      return;
    }
    // Pilotage : le service worker fait exécuter les actions de l'agent ICI.
    if (msg?.type === "prompta:pilot-snapshot") { sendResponse({ ok: true, snapshot: pilotSnapshot() }); return; }
    if (msg?.type === "prompta:pilot-toast") { pilotToast(msg.label || "navigation…"); return; }
    if (msg?.type === "prompta:pilot-end") { pilotEnd(); return; }
    if (msg?.type === "prompta:pilot-act") {
      pilotAct(msg.action || {}, msg.label || "").then(sendResponse);
      return true; // réponse asynchrone
    }
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  (async () => {
    await Promise.all([loadModels(), loadHistory(), loadTabs()]);
    renderFeed();
  })();
})();
