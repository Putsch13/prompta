/**
 * Cas d'usage marketing — source unique pour les pages /cas-usage/[slug],
 * l'index /cas-usage et le sitemap. Chaque entrée cible une requête de longue
 * traîne FR et débouche sur le wizard avec l'objectif prérempli.
 */

export interface UseCase {
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** Emoji vignette pour l'index. */
  emoji: string;
  /** Accroche courte pour la carte de l'index. */
  teaser: string;
  hook: string;
  steps: string[];
  apps: string[];
  objectif: string;
  faq: Array<{ q: string; a: string }>;
}

export const USE_CASES: Record<string, UseCase> = {
  "veille-quotidienne": {
    title: "Ta veille quotidienne, faite par un agent IA",
    metaTitle: "Automatiser sa veille quotidienne avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui cherche les actualités de ton secteur chaque matin et t'envoie un résumé clair par email. Sans code, en 3 minutes.",
    emoji: "📰",
    teaser: "Les actus de ton secteur, résumées dans ta boîte chaque matin à 8h.",
    hook:
      "Chaque matin à 8h, ton agent parcourt le web, croise les sources, rédige un résumé hiérarchisé et te l'envoie par email — avant ton premier café.",
    steps: [
      "Recherche web sur tes sujets (marché, concurrents, technologie)",
      "Analyse et hiérarchisation par IA : l'info à retenir d'abord",
      "Rédaction d'un résumé clair avec sources",
      "Envoi par email chaque matin à l'heure que tu choisis",
    ],
    apps: ["Recherche web", "Gmail", "Google Sheets (archivage optionnel)"],
    objectif:
      "Chaque matin, cherche les 3 actualités les plus importantes de mon secteur et envoie-moi un résumé clair et hiérarchisé par email.",
    faq: [
      {
        q: "Puis-je choisir mes sources et mes sujets ?",
        a: "Oui : tu décris tes sujets en langage naturel et le copilote configure les recherches. Tu peux affiner à tout moment.",
      },
      {
        q: "L'envoi est-il vraiment automatique ?",
        a: "Oui — planification intégrée (chaque jour ou chaque semaine, heure de Paris). Tu peux aussi lancer à la demande.",
      },
    ],
  },
  "reporting-automatique": {
    title: "Ton reporting hebdo, écrit directement dans Google Sheets",
    metaTitle: "Rapport automatique dans Google Sheets avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui analyse tes fichiers Drive chaque semaine, synthétise les avancées et remplit ta feuille Google Sheets. Validation humaine incluse.",
    emoji: "📊",
    teaser: "Tes documents analysés, ta feuille de reporting remplie, chaque lundi.",
    hook:
      "Chaque lundi, ton agent lit tes documents récents, en tire les chiffres et points clés, remplit ta feuille de reporting et attend ta validation avant d'envoyer le récap à ton équipe (ou juste à toi).",
    steps: [
      "Lecture de tes fichiers Google Drive récents",
      "Synthèse IA : avancées, chiffres, points de blocage",
      "Écriture structurée dans ta feuille Google Sheets",
      "Validation humaine : tu relis et approuves avant tout envoi",
    ],
    apps: ["Google Drive", "Google Sheets", "Gmail"],
    objectif:
      "Chaque lundi matin, analyse mes fichiers Drive récents, synthétise les avancées de la semaine et écris les points clés dans une feuille Google Sheets, puis envoie-moi le récap par email après ma validation.",
    faq: [
      {
        q: "L'agent peut-il écrire dans une feuille existante ?",
        a: "Oui — tu choisis la feuille cible dans le builder (ou l'agent en crée une). Les données sont écrites en colonnes propres, pas en texte brut.",
      },
      {
        q: "Et si l'analyse est fausse ?",
        a: "L'étape de validation humaine te montre le contenu AVANT toute écriture ou envoi : tu peux l'éditer ou rejeter.",
      },
    ],
  },
  "prospection-contenu": {
    title: "Du contenu de prospection prêt à publier, chaque semaine",
    metaTitle: "Automatiser son contenu LinkedIn avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui suit l'actualité de ton marché, rédige tes posts et prépare tes visuels Canva. Tu valides, il publie.",
    emoji: "🚀",
    teaser: "Veille marché → posts rédigés → visuels Canva. Tu valides, c'est prêt.",
    hook:
      "Ton agent surveille ton marché, propose des angles, rédige des posts calibrés pour LinkedIn et prépare le visuel Canva assorti. Tu relis, tu ajustes, tu valides — il ne publie jamais sans toi.",
    steps: [
      "Veille sur ton secteur et tes concurrents",
      "Rédaction de posts avec hook, structure et CTA",
      "Création du visuel Canva assorti",
      "Validation humaine puis publication ou envoi du kit par email",
    ],
    apps: ["Recherche web", "Canva", "LinkedIn", "Gmail"],
    objectif:
      "Chaque semaine, fais une veille sur mon secteur, rédige un post LinkedIn avec un bon hook et prépare un visuel Canva assorti, puis envoie-moi le tout pour validation.",
    faq: [
      {
        q: "L'agent publie-t-il directement sur LinkedIn ?",
        a: "Seulement si tu l'y autorises — et avec une validation humaine avant chaque publication. Par défaut, il t'envoie le kit complet par email.",
      },
      {
        q: "Le ton des posts est-il personnalisable ?",
        a: "Oui : tu donnes ton persona, ton ton et tes exemples au copilote — chaque étape de rédaction est configurée avec TA voix.",
      },
    ],
  },
  "veille-concurrentielle": {
    title: "Surveille tes concurrents sans y passer tes soirées",
    metaTitle: "Surveiller ses concurrents automatiquement avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui suit tes concurrents chaque semaine : nouveautés produit, prix, communication — synthèse comparative dans ta boîte. Sans code.",
    emoji: "🔭",
    teaser: "Nouveautés, prix, communication de tes concurrents — comparés chaque semaine.",
    hook:
      "Chaque semaine, ton agent passe tes concurrents au crible — annonces produit, changements de prix, prises de parole — et t'envoie une synthèse comparative avec ce qui mérite une réaction de ta part.",
    steps: [
      "Recherches ciblées sur chaque concurrent (produit, tarifs, actualités)",
      "Comparaison avec la semaine précédente : ce qui a changé",
      "Analyse d'impact : opportunités et menaces pour TOI",
      "Synthèse par email + historique archivé dans Google Sheets",
    ],
    apps: ["Recherche web", "Gmail", "Google Sheets"],
    objectif:
      "Chaque lundi, surveille mes 3 principaux concurrents (nouveautés produit, prix, communication), compare avec la semaine précédente et envoie-moi une synthèse de ce qui a changé avec les actions à envisager.",
    faq: [
      {
        q: "Combien de concurrents puis-je suivre ?",
        a: "Autant que tu veux — chaque concurrent est une branche de recherche. Au-delà de 5-6, on recommande deux agents thématiques pour des synthèses plus lisibles.",
      },
      {
        q: "Les données sont-elles fiables ?",
        a: "L'agent cite ses sources dans la synthèse, et l'historique Sheets te permet de vérifier chaque affirmation. Tu peux aussi ajouter une validation humaine avant archivage.",
      },
    ],
  },
  "resume-emails": {
    title: "Ta boîte mail triée et résumée, chaque matin",
    metaTitle: "Résumer ses emails automatiquement avec l'IA — Prompta",
    metaDescription:
      "Un agent IA qui lit ta boîte Gmail chaque matin, classe par urgence et t'envoie un digest : à traiter, à lire, à ignorer. 5 minutes gagnées par heure.",
    emoji: "📥",
    teaser: "Un digest « à traiter / à lire / à ignorer » de ta boîte, chaque matin.",
    hook:
      "Chaque matin, ton agent lit les emails reçus depuis la veille, identifie ce qui demande une action, résume le reste, et t'envoie un digest en trois sections : à traiter en priorité, à lire, à ignorer. Ta boîte n'est plus une to-do subie.",
    steps: [
      "Lecture des emails récents de ta boîte Gmail",
      "Classement par urgence et détection des demandes d'action",
      "Résumé d'une ligne par email important",
      "Digest structuré envoyé à l'heure de ton choix",
    ],
    apps: ["Gmail"],
    objectif:
      "Chaque matin à 8h, lis mes emails reçus depuis la veille, classe-les par urgence (à traiter / à lire / à ignorer) et envoie-moi un digest avec un résumé d'une ligne par email important.",
    faq: [
      {
        q: "L'agent lit-il vraiment mes emails ? Où vont ces données ?",
        a: "L'agent accède à ta boîte via une connexion OAuth sécurisée que tu peux révoquer à tout moment. Le contenu transite pour l'analyse mais n'est pas conservé au-delà des journaux d'exécution, que tu contrôles.",
      },
      {
        q: "Peut-il répondre à ma place ?",
        a: "Il peut préparer des brouillons de réponse — mais avec une validation humaine obligatoire avant tout envoi si tu actives cette étape. Rien ne part sans toi.",
      },
    ],
  },
  "relances-clients": {
    title: "Les relances clients qui partent toutes seules (après ton OK)",
    metaTitle: "Automatiser ses relances clients avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui repère les devis sans réponse et factures en attente, rédige des relances personnalisées et attend ta validation. Fini les impayés oubliés.",
    emoji: "💶",
    teaser: "Devis sans réponse et factures en attente relancés — après ta validation.",
    hook:
      "Ton agent croise ta feuille de suivi et ta boîte mail, repère les devis restés sans réponse et les factures qui traînent, rédige une relance personnalisée pour chacun — ferme mais cordiale — et te les présente pour validation. Un clic, c'est parti.",
    steps: [
      "Lecture de ton suivi (Google Sheets) et de tes échanges récents",
      "Détection des dossiers à relancer (délai que TU définis)",
      "Rédaction de relances personnalisées selon l'historique",
      "Validation humaine puis envoi, et mise à jour du suivi",
    ],
    apps: ["Google Sheets", "Gmail"],
    objectif:
      "Chaque semaine, repère dans ma feuille de suivi les devis sans réponse depuis 7 jours et les factures en attente depuis 15 jours, rédige une relance personnalisée pour chacun et envoie-les-moi pour validation avant envoi.",
    faq: [
      {
        q: "Les relances sont-elles vraiment personnalisées ?",
        a: "Oui — l'agent utilise le contexte de chaque dossier (montant, historique, dernière interaction) et le ton que tu lui as donné. Tu peux éditer chaque relance dans l'écran de validation avant envoi.",
      },
      {
        q: "Ça marche avec mon CRM ?",
        a: "Google Sheets marche immédiatement ; HubSpot, Pipedrive, Notion et 1000+ apps sont connectables pour lire ton pipe directement.",
      },
    ],
  },
  "compte-rendu-reunion": {
    title: "Tes comptes rendus de réunion rangés dans Notion, tout seuls",
    metaTitle: "Compte rendu de réunion automatique dans Notion — Prompta",
    metaDescription:
      "Un agent IA qui transforme tes notes brutes en compte rendu structuré (décisions, actions, deadlines) et le range dans Notion. Plus de CR à rédiger.",
    emoji: "📝",
    teaser: "Notes brutes → CR structuré (décisions, actions) → rangé dans Notion.",
    hook:
      "Colle tes notes brutes (ou dépose la transcription), ton agent en tire un compte rendu structuré — participants, décisions, actions avec responsables et deadlines — et le range au bon endroit dans ton espace Notion. La mémoire de ton équipe s'écrit sans toi.",
    steps: [
      "Réception de tes notes ou de la transcription de réunion",
      "Structuration IA : contexte, décisions, actions, deadlines",
      "Création de la page dans ta base Notion, au bon endroit",
      "Envoi du lien + rappel des actions par email",
    ],
    apps: ["Notion", "Gmail"],
    objectif:
      "À partir des notes de réunion que je te donne, rédige un compte rendu structuré (contexte, décisions, actions avec responsables et deadlines), crée la page dans mon espace Notion et envoie-moi le lien par email.",
    faq: [
      {
        q: "Comment l'agent accède-t-il à mon Notion ?",
        a: "Via la connexion officielle Notion : lors de l'autorisation, tu choisis exactement quelles pages l'agent peut voir et où il peut écrire. Révocable à tout moment.",
      },
      {
        q: "Puis-je imposer mon modèle de CR ?",
        a: "Oui — donne ton modèle au copilote (sections, format des actions) et chaque CR le suivra.",
      },
    ],
  },
  "rapport-stripe": {
    title: "Ton chiffre d'affaires Stripe, débriefé chaque lundi matin",
    metaTitle: "Rapport Stripe automatique par email — Prompta",
    metaDescription:
      "Un agent IA qui lit tes données Stripe chaque semaine : revenus, nouveaux clients, échecs de paiement — et t'envoie un rapport clair. Sans dashboard à ouvrir.",
    emoji: "💳",
    teaser: "Revenus, nouveaux clients, paiements échoués — le récap Stripe sans ouvrir Stripe.",
    hook:
      "Chaque lundi, ton agent interroge ton compte Stripe : encaissements de la semaine, nouveaux clients, paiements échoués à récupérer, tendance vs semaine précédente — et te livre un rapport lisible en 2 minutes dans ta boîte. Le pilotage sans le dashboard.",
    steps: [
      "Lecture de tes données Stripe (paiements, clients, échecs)",
      "Calculs : totaux, tendance, paiements à récupérer",
      "Rédaction d'un rapport clair avec les 3 chiffres qui comptent",
      "Envoi par email chaque lundi + archivage dans Sheets",
    ],
    apps: ["Stripe", "Gmail", "Google Sheets"],
    objectif:
      "Chaque lundi matin, lis mes données Stripe de la semaine écoulée (revenus, nouveaux clients, paiements échoués), compare à la semaine précédente et envoie-moi un rapport clair par email avec les paiements à récupérer en priorité.",
    faq: [
      {
        q: "L'agent peut-il toucher à mon argent ?",
        a: "Non — connecte une clé Stripe en LECTURE seule (clé restreinte) : l'agent lit les données, il ne peut ni rembourser ni encaisser. C'est toi qui décides du périmètre de la clé.",
      },
      {
        q: "Puis-je suivre d'autres indicateurs ?",
        a: "Oui : MRR, churn, panier moyen, répartition par produit… décris les indicateurs voulus au copilote et le rapport s'adapte.",
      },
    ],
  },
  "suivi-recrutement": {
    title: "Ton pipeline de recrutement tenu à jour dans Sheets",
    metaTitle: "Automatiser le suivi des candidatures avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui lit les candidatures reçues par email, extrait les infos clés et alimente ton tableau de suivi Google Sheets. Zéro candidature perdue.",
    emoji: "🎯",
    teaser: "Chaque candidature reçue par email, extraite et rangée dans ton tableau de suivi.",
    hook:
      "Chaque candidature qui arrive dans ta boîte est lue par ton agent : nom, poste visé, expérience clé, points saillants du CV — tout est extrait et rangé dans ton tableau de suivi, avec un résumé de 2 lignes pour trier vite. Plus aucune candidature ne se perd dans le fil de ta boîte.",
    steps: [
      "Détection des emails de candidature dans ta boîte",
      "Extraction : nom, poste, expérience, points clés",
      "Ajout d'une ligne structurée dans ton Google Sheets de suivi",
      "Digest hebdo : nouvelles candidatures + relances à faire",
    ],
    apps: ["Gmail", "Google Sheets"],
    objectif:
      "Chaque jour, repère les candidatures reçues dans ma boîte mail, extrais le nom, le poste visé et les points clés du profil, ajoute une ligne dans ma feuille de suivi Google Sheets et envoie-moi un digest hebdomadaire.",
    faq: [
      {
        q: "Et le RGPD, avec les données des candidats ?",
        a: "Les données restent dans TES outils (ta boîte, ton Sheets) — l'agent les déplace, il ne les stocke pas ailleurs. Pense à mentionner ce traitement dans ta politique candidats et à purger ton tableau selon tes durées de conservation.",
      },
      {
        q: "Peut-il présélectionner les candidats ?",
        a: "Il peut noter chaque profil selon TES critères (expérience, stack, localisation) pour t'aider à prioriser — mais la décision reste chez toi, c'est un tri assisté, pas une sélection automatique.",
      },
    ],
  },
  "analyse-avis-clients": {
    title: "Tes avis clients analysés, ton plan d'action prêt",
    metaTitle: "Analyser ses avis clients automatiquement avec l'IA — Prompta",
    metaDescription:
      "Un agent IA qui collecte tes avis clients, détecte les irritants récurrents et les tendances de satisfaction, et te livre un plan d'action chaque mois.",
    emoji: "💬",
    teaser: "Sentiment, irritants récurrents, plan d'action — tes avis clients décodés chaque mois.",
    hook:
      "Chaque mois, ton agent rassemble tes avis clients, mesure le sentiment, identifie les 3 irritants qui reviennent et les points forts à capitaliser — puis te propose un plan d'action priorisé. Tu passes de « on a des avis » à « on sait quoi faire ».",
    steps: [
      "Collecte des avis (formulaires, emails, feuille d'import)",
      "Analyse de sentiment et détection des thèmes récurrents",
      "Priorisation : les 3 irritants à traiter, les forces à exploiter",
      "Rapport mensuel par email + historique dans Sheets",
    ],
    apps: ["Google Sheets", "Recherche web", "Gmail"],
    objectif:
      "Chaque mois, analyse les avis clients de ma feuille Google Sheets : sentiment global, les 3 irritants récurrents et les points forts, puis envoie-moi un rapport avec un plan d'action priorisé.",
    faq: [
      {
        q: "D'où l'agent tire-t-il les avis ?",
        a: "Le plus simple : une feuille Google Sheets où tes avis arrivent (export Typeform, Google Reviews, zapier existant…). L'agent peut aussi lire tes emails de feedback ou un formulaire connecté.",
      },
      {
        q: "L'analyse de sentiment est-elle fiable en français ?",
        a: "Oui — les modèles utilisés (GPT, Claude) excellent en français, y compris sur l'ironie et les avis nuancés. Chaque conclusion cite les verbatims sur lesquels elle s'appuie.",
      },
    ],
  },
  "newsletter-automatique": {
    title: "Ta newsletter curatée, rédigée et prête à envoyer",
    metaTitle: "Créer sa newsletter automatiquement avec l'IA — Prompta",
    metaDescription:
      "Un agent IA qui fait la veille, sélectionne les meilleurs contenus, rédige ta newsletter dans ton ton et te la soumet pour validation. Chaque semaine.",
    emoji: "✉️",
    teaser: "Veille + sélection + rédaction dans TON ton — ta newsletter arrive prête à valider.",
    hook:
      "Chaque semaine, ton agent fait la veille sur tes thématiques, sélectionne les 5 contenus qui méritent l'attention de tes lecteurs, rédige l'édito et les brèves dans ton ton, et te soumet le tout. Tu retouches, tu valides — ta newsletter part sans y avoir passé ta soirée.",
    steps: [
      "Veille sur tes thématiques et sources préférées",
      "Sélection éditoriale : les contenus qui valent le clic",
      "Rédaction complète (édito + brèves) dans ton style",
      "Validation humaine, puis envoi ou dépôt dans ton outil d'emailing",
    ],
    apps: ["Recherche web", "Gmail", "Mailchimp (optionnel)"],
    objectif:
      "Chaque jeudi, fais une veille sur mes thématiques, sélectionne les 5 meilleurs contenus de la semaine, rédige ma newsletter (édito de 3 lignes + une brève par contenu avec pourquoi c'est intéressant) et envoie-la-moi pour validation.",
    faq: [
      {
        q: "Comment l'agent apprend-il mon ton ?",
        a: "Donne-lui 2-3 anciennes éditions au copilote : il en extrait ton style (longueur, tutoiement, humour) et chaque édition le respecte. Tu peux ajuster à tout moment.",
      },
      {
        q: "Peut-il envoyer directement à ma liste ?",
        a: "Après TA validation uniquement. Il peut déposer la version validée dans Mailchimp/Brevo ou te l'envoyer prête à coller — tu gardes la main sur l'envoi final.",
      },
    ],
  },
  "emails-vers-trello": {
    title: "Tes emails transformés en cartes Trello, automatiquement",
    metaTitle: "Transformer ses emails en tâches Trello avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui détecte les demandes dans ta boîte mail et crée les cartes Trello correspondantes — bonne liste, bon contexte, deadline extraite.",
    emoji: "📋",
    teaser: "Chaque demande reçue par email devient une carte Trello — bien rangée, avec contexte.",
    hook:
      "« Tu peux regarder ça ? », « il faudrait corriger… » — chaque demande qui arrive par email est détectée par ton agent, transformée en carte Trello avec le contexte résumé et la deadline si elle est mentionnée, et rangée dans la bonne liste. Ta boîte mail cesse d'être ta to-do cachée.",
    steps: [
      "Lecture des emails récents et détection des demandes actionnables",
      "Extraction : quoi, qui, pour quand",
      "Création de la carte Trello dans la bonne liste, contexte en description",
      "Récap quotidien des cartes créées",
    ],
    apps: ["Gmail", "Trello"],
    objectif:
      "Chaque jour, détecte dans mes emails les demandes qui nécessitent une action, crée pour chacune une carte Trello dans ma liste « À faire » avec un résumé du contexte et la deadline si mentionnée, et envoie-moi le récap.",
    faq: [
      {
        q: "Comment évite-t-il les doublons ?",
        a: "L'agent traite chaque email une seule fois (suivi des messages déjà traités) et peut vérifier qu'une carte similaire n'existe pas avant d'en créer une.",
      },
      {
        q: "Ça marche aussi avec Notion, Asana, ClickUp ?",
        a: "Oui — même agent, autre destination : Notion, Asana, ClickUp, Todoist, Linear et 1000+ apps sont connectables.",
      },
    ],
  },
  "onboarding-clients": {
    title: "L'onboarding de tes clients, orchestré sans y penser",
    metaTitle: "Automatiser l'onboarding client avec un agent IA — Prompta",
    metaDescription:
      "Un agent IA qui déroule ton parcours d'accueil à chaque nouveau client : email de bienvenue, espace de travail créé, suivi planifié. Une expérience pro, à chaque fois.",
    emoji: "🤝",
    teaser: "Nouveau client → bienvenue envoyée, espace créé, suivi planifié. À chaque fois.",
    hook:
      "Un nouveau client signe ? Ton agent déroule ton rituel d'accueil sans que tu y penses : email de bienvenue personnalisé, espace projet créé dans tes outils, point de suivi posé dans l'agenda, ligne ajoutée au tableau de bord. Chaque client vit le même accueil impeccable — même quand tu es débordé.",
    steps: [
      "Déclenchement : nouveau client détecté (Stripe, formulaire ou webhook)",
      "Email de bienvenue personnalisé (validé par toi si tu préfères)",
      "Création de l'espace projet (Notion ou Trello) depuis ton modèle",
      "Point de suivi planifié dans Google Calendar + suivi dans Sheets",
    ],
    apps: ["Stripe", "Gmail", "Notion", "Google Calendar"],
    objectif:
      "Quand un nouveau client arrive, envoie-lui un email de bienvenue personnalisé après ma validation, crée son espace projet dans Notion à partir de mon modèle, planifie un point de suivi dans mon agenda à J+7 et ajoute-le à mon tableau de suivi.",
    faq: [
      {
        q: "Comment l'agent sait-il qu'un client a signé ?",
        a: "Trois déclencheurs possibles : un paiement Stripe, une réponse de formulaire, ou l'URL webhook de l'agent que tu branches sur n'importe quel outil (signature électronique, CRM…).",
      },
      {
        q: "Puis-je garder la main sur l'email de bienvenue ?",
        a: "Oui — ajoute une validation humaine sur l'étape d'envoi : tu reçois le texte prêt, tu peux le retoucher en discutant avec l'agent, puis tu approuves.",
      },
    ],
  },
};

export const USE_CASE_SLUGS = Object.keys(USE_CASES);
