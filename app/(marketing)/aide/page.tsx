import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aide & FAQ — Prompta",
  description:
    "Tout comprendre : l'assistant dans le navigateur, créer un agent IA, connecter tes apps, crédits et BYOK, validations humaines, planification, sécurité.",
};

const SECTIONS: Array<{ title: string; items: Array<{ q: string; a: string }> }> = [
  {
    title: "L'assistant dans le navigateur (Prompta partout)",
    items: [
      {
        q: "C'est quoi, Prompta partout ?",
        a: "Une barre flottante disponible sur toutes tes pages web (extension Chrome) : tu poses une question, elle répond au tac au tac en voyant la page affichée. Tu donnes un ordre plus ambitieux (« croise cette page avec mon Drive et envoie-moi une synthèse ») et elle bascule toute seule en mission d'agent complète, avec plan et suivi en direct.",
      },
      {
        q: "L'assistant peut-il lire mes autres onglets ?",
        a: "Oui — mentionne-les simplement (« compare les 3 devis ouverts dans mes onglets ») : le contenu est lu par TON navigateur, avec ta session, donc ça marche aussi sur les pages derrière login (CRM, mails, dashboards). Rien n'est lu sans que tu le demandes.",
      },
      {
        q: "Comment fonctionne le pilotage du navigateur ?",
        a: "Quand une mission l'exige, l'agent agit directement dans ton onglet : il annonce chaque action, surligne l'élément visé, puis clique ou remplit sous tes yeux. Toute action risquée (envoyer, publier, payer, supprimer) affiche une confirmation dans la page — sans ton feu vert, rien ne part. Il ne saisit jamais de mot de passe ni de données de paiement.",
      },
      {
        q: "Une mission lancée depuis l'assistant a bien marché, je peux la garder ?",
        a: "Oui — bouton « Sauvegarder comme agent » sur la mission : elle devient un agent privé réutilisable dans ton Dashboard, planifiable et modifiable dans le builder.",
      },
    ],
  },
  {
    title: "Créer & modifier un agent",
    items: [
      {
        q: "Comment créer mon premier agent ?",
        a: "Dashboard → Nouvel agent : décris ton objectif en une phrase (« chaque lundi, envoie-moi un récap de mes fichiers Drive »). Le copilote génère l'arborescence des étapes, te pose les bonnes questions, puis tu testes en réel avant de mettre en production.",
      },
      {
        q: "Puis-je modifier un agent existant ?",
        a: "Oui — Mes agents → Modifier rouvre l'arborescence complète dans le builder avec le copilote. Chaque sauvegarde crée une nouvelle version : rien n'est jamais écrasé.",
      },
      {
        q: "Le copilote s'est trompé, je fais quoi ?",
        a: "Réponds-lui directement dans le chat (« remplace l'étape 3 par un envoi Slack »), passe en Mode manuel pour éditer un nœud précis, ou utilise Cmd+Z pour annuler la dernière modification de l'arborescence.",
      },
    ],
  },
  {
    title: "Connexions & applications",
    items: [
      {
        q: "Combien d'applications sont disponibles ?",
        a: "Plus de 1 000 apps (Gmail, Sheets, Notion, Slack, Canva, HubSpot, GitHub…) via une connexion OAuth sécurisée : tu autorises l'app une fois dans Connexions, tous tes agents peuvent l'utiliser.",
      },
      {
        q: "Un run échoue avec « autorisation manquante » alors que l'app est connectée ?",
        a: "Certaines apps demandent des permissions supplémentaires selon l'action (ex. envoyer un email vs le lire). Va dans Connexions → Reconnecter sur l'app concernée pour refaire l'OAuth avec les permissions à jour.",
      },
      {
        q: "Mes identifiants sont-ils stockés chez Prompta ?",
        a: "Non. L'OAuth est géré par notre partenaire d'intégration (Composio) : Prompta ne voit jamais tes mots de passe, et tu peux révoquer un accès à tout moment depuis Connexions ou depuis l'app elle-même.",
      },
    ],
  },
  {
    title: "Crédits, clés API & plans",
    items: [
      {
        q: "Comment fonctionnent les crédits IA ?",
        a: "Chaque run consomme des crédits selon les modèles utilisés (2 € offerts à l'inscription, recharge mensuelle incluse dans les plans payants). Tu suis ta consommation dans Crédits.",
      },
      {
        q: "Puis-je utiliser mes propres clés API (BYOK) ?",
        a: "Oui — ajoute tes clés OpenAI, Anthropic, Google ou Mistral dans Connexions : tes agents les utilisent en priorité et la consommation part sur TES comptes fournisseurs, sans toucher tes crédits Prompta.",
      },
      {
        q: "Que se passe-t-il si je dépasse mon quota d'agents en production ?",
        a: "Tes agents existants continuent de tourner. Pour en publier un de plus, passe au plan supérieur — l'agent en attente reste sauvegardé en brouillon.",
      },
    ],
  },
  {
    title: "Lancer, planifier, superviser",
    items: [
      {
        q: "Comment lancer un agent automatiquement chaque jour/semaine ?",
        a: "Mes agents → bouton Planifier sur la carte de l'agent : choisis « Chaque jour » ou « Chaque semaine » + l'heure (heure de Paris). L'agent se lance seul et tu reçois le dossier de mission par email.",
      },
      {
        q: "Puis-je déclencher un agent depuis un autre outil (Zapier, mon backend…) ?",
        a: "Oui — chaque agent en production a une URL de webhook (panneau Planifier) : un POST dessus le déclenche, le corps JSON devient ses entrées. Signature HMAC-SHA256 disponible pour sécuriser l'appel.",
      },
      {
        q: "C'est quoi une validation humaine ?",
        a: "Une étape de pause : l'agent te montre ce qu'il s'apprête à faire (ex. le brouillon d'email) et attend ton feu vert dans l'espace Validations. Tu peux éditer le contenu avant d'approuver, ou rejeter. Tu es notifié par email.",
      },
      {
        q: "Où trouver les livrables d'une mission ?",
        a: "Chaque run terminé a son dossier de mission (Mes runs → clique le run) : résultat final, rapport HTML téléchargeable, fichiers CSV, et liens directs vers ce qui a été créé dans tes apps. Le tout t'arrive aussi par email en pièces jointes.",
      },
    ],
  },
  {
    title: "Quand ça se passe mal",
    items: [
      {
        q: "Mon run a échoué, comment le réparer ?",
        a: "Ouvre le run → Réparer avec l'IA : elle lit les logs, corrige le plan de l'agent (la correction est conservée pour les prochains lancements), te pose des questions si une information lui manque, et relance.",
      },
      {
        q: "Comment arrêter un agent en cours d'exécution ?",
        a: "Bouton Arrêter dans la console du run : l'agent s'interrompt proprement à la fin de l'étape en cours.",
      },
      {
        q: "Autre problème ?",
        a: "Écris-nous : contact@prompta.fr — on répond vite.",
      },
    ],
  },
];

export default function AidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">Aide</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-ink">
        Questions fréquentes
      </h1>
      <p className="mt-3 text-ink-soft">
        Tout ce qu&apos;il faut savoir pour construire, lancer et superviser tes agents.
      </p>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 font-display text-xl font-bold text-ink">{section.title}</h2>
            <div className="space-y-3">
              {section.items.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-line bg-card p-4 open:border-accent/40"
                >
                  <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-accent/30 bg-accent/5 p-8 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          Prêt à donner un ordre à l&apos;assistant ?
        </p>
        <Link
          href="/quick"
          className="mt-4 inline-flex rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Ouvrir l&apos;assistant
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: SECTIONS.flatMap((s) =>
              s.items.map((i) => ({
                "@type": "Question",
                name: i.q,
                acceptedAnswer: { "@type": "Answer", text: i.a },
              })),
            ),
          }),
        }}
      />
    </div>
  );
}
