import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation | Prompta",
  description: "Conditions générales d'utilisation de la marketplace Prompta",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-bold text-ink">
        Conditions Générales d&apos;Utilisation
      </h1>
      <p className="mt-4 text-ink-soft">
        Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}
      </p>

      <div className="prose prose-neutral mt-8 max-w-none">
        <h2>1. Présentation de Prompta</h2>
        <p>
          Prompta est une marketplace permettant aux créateurs de vendre des prompts,
          agents et workflows d&apos;intelligence artificielle, et aux utilisateurs de les
          acquérir et utiliser.
        </p>

        <h2>2. Acceptation des conditions</h2>
        <p>
          En accédant à Prompta et en utilisant nos services, vous acceptez d&apos;être lié
          par les présentes conditions générales d&apos;utilisation. Si vous n&apos;acceptez pas
          ces conditions, veuillez ne pas utiliser nos services.
        </p>

        <h2>3. Inscription et compte utilisateur</h2>
        <h3>3.1 Création de compte</h3>
        <p>
          Pour utiliser certaines fonctionnalités de Prompta, vous devez créer un compte.
          Vous vous engagez à fournir des informations exactes et à les maintenir à jour.
        </p>
        <h3>3.2 Sécurité du compte</h3>
        <p>
          Vous êtes responsable de la confidentialité de vos identifiants de connexion
          et de toutes les activités réalisées depuis votre compte.
        </p>

        <h2>4. Rôles et responsabilités</h2>
        <h3>4.1 Pour les créateurs (vendeurs)</h3>
        <ul>
          <li>Vous garantissez que vos contenus sont originaux ou que vous disposez des droits nécessaires.</li>
          <li>Vous vous engagez à ne pas publier de contenu illégal, nuisible ou trompeur.</li>
          <li>Vous êtes responsable de la qualité et du fonctionnement de vos prompts/agents.</li>
          <li>Vous acceptez la commission de 20% prélevée par Prompta sur chaque vente.</li>
        </ul>
        <h3>4.2 Pour les acheteurs</h3>
        <ul>
          <li>Vous vous engagez à utiliser les contenus acquis de manière légale et éthique.</li>
          <li>Vous ne pouvez pas revendre ou redistribuer les contenus achetés sans autorisation.</li>
          <li>Vous acceptez que les résultats des prompts/agents dépendent de facteurs externes (modèles IA, paramètres, etc.).</li>
        </ul>

        <h2>5. Contenus interdits</h2>
        <p>Les contenus suivants sont strictement interdits sur Prompta :</p>
        <ul>
          <li>Contenus visant à contourner les protections des modèles d&apos;IA (jailbreak)</li>
          <li>Contenus à caractère sexuel, pornographique ou explicite</li>
          <li>Contenus incitant à la violence, à la haine ou à la discrimination</li>
          <li>Contenus facilitant des activités illégales</li>
          <li>Contenus diffusant de la désinformation</li>
          <li>Contenus violant les droits de propriété intellectuelle d&apos;autrui</li>
          <li>Spam, arnaques ou contenus trompeurs</li>
        </ul>

        <h2>6. Paiements et remboursements</h2>
        <h3>6.1 Paiements</h3>
        <p>
          Les paiements sont traités par Stripe. Prompta ne stocke aucune information
          de carte bancaire. Les prix sont affichés TTC pour les clients européens.
        </p>
        <h3>6.2 Remboursements</h3>
        <p>
          Les demandes de remboursement sont évaluées au cas par cas. Un remboursement
          peut être accordé si le contenu ne correspond pas à sa description ou ne
          fonctionne pas comme prévu.
        </p>

        <h2>7. Propriété intellectuelle</h2>
        <p>
          Les créateurs conservent leurs droits de propriété intellectuelle sur les
          contenus qu&apos;ils publient. En publiant sur Prompta, ils accordent une licence
          limitée permettant l&apos;affichage et la distribution de leurs contenus sur la
          plateforme.
        </p>

        <h2>8. Modération et signalement</h2>
        <h3>8.1 Modération</h3>
        <p>
          Tous les contenus sont soumis à une modération avant publication. Prompta
          se réserve le droit de refuser ou supprimer tout contenu ne respectant pas
          ces conditions.
        </p>
        <h3>8.2 Procédure de signalement (Takedown)</h3>
        <p>
          Si vous pensez qu&apos;un contenu viole vos droits ou ces conditions, vous pouvez
          le signaler via le bouton de signalement présent sur chaque fiche. Nous
          traiterons votre demande dans un délai de 48 heures ouvrées.
        </p>

        <h2>9. Limitation de responsabilité</h2>
        <p>
          Prompta fournit une plateforme de mise en relation. Nous ne garantissons pas
          les résultats obtenus avec les prompts/agents achetés. Notre responsabilité
          est limitée au montant des transactions effectuées.
        </p>

        <h2>10. Modification des conditions</h2>
        <p>
          Nous nous réservons le droit de modifier ces conditions à tout moment. Les
          utilisateurs seront informés des modifications importantes par email ou via
          la plateforme.
        </p>

        <h2>11. Droit applicable</h2>
        <p>
          Les présentes conditions sont régies par le droit français. Tout litige sera
          soumis aux tribunaux compétents de Paris, France.
        </p>

        <h2>12. Contact</h2>
        <p>
          Pour toute question concernant ces conditions, contactez-nous à :{" "}
          <a href="mailto:legal@prompta.fr" className="text-accent hover:underline">
            legal@prompta.fr
          </a>
        </p>

        <div className="mt-12 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-800">
            <strong>Note importante :</strong> Ce document est un gabarit et doit être
            validé par un professionnel du droit avant mise en production. Il ne
            constitue pas un avis juridique.
          </p>
        </div>
      </div>
    </div>
  );
}
