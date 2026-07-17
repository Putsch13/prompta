import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de Confidentialité | Prompta",
  description: "Politique de confidentialité et protection des données de Prompta",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-bold text-ink">
        Politique de Confidentialité
      </h1>
      <p className="mt-4 text-ink-soft">
        Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}
      </p>

      <div className="prose prose-neutral mt-8 max-w-none">
        <h2>1. Introduction</h2>
        <p>
          Prompta s&apos;engage à protéger la vie privée de ses utilisateurs. Cette
          politique de confidentialité explique comment nous collectons, utilisons et
          protégeons vos données personnelles conformément au Règlement Général sur la
          Protection des Données (RGPD).
        </p>

        <h2>2. Responsable du traitement</h2>
        <p>
          Le responsable du traitement des données est <strong>Puccini EI</strong>{" "}
          (entrepreneur individuel, SIREN 932 699 697), représenté par Florent
          Puccini — 824 chemin de la Daby, 83330 Le Beausset, France.
        </p>
        <p>
          Contact :{" "}
          <a href="mailto:contact@prompta.fr" className="text-accent hover:underline">
            contact@prompta.fr
          </a>{" "}
          · 06 74 81 80 67
        </p>

        <h2>3. Données collectées</h2>
        <h3>3.1 Données fournies par l&apos;utilisateur</h3>
        <ul>
          <li>Informations de compte : nom, prénom, email, nom d&apos;utilisateur</li>
          <li>Informations de profil : bio, photo, localisation (optionnel)</li>
          <li>Données de paiement : traitées par Stripe (nous ne stockons pas vos données bancaires)</li>
          <li>Ordres donnés à l&apos;assistant et agents créés (missions, historique de runs)</li>
          <li>Clés API personnelles (BYOK) et jetons de connexion à vos applications : chiffrés au repos, jamais exposés</li>
        </ul>
        <h3>3.2 Contenus de pages traités à votre demande</h3>
        <p>
          Quand vous demandez à l&apos;assistant de lire une page ou des onglets, leur
          contenu est transmis à nos serveurs puis au fournisseur du modèle d&apos;IA
          que vous avez choisi (OpenAI, Anthropic, Google ou Mistral) pour générer
          la réponse. Ces contenus ne sont traités que pour exécuter votre demande,
          sont conservés dans votre historique de missions (que vous pouvez
          supprimer) et ne servent jamais à entraîner des modèles de notre fait.
        </p>
        <h3>3.3 Données collectées automatiquement</h3>
        <ul>
          <li>Données techniques : adresse IP, type de navigateur, appareil (journaux serveur)</li>
          <li>Cookies : uniquement essentiels — voir la section dédiée ci-dessous</li>
        </ul>

        <h2>4. Finalités du traitement</h2>
        <p>Nous utilisons vos données pour :</p>
        <ul>
          <li>Fournir et améliorer nos services</li>
          <li>Gérer votre compte et vos transactions</li>
          <li>Assurer la sécurité de la plateforme</li>
          <li>Vous envoyer des communications importantes</li>
          <li>Respecter nos obligations légales</li>
          <li>Analyser l&apos;utilisation de la plateforme (anonymisé)</li>
        </ul>

        <h2>5. Base légale du traitement</h2>
        <ul>
          <li><strong>Exécution du contrat :</strong> pour fournir nos services</li>
          <li><strong>Consentement :</strong> pour les communications marketing</li>
          <li><strong>Intérêts légitimes :</strong> pour améliorer nos services et assurer la sécurité</li>
          <li><strong>Obligations légales :</strong> pour la facturation et les déclarations fiscales</li>
        </ul>

        <h2>6. Partage des données</h2>
        <p>Nous pouvons partager vos données avec :</p>
        <ul>
          <li><strong>Render :</strong> hébergement du site et des serveurs (UE)</li>
          <li><strong>Supabase :</strong> base de données et authentification (UE)</li>
          <li><strong>Stripe :</strong> traitement des paiements</li>
          <li><strong>Fournisseurs de modèles IA</strong> (OpenAI, Anthropic, Google, Mistral) : uniquement les contenus nécessaires à l&apos;exécution de vos demandes</li>
          <li><strong>Composio :</strong> exécution des actions sur les applications que vous connectez (OAuth)</li>
          <li><strong>Resend :</strong> envoi d&apos;emails transactionnels</li>
          <li><strong>Sentry :</strong> monitoring des erreurs</li>
          <li><strong>Plausible</strong> (si activé) : mesure d&apos;audience agrégée <em>sans cookie</em> et sans identification individuelle</li>
        </ul>
        <p>
          Nous ne vendons jamais vos données personnelles à des tiers.
        </p>

        <h2>7. Conservation des données</h2>
        <ul>
          <li>Données de compte : conservées pendant toute la durée de votre inscription, puis 3 ans après suppression</li>
          <li>Données de transaction : conservées 10 ans (obligations comptables)</li>
          <li>Données de navigation : conservées 13 mois maximum</li>
        </ul>

        <h2>8. Vos droits</h2>
        <p>Conformément au RGPD, vous disposez des droits suivants :</p>
        <ul>
          <li><strong>Droit d&apos;accès :</strong> obtenir une copie de vos données</li>
          <li><strong>Droit de rectification :</strong> corriger vos données inexactes</li>
          <li><strong>Droit à l&apos;effacement :</strong> demander la suppression de vos données</li>
          <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré</li>
          <li><strong>Droit d&apos;opposition :</strong> vous opposer à certains traitements</li>
          <li><strong>Droit de limitation :</strong> limiter le traitement de vos données</li>
        </ul>
        <p>
          Pour exercer ces droits, contactez-nous à{" "}
          <a href="mailto:contact@prompta.fr" className="text-accent hover:underline">
            contact@prompta.fr
          </a>
        </p>

        <h2>9. Cookies</h2>
        <p>
          Prompta n&apos;utilise <strong>que des cookies strictement nécessaires</strong> au
          fonctionnement du service : la session d&apos;authentification (Supabase).
          Ils sont exemptés de consentement au sens des lignes directrices de la
          CNIL — c&apos;est pourquoi aucune bannière de cookies n&apos;est affichée. Nous
          n&apos;utilisons aucun cookie publicitaire ni traceur d&apos;audience tiers. Les
          pages de paiement Stripe peuvent déposer leurs propres cookies, régis
          par la politique de Stripe.
        </p>

        <h2>10. Sécurité</h2>
        <p>Nous mettons en œuvre des mesures de sécurité appropriées :</p>
        <ul>
          <li>Chiffrement des données en transit (HTTPS)</li>
          <li>Chiffrement des données au repos</li>
          <li>Authentification sécurisée</li>
          <li>Contrôle d&apos;accès strict</li>
          <li>Audits de sécurité réguliers</li>
        </ul>

        <h2>11. Transferts internationaux</h2>
        <p>
          Vos données peuvent être transférées vers des serveurs situés hors de l&apos;UE.
          Dans ce cas, nous nous assurons que des garanties appropriées sont en place
          (clauses contractuelles types, Privacy Shield, etc.).
        </p>

        <h2>12. Mineurs</h2>
        <p>
          Prompta n&apos;est pas destiné aux personnes de moins de 16 ans. Nous ne
          collectons pas sciemment des données de mineurs.
        </p>

        <h2>13. Modifications</h2>
        <p>
          Nous pouvons modifier cette politique à tout moment. Les modifications
          importantes seront notifiées par email ou via la plateforme.
        </p>

        <h2>14. Contact et réclamations</h2>
        <p>
          Pour toute question ou réclamation concernant vos données :{" "}
          <a href="mailto:contact@prompta.fr" className="text-accent hover:underline">
            contact@prompta.fr
          </a>
        </p>
        <p>
          Vous pouvez également déposer une réclamation auprès de la CNIL :{" "}
          <a
            href="https://www.cnil.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            www.cnil.fr
          </a>
        </p>

        <div className="mt-12 rounded-xl border border-warning/30 bg-warning/10 p-6">
          <p className="text-sm text-warning">
            <strong>Note importante :</strong> Ce document est un gabarit et doit être
            validé par un professionnel du droit et un DPO avant mise en production.
            Il ne constitue pas un avis juridique.
          </p>
        </div>
      </div>
    </div>
  );
}
