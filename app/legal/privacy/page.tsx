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
          Le responsable du traitement des données est Prompta SAS, dont le siège social
          est situé à [adresse à compléter], France.
        </p>
        <p>
          Contact DPO :{" "}
          <a href="mailto:dpo@prompta.fr" className="text-accent hover:underline">
            dpo@prompta.fr
          </a>
        </p>

        <h2>3. Données collectées</h2>
        <h3>3.1 Données fournies par l&apos;utilisateur</h3>
        <ul>
          <li>Informations de compte : nom, prénom, email, nom d&apos;utilisateur</li>
          <li>Informations de profil : bio, photo, localisation (optionnel)</li>
          <li>Données de paiement : traitées par Stripe (nous ne stockons pas vos données bancaires)</li>
          <li>Contenus publiés : prompts, descriptions, commentaires</li>
        </ul>
        <h3>3.2 Données collectées automatiquement</h3>
        <ul>
          <li>Données de navigation : pages visitées, durée des sessions</li>
          <li>Données techniques : adresse IP, type de navigateur, appareil</li>
          <li>Cookies : voir notre section dédiée ci-dessous</li>
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
          <li><strong>Stripe :</strong> pour le traitement des paiements</li>
          <li><strong>Supabase :</strong> pour l&apos;hébergement des données</li>
          <li><strong>Resend :</strong> pour l&apos;envoi d&apos;emails</li>
          <li><strong>PostHog :</strong> pour l&apos;analyse d&apos;usage (anonymisée)</li>
          <li><strong>Sentry :</strong> pour le monitoring des erreurs</li>
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
          <a href="mailto:dpo@prompta.fr" className="text-accent hover:underline">
            dpo@prompta.fr
          </a>
        </p>

        <h2>9. Cookies</h2>
        <h3>9.1 Cookies essentiels</h3>
        <p>
          Nécessaires au fonctionnement du site (authentification, préférences).
          Ne peuvent pas être désactivés.
        </p>
        <h3>9.2 Cookies analytiques</h3>
        <p>
          Utilisés pour comprendre comment vous utilisez le site (PostHog).
          Vous pouvez les refuser via les paramètres de votre navigateur.
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
          <a href="mailto:dpo@prompta.fr" className="text-accent hover:underline">
            dpo@prompta.fr
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

        <div className="mt-12 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-800">
            <strong>Note importante :</strong> Ce document est un gabarit et doit être
            validé par un professionnel du droit et un DPO avant mise en production.
            Il ne constitue pas un avis juridique.
          </p>
        </div>
      </div>
    </div>
  );
}
