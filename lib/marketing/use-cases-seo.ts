/**
 * Pages SEO « cas d'usage » — la longue traîne de Prompta.
 * Chaque entrée devient une page statique indexable /cas-usage/<slug>
 * (HowTo + FAQPage en JSON-LD), écrite pour une requête intentionniste FR.
 */

export interface UseCaseSeo {
  slug: string;
  /** <title> — la requête cible en tête. */
  title: string;
  metaDescription: string;
  kicker: string;
  h1: string;
  intro: string;
  /** L'ordre exact à donner à Prompta (affiché en « prompt prêt à l'emploi »). */
  exampleOrder: string;
  steps: { title: string; body: string }[];
  benefits: string[];
  faq: { q: string; a: string }[];
}

export const USE_CASES_SEO: UseCaseSeo[] = [
  {
    slug: "resumer-page-web-ia",
    title: "Résumer une page web avec l'IA (sans copier-coller)",
    metaDescription:
      "Résume n'importe quelle page web en 3 secondes avec un assistant IA qui lit ce que tu vois — articles, rapports, PDF, dashboards. Gratuit pour démarrer.",
    kicker: "Lecture instantanée",
    h1: "Résumer une page web avec l'IA, sans copier-coller",
    intro:
      "Copier le texte d'un article, ouvrir ChatGPT, coller, attendre… c'est fini. Prompta vit dans ton navigateur : il lit la page que tu regardes — article, rapport, PDF, documentation, même un dashboard derrière ton login — et te la résume en streaming, sans que tu quittes l'onglet.",
    exampleOrder: "Résume cette page en 5 points clés, avec les chiffres importants.",
    steps: [
      { title: "Ouvre la page à résumer", body: "Article de presse, étude, PDF, page de doc, fiche produit : tout ce qui s'affiche dans ton navigateur fonctionne — y compris les pages accessibles uniquement avec ton compte." },
      { title: "Ouvre le panneau Prompta", body: "Clique sur le P dans ta barre Chrome (ou Alt+P). Le panneau glisse à droite, la page reste visible." },
      { title: "Demande, il répond au tac au tac", body: "« Résume cette page », « explique ce tableau », « traduis la section pricing » — la réponse arrive token par token, en général en moins d'une seconde." },
    ],
    benefits: [
      "Fonctionne sur les pages connectées (CRM, intranet, mails ouverts) — l'IA lit via TON navigateur, avec ta session",
      "Résume aussi plusieurs onglets d'un coup : « compare ces 3 articles »",
      "Zéro copier-coller, zéro changement d'onglet, historique conservé",
    ],
    faq: [
      { q: "Ça marche sur les PDF ouverts dans le navigateur ?", a: "Oui. Prompta détecte les PDF affichés dans un onglet et les traite comme n'importe quelle page : résumé, extraction de chiffres, traduction de sections." },
      { q: "Et sur les pages qui demandent une connexion ?", a: "Oui — c'est la grande différence avec un chatbot externe. La page est lue par ton navigateur, avec ta session : un dashboard interne, un article réservé aux abonnés ou un email ouvert sont lisibles par l'assistant." },
      { q: "C'est vraiment gratuit ?", a: "Le compte est gratuit et 2 € de crédits IA sont offerts sans carte bancaire. Tu peux aussi brancher ta propre clé API (OpenAI, Anthropic…) : dans ce cas les résumés sont illimités et ne consomment aucun crédit." },
    ],
  },
  {
    slug: "extraire-donnees-site-google-sheets",
    title: "Extraire les données d'un site vers Google Sheets avec l'IA",
    metaDescription:
      "Un agent IA qui lit le tableau ou l'annuaire affiché à l'écran et le structure dans Google Sheets — noms, prix, contacts. Avec ta validation avant chaque écriture.",
    kicker: "Extraction & structuration",
    h1: "Extraire les données d'un site vers Google Sheets",
    intro:
      "Un annuaire de prospects, un tableau de prix, une liste de résultats : recopier à la main prend des heures et génère des erreurs. Donne l'ordre à Prompta — il lit ce qui est affiché à l'écran, structure les données (nom, ville, téléphone, prix…) et les écrit dans ton Google Sheets. Toi, tu vérifies et tu valides.",
    exampleOrder: "Recense les entreprises affichées sur cette page dans mon Google Sheets ouvert : nom, ville, téléphone, site web.",
    steps: [
      { title: "Affiche la source et ton Sheets", body: "Ouvre la page qui contient les données dans un onglet, et ton Google Sheets dans un autre. Prompta voit tes onglets ouverts (ceux que tu coches)." },
      { title: "Donne l'ordre en français", body: "Décris les colonnes que tu veux. L'assistant bascule en mode mission : il planifie, extrait, structure — et te montre chaque étape en direct." },
      { title: "Valide avant écriture", body: "Les écritures passent par ta validation : tu vois exactement ce qui va être ajouté au Sheets, tu corriges ou tu refuses. Rien ne part sans ton feu vert." },
    ],
    benefits: [
      "Il peut aussi cliquer pour toi : « affiche les numéros masqués puis recense-les » — le pilotage se fait sous tes yeux",
      "Corrige en conversationnel : « tu as oublié la colonne email » et il reprend là où il en était",
      "Fonctionne avec Sheets, Airtable, Notion — 1 000+ apps connectables",
    ],
    faq: [
      { q: "Il faut savoir coder ou faire du scraping ?", a: "Non. Tu décris ce que tu veux en français. Prompta lit le contenu affiché dans ton navigateur — pas besoin de sélecteurs CSS, d'API ou de scripts." },
      { q: "Comment se passe la connexion à Google Sheets ?", a: "En un clic, via une connexion OAuth sécurisée. Si la connexion manque au moment de la mission, Prompta te propose de connecter l'app puis reprend la mission automatiquement." },
      { q: "Et si le site pagine ses résultats ?", a: "L'assistant peut piloter ton navigateur en copilote visible : cliquer « page suivante », dérouler des résultats, révéler des informations masquées — chaque action est annoncée et les actions risquées attendent ta confirmation." },
    ],
  },
  {
    slug: "automatiser-gmail-ia",
    title: "Automatiser Gmail avec un agent IA (rédaction, tri, synthèses)",
    metaDescription:
      "Un assistant IA branché à ta boîte Gmail : rédige des réponses, synthétise des fils, prépare des relances — et n'envoie JAMAIS sans ta validation.",
    kicker: "Email en pilote assisté",
    h1: "Automatiser Gmail avec un agent IA — sans jamais perdre la main",
    intro:
      "L'email est le premier trou noir de la journée. Prompta se branche à Gmail et fait le travail de rédaction à ta place : réponses, relances, synthèses de fils interminables, emails préparés à partir de ce que tu regardes à l'écran. La règle d'or : aucun envoi sans ta validation — tu relis, tu corriges, tu approuves.",
    exampleOrder: "Rédige une réponse professionnelle à cet email en acceptant la proposition, et envoie-la après ma validation.",
    steps: [
      { title: "Connecte Gmail en un clic", body: "Connexion OAuth sécurisée (jeton chiffré, jamais ton mot de passe). Prompta te la propose automatiquement à la première mission qui en a besoin." },
      { title: "Demande depuis n'importe quelle page", body: "Depuis l'email ouvert (« réponds en refusant poliment »), depuis un devis (« envoie ce récap à mon associé »), depuis ton CRM (« relance ce client »)." },
      { title: "Relis, corrige, valide", body: "L'email rédigé s'affiche dans une carte de validation éditable. Tu modifies le texte directement ou tu demandes une retouche (« plus court, plus ferme »), puis tu valides l'envoi." },
    ],
    benefits: [
      "Synthèse d'un fil de 40 messages en 10 secondes, avec les décisions et les actions à faire",
      "Emails rédigés à partir du contexte réel : la page affichée, tes onglets, ton historique de mission",
      "Chaque envoi est tracé dans ton dossier de mission — qui, quoi, quand",
    ],
    faq: [
      { q: "L'IA peut-elle envoyer un email sans mon accord ?", a: "Non. Toute écriture sensible — envoi d'email inclus — est bloquée par une validation humaine obligatoire. Tu vois le contenu exact, tu peux l'éditer, et rien ne part sans ton feu vert explicite." },
      { q: "Prompta lit-il toute ma boîte mail ?", a: "Non. Il agit à la demande : il lit le fil que tu lui montres ou effectue la recherche que tu demandes. Les jetons OAuth sont chiffrés et tu peux révoquer la connexion à tout moment." },
      { q: "Ça marche aussi avec autre chose que Gmail ?", a: "Oui : plus de 1 000 applications sont connectables (Google Workspace, Notion, Slack, HubSpot, Trello…). Une mission peut enchaîner plusieurs apps : lire un Sheet, préparer un email, créer une tâche." },
    ],
  },
  {
    slug: "comparer-devis-fournisseurs-ia",
    title: "Comparer des devis en ligne avec l'IA (multi-onglets)",
    metaDescription:
      "Ouvre tes devis dans des onglets, demande la comparaison : l'IA croise les prix, délais et conditions, et remplit même le formulaire du gagnant — avec ta validation.",
    kicker: "Comparaison multi-onglets",
    h1: "Comparer des devis et des offres sans tableur ni copier-coller",
    intro:
      "Trois devis PDF, deux pages fournisseurs, une grille tarifaire : la comparaison à la main est pénible et tu rates toujours une ligne. Prompta lit TOUS tes onglets ouverts d'un coup — y compris les PDF — croise prix, délais, conditions et exclusions, et te sort un verdict argumenté. Il peut même remplir le formulaire de commande du gagnant, sous tes yeux.",
    exampleOrder: "Compare les 3 devis ouverts dans mes onglets (prix, délais, garanties) et dis-moi lequel choisir.",
    steps: [
      { title: "Ouvre tout ce qui doit être comparé", body: "Devis PDF, pages d'offres, grilles tarifaires — chacun dans son onglet. Dans le panneau, coche les onglets à prendre en compte." },
      { title: "Demande la comparaison", body: "L'assistant lit le contenu réel de chaque onglet (avec ta session si besoin), aligne les critères et justifie sa recommandation, chiffres à l'appui." },
      { title: "Passe à l'action", body: "« Remplis le formulaire de contact du mieux-disant » : le pilotage se fait dans ton onglet, chaque champ est annoncé, et l'envoi attend ta confirmation dans la page." },
    ],
    benefits: [
      "Croise jusqu'à 30 onglets — devis, avis, fiches techniques, conditions générales",
      "Détecte les pièges : frais cachés, exclusions de garantie, différences de périmètre",
      "Verdict argumenté et traçable, réutilisable en agent pour tes prochains achats",
    ],
    faq: [
      { q: "Les PDF de devis sont-ils lus correctement ?", a: "Oui, les PDF affichés dans le navigateur sont extraits en texte intégral. Pour les scans en image, le taux de réussite dépend de la qualité du document." },
      { q: "Peut-il commander à ma place ?", a: "Il peut préparer la commande (formulaires, paniers) en copilote visible, mais les actions de paiement sont volontairement exclues : jamais de saisie de carte bancaire, jamais de validation d'achat sans toi." },
      { q: "Puis-je en faire un agent réutilisable ?", a: "Oui. Une mission réussie se garde en un clic (« garder comme agent ») : la prochaine fois, tu la relances sur de nouveaux devis sans tout redécrire." },
    ],
  },
  {
    slug: "assistant-ia-crm",
    title: "Assistant IA pour ton CRM : HubSpot, Pipedrive, Salesforce",
    metaDescription:
      "Un assistant IA qui lit ton CRM à l'écran, croise avec tes mails et tes notes, met à jour les fiches et prépare les relances — chaque écriture validée par toi.",
    kicker: "CRM sous contrôle",
    h1: "Un assistant IA qui travaille dans ton CRM, pas à côté",
    intro:
      "Ton CRM sait tout mais ne fait rien. Prompta lit la fiche ou le pipeline affiché à l'écran — HubSpot, Pipedrive, Salesforce, peu importe — le croise avec tes emails et tes notes ouvertes, et agit : mise à jour de fiches, création de contacts, préparation de relances priorisées. Chaque écriture passe par ta validation.",
    exampleOrder: "Croise mon pipeline affiché avec ma boîte mail : quels deals dois-je relancer en priorité cette semaine ? Prépare les emails de relance.",
    steps: [
      { title: "Affiche ton CRM, ajoute le contexte", body: "Ouvre ton pipeline dans un onglet, tes mails ou tes notes dans d'autres. L'assistant voit ce que tu vois — avec ta session, sans export." },
      { title: "Demande l'analyse ou l'action", body: "« Quels deals stagnent ? », « ajoute ce prospect en fiche », « mets à jour le montant du deal Acme » : analyse instantanée ou mission complète, selon l'ordre." },
      { title: "Valide les écritures", body: "Créations et mises à jour CRM sont des actions sensibles : tu vois le détail exact avant exécution, tu corriges ou tu refuses. Tout est tracé dans le dossier de mission." },
    ],
    benefits: [
      "Détecte les contradictions : un client qui annule par email pendant que le deal est « en négociation » au CRM",
      "Relances rédigées à partir du contexte réel du deal, pas d'un template générique",
      "Garde tes routines en agents : « revue de pipeline du lundi » relançable en un clic",
    ],
    faq: [
      { q: "Faut-il connecter le CRM par API ?", a: "Pour LIRE ce qui est à l'écran : aucune connexion nécessaire, l'assistant lit la page affichée. Pour ÉCRIRE (créer un contact, mettre à jour un deal), une connexion OAuth en un clic est proposée automatiquement — puis la mission reprend toute seule." },
      { q: "Mes données CRM sont-elles en sécurité ?", a: "Les contenus ne sont traités qu'à ta demande, les jetons OAuth sont chiffrés, et le contenu des pages est traité comme une donnée non fiable : un texte piégé ne peut pas donner d'ordres à ton agent. Chaque écriture exige ta validation." },
      { q: "Quels CRM sont compatibles ?", a: "La lecture à l'écran fonctionne avec tous. Pour les actions, plus de 1 000 applications sont connectables, dont HubSpot, Pipedrive, Salesforce, Notion ou Airtable utilisés en CRM." },
    ],
  },
  {
    slug: "veille-concurrentielle-ia",
    title: "Veille concurrentielle automatisée avec un agent IA",
    metaDescription:
      "Un agent IA qui lit les sites de tes concurrents, compare les prix et les offres, et te livre une synthèse structurée dans Sheets ou par email. Relançable en un clic.",
    kicker: "Veille & synthèse",
    h1: "Ta veille concurrentielle, faite par un agent — pas par tes soirées",
    intro:
      "Surveiller les prix, les offres et les annonces de tes concurrents est vital et chronophage. Confie-le à un agent : Prompta explore les pages que tu lui désignes, extrait les infos qui comptent (prix, features, promos, recrutements), les compare aux tiennes et te livre une synthèse actionnable — dans un Sheets, un Doc ou par email.",
    exampleOrder: "Explore les pages tarifs de ces 3 concurrents ouverts dans mes onglets, compare avec la mienne, et fais-moi un tableau des écarts avec recommandations.",
    steps: [
      { title: "Désigne les sources", body: "Ouvre les pages concurrentes dans des onglets, ou laisse l'agent explorer les liens d'une page (« va voir leurs pages tarifs et fonctionnalités »)." },
      { title: "L'agent lit, extrait, compare", body: "Prix, positionnement, arguments, nouveautés : l'agent structure ce qu'il trouve et le confronte à ton offre. Tu suis chaque étape en direct." },
      { title: "Reçois un livrable, garde l'agent", body: "Tableau comparatif dans Sheets, synthèse par email — puis garde la mission en agent et relance-la chaque semaine en un clic." },
    ],
    benefits: [
      "Explore les liens d'un site (pages tarifs, changelog, blog) sans que tu cliques",
      "Livrables concrets : tableau d'écarts, alertes sur les changements, recommandations",
      "Réutilisable : la même veille se relance sur les mêmes cibles quand tu veux",
    ],
    faq: [
      { q: "L'agent peut-il visiter des pages que je n'ai pas ouvertes ?", a: "Oui : il peut explorer les liens publics d'une page (option « explorer les liens ») et aller lire d'autres URL publiques. Pour les pages derrière un login, ouvre-les dans un onglet — il les lira avec ta session." },
      { q: "Puis-je programmer la veille chaque semaine ?", a: "Garde la mission comme agent, et relance-la en un clic quand tu veux. La planification automatique récurrente arrive — dis-nous si c'est critique pour toi." },
      { q: "Où atterrit la synthèse ?", a: "Où tu veux : réponse directe dans le panneau, tableau Google Sheets, document, ou email envoyé à ton adresse — après ta validation, comme toujours." },
    ],
  },
];

export function findUseCaseBySlug(slug: string): UseCaseSeo | undefined {
  return USE_CASES_SEO.find((u) => u.slug === slug);
}
