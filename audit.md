# Prompta — Document directeur (v2, approfondi)

> Consolidation de l'audit, des recommandations et des nouvelles décisions produit.
> Ce document **remplace** la note B2B/agents précédente sur le volet monétisation :
> ta question sur l'abonnement fait évoluer la reco. Lis-le en entier.

---

## Thèse en 4 phrases

Prompta ne doit pas être un catalogue de texte, mais un **runtime** : l'endroit où les
prompts et agents **tournent**, pas seulement où on les achète. La copie cesse d'être un
problème dès lors que l'exécution se fait chez toi. Le revenu durable est **récurrent**
(abonnement) et non transactionnel. Et le B2B n'est pas un produit séparé : c'est le même
runtime, vendu en privé et en gouverné.

---

# PARTIE A — Tout faire tourner sur la plateforme

## A1. Le principe : Prompta devient un runtime

Aujourd'hui un achat = un `.zip` téléchargé que l'utilisateur doit faire tourner ailleurs.
La cible : **l'utilisateur clique, ça tourne dans Prompta.** Trois types de contenu, un
seul moteur :

- **Prompt** = 1 appel modèle. Exécution triviale.
- **Workflow** = chaîne d'appels modèle. Exécution séquentielle.
- **Agent** = chaîne + outils (recherche web, fetch, fichiers). Exécution orchestrée.

Le même moteur sert le marketplace public **et** le B2B (bibliothèque privée qui exécute
en interne). **Tu construis le runtime une fois, tu le vends deux fois.**

## A2. Prompts en un clic, multi-modèles — ton scénario

Scénario : un prompt gratuit, le builder l'a prévu pour GPT, l'utilisateur clique et ça
se lance. Voici comment ça se câble proprement.

1. **À la publication**, le builder déclare le ou les modèles cibles :
   `model.preferred = "gpt-4o"`, `model.compatible = ["claude-sonnet", "gemini-2.5"]`.
2. **La passerelle modèles (model gateway)** abstrait tous les fournisseurs derrière une
   seule interface : OpenAI, Anthropic, Google, Mistral, etc. Le builder ne code rien de
   spécifique à un fournisseur — il choisit dans une liste.
3. **Côté utilisateur** : bouton « Lancer ». Si le prompt a des variables
   (`{{secteur}}`, `{{prospect}}`…), un **masque** s'ouvre (cf. A3). Le modèle est
   pré-sélectionné sur la reco du builder, mais l'utilisateur peut basculer sur un autre
   modèle compatible. Résultat **streamé** en direct.
4. **Qui paie l'appel ?** Voir A4 et Partie B. En résumé : la clé de l'utilisateur (BYOK)
   par défaut, ou un quota gratuit plafonné de la plateforme pour les prompts gratuits.

> **Point de vigilance — « gratuit » ne veut pas dire « gratuit pour toi ».** Si un prompt
> gratuit tourne sur **les clés de la plateforme**, c'est **toi** qui paies chaque appel.
> Sans garde-fou, c'est une fuite de trésorerie. Solutions : (a) un prompt gratuit tourne
> avec **la clé de l'utilisateur** → coût zéro pour toi, infiniment scalable ; (b) sinon,
> un **quota gratuit plafonné** (ex. 20 runs/jour/utilisateur) sur les clés plateforme
> pour ceux qui n'ont pas encore de clé. La recommandation : (a) par défaut, (b) en
> roue de secours pour ne pas bloquer l'onboarding.

## A3. Le masque d'exécution (spécification UI)

Le « masque » qui s'ouvre quand on lance un prompt/agent. Composition :

```
┌─────────────────────────────────────────────┐
│  ▶ Lancer — Agent Cold Email closer B2B       │
├─────────────────────────────────────────────┤
│  CHAMPS  (générés depuis le manifeste)        │
│   • Nom de l'entreprise   [____________]      │
│   • Votre offre           [____________]      │
│   • Fichier CV            [ Choisir… ]        │
│                                               │
│  MODÈLE                                       │
│   ( ● GPT-4o   ○ Claude   ○ Gemini )          │
│                                               │
│  CONNEXIONS REQUISES                          │
│   ✓ OpenAI            connectée                │
│   ⚠ Serper.dev        à renseigner  [ + ]      │
│                                               │
│  Coût estimé : ~0,06 € (votre clé OpenAI)      │
│                                               │
│            [  Lancer l'exécution  ]            │
└─────────────────────────────────────────────┘
```

Règles :
- Les **champs** sont générés automatiquement depuis les `inputs` du manifeste.
- Le **sélecteur de modèle** n'affiche que les modèles compatibles déclarés par le builder.
- Le bloc **« Connexions requises »** liste les clés API dont ce contenu a besoin, avec
  un état : `✓ connectée` ou `⚠ à renseigner`. Un bouton `+` ouvre la saisie **inline**
  (sans quitter le masque) → la clé est stockée dans le compte (cf. A4) et réutilisée
  ensuite partout.
- **Estimation de coût** affichée avant de lancer. Confirmation au-delà d'un seuil.
- Le bouton « Lancer » est désactivé tant qu'une connexion requise manque.

## A4. La gestion des clés API par l'utilisateur (spec + sécurité)

C'est ta demande explicite : l'interface doit permettre à l'utilisateur final de
renseigner les API nécessaires. Deux endroits :

**1. Un écran global « Mes connexions »** (`/dashboard/connexions`) :
- L'utilisateur saisit **une fois** ses clés : OpenAI, Anthropic, Google AI, Mistral,
  Serper, etc. Chaque entrée : nom du service, clé, état (valide/invalide testé en direct).
- Affichage : seuls les **4 derniers caractères** sont visibles (`sk-…a3f9`).
- Pour les comptes B2B : clés gérées **au niveau de l'organisation** — entrées une fois
  par l'admin, utilisées par tous les sièges, jamais visibles des employés.

**2. La saisie inline dans le masque** (cf. A3) — si une clé manque au moment de lancer.

**Sécurité des clés — non négociable :**
- Chiffrement **au repos** (libsodium / KMS), avec une clé serveur jamais exposée.
- La clé n'est **jamais** renvoyée au navigateur après saisie, **jamais** loggée,
  **jamais** visible d'un builder.
- Au runtime, la clé est déchiffrée **côté serveur uniquement**, le temps de l'appel.
- Possibilité pour l'utilisateur de **révoquer** une clé à tout moment.
- RGPD : la clé est une donnée sensible → la mentionner dans la politique de
  confidentialité, suppression à la demande.

> Modèle de données : table `user_api_keys` (ou `org_api_keys`) — `owner_id`,
> `provider`, `encrypted_key`, `last4`, `is_valid`, `created_at`. RLS stricte : un
> utilisateur ne lit que ses propres clés ; aucune route ne renvoie `encrypted_key`.

## A5. Architecture du runtime

Quatre briques (déjà décrites, ici consolidées) :

1. **Passerelle modèles** — interface unique multi-fournisseurs (LiteLLM ou OpenRouter
   pour démarrer). Gère le `fallback`, le comptage de tokens, le multi-modèle.
2. **Orchestrateur** — service worker séparé (sur Render), lit le manifeste, exécute les
   étapes, gère retries/timeouts. Les runs passent par une file (table `agent_runs` en
   `pending`, ou Redis).
3. **Outils** — implémentés **côté serveur** par la plateforme, depuis une **liste
   blanche** : `web_search`, `http_fetch` (avec filtrage d'egress), `file_read`. L'agent
   ne choisit jamais un outil hors liste.
4. **Bac à sable** — *seulement* si tu autorises un jour du code arbitraire. Utilise E2B
   ou Modal, ne le construis pas toi-même. **Hors périmètre V1.**

**V1 = agents déclaratifs (étapes en JSON), pas de code arbitraire.** Tu n'as besoin que
des briques 1-2-3. Sûr et suffisant pour ~80 % des cas.

---

# PARTIE B — La monétisation des agents : per-run vs abonnement

## B1. Le débat — et pourquoi ton instinct est bon

Tu remets en cause le « payer à chaque run ». **Tu as raison, et je révise ma reco
précédente.** Comparons honnêtement :

| Critère | Crédits par run (modèle précédent) | Abonnement + BYOK (ton idée) |
|---|---|---|
| Ressenti utilisateur | Anxiété : « chaque clic coûte » | Prévisible, confortable |
| Coût/risque compute pour toi | Tu avances les tokens, tu marges | **~Zéro** : l'utilisateur paie sa conso |
| Complexité technique | Lourde : métering, facturation à l'usage | Légère : une souscription Stripe |
| Revenu | Variable, à la conso | **MRR** récurrent et prévisible |
| Revenu builder | Part sur chaque run | **MRR** par agent |
| Qui supporte un abus de volume | Toi (si clés plateforme) | **L'abuseur lui-même** (sa propre clé) |
| Friction d'entrée | Faible (pas de clé à gérer) | Plus élevée (il faut une clé API) |

Le per-run n'est pas « faux » — il est *exact* en comptabilité analytique — mais il est
**lourd à opérer** et **angoissant à l'usage**. L'abonnement + BYOK est plus simple, plus
prévisible, génère du MRR, et **fait porter le coût de conso par celui qui en profite**.
C'est un modèle SaaS éprouvé.

## B2. Le modèle recommandé : abonnement + BYOK par défaut

**Pour les agents et workflows (usage régulier) :**

- L'utilisateur **s'abonne à l'agent** : un forfait mensuel fixé par le builder
  (ex. 5–29 €/mois selon la valeur).
- L'utilisateur **branche sa propre clé** (BYOK) → il paie sa conso LLM directement au
  fournisseur. Coût compute pour toi ≈ zéro.
- Le builder touche du **MRR par agent**. Tu prélèves ta **commission** (ex. 20–30 %)
  sur l'abonnement.
- L'agent **tourne sur Prompta** : l'accès est conditionné à l'abonnement actif.
  **Résiliation = perte d'accès** → le piratage est résolu par construction.
- Volume illimité : l'utilisateur peut lancer l'agent 10 ou 10 000 fois, c'est **sa**
  clé qui paie. Le builder garde son MRR fixe. Le coût scale avec le bénéficiaire.

C'est élégant : personne ne subit le coût d'un autre.

## B3. Les autres modes (à garder, mais secondaires)

L'abonnement + BYOK est le **défaut**. Mais garde deux options pour ne pas perdre de
segments :

- **Mode facile — clés plateforme + crédits.** Pour l'utilisateur non technique qui
  refuse de gérer une clé API. La plateforme fournit la clé, applique une **marge**,
  refacture en crédits. Plus cher pour l'utilisateur, plus complexe pour toi → positionne-le
  comme un **confort premium**, pas le défaut.
- **Pay-per-run ponctuel.** Pour celui qui veut juste essayer un agent une ou deux fois
  sans s'abonner. Petit montant, clé plateforme. Sert surtout de **galop d'essai**.

## B4. Récapitulatif par type de contenu

| Type | Gratuit | Payant |
|---|---|---|
| **Prompt** | Run avec **clé utilisateur** (BYOK), ou quota gratuit plafonné | **Achat unique** pour débloquer + run BYOK |
| **Workflow** | Idem prompt | Achat unique, ou petit abonnement si usage répété |
| **Agent** | Galop d'essai (X runs gratuits, clé plateforme) | **Abonnement mensuel + BYOK** (défaut) · crédits plateforme (option) |

> Un prompt simple = un appel : l'abonnement n'a pas de sens, l'achat unique suffit.
> Un agent = un outil qu'on réutilise : l'abonnement est le bon modèle.

## B5. Ce que ça change pour les builders

- Le builder ne vend plus une fois à 7 € : il a du **MRR** sur chaque agent abonné.
- Il a une raison forte de **maintenir** son agent (un agent cassé = désabonnement).
- Il devient **quasi-propriétaire d'un micro-SaaS** hébergé par Prompta.
- Ça change le profil des builders que tu attires : moins de « vendeurs de prompts »,
  plus de **constructeurs sérieux** — exactement ceux qui crédibilisent la plateforme.

> **Idée pour plus tard (modèle Spotify).** Un abonnement plateforme unique « Prompta Pro »
> donnant accès à *tout* le catalogue d'agents, avec un revshare redistribué aux builders
> **au prorata de l'usage**. Confort maximal pour l'utilisateur, MRR maximal pour toi.
> À tester une fois que le modèle par-agent tourne.

---

# PARTIE C — Le B2B

## C1. Le produit (rappel)

Bibliothèque privée d'agents IA, versionnée et gouvernée : organisations, rôles, espaces
par équipe/client, workflow d'approbation, audit log, SSO, analytics, **et exécution
interne via le même runtime** avec plafonds par équipe. Clés API gérées au niveau de
l'organisation (cf. A4).

Pricing : **abonnement par siège** (gouvernance, accès) **+ exécution en BYOK org**
(la boîte branche ses propres clés → conso prévisible, pas de marge token à gérer).

## C2. « Dois-je faire leur contenu ? » — la réponse

**Non — et tu ne dois pas vendre ça comme ta promesse principale.** Le produit que tu
vends, c'est **la plateforme** (le contenant : bibliothèque, gouvernance, runtime, SSO),
pas le contenu. « On écrit vos prompts » ne scale pas et n'est pas le business.

**Mais** chaque client B2B a un problème de démarrage à froid : une bibliothèque vide n'a
aucune valeur. Tu dois donc l'**amorcer** — sans pour autant tout produire toi-même.

## C3. Les 3 leviers de contenu B2B

1. **Import depuis le marketplace public.** Le catalogue public devient le **stock de
   départ** des bibliothèques privées : « Importez cet agent du catalogue dans votre
   bibliothèque d'équipe. » Levier énorme — c'est la jonction entre ton B2C et ton B2B.
   Tu construis le contenu une fois (public), il sert tout le monde.
2. **Onboarding « clé en main » payant.** Une prestation de mise en route où **toi ou des
   builders certifiés** construisez les 10–20 premiers agents du client. C'est du
   **revenu de service**, à forte marge, et c'est la façon classique de **closer un gros
   compte enterprise**. Optionnel pour le client, mais c'est souvent ce qui débloque la
   signature.
3. **Le client crée son contenu** avec tes outils de gouvernance. C'est le régime de
   croisière — et la vraie valeur : ses agents internes, c'est **son** savoir-faire.

**Le flywheel :** les builders du marketplace deviennent un **vivier de prestataires**
pour les missions B2B sur mesure → Prompta prend une commission sur la prestation. Tu n'as
toi-même presque rien à produire ; tu orchestres une place de marché de contenu *et* de
services.

## C4. Go-to-market B2B

- Wedge : **agences et cabinets de conseil** d'abord (leurs agents = leur IP, besoin
  multi-sièges, adopteurs précoces, et ils peuvent aussi *publier* sur le public).
- Puis les équipes internes des PME/ETI (« shadow AI » à structurer).
- Vente menée par le fondateur, *land & expand* : atterrir dans une équipe, prouver,
  étendre.
- Anticiper : revue de sécurité, DPA RGPD, puis SOC 2 pour les gros comptes.

---

# PARTIE D — Sécurité, juridique, coûts (consolidé)

- **Clés API** : chiffrées au repos, jamais exposées au client ni aux builders, jamais
  loggées, révocables (cf. A4).
- **Modération** : rien ne se publie sans validation (`under_review` → admin). Scan des
  injections, NSFW, exfiltration. *Chantier prioritaire — cf. roadmap.*
- **Exécution non fiable** : liste blanche d'outils, filtrage d'egress sur `http_fetch`,
  timeouts, plafonds de pas/tokens, scan des sorties.
- **RGPD** : quand un agent tourne, les données de l'acheteur transitent par la logique
  du builder et par Prompta → **DPA obligatoire**, logs cloisonnés (les données acheteur
  ne fuient **jamais** vers le builder), registre des traitements.
- **Coûts plateforme** : avec le modèle BYOK par défaut, ton coût LLM ≈ zéro ; tu portes
  l'orchestration (faible), le stockage, l'egress, et la conso du *mode facile* optionnel.
- **Risque fournisseur** : la passerelle multi-modèles protège des changements de prix /
  pannes d'un fournisseur unique.
- **Rate limiting** sur les routes sensibles (checkout, download, webhooks, exécution).

---

# PARTIE E — Feuille de route consolidée

Intègre l'audit (`AUDIT.md`), la TODO Cursor existante et les nouveaux chantiers runtime.

### Phase 0 — Combler les manques bloquants (depuis l'audit)
- [ ] **Modération** : back-office admin `under_review → published`. *Sans ça, rien ne
  se publie.* Priorité absolue.
- [ ] Finir le reskin (profil, dashboard, auth) au design du preview.
- [ ] Rate limiting + filtres de contenu + pages légales validées.

### Phase 1 — Le runtime (cœur du pivot)
- [ ] Passerelle modèles multi-fournisseurs.
- [ ] Écran « Mes connexions » + table `user_api_keys`/`org_api_keys` chiffrée.
- [ ] Masque d'exécution (champs dynamiques, sélecteur de modèle, état des connexions,
  estimation de coût).
- [ ] **Run de prompt en un clic** (BYOK ou quota gratuit plafonné), résultat streamé.
- [ ] Manifeste `agent.json` + éditeur visuel d'agents déclaratifs + playground.
- [ ] Orchestrateur + 2-3 outils en liste blanche.

### Phase 2 — Monétisation récurrente
- [ ] **Abonnement à l'agent + BYOK** (Stripe Subscriptions), commission plateforme.
- [ ] Galop d'essai (runs gratuits) ; mode facile crédits en option.
- [ ] Revshare builder en MRR ; tableau de bord revenus builder.
- [ ] Observabilité des runs (perf agent, ROI acheteur).

### Phase 3 — B2B profond
- [ ] Organisations, rôles, espaces, clés au niveau org.
- [ ] Import marketplace → bibliothèque privée.
- [ ] Workflow d'approbation interne, audit log, SSO.
- [ ] Offre d'onboarding « clé en main » + vivier de builders prestataires.
- [ ] Facturation par siège (Stripe) + exécution BYOK org.

### Phase 4 — Extensions
- [ ] Planification d'agents (le « Zapier de l'IA »).
- [ ] Abonnement plateforme « Prompta Pro » (modèle Spotify, revshare à l'usage).
- [ ] Sandbox pour code arbitraire (E2B/Modal).
- [ ] BYO-model entreprise, instance privée.

---

# Décisions à acter maintenant

1. **Le runtime est la priorité produit** après la modération. Prompta exécute, ne se
   contente pas de vendre.
2. **Abonnement + BYOK = modèle par défaut des agents.** Per-run abandonné comme défaut,
   conservé seulement en galop d'essai. Crédits plateforme = option confort premium.
3. **L'utilisateur gère ses clés API** via un écran dédié + saisie inline dans le masque.
   Chiffrement et cloisonnement non négociables.
4. **Tu ne produis pas le contenu B2B** : tu amorces par l'import du marketplace et tu
   vends l'onboarding en prestation (toi ou builders certifiés).
5. **Un seul moteur** sert le marketplace public et le B2B. Construis-le une fois.

---

*Le fil rouge : exécution → récurrence → défendabilité. Le marketplace amorce et
crédibilise ; le runtime fait tourner ; l'abonnement fait le chiffre ; le B2B réutilise
tout. Construis le moteur une fois, proprement.*
