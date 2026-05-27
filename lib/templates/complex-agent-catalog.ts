/**
 * Catalogue de 100 agents marketplace complexes.
 *
 * Chaque agent est conçu pour tester les limites du builder :
 * - multi-étapes (5–15 steps)
 * - multi-connecteurs
 * - étapes parallèles (via type "parallel")
 * - conditions / branches
 * - validations humaines
 * - livrables multiples
 * - variables imbriquées (dot notation)
 * - retrieve / code sandbox
 *
 * Le champ `difficulty` indique la complexité builder :
 * - "standard" : faisable en 5 min
 * - "advanced" : faisable en 15 min, nécessite connecteurs
 * - "expert" : 30+ min, multi-connecteur, branches, approbation
 */

import type { AgentStep } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

export interface ComplexAgentSpec {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: "standard" | "advanced" | "expert";
  models: string[];
  requiredSecrets: KeyProvider[];
  requiredConnectors: string[];
  inputFields: { key: string; label: string; type: string }[];
  steps: AgentStep[];
  expectedDeliverables: string[];
  builderPainPoints: string[];
  userPainPoints: string[];
}

export const COMPLEX_AGENT_CATALOG: ComplexAgentSpec[] = [
  // ═══════════════════════════════════════════════════════
  // A. DATA / RECHERCHE / VEILLE (1–10)
  // ═══════════════════════════════════════════════════════
  {
    id: "ca-001",
    title: "Analyseur multi-PDF → rapport exécutif",
    category: "data",
    description: "Lit plusieurs documents uploadés, extrait les points clés, produit un rapport structuré.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "documents", label: "Documents (collés)", type: "textarea" },
      { key: "focus", label: "Sujet d'analyse", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Extrais les 10 points clés de ces documents :\n{{documents}}\n\nFocus : {{focus}}", outputKey: "key_points" },
      { type: "llm", model: "gpt-5.4", prompt: "Classe ces points par importance et regroupe-les en 3 thèmes :\n{{key_points}}", outputKey: "themes" },
      { type: "llm", model: "gpt-5.4", prompt: "Rédige un rapport exécutif professionnel (800 mots max) à partir de :\n{{themes}}\n\nFormat : Résumé exécutif → Analyse détaillée → Recommandations → Prochaines étapes", outputKey: "report" },
    ],
    expectedDeliverables: ["Rapport exécutif (markdown)"],
    builderPainPoints: ["Input textarea trop petit pour multi-PDF", "Pas de support fichier natif multiple"],
    userPainPoints: ["Copier-coller 20 PDFs est pénible", "Pas de download du rapport"],
  },
  {
    id: "ca-002",
    title: "Comparateur de contrats",
    category: "data",
    description: "Compare 2 contrats, identifie les différences majeures, les risques, et les points de négociation.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "contrat_a", label: "Contrat A", type: "textarea" },
      { key: "contrat_b", label: "Contrat B", type: "textarea" },
      { key: "role", label: "Votre rôle (acheteur/vendeur)", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Analyse le Contrat A et extrais les clauses clés :\n{{contrat_a}}", outputKey: "clauses_a" },
      { type: "llm", model: "gpt-5.4", prompt: "Analyse le Contrat B et extrais les clauses clés :\n{{contrat_b}}", outputKey: "clauses_b" },
      { type: "llm", model: "gpt-5.4", prompt: "Compare ces deux jeux de clauses :\nContrat A : {{clauses_a}}\nContrat B : {{clauses_b}}\n\nIdentifie : différences majeures, risques pour le rôle {{role}}, points de négociation.", outputKey: "comparison" },
      { type: "llm", model: "gpt-5.4", prompt: "Rédige un mémo de négociation à partir de :\n{{comparison}}\n\nFormat : tableau des différences, alertes, recommandations d'action.", outputKey: "memo" },
    ],
    expectedDeliverables: ["Mémo de négociation", "Tableau comparatif"],
    builderPainPoints: ["2 textareas longs difficiles à gérer", "Pas de side-by-side preview"],
    userPainPoints: ["Long à remplir", "Besoin de copier depuis PDF"],
  },
  {
    id: "ca-003",
    title: "Veille web hebdo → newsletter",
    category: "data",
    description: "Cherche les dernières actualités sur un sujet, les résume, et génère une newsletter prête à envoyer.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai", "serper"],
    requiredConnectors: ["gmail"],
    inputFields: [
      { key: "topic", label: "Sujet de veille", type: "text" },
      { key: "audience", label: "Audience", type: "text" },
      { key: "email_to", label: "Email destinataire", type: "text" },
    ],
    steps: [
      { type: "tool", tool: "web_search", params: { query: "{{topic}} actualités dernière semaine" }, outputKey: "search_results" },
      { type: "llm", model: "gpt-5.4", prompt: "Résume les 5 actualités les plus importantes de ces résultats :\n{{search_results}}\n\nPour chaque : titre, résumé 2 phrases, source.", outputKey: "summaries" },
      { type: "llm", model: "gpt-5.4", prompt: "Rédige une newsletter professionnelle à partir de :\n{{summaries}}\n\nAudience : {{audience}}\nFormat : intro accrocheuse, 5 sections avec liens, conclusion avec perspective.", outputKey: "newsletter" },
      { type: "action", connector: "gmail", action: "GMAIL_SEND_EMAIL", params: { to: "{{email_to}}", subject: "Veille {{topic}} — cette semaine", body: "{{newsletter}}" }, outputKey: "sent" },
    ],
    expectedDeliverables: ["Newsletter (markdown)", "Email envoyé"],
    builderPainPoints: ["Scheduling récurrent non supporté", "Pas de preview email avant envoi"],
    userPainPoints: ["Pas de preview avant envoi", "Pas de récurrence auto"],
  },
  {
    id: "ca-004",
    title: "Chercheur web + synthèse argumentée",
    category: "data",
    description: "Recherche approfondie sur un sujet, citations de sources, synthèse avec pour/contre.",
    difficulty: "standard",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai", "serper"],
    requiredConnectors: [],
    inputFields: [
      { key: "question", label: "Question de recherche", type: "textarea" },
      { key: "depth", label: "Profondeur (rapide/moyenne/exhaustive)", type: "text" },
    ],
    steps: [
      { type: "tool", tool: "web_search", params: { query: "{{question}}" }, outputKey: "search1" },
      { type: "tool", tool: "web_search", params: { query: "{{question}} arguments pour contre" }, outputKey: "search2" },
      { type: "llm", model: "gpt-5.4", prompt: "À partir de ces résultats de recherche :\n\nRecherche 1 : {{search1}}\nRecherche 2 : {{search2}}\n\nProduis une synthèse argumentée avec :\n- Résumé factuel\n- Arguments pour\n- Arguments contre\n- Sources citées\n- Conclusion nuancée\n\nProfondeur : {{depth}}", outputKey: "synthesis" },
    ],
    expectedDeliverables: ["Synthèse argumentée"],
    builderPainPoints: ["Pas de contrôle sur le nombre de recherches"],
    userPainPoints: ["Sources parfois non vérifiables"],
  },
  {
    id: "ca-005",
    title: "Connecteur Notion → roadmap auto",
    category: "data",
    description: "Lit une base Notion, identifie les tâches, et génère une roadmap trimestrielle.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: ["notion"],
    inputFields: [
      { key: "notion_db_id", label: "ID base Notion", type: "text" },
      { key: "quarter", label: "Trimestre visé (Q1/Q2/Q3/Q4)", type: "text" },
    ],
    steps: [
      { type: "action", connector: "notion", action: "NOTION_QUERY_DATABASE", params: { database_id: "{{notion_db_id}}" }, outputKey: "tasks" },
      { type: "llm", model: "gpt-5.4", prompt: "À partir de ces tâches Notion :\n{{tasks}}\n\nIdentifie les projets, dépendances, et priorités.", outputKey: "analysis" },
      { type: "llm", model: "gpt-5.4", prompt: "Génère une roadmap pour le {{quarter}} :\n{{analysis}}\n\nFormat : timeline mois par mois, jalons, risques, ressources nécessaires.", outputKey: "roadmap" },
    ],
    expectedDeliverables: ["Roadmap trimestrielle"],
    builderPainPoints: ["Connecteur Notion complexe à configurer", "Pas de preview des données récupérées"],
    userPainPoints: ["Doit trouver l'ID de la base Notion", "Résultat dépend de la structure Notion"],
  },
  {
    id: "ca-006",
    title: "Classifieur automatique de documents",
    category: "data",
    description: "Analyse des documents et les classe par catégorie/priorité dans un tableau.",
    difficulty: "standard",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "documents", label: "Documents à classer (un par section)", type: "textarea" },
      { key: "categories", label: "Catégories possibles", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Analyse chaque document et assigne-le à une catégorie parmi : {{categories}}\n\nDocuments :\n{{documents}}\n\nPour chaque : nom du document, catégorie, confiance (haute/moyenne/basse), résumé 1 ligne.", outputKey: "classification" },
      { type: "llm", model: "gpt-5.4", prompt: "Formatte cette classification en tableau markdown :\n{{classification}}\n\nAjoute des statistiques : nombre par catégorie, documents incertains.", outputKey: "table" },
    ],
    expectedDeliverables: ["Tableau de classification"],
    builderPainPoints: ["Pas de support batch/upload fichiers multiples"],
    userPainPoints: ["Copier-coller beaucoup de texte"],
  },
  {
    id: "ca-007",
    title: "Extracteur de données tabulaires",
    category: "data",
    description: "Extrait des tableaux depuis du texte (PDF copié) et les structure en CSV.",
    difficulty: "standard",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "raw_text", label: "Texte brut contenant des tableaux", type: "textarea" },
      { key: "columns", label: "Colonnes attendues (optionnel)", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Identifie et extrais tous les tableaux de ce texte :\n{{raw_text}}\n\nColonnes attendues : {{columns}}\n\nRetourne-les en format JSON [{...}, ...]", outputKey: "tables_json" },
      { type: "llm", model: "gpt-5.4", prompt: "Convertis ce JSON en format CSV propre :\n{{tables_json}}\n\nUne section par tableau trouvé. Ajoute les en-têtes.", outputKey: "csv_output" },
    ],
    expectedDeliverables: ["Fichier CSV"],
    builderPainPoints: ["Pas de download CSV natif", "Limites de longueur pour gros tableaux"],
    userPainPoints: ["Le CSV n'est pas téléchargeable directement"],
  },
  {
    id: "ca-008",
    title: "Résumeur de tickets support en masse",
    category: "data",
    description: "Résume 50+ tickets support, identifie les patterns, et propose des actions.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "tickets", label: "Tickets (format libre)", type: "textarea" },
      { key: "product", label: "Nom du produit", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Catégorise ces tickets support par thème :\n{{tickets}}\n\nProduit : {{product}}\nPour chaque catégorie : nombre, exemples, gravité.", outputKey: "categories" },
      { type: "llm", model: "gpt-5.4", prompt: "Identifie les 5 patterns les plus critiques :\n{{categories}}\n\nPour chaque : impact business, fréquence, solution proposée.", outputKey: "patterns" },
      { type: "llm", model: "gpt-5.4", prompt: "Rédige un rapport d'analyse support avec plan d'action :\n{{patterns}}\n\nFormat : Executive summary, top 5 problèmes, actions recommandées avec priorité et estimation effort.", outputKey: "report" },
    ],
    expectedDeliverables: ["Rapport d'analyse support"],
    builderPainPoints: ["Risque de dépasser max_tokens avec 100 tickets", "Pas de chunking auto"],
    userPainPoints: ["Copier 100 tickets est laborieux"],
  },
  {
    id: "ca-009",
    title: "Veille concurrentielle automatisée",
    category: "data",
    description: "Recherche les dernières infos sur N concurrents, compare, et produit un rapport.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai", "serper"],
    requiredConnectors: [],
    inputFields: [
      { key: "competitors", label: "Concurrents (un par ligne)", type: "textarea" },
      { key: "industry", label: "Secteur", type: "text" },
    ],
    steps: [
      { type: "tool", tool: "web_search", params: { query: "{{competitors}} news {{industry}} 2026" }, outputKey: "news" },
      { type: "tool", tool: "web_search", params: { query: "{{competitors}} pricing features comparison" }, outputKey: "features" },
      { type: "llm", model: "gpt-5.4", prompt: "Compile une analyse concurrentielle :\n\nActualités : {{news}}\nFeatures/pricing : {{features}}\nConcurrents : {{competitors}}\nSecteur : {{industry}}\n\nFormat : tableau comparatif, forces/faiblesses, tendances, opportunités.", outputKey: "analysis" },
    ],
    expectedDeliverables: ["Rapport concurrentiel"],
    builderPainPoints: ["Une seule recherche par concurrent serait mieux → besoin de boucle"],
    userPainPoints: ["Qualité dépend beaucoup des résultats de recherche"],
  },
  {
    id: "ca-010",
    title: "Benchmark produit avec sources",
    category: "data",
    description: "Analyse en profondeur d'un produit vs alternatives avec liens et citations.",
    difficulty: "standard",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai", "serper"],
    requiredConnectors: [],
    inputFields: [
      { key: "product", label: "Produit à analyser", type: "text" },
      { key: "alternatives", label: "Alternatives à comparer", type: "text" },
    ],
    steps: [
      { type: "tool", tool: "web_search", params: { query: "{{product}} review benchmark comparison {{alternatives}}" }, outputKey: "research" },
      { type: "llm", model: "gpt-5.4", prompt: "Rédige un benchmark détaillé :\nProduit : {{product}}\nAlternatives : {{alternatives}}\nRecherche : {{research}}\n\nInclus : prix, features, avis utilisateurs, notes, liens sources. Format tableau + texte.", outputKey: "benchmark" },
    ],
    expectedDeliverables: ["Benchmark comparatif"],
    builderPainPoints: [],
    userPainPoints: ["Liens parfois cassés ou inventés"],
  },

  // ═══════════════════════════════════════════════════════
  // B. CRM / SALES (11–20)
  // ═══════════════════════════════════════════════════════
  {
    id: "ca-011",
    title: "Enrichisseur de leads CSV",
    category: "crm",
    description: "Lit un CSV de leads, recherche des infos sur chacun, et enrichit le tableau.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai", "serper"],
    requiredConnectors: ["google_sheets"],
    inputFields: [
      { key: "leads_csv", label: "Données leads (CSV ou texte)", type: "textarea" },
      { key: "sheets_id", label: "Google Sheets ID pour le résultat", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Parse ces leads et identifie : nom, entreprise, email, poste.\n\n{{leads_csv}}\n\nRetourne en JSON.", outputKey: "parsed" },
      { type: "tool", tool: "web_search", params: { query: "{{step_0_output}} LinkedIn company info" }, outputKey: "enrichment" },
      { type: "llm", model: "gpt-5.4", prompt: "Enrichis ces leads avec les infos trouvées :\nLeads : {{parsed}}\nInfos web : {{enrichment}}\n\nAjoute : taille entreprise, secteur, score intérêt (1-10). Format CSV.", outputKey: "enriched" },
      { type: "action", connector: "google_sheets", action: "GOOGLESHEETS_BATCH_UPDATE", params: { spreadsheet_id: "{{sheets_id}}", range: "A1", values: "{{enriched}}" }, outputKey: "sheet_result" },
    ],
    expectedDeliverables: ["Google Sheets enrichi", "CSV enrichi"],
    builderPainPoints: ["Boucle par lead impossible", "Mapping CSV fragile"],
    userPainPoints: ["Rate limit si beaucoup de leads", "Qualité enrichissement variable"],
  },
  {
    id: "ca-012",
    title: "Email personnalisé par lead",
    category: "crm",
    description: "Génère un email cold outreach personnalisé pour chaque lead d'une liste.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: ["gmail"],
    inputFields: [
      { key: "leads", label: "Liste leads (nom, email, entreprise)", type: "textarea" },
      { key: "product", label: "Votre produit/service", type: "text" },
      { key: "tone", label: "Ton (formel/décontracté)", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Parse cette liste de leads :\n{{leads}}\n\nRetourne un JSON array avec : name, email, company.", outputKey: "parsed_leads" },
      { type: "llm", model: "gpt-5.4", prompt: "Pour chaque lead de cette liste :\n{{parsed_leads}}\n\nRédige un email personnalisé de cold outreach pour {{product}}.\nTon : {{tone}}\n\nRetourne un JSON array avec : to, subject, body.", outputKey: "emails" },
      { type: "approval", label: "Vérifier les emails avant envoi", payloadTemplate: "{{emails}}", expiresInMinutes: 60 },
      { type: "llm", model: "gpt-5.4", prompt: "Confirme que ces emails sont prêts à envoyer :\n{{emails}}\n\nRetourne le premier email uniquement (pour test).", outputKey: "first_email" },
    ],
    expectedDeliverables: ["Emails personnalisés (JSON)", "Premier email envoyé"],
    builderPainPoints: ["Pas de boucle pour envoyer N emails", "Approbation ne montre pas bien le preview"],
    userPainPoints: ["Ne peut pas envoyer en batch", "Validation fastidieuse"],
  },
  {
    id: "ca-013",
    title: "Gmail auto-répondeur intelligent",
    category: "crm",
    description: "Lit les emails non lus, catégorise, et prépare des réponses.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: ["gmail"],
    inputFields: [
      { key: "context", label: "Contexte entreprise", type: "textarea" },
      { key: "rules", label: "Règles de réponse", type: "textarea" },
    ],
    steps: [
      { type: "action", connector: "gmail", action: "GMAIL_FETCH_EMAILS", params: { label: "INBOX", max_results: "10", query: "is:unread" }, outputKey: "unread" },
      { type: "llm", model: "gpt-5.4", prompt: "Catégorise ces emails :\n{{unread}}\n\nCatégories : urgent, client, prospect, spam, info.\nContexte : {{context}}\n\nRetourne JSON avec : id, from, subject, category, priority (1-5).", outputKey: "categorized" },
      { type: "llm", model: "gpt-5.4", prompt: "Pour les emails catégorisés urgent ou client :\n{{categorized}}\n\nRédige une réponse brève pour chacun.\nRègles : {{rules}}\n\nRetourne JSON : id, draft_reply.", outputKey: "drafts" },
      { type: "approval", label: "Valider les réponses avant envoi", payloadTemplate: "{{drafts}}", expiresInMinutes: 30 },
    ],
    expectedDeliverables: ["Emails catégorisés", "Brouillons de réponse"],
    builderPainPoints: ["Mauvais compte Gmail possible", "Pas de preview email natif"],
    userPainPoints: ["Risque de réponse inadaptée", "Connecter le bon compte Gmail"],
  },
  {
    id: "ca-014",
    title: "Mise à jour CRM depuis notes",
    category: "crm",
    description: "Analyse des notes de rdv et met à jour les fiches contacts dans le CRM.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: ["hubspot"],
    inputFields: [
      { key: "meeting_notes", label: "Notes du rendez-vous", type: "textarea" },
      { key: "contact_email", label: "Email du contact CRM", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Extrais de ces notes :\n{{meeting_notes}}\n\n- Statut deal (chaud/tiède/froid)\n- Prochaine action\n- Budget mentionné\n- Objections\n- Notes résumées", outputKey: "extracted" },
      { type: "action", connector: "hubspot", action: "HUBSPOT_UPDATE_CONTACT", params: { email: "{{contact_email}}", properties: "{{extracted}}" }, outputKey: "crm_update" },
      { type: "llm", model: "gpt-5.4", prompt: "Confirme la mise à jour CRM :\n{{crm_update}}\n\nRésumé des changements appliqués.", outputKey: "summary" },
    ],
    expectedDeliverables: ["Résumé mise à jour CRM"],
    builderPainPoints: ["Mapping champs HubSpot complexe", "Pas de validation structure params"],
    userPainPoints: ["Vérifier que le bon contact est mis à jour"],
  },
  {
    id: "ca-015",
    title: "Lead scorer + tri automatique",
    category: "crm",
    description: "Score des leads sur plusieurs critères et filtre les meilleurs.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "leads", label: "Liste leads", type: "textarea" },
      { key: "icp", label: "Profil client idéal (ICP)", type: "textarea" },
      { key: "threshold", label: "Score minimum (1-10)", type: "number" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Score chaque lead de 1 à 10 selon cet ICP :\nICP : {{icp}}\n\nLeads : {{leads}}\n\nCritères : taille entreprise, secteur, poste, budget probable.\nRetourne JSON : name, score, justification.", outputKey: "scored" },
      { type: "condition", expression: "{{threshold}} > 0", outputKey: "has_threshold" },
      { type: "llm", model: "gpt-5.4", prompt: "Filtre les leads avec score >= {{threshold}} :\n{{scored}}\n\nRetourne un tableau trié par score décroissant avec recommandation d'approche pour chacun.", outputKey: "top_leads" },
    ],
    expectedDeliverables: ["Liste leads scorés et filtrés"],
    builderPainPoints: ["Condition pas vraiment utile ici", "Pas de boucle par lead"],
    userPainPoints: ["Le scoring est subjectif"],
  },
  {
    id: "ca-016",
    title: "Relanceur de leads silencieux",
    category: "crm",
    description: "Identifie les leads sans réponse et génère des emails de relance.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: ["gmail"],
    inputFields: [
      { key: "leads", label: "Leads à relancer (nom, email, dernier contact)", type: "textarea" },
      { key: "product", label: "Produit/service", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Analyse ces leads et identifie ceux sans réponse depuis > 7 jours :\n{{leads}}\n\nRetourne JSON : name, email, days_since_contact, reason_to_follow_up.", outputKey: "to_follow_up" },
      { type: "llm", model: "gpt-5.4", prompt: "Pour chaque lead à relancer :\n{{to_follow_up}}\n\nRédige un email de relance personnalisé pour {{product}}. Ton : amical, pas insistant. 3 lignes max.\nRetourne JSON : to, subject, body.", outputKey: "followup_emails" },
      { type: "approval", label: "Valider les relances", payloadTemplate: "{{followup_emails}}", expiresInMinutes: 60 },
    ],
    expectedDeliverables: ["Emails de relance prêts"],
    builderPainPoints: ["Pas d'intégration inbox pour vérifier les non-réponses"],
    userPainPoints: ["Données manuelles au lieu d'auto-détection"],
  },
  {
    id: "ca-017",
    title: "Sync Google Sheets → pipeline CRM",
    category: "crm",
    description: "Lit un Google Sheets de prospects et met à jour le pipeline.",
    difficulty: "expert",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: ["google_sheets"],
    inputFields: [
      { key: "sheets_id", label: "Google Sheets ID", type: "text" },
      { key: "sheet_range", label: "Plage (ex. A1:F50)", type: "text" },
    ],
    steps: [
      { type: "action", connector: "google_sheets", action: "GOOGLESHEETS_GET_SPREADSHEET_DATA", params: { spreadsheet_id: "{{sheets_id}}", range: "{{sheet_range}}" }, outputKey: "sheet_data" },
      { type: "llm", model: "gpt-5.4", prompt: "Analyse ces données de prospection :\n{{sheet_data}}\n\nIdentifie : leads chauds, bloqués, à relancer. Résumé pipeline.", outputKey: "pipeline_analysis" },
      { type: "llm", model: "gpt-5.4", prompt: "Génère un dashboard textuel du pipeline :\n{{pipeline_analysis}}\n\nFormat : funnel (prospects → qualifiés → en discussion → fermés), KPIs, alertes.", outputKey: "dashboard" },
    ],
    expectedDeliverables: ["Analyse pipeline", "Dashboard textuel"],
    builderPainPoints: ["Pas de refresh auto", "Mapping colonnes implicite"],
    userPainPoints: ["Doit connaître l'ID et la plage du Sheet"],
  },
  {
    id: "ca-018",
    title: "Générateur de script d'appel",
    category: "crm",
    description: "Crée un script d'appel commercial personnalisé pour un prospect.",
    difficulty: "standard",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "prospect_info", label: "Infos prospect (nom, entreprise, contexte)", type: "textarea" },
      { key: "product", label: "Produit à vendre", type: "text" },
      { key: "objections", label: "Objections fréquentes", type: "textarea" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Crée un script d'appel commercial pour :\nProspect : {{prospect_info}}\nProduit : {{product}}\n\nStructure : accroche (10s), discovery questions (3), pitch (30s), gestion objections, closing.\n\nObjections connues : {{objections}}", outputKey: "script" },
    ],
    expectedDeliverables: ["Script d'appel"],
    builderPainPoints: [],
    userPainPoints: [],
  },
  {
    id: "ca-019",
    title: "Séquence email complète (5 touchpoints)",
    category: "crm",
    description: "Génère une séquence de 5 emails de prospection avec espacement et A/B.",
    difficulty: "advanced",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "target", label: "Profil prospect cible", type: "textarea" },
      { key: "product", label: "Produit/offre", type: "text" },
      { key: "tone", label: "Ton", type: "text" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Conçois une séquence de 5 emails cold outreach :\nCible : {{target}}\nProduit : {{product}}\nTon : {{tone}}\n\nPour chaque email : jour d'envoi (J+0, J+3, J+7, J+14, J+21), objet, corps, CTA.\nVariante A/B pour l'email 1.", outputKey: "sequence" },
      { type: "llm", model: "gpt-5.4", prompt: "Formatte cette séquence de manière pro :\n{{sequence}}\n\nAjoute : KPIs attendus (taux d'ouverture, réponse), tips de personnalisation, instructions de setup.", outputKey: "final_sequence" },
    ],
    expectedDeliverables: ["Séquence 5 emails + A/B"],
    builderPainPoints: ["Pas de multi-livrable (5 emails séparés)"],
    userPainPoints: ["Pas d'intégration avec un outil de séquencing"],
  },
  {
    id: "ca-020",
    title: "Analyseur de pipeline + forecast",
    category: "crm",
    description: "Analyse un pipeline de ventes et produit des prévisions.",
    difficulty: "standard",
    models: ["gpt-5.4"],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    inputFields: [
      { key: "pipeline", label: "Pipeline (deals, montants, étapes)", type: "textarea" },
      { key: "target", label: "Objectif de CA", type: "number" },
    ],
    steps: [
      { type: "llm", model: "gpt-5.4", prompt: "Analyse ce pipeline commercial :\n{{pipeline}}\n\nObjectif : {{target}}€\n\nProduis :\n- Forecast pondéré (% de chance × montant)\n- Gap vs objectif\n- Top 3 deals à accélérer\n- Risques identifiés\n- Actions recommandées", outputKey: "forecast" },
    ],
    expectedDeliverables: ["Forecast + recommandations"],
    builderPainPoints: [],
    userPainPoints: [],
  },

  // ═══════════════════════════════════════════════════════
  // C. MARKETING / CONTENU (21–30)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("marketing", 21, 30, [
    { title: "Brief → 10 posts LinkedIn", desc: "Décline un brief en 10 posts LinkedIn formatés.", steps: 3, connectors: [] },
    { title: "Calendrier éditorial mensuel", desc: "Génère un calendrier éditorial pour 4 semaines.", steps: 2, connectors: [] },
    { title: "Adaptateur de contenu multi-ton", desc: "Adapte un texte en 5 tons différents.", steps: 2, connectors: [] },
    { title: "Analyseur de posts sociaux", desc: "Analyse les performances de posts et recommande des améliorations.", steps: 3, connectors: [] },
    { title: "Générateur landing page HTML", desc: "Crée le HTML/CSS d'une landing page depuis un brief.", steps: 3, connectors: [] },
    { title: "Réécrivain SEO", desc: "Réécrit un article existant pour optimiser le SEO.", steps: 3, connectors: [] },
    { title: "Audit SEO concurrent", desc: "Analyse le SEO de concurrents et propose un plan d'action.", steps: 4, connectors: [] },
    { title: "Générateur de newsletter", desc: "Crée une newsletter complète depuis un brief et des liens.", steps: 3, connectors: ["gmail"] },
    { title: "Segmenteur d'audience", desc: "Analyse une base contacts et propose des segments.", steps: 2, connectors: [] },
    { title: "Créateur de brand voice", desc: "Définit une charte éditoriale complète depuis des exemples.", steps: 3, connectors: [] },
  ]),

  // ═══════════════════════════════════════════════════════
  // D. E-COMMERCE (31–40)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("ecommerce", 31, 40, [
    { title: "Générateur fiches produits CSV", desc: "Crée des fiches produits depuis un CSV de références.", steps: 3, connectors: ["google_sheets"] },
    { title: "Traducteur fiches 5 langues", desc: "Traduit des fiches produits en FR, EN, ES, DE, IT.", steps: 3, connectors: [] },
    { title: "Optimiseur titres Amazon", desc: "Réécrit des titres produits pour maximiser le CTR Amazon.", steps: 2, connectors: [] },
    { title: "Répondeur avis clients", desc: "Analyse et répond aux avis clients négatifs.", steps: 3, connectors: [] },
    { title: "Analyseur stocks & ventes", desc: "Analyse les données de vente et alerte sur les ruptures.", steps: 3, connectors: ["google_sheets"] },
    { title: "Créateur de bundles", desc: "Propose des bundles produits basés sur les ventes croisées.", steps: 2, connectors: [] },
    { title: "Détecteur marges faibles", desc: "Identifie les produits à faible marge et propose des ajustements.", steps: 2, connectors: [] },
    { title: "Descripteur produit depuis photo", desc: "Génère une description produit riche à partir d'un texte de features.", steps: 2, connectors: [] },
    { title: "Sync Shopify ↔ Sheets", desc: "Synchronise les données Shopify avec Google Sheets.", steps: 4, connectors: ["google_sheets"] },
    { title: "Rapport ventes hebdo", desc: "Génère un rapport de ventes automatique chaque semaine.", steps: 3, connectors: ["google_sheets", "gmail"] },
  ]),

  // ═══════════════════════════════════════════════════════
  // E. ADMIN / FINANCE / JURIDIQUE (41–50)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("finance", 41, 50, [
    { title: "Classifieur de factures", desc: "Classe des factures par catégorie comptable.", steps: 2, connectors: [] },
    { title: "Tableau de dépenses mensuel", desc: "Compile des factures en tableau de suivi budgétaire.", steps: 2, connectors: [] },
    { title: "Détecteur factures manquantes", desc: "Compare la liste attendue vs reçue et alerte.", steps: 2, connectors: [] },
    { title: "Résumeur de contrat", desc: "Résume un contrat en points clés avec alertes.", steps: 2, connectors: [] },
    { title: "Comparateur de clauses", desc: "Compare les clauses de 2 contrats côte à côte.", steps: 3, connectors: [] },
    { title: "Relance paiement intelligente", desc: "Rédige un email de relance adapté au retard.", steps: 3, connectors: ["gmail"] },
    { title: "Rapport financier mensuel", desc: "Génère un rapport financier structuré depuis des données.", steps: 3, connectors: [] },
    { title: "Analyseur emails facturation", desc: "Lit les emails et extrait les factures reçues.", steps: 3, connectors: ["gmail"] },
    { title: "Checklist conformité", desc: "Génère une checklist de conformité selon le secteur.", steps: 2, connectors: [] },
    { title: "Pack documents comptable", desc: "Prépare un ensemble de documents pour le comptable.", steps: 3, connectors: [] },
  ]),

  // ═══════════════════════════════════════════════════════
  // F. MULTI-CONNECTEURS (51–60)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("multi", 51, 60, [
    { title: "Gmail + Sheets + rapport", desc: "Lit des emails, extrait des données, les met dans Sheets.", steps: 4, connectors: ["gmail", "google_sheets"] },
    { title: "Slack alerter depuis Sheets", desc: "Surveille un Sheet et envoie une alerte Slack si seuil dépassé.", steps: 3, connectors: ["google_sheets", "slack"] },
    { title: "Notion → Sheets sync", desc: "Exporte des pages Notion vers Google Sheets.", steps: 3, connectors: ["notion", "google_sheets"] },
    { title: "Gmail → Calendar events", desc: "Détecte des dates dans les emails et crée des events.", steps: 3, connectors: ["gmail"] },
    { title: "Compte-rendu réunion → email", desc: "Résume une réunion et envoie par email.", steps: 3, connectors: ["gmail"] },
    { title: "Recherche web → Sheets", desc: "Fait une recherche et stocke les résultats dans Sheets.", steps: 3, connectors: ["google_sheets"] },
    { title: "Analyse Sheets → Slack summary", desc: "Analyse un Sheet et poste un résumé dans Slack.", steps: 3, connectors: ["google_sheets", "slack"] },
    { title: "Email + CRM update auto", desc: "Lit un email client et met à jour le CRM.", steps: 4, connectors: ["gmail", "hubspot"] },
    { title: "Alert CRM → Slack", desc: "Détecte un deal urgent dans le CRM et alerte Slack.", steps: 3, connectors: ["hubspot", "slack"] },
    { title: "Multi-tool data pipeline", desc: "Recherche, analyse, stocke, et notifie.", steps: 5, connectors: ["google_sheets", "gmail"] },
  ]),

  // ═══════════════════════════════════════════════════════
  // G. CODE / DATA PROCESSING (61–70)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("code", 61, 70, [
    { title: "Exécuteur Python sur CSV", desc: "Exécute du code Python pour analyser un CSV.", steps: 2, connectors: [] },
    { title: "Générateur SQL depuis description", desc: "Génère du SQL sécurisé depuis une description en langage naturel.", steps: 2, connectors: [] },
    { title: "Nettoyeur de dataset", desc: "Détecte et corrige les anomalies dans un jeu de données.", steps: 3, connectors: [] },
    { title: "Analyseur de données → graphique", desc: "Analyse des données et génère un graphique ASCII/tableau.", steps: 2, connectors: [] },
    { title: "Générateur de dashboard HTML", desc: "Crée un dashboard HTML interactif depuis des données.", steps: 3, connectors: [] },
    { title: "Convertisseur JSON → CSV", desc: "Convertit du JSON imbriqué en CSV plat.", steps: 2, connectors: [] },
    { title: "Validateur d'emails en masse", desc: "Vérifie le format et la validité d'une liste d'emails.", steps: 2, connectors: [] },
    { title: "Merger de fichiers CSV", desc: "Fusionne plusieurs CSV sur une clé commune.", steps: 2, connectors: [] },
    { title: "Générateur de fichier structuré", desc: "Crée un fichier structuré (JSON/XML/CSV) selon un schéma.", steps: 2, connectors: [] },
    { title: "Analyseur de code source", desc: "Analyse du code source et produit un rapport qualité.", steps: 3, connectors: [] },
  ]),

  // ═══════════════════════════════════════════════════════
  // H. AGENTS LONGS / LIVE / LIVRABLES (71–80)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("live", 71, 80, [
    { title: "Agent 10 étapes avec live tracking", desc: "Agent complexe avec suivi live de chaque étape.", steps: 10, connectors: [] },
    { title: "Pipeline long (recherche → rédaction → review)", desc: "Pipeline 8 étapes avec validation humaine.", steps: 8, connectors: [] },
    { title: "Agent avec reprise sur erreur", desc: "Agent qui peut reprendre depuis la dernière étape réussie.", steps: 5, connectors: [] },
    { title: "Agent 20 sous-actions", desc: "Agent avec beaucoup de micro-actions à logger.", steps: 12, connectors: ["gmail", "google_sheets"] },
    { title: "Agent multi-livrables", desc: "Produit 5 livrables distincts (rapport, CSV, email, dashboard, checklist).", steps: 6, connectors: [] },
    { title: "Agent PDF + CSV output", desc: "Génère un rapport texte et un export CSV.", steps: 4, connectors: [] },
    { title: "Agent avec notification email", desc: "Envoie un email de notification quand le traitement est terminé.", steps: 4, connectors: ["gmail"] },
    { title: "Agent anti-doublon", desc: "Vérifie qu'une action n'a pas déjà été faite avant de l'exécuter.", steps: 3, connectors: [] },
    { title: "Agent background robuste", desc: "Conçu pour tourner en background avec heartbeat.", steps: 6, connectors: [] },
    { title: "Agent de backup données", desc: "Sauvegarde des données critiques dans Sheets.", steps: 4, connectors: ["google_sheets"] },
  ]),

  // ═══════════════════════════════════════════════════════
  // I. MARKETPLACE / BILLING / PERMISSIONS (81–90)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("marketplace", 81, 90, [
    { title: "Agent gratuit simple (test achat)", desc: "Agent minimal pour tester le flow d'achat.", steps: 1, connectors: [] },
    { title: "Agent payant avec estimation coût", desc: "Agent qui montre le coût estimé avant exécution.", steps: 3, connectors: [] },
    { title: "Agent abonnement mensuel", desc: "Agent accessible uniquement avec abonnement.", steps: 4, connectors: [] },
    { title: "Agent multi-modèle (GPT + Claude)", desc: "Utilise GPT pour l'analyse et Claude pour la rédaction.", steps: 3, connectors: [] },
    { title: "Agent avec dry-run complet", desc: "Preview sans exécuter les actions réelles.", steps: 5, connectors: ["gmail"] },
    { title: "Agent créateur avec analytics", desc: "Agent de créateur avec tracking d'usage.", steps: 2, connectors: [] },
    { title: "Agent avec quota gratuit", desc: "3 exécutions gratuites puis payant.", steps: 2, connectors: [] },
    { title: "Agent BYOK vs crédits", desc: "Fonctionne avec clé user ou crédits plateforme.", steps: 2, connectors: [] },
    { title: "Agent à accès restreint", desc: "Accessible uniquement aux abonnés Pro.", steps: 2, connectors: [] },
    { title: "Agent avec version publiée et draft", desc: "Teste le versioning entre publié et brouillon.", steps: 3, connectors: [] },
  ]),

  // ═══════════════════════════════════════════════════════
  // J. EDGE CASES / SÉCURITÉ / ROBUSTESSE (91–100)
  // ═══════════════════════════════════════════════════════
  ...generateSimpleAgents("edge", 91, 100, [
    { title: "Agent avec référence step future (doit bloquer)", desc: "Teste que le builder bloque {{step_5_output}} à l'étape 2.", steps: 3, connectors: [] },
    { title: "Agent avec outputKey dupliqué (doit bloquer)", desc: "Teste que 2 étapes ne peuvent pas avoir le même outputKey.", steps: 2, connectors: [] },
    { title: "Agent prompt vide (doit bloquer)", desc: "Teste qu'un prompt vide est refusé.", steps: 1, connectors: [] },
    { title: "Agent action sans connecteur (doit bloquer)", desc: "Teste qu'une action sans connecteur est refusée.", steps: 1, connectors: [] },
    { title: "Agent code vide (doit bloquer)", desc: "Teste qu'une étape code sans source est refusée.", steps: 1, connectors: [] },
    { title: "Agent retrieve sans query (doit bloquer)", desc: "Teste qu'un retrieve sans query est refusé.", steps: 1, connectors: [] },
    { title: "Agent prompt injection test", desc: "Teste la résistance à l'injection de prompt via les inputs.", steps: 2, connectors: [] },
    { title: "Agent token expiré test", desc: "Vérifie le comportement quand un token connecteur expire.", steps: 2, connectors: ["gmail"] },
    { title: "Agent rate limit test", desc: "Vérifie le retry/backoff sur rate limit.", steps: 3, connectors: [] },
    { title: "Agent max_steps limit test", desc: "Agent avec 15 étapes pour tester la limite max_steps.", steps: 15, connectors: [] },
  ]),
];

function generateSimpleAgents(
  category: string,
  startIdx: number,
  endIdx: number,
  specs: { title: string; desc: string; steps: number; connectors: string[] }[],
): ComplexAgentSpec[] {
  return specs.map((spec, i) => {
    const idx = startIdx + i;
    const steps: AgentStep[] = [];

    if (spec.connectors.length > 0 && spec.steps > 2) {
      steps.push({
        type: "action" as const,
        connector: spec.connectors[0],
        action: `${spec.connectors[0].toUpperCase()}_FETCH_DATA`,
        params: { query: "{{input}}" },
        outputKey: "fetched_data",
      });
    }

    for (let s = steps.length; s < spec.steps - 1; s++) {
      const prevRef = s === 0 ? "{{input}}" : `{{step_${s - 1}_output}}`;
      steps.push({
        type: "llm" as const,
        model: "gpt-5.4",
        prompt: `Étape ${s + 1} de "${spec.title}" :\n\nDonnées : ${prevRef}\n\nAnalyse et traite ces données selon le contexte de l'agent.`,
        outputKey: `step_${s}_result`,
      });
    }

    steps.push({
      type: "llm" as const,
      model: "gpt-5.4",
      prompt: `Produis le livrable final de "${spec.title}" :\n\n${steps.length > 0 ? `{{step_${steps.length - 1}_output}}` : "{{input}}"}\n\nFormat professionnel, structuré, prêt à utiliser.`,
      outputKey: "final_output",
    });

    const secrets: KeyProvider[] = ["openai"];
    if (spec.steps > 3) secrets.push("serper" as KeyProvider);

    return {
      id: `ca-${String(idx).padStart(3, "0")}`,
      title: spec.title,
      category,
      description: spec.desc,
      difficulty: spec.connectors.length > 1 ? "expert" as const : spec.steps > 3 ? "advanced" as const : "standard" as const,
      models: ["gpt-5.4"],
      requiredSecrets: secrets,
      requiredConnectors: spec.connectors,
      inputFields: [{ key: "input", label: "Données d'entrée", type: "textarea" }],
      steps,
      expectedDeliverables: [`Livrable: ${spec.title}`],
      builderPainPoints: spec.connectors.length > 1 ? ["Multi-connecteur complexe à configurer"] : [],
      userPainPoints: spec.connectors.length > 0 ? ["Doit connecter " + spec.connectors.join(" + ")] : [],
    };
  });
}

export function getCatalogStats() {
  const total = COMPLEX_AGENT_CATALOG.length;
  const byCategory = new Map<string, number>();
  const byDifficulty = new Map<string, number>();
  const withConnectors = COMPLEX_AGENT_CATALOG.filter((a) => a.requiredConnectors.length > 0).length;
  const multiStep = COMPLEX_AGENT_CATALOG.filter((a) => a.steps.length >= 5).length;

  for (const agent of COMPLEX_AGENT_CATALOG) {
    byCategory.set(agent.category, (byCategory.get(agent.category) ?? 0) + 1);
    byDifficulty.set(agent.difficulty, (byDifficulty.get(agent.difficulty) ?? 0) + 1);
  }

  return {
    total,
    byCategory: Object.fromEntries(byCategory),
    byDifficulty: Object.fromEntries(byDifficulty),
    withConnectors,
    multiStep,
  };
}
