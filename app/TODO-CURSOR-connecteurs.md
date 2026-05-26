# TODO Cursor — Connecteurs & exécution multi-techno

> Complément à `TODO-CURSOR-v5.md` et `TODO-CURSOR-builder-flow.md`.
> Objectif : permettre à un builder de créer un agent qui **agit réellement** sur
> plusieurs outils (lire un mail → rédiger un devis → le créer sur Canva → l'envoyer),
> et à l'utilisateur final de le faire tourner depuis Prompta après abonnement.
> ⚠️ Ce chantier est **structurant** — à planifier comme une vraie phase, pas un bloc.

---

## Le constat — pourquoi ce n'est pas possible aujourd'hui

Il faut distinguer deux choses que le projet confond :

- **Métadonnée déclarative** (le catalogue d'intégrations : « cet agent est compatible
  Canva ») → c'est juste un **badge**. C'est ce qu'on a.
- **Connecteur exécutable** (l'agent **appelle vraiment** l'API Canva avec le compte de
  l'utilisateur) → c'est ce qu'il **manque**.

Aujourd'hui l'orchestrateur ne connaît que 4 outils : `llm`, `web_search`,
`http_fetch`, `file_read`. Déclarer « Gmail + Canva » dans le catalogue **ne donne
aucune capacité d'action** à l'agent. Un builder ne peut donc **pas** créer l'agent
« mail → devis → Canva → mail » : il n'a aucune brique pour lire un mail, créer un design
Canva ou envoyer un email.

Deuxième confusion : **clé API ≠ connexion OAuth**.
- Les fournisseurs LLM (OpenAI, Anthropic…) → l'utilisateur **colle une clé**.
- Les services SaaS (Gmail, Canva, Slack, HubSpot…) → l'utilisateur **se connecte en
  OAuth** (« Se connecter avec Google »), il ne colle pas de clé.
Le système actuel ne gère que les clés collées. Le masque utilisateur final est donc
incomplet pour ce scénario.

**Conclusion :** après les TODO précédentes, ni le builder ni l'utilisateur final ne
peuvent réaliser ce scénario. Ce document comble ce trou.

---

## Décision d'architecture à acter

Construire à la main les connecteurs OAuth de dizaines de services (Gmail, Canva, Slack,
WhatsApp, HubSpot, Notion…) est un travail **énorme et sans fin** (une app OAuth + une
intégration + de la maintenance par service).

**Recommandation : intégrer une plateforme de connecteurs unifiée** plutôt que tout
recoder — par exemple **Composio** (conçu précisément pour donner des actions/outils à
des agents IA, avec auth gérée, sur 250+ apps), ou Nango / Paragon / Pipedream Connect.
Cela fournit en une intégration : les connecteurs, les flux OAuth, et les actions.
À évaluer en Bloc C1. À défaut, partir sur **3-4 connecteurs maison** prioritaires.

> Note coûts : une plateforme de connecteurs a un coût (par utilisateur/action). Le
> modèle « BYO » reste vrai (l'utilisateur connecte SES comptes), mais ce n'est plus
> strictement « zéro coût plateforme » — à intégrer dans le pricing.

---

## 🔵 BLOC C1 — Couche de connecteurs exécutables

- [x] Évaluer et choisir : plateforme unifiée (Composio recommandé) **vs** connecteurs
  maison. Documenter le choix dans `docs/connectors.md`.
- [x] `lib/connectors/` : une abstraction `Connector` avec, par service :
  `id`, `label`, `authType` (`oauth` | `api_key`), et une liste d'**actions**
  (`id`, `label`, `inputs`, `output`).
- [x] Catalogue d'actions de départ (prioritaires) :
  - **Gmail / Outlook** : lire des emails (filtre), envoyer un email, répondre.
  - **Canva** : créer un design depuis un template, exporter en PDF/image.
  - **Telegram** : envoyer un message (simple — bot token).
  - **Google Sheets** : lire/écrire des lignes.
  - **Slack** : envoyer un message.
  - (WhatsApp : prévoir, mais signaler que la WhatsApp Business API est complexe —
    approbation Meta, BSP — donc à planifier à part.)
- [x] Chaque action est exécutée **côté serveur** avec la connexion de l'utilisateur,
  jamais celle du builder.
- **DoD :** l'orchestrateur dispose d'actions réelles `gmail.send`, `canva.create`, etc.,
  utilisables comme étapes.

## 🔵 BLOC C2 — Étape « Action » dans le builder

- [x] `StepEditor.tsx` : nouveau type d'étape **« Action »** (en plus de LLM / Recherche
  web / HTTP / Fichier).
- [x] Parcours de configuration d'une étape Action :
  1. choisir le **connecteur** (Gmail, Canva, Telegram…) dans le catalogue ;
  2. choisir l'**action** (envoyer un email, créer un design…) ;
  3. **renseigner les paramètres** de l'action via un masque généré depuis
     `action.inputs` — chaque paramètre peut être une valeur fixe, une `{{variable}}`
     d'entrée, ou la sortie d'une étape `{{step_N_output}}` (barre d'insertion du
     Bloc B4).
- [x] À chaque étape Action ajoutée, le connecteur correspondant est automatiquement
  ajouté aux **connexions requises** du manifeste.
- [x] Le manifeste (`AgentManifestSchema`) doit accepter un step `type: "action"` avec
  `connector`, `action`, `params`.
- **DoD :** le builder compose l'agent « lire mail (Gmail) → générer devis (LLM) →
  créer design (Canva) → envoyer (Gmail) » entièrement dans le masque, sans coder.

## 🔵 BLOC C3 — Flux de connexion OAuth

- [x] `app/api/connectors/[id]/connect` + `/callback` : flux OAuth par connecteur (ou
  délégué à la plateforme unifiée du Bloc C1).
- [x] Migration `0022_user_connections.sql` : table `user_connections`
  (`owner_id`, `connector_id`, `access_token` chiffré, `refresh_token` chiffré,
  `status`, `scopes`, `expires_at`). RLS stricte, mêmes règles que les clés API.
- [x] **Rafraîchissement automatique** des tokens expirés ; si échec → statut
  `disconnected` + invitation à reconnecter.
- [x] Sécurité : tokens chiffrés au repos, jamais exposés au client ni au builder,
  jamais loggés, révocables.
- **DoD :** un utilisateur connecte son compte Google/Canva en un clic ; le token est
  stocké chiffré et rafraîchi tout seul.

## 🔵 BLOC C4 — Le masque de connexions de l'utilisateur final

> Au moment où l'utilisateur s'abonne à un agent, il doit voir **tout ce qu'il doit
> brancher**, avec de l'aide, et pouvoir le mettre à jour à la demande.

- [x] `components/run/ConnectionsMasque.tsx` : affiché à l'abonnement à un agent, et
  accessible **à tout moment** depuis la fiche / le dashboard.
- [x] Il liste **tout ce que l'agent requiert**, en deux familles :
  - **Clés API** (LLM) → champ à coller + lien d'aide « Où trouver ma clé OpenAI ? ».
  - **Connexions** (Gmail, Canva…) → bouton « Se connecter » (OAuth) + courte explication
    « Pourquoi : l'agent envoie l'email depuis votre compte ».
- [x] Pour chaque élément, un **état clair** : ✅ connecté / ⚠️ à configurer, et une
  **aide contextuelle** indiquant où aller chercher la chose.
- [x] **Checklist de préparation** : tant que tout n'est pas vert, le bouton « Lancer »
  est désactivé avec un message explicite (« il reste à connecter Canva »).
- [x] Page « Mes connexions » globale : l'utilisateur met à jour / révoque ses clés et
  connexions quand il veut.
- **DoD :** à l'abonnement, l'utilisateur est guidé pas à pas pour préparer son
  environnement ; il sait exactement quoi brancher et où, et peut le modifier à la
  demande.

## 🔵 BLOC C5 — Exécution multi-techno depuis Prompta

- [x] `lib/agent/orchestrator.ts` : gérer le step `type: "action"` — résoudre la
  connexion de l'utilisateur, appeler le connecteur, passer la sortie à l'étape suivante.
- [x] Avant de lancer : vérifier que **toutes** les connexions requises sont actives ;
  sinon, renvoyer vers le masque du Bloc C4.
- [x] `RunPanel` : affichage **étape par étape** de l'exécution multi-techno —
  « 1/4 Lecture des emails ✓ · 2/4 Rédaction du devis… » — avec le résultat final.
- [x] Gestion d'erreur par étape : si Canva échoue, message clair + reprise possible.
- **DoD :** l'utilisateur abonné lance l'agent depuis Prompta, voit chaque étape
  s'exécuter visuellement, et obtient le résultat — sans rien télécharger.

## 🟢 BLOC C6 — Déclencheurs (phase ultérieure)

> Le scénario « répond au mail » implique un **déclencheur** (l'agent se lance quand un
> mail arrive), pas seulement un lancement manuel.

 Concept de `trigger` : manuel (défaut), planifié (cron), ou événementiel
  (« nouveau mail », « nouveau message »).
- [x] Réutiliser `scheduled_runs` pour le planifié ; les triggers événementiels (webhooks
  entrants des connecteurs) sont un chantier à part — **à planifier après C1-C5**.
- **DoD :** un agent peut se déclencher automatiquement, pas seulement à la demande.

---

## Réponse aux deux questions

**Côté builder** — après C1-C5, oui : il compose un agent multi-techno (mail → devis →
Canva → mail) entièrement dans le masque, en empilant des étapes LLM et des étapes
Action, sans écrire de code. C6 ajoute le déclenchement automatique.

**Côté utilisateur final** — après C3-C5, oui : à l'abonnement, le masque de connexions
lui dit exactement quoi brancher (clé OpenAI + connexion Gmail + connexion Canva), avec
de l'aide ; une fois tout vert, l'agent tourne **visuellement depuis Prompta**, étape
par étape, sans téléchargement.

---

## Ordre & dépendances

| Priorité | Bloc | Dépend de |
|---|---|---|
| 🔵 D'abord | C1 | — (choix d'archi : plateforme unifiée vs maison) |
| 🔵 Ensuite | C2, C3 | C1 |
| 🔵 Puis | C4, C5 | C2, C3 |
| 🟢 Plus tard | C6 | C1-C5 |

*Ce chantier vient après les blocs 🔴 de `TODO-CURSOR-v5.md` (moteur de modèles) et
`TODO-CURSOR-builder-flow.md` (B1-B2). C'est lui qui transforme Prompta en vraie
plateforme d'agents qui agissent — pas seulement qui répondent.*
