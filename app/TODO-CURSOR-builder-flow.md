# TODO Cursor — Refonte du parcours builder (« le masque »)

> Complément **prioritaire** à `TODO-CURSOR-v5.md`, basé sur les captures du parcours de
> création d'agent. À traiter **juste après le Bloc 1 de v5** (catalogue de modèles),
> car plusieurs points en dépendent.
> Après chaque bloc : `npx tsc --noEmit` et `npm run lint` doivent passer.

**Vision :** Prompta est aussi une **plateforme qui facilite la création d'agents IA**.
Le builder doit tout configurer clairement ; en échange, l'utilisateur final a une
expérience simple. Le parcours actuel a un bug bloquant et manque de clarté.

---

## 🔴 BLOC B1 — Corriger le bug des « fausses variables »

> Sur les captures « Environnement » et « Test », on voit 3 variables parasites :
> `variable`, `step_N_output`, `input`. Ce sont des **faux positifs**.

**Cause exacte :**
- `components/builder/StepEditor.tsx` (ligne ~52) : une étape LLM ajoutée est
  pré-remplie avec le **texte par défaut** `"Écrivez votre prompt ici. Utilisez
  {{variable}} et {{step_N_output}}."`. Ce texte est dans la **valeur** du champ.
- `components/builder/CreateWizard.tsx` (ligne ~107) : la détection
  `text.match(/\{\{(\w+)\}\}/g)` scanne ce texte et extrait `variable`,
  `step_N_output`, `input` comme si c'étaient de vraies variables d'entrée.
- Le label devient `Variable ${key}` → d'où l'affichage moche « Variable variable ».

**Correctifs :**
- [x] `StepEditor.tsx` : la valeur par défaut du prompt d'une nouvelle étape doit être
  **vide**. Le texte d'exemple passe en **`placeholder`** (le placeholder n'est pas dans
  `.value`, donc non détecté).
- [x] `CreateWizard.tsx` : la détection de variables doit **exclure les références
  d'étapes** — tout ce qui correspond à `/^step_\d+_output$/` (et `step_N_output`) n'est
  **jamais** une variable d'entrée.
- [x] Le label par défaut d'une variable ne doit plus être `Variable ${key}` mais une
  version lisible de la clé (ex. `nom_client` → « Nom client »).
- [x] Nettoyer les listings déjà créés : script `scripts/clean-fake-vars.ts` qui retire
  `variable`, `step_N_output`, `input` des `inputs` des manifestes existants.
- **DoD :** un agent nouvellement créé n'a aucune variable parasite ; les `{{step_..}}`
  ne sont jamais traités comme des entrées utilisateur.

---

## 🔴 BLOC B2 — Sélecteur de modèles IA dans l'étape LLM

> Sur la capture « Contenu », en ajoutant une étape LLM on ne peut pas choisir
> GPT-5, Claude Opus 4.7 / Sonnet 4.6, etc.

- [x] `StepEditor.tsx` : le sélecteur de modèle d'une étape LLM doit consommer le
  **catalogue `AI_MODELS` mis à jour** (Bloc 1 de v5 — GPT-5.x, Claude Opus 4.7,
  Claude Sonnet 4.6, Claude Haiku 4.5, Gemini 3.x…).
- [x] Utiliser un sélecteur **groupé par fournisseur** et recherchable (réutiliser la
  logique de `CatalogMultiSelect`), pas un `<select>` brut.
- [x] Chaque étape LLM stocke un `id` de catalogue ; la résolution vers l'identifiant
  d'API se fait via `resolveModel` (Bloc 1 de v5).
- **DoD :** le builder choisit n'importe quel modèle actuel pour chaque étape, par
  fournisseur.

---

## 🟠 BLOC B3 — Étendre massivement le catalogue d'intégrations

> Sur « Environnement », « Intégrations connectées » n'a qu'une poignée d'options.
> Il faut WhatsApp, Telegram et beaucoup d'autres.

- [x] `lib/catalogs.ts` — enrichir `INTEGRATIONS`, groupées par `category` :
  - **Messagerie** : WhatsApp, Telegram, Slack, Discord, Microsoft Teams, Messenger,
    SMS (Twilio)
  - **Email** : Gmail, Outlook, Resend, SendGrid
  - **Productivité** : Notion, Google Sheets, Google Docs, Google Drive, Airtable,
    ClickUp, Trello, Asana, Monday
  - **CRM / Sales** : HubSpot, Salesforce, Pipedrive, Zoho
  - **Design** : Canva, Figma, Adobe Express
  - **Dev** : GitHub, GitLab, Linear, Jira
  - **Automatisation** : Zapier, Make, n8n
  - **E-commerce / Web** : Shopify, WooCommerce, WordPress, Webflow
  - **Réseaux sociaux** : LinkedIn, X, Instagram, YouTube, TikTok, Facebook
  - **Recherche / Data** : Serper, Perplexity, Google Search
  - **Stockage** : Dropbox, Google Cloud Storage, AWS S3
  - **Agenda** : Google Calendar, Calendly
- [x] Marquer `popular: true` sur ~6 entrées transverses.
- [x] `CatalogMultiSelect` : le déroulant « Voir tout » affiche les **groupes** avec un
  champ de recherche en haut (la liste devient longue).
- [x] Quand une intégration nécessite une clé/connexion (ex. Serper, WhatsApp Business
  API), l'ajouter automatiquement aux `secrets` du manifeste et au bloc « Connexions
  requises » côté utilisateur.
- **DoD :** le builder déclare WhatsApp, Telegram et toute intégration du marché ;
  l'utilisateur final voit les connexions nécessaires.

---

## 🟠 BLOC B4 — Clarifier le « masque » de configuration des étapes

> Le builder doit pouvoir tout configurer clairement quand un agent enchaîne plusieurs
> étapes qui se croisent.

- [x] `StepEditor.tsx` — chaque étape est une **carte claire** :
  - badge de type (LLM / Recherche web / HTTP / Fichier) + numéro d'étape ;
  - pour une étape LLM : modèle, prompt, et une ligne « Entrée / Sortie » lisible
    (« cette étape produit `étape 2` ») ;
  - boutons : réordonner (↑↓), dupliquer, supprimer.
- [x] **Barre d'insertion** au-dessus du champ prompt : des boutons « Insérer une
  variable » et « Insérer la sortie de l'étape N » → le builder **n'écrit jamais
  `{{step_1_output}}` à la main** (source d'erreurs).
- [x] Indicateur visuel de la **chaîne** : étape 1 → étape 2 → étape 3.
- [x] Validation : bloquer « Continuer » si une étape LLM a un prompt vide ou si une
  référence `{{step_X_output}}` pointe vers une étape inexistante.
- **DoD :** le builder visualise et configure une chaîne multi-étapes sans ambiguïté.

---

## 🟠 BLOC B5 — Section « Variables d'entrée » explicite et propre

> Aujourd'hui les variables sont auto-détectées (avec des parasites) et mal libellées.

- [x] Faire de cette section une **définition explicite** : titre clair — « Que doit
  fournir l'utilisateur final ? ».
- [x] Chaque variable : `clé` (le `{{...}}`), `label` (ce que voit l'utilisateur),
  `type` (texte court / texte long / nombre / fichier / liste), `requis`, `aide/exemple`.
- [x] L'auto-détection devient une **suggestion** : « On a repéré `{{secteur}}` dans vos
  prompts — l'ajouter ? » — jamais une injection automatique silencieuse.
- [x] Les `{{step_N_output}}` n'apparaissent **jamais** ici (ce sont des références
  internes, gérées au Bloc B4).
- **DoD :** la liste des variables est propre, explicite, bien libellée.

---

## 🟠 BLOC B6 — Refondre l'étape « Test (Playground) »

> Sur la capture, le Playground affiche « Variable variable », « Variable step_N_output »,
> « Variable input » — illisible.

- [x] Le Playground affiche les **vraies variables d'entrée** avec leur `label` et leur
  `type` (corrigés via B1/B5) — plus aucun « Variable variable ».
- [x] Afficher un **récap clair** avant le test : « Cet agent va : 1) … 2) … et produira :
  … ». Le builder voit ce que vivra l'utilisateur final.
- [x] À l'exécution : afficher **chaque étape** et sa sortie, le résultat final, le coût
  estimé, et les erreurs de façon lisible.
- [x] Retirer ou clarifier la mention « streaming simulé en V1 » (jargon inutile pour le
  builder).
- **DoD :** le builder teste son agent comme le fera l'utilisateur final, avec des
  libellés clairs et un résultat visible.

---

## 🟢 BLOC B7 — Cohérence builder → utilisateur final

- [x] Vérifier que tout ce que le builder configure (variables, modèle, intégrations,
  connexions requises) se retrouve **fidèlement** dans le masque de run côté utilisateur
  (`RunPanel`).
- [x] Aperçu builder : un bouton « Voir comme un utilisateur » qui montre la fiche et le
  masque de run tels que l'utilisateur final les verra.
- **DoD :** ce que le builder configure = ce que l'utilisateur final voit. Aucune
  surprise.

---

## Ordre

| Priorité | Bloc | Pourquoi |
|---|---|---|
| 🔴 Immédiat | B1, B2 | Bug des fausses variables + modèles non sélectionnables. |
| 🟠 Haute | B3, B4, B5, B6 | Catalogue d'intégrations, clarté du masque, Playground. |
| 🟢 Finition | B7 | Cohérence builder ↔ utilisateur. |

*À traiter après le Bloc 1 de `TODO-CURSOR-v5.md` (catalogue de modèles), dont B2 dépend.*
