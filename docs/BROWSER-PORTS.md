# Prompta partout — ports Firefox & Safari

État au 2026-07 : **Chrome/Chromium = cible officielle**, **Firefox = supporté en bêta**
(même code, manifest dédié), **Safari = conversion prête, distribution à faire**.

Artefacts produits par `node scripts/pack-extension.mjs` (lancé automatiquement en `prebuild`) :

| Fichier | Cible | Manifest embarqué |
|---|---|---|
| `public/downloads/prompta-everywhere.zip` | Chrome, Edge, Brave, Arc, Opera | `extension/manifest.json` (background `service_worker`) |
| `public/downloads/prompta-firefox.zip` | Firefox ≥ 128 | `extension/manifest.firefox.json` renommé `manifest.json` (background `scripts` + `service_worker`, `browser_specific_settings.gecko`) |

Le code (`bg.js`, `content.js`) est **strictement identique** dans les deux zips :
seul le manifest change.

---

## Firefox

### Ce qui a été adapté

- **Background** : Firefox MV3 n'exécute pas les service workers — il utilise des
  *event pages*. `manifest.firefox.json` déclare `background.scripts: ["bg.js"]`
  **et** `service_worker: "bg.js"` (depuis Firefox 121, quand les deux clés sont
  présentes, Firefox prend `scripts` et ignore `service_worker` ; Chrome fait
  l'inverse — c'est le pattern cross-browser recommandé par MDN).
- **`browser_specific_settings.gecko`** : `id: prompta@prompta.fr` (obligatoire
  pour la signature et pour `storage.sync`), `strict_min_version: 128.0`,
  et `data_collection_permissions` (exigé par AMO pour toute nouvelle soumission
  depuis fin 2025 — l'extension envoie du contenu de pages au serveur Prompta,
  d'où `websiteContent` + `websiteActivity` en `required`).
- **Menu contextuel** : contrairement à Chrome, Firefox ne persiste pas les menus
  d'une event page entre deux démarrages du navigateur et `onInstalled` ne se
  re-déclenche pas au restart → `bg.js` recrée le menu sur `runtime.onStartup`
  en plus de `runtime.onInstalled` (no-op côté Chrome grâce au `removeAll`).
- **`runtime.lastError`** : lu dans les callbacks de `sendMessage` pour éviter le
  spam console « Unchecked runtime.lastError » quand l'event page dort.

### Pourquoi `strict_min_version: 128.0`

| Besoin | Version Firefox mini |
|---|---|
| `chrome.scripting` | 102 |
| MV3 + event pages + promesses sur `chrome.*` | 109 |
| `chrome.storage.session` | 115 |
| Double déclaration `background.scripts` + `service_worker` tolérée | 121 |
| `host_permissions` MV3 proposées à l'installation (avant : silencieusement NON accordées) | 127 |
| ESR courante (base stable) | **128** |

⚠️ **Host permissions** : même ≥ 128, Firefox traite les `host_permissions` MV3
comme *optionnelles* — l'utilisateur peut décocher la case à l'installation.
Si les appels API échouent (401/CORS bizarres), vérifier :
`about:addons` → Prompta partout → onglet **Permissions** → activer l'accès à
`prompta-sjtf.onrender.com`.

### Test local (sans signature)

1. Télécharger `prompta-firefox.zip` (ou `npm run pack:extension`).
2. `about:debugging#/runtime/this-firefox` → **Charger un module complémentaire temporaire…**
3. Sélectionner le **zip lui-même** (Firefox accepte le zip directement, pas
   besoin de dézipper) ou le `manifest.json` d'un dossier dézippé.
4. Vérifier les host permissions (voir ⚠️ ci-dessus), épingler le P, tester.

Limite : une extension *temporaire* disparaît à la fermeture de Firefox.
C'est un mode de test, pas une installation utilisateur.

### Distribution réelle : signature AMO OBLIGATOIRE

Firefox (build standard) **refuse d'installer durablement une extension non
signée** par addons.mozilla.org — même hors store, même en « unlisted ».
Pas d'équivalent du « mode développeur » permanent de Chrome.

À la main du fondateur :

1. **Compte** : créer un compte (gratuit) sur <https://addons.mozilla.org>,
   puis générer les clés API sur <https://addons.mozilla.org/developers/addon/api/key/>
   (`AMO_JWT_ISSUER` / `AMO_JWT_SECRET`).
2. **Deux canaux au choix** :
   - **Listed** (page publique AMO, review Mozilla complète) : soumettre le zip
     sur <https://addons.mozilla.org/developers/> — délai de review variable
     (heures à semaines). Une fois publié, l'URL publique va dans
     `NEXT_PUBLIC_FIREFOX_ADDON_URL` (env Render) et la page
     `/prompta-partout` bascule automatiquement sur « Ajouter à Firefox ».
   - **Unlisted / self-hosted** (review automatique, quasi immédiate) :
     ```bash
     npx web-ext sign \
       --source-dir <dossier avec le manifest firefox> \
       --channel unlisted \
       --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
     ```
     → produit un `.xpi` **signé** ; l'héberger (ex. `public/downloads/prompta.xpi`)
     et pointer `NEXT_PUBLIC_FIREFOX_ADDON_URL` dessus (Firefox installe un lien
     `.xpi` signé en un clic, après confirmation).
     Note : `web-ext sign` attend un dossier source dont le manifest est le
     manifest Firefox — dézipper `prompta-firefox.zip` et signer ce dossier.
3. **Versions** : AMO refuse de re-signer une version déjà vue — incrémenter
   `version` dans les DEUX manifests à chaque soumission.

### Limites connues Firefox (à surveiller en bêta)

- **Event page recyclée après ~30 s d'inactivité** : comme le service worker
  Chrome, mais le comportement de réveil diffère. Le streaming SSE long
  (« tac au tac ») pourrait être coupé si Firefox suspend la page pendant un
  flux sans événement runtime ; le watchdog client (90 s) et l'alarme
  keepalive (30 s) limitent la casse, mais **à tester en conditions réelles**.
- **`chrome.alarms` `periodInMinutes: 0.5`** : Firefox peut arrondir à la minute
  — le keepalive du pilotage serait alors moins fréquent (dégradation douce).
- **Raccourci Alt+P** : peut entrer en conflit avec des accès-clavier de menus
  sur certaines locales ; modifiable par l'utilisateur dans
  `about:addons` → roue dentée → « Gérer les raccourcis d'extensions ».
- `file://*/*` dans `content_scripts` : Firefox restreint davantage l'accès aux
  fichiers locaux ; le panneau peut être indisponible sur des PDF/HTML locaux.

---

## Safari

### Conversion (prête, non exécutée)

```bash
scripts/build-safari.sh
```

Le script appelle `xcrun safari-web-extension-converter extension/` et génère
`safari-build/Prompta partout/` (projet Xcode : app macOS conteneur + extension).
Il échoue avec un message clair si Xcode complet est absent. Safari lit le
manifest Chrome (`background.service_worker` est supporté depuis Safari 16.4) —
aucun manifest dédié nécessaire à ce stade.

### Prérequis / distribution — à la main du fondateur

1. **Xcode complet** (App Store, ~12 Go) — les Command Line Tools ne suffisent pas.
2. **Test local sans compte payant** :
   `scripts/build-safari.sh` → ouvrir le `.xcodeproj` → ⌘R →
   Safari → Réglages → Avancé → « Afficher le menu Développement » →
   menu **Développement → Autoriser les extensions non signées** →
   Réglages → Extensions → activer Prompta partout.
   (À refaire à chaque redémarrage de Safari tant que l'extension n'est pas signée.)
3. **Distribution** : compte **Apple Developer (99 $/an)** obligatoire.
   Signature + notarisation dans Xcode, puis soumission **App Store**
   (l'app conteneur est publiée comme une app macOS ; review Apple ~1-3 jours).
   Pas de side-loading durable possible pour les utilisateurs finaux.

### Limites connues Safari

- **Service worker** : supporté depuis Safari 16.4 (macOS 13.3), mais Safari le
  suspend agressivement ; `chrome.alarms` n'existe que depuis Safari 17 et ne
  RÉVEILLE pas le worker de façon fiable → le **pilotage long** (poll 15 min)
  et le keepalive sont les points les plus à risque.
- **`storage.session`** : Safari ≥ 16.4 uniquement.
- **`chrome.*` vs `browser.*`** : Safari expose les deux, callbacks et promesses
  OK — pas de changement de code attendu.
- **Menu contextuel `contextMenus`** : supporté, mais le rendu/emplacement
  diffère (sous-menu du nom de l'extension).
- **Streaming fetch (SSE)** : `res.body.getReader()` fonctionne, mais la
  suspension du worker en cours de flux est plus fréquente que sur Chrome.
- iOS/iPadOS : possible en théorie (même converter), non visé pour l'instant.

---

## Checklist de mise à jour courante

1. Modifier `extension/*.js` → **incrémenter `version` dans les 2 manifests**.
2. `npm run pack:extension` (ou laisser le `prebuild` le faire).
3. Chrome Web Store : re-soumettre `prompta-everywhere.zip` (voir `docs/CHROME-WEB-STORE.md`).
4. Firefox : re-signer / re-soumettre (section AMO ci-dessus).
5. Safari : relancer `scripts/build-safari.sh` (avec `--force`, il régénère), re-builder dans Xcode.
