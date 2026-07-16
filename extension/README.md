# Prompta partout — extension Chromium

UN cerveau, DEUX régimes, sur **toutes** vos pages (web, PDF, fichiers locaux) :

- **Tac au tac** : question, résumé, analyse de la page affichée → la réponse
  arrive **en streaming**, en moins d'une seconde, directement dans le panneau.
- **Mission** : dès que l'ordre exige d'agir (apps, livrables, croiser des
  onglets), l'assistant bascule tout seul sur un agent complet — plan, exécution
  live, **validations humaines**, et **re-planification automatique** si une
  étape échoue.

Ce que l'extension voit : la page active (même derrière votre login), votre
sélection, et le **contenu réel de tous les onglets cochés** — capturé par le
navigateur avec votre session (dashboards, CRM, mails ouverts…).

## Compatibilité navigateurs

| Navigateur | Statut |
|---|---|
| **Chrome** | Cible officielle |
| **Edge, Brave, Arc, Opera** | Chromium — même install « charger non empaquetée », en général OK |
| **Firefox** | Pas supporté tel quel (polyfill `browser.*`, packaging Add-ons) |
| **Safari** | Pas supporté (conversion Web Extension + compte Apple) |

Sans extension : [`/quick`](https://prompta-sjtf.onrender.com/quick) marche partout.

Guide produit : [`/prompta-partout`](https://prompta-sjtf.onrender.com/prompta-partout).

## Pilotage du navigateur (copilote visible)

Quand la mission l'exige (remplir un formulaire, dérouler des résultats, agir
sur un site sans connecteur), l'agent **pilote votre onglet sous vos yeux** :
chaque action est annoncée (toast en haut de page) et l'élément visé est
surligné. Les actions risquées — envoyer, publier, payer, supprimer… —
affichent une **demande de confirmation dans la page** : rien ne part sans
votre accord (silence = refus au bout de 40 s). Jamais de saisie de mots de
passe ni de paiement. Gardez l'onglet ouvert pendant le pilotage.

Exemples d'ordres, depuis n'importe quelle page :
- « Résume cette page en 5 points. » *(réponse instantanée)*
- « Lis la bdd affichée, compare-la avec le doc “budget 2026” de mon Drive, fais-moi une prez Canva et envoie-la-moi. »
- « Explore leur site (pages produits) et fais-moi un comparatif dans un Doc. »
- « Ajoute tous les produits de ce PDF sur mon Shopify » *(passera par une validation humaine avant l'écriture).*

Une mission réussie peut être **enregistrée comme agent réutilisable** (bouton
« garder comme agent » sur la carte de mission) : elle devient un brouillon
privé éditable dans le builder, relançable à volonté.

## Installation (mode développeur)

Même dossier `extension/` sur tout Chromium :

| Navigateur | Page extensions |
|---|---|
| Chrome | `chrome://extensions` |
| Edge | `edge://extensions` |
| Brave | `brave://extensions` |
| Arc | `arc://extensions` |
| Opera | `opera://extensions` |

1. Ouvrir la page extensions ci-dessus
2. Activer **Mode développeur**
3. **Charger l'extension non empaquetée** → sélectionner ce dossier `extension/`
4. **Épingler Prompta** : icône puzzle 🧩 → punaise à côté de « Prompta Everywhere »
5. Être connecté à Prompta dans un onglet du **même** navigateur (session partagée)
6. Après une mise à jour du code : ⟳ Recharger l'extension, puis recharger l'onglet

## Utilisation

- **Clic sur l'icône « P »** de la barre d'outils Chrome → un **panneau latéral
  glisse depuis la droite** (pleine hauteur, comme Joko). Re-clique (ou ✕ / fond
  assombri) pour le fermer. La page active est capturée automatiquement.
- **Alt+P** : même panneau, au clavier
- **Clic droit** → **« Prompta : agir sur la sélection »** : ouvre le panneau
  avec la sélection déjà prise en compte
- Le bouton **connexions** montre l'état de chaque app (vert = utilisable)
- La case **exploration du site** autorise l'agent à suivre les liens de la page
  (outil `web_fetch` côté serveur : HTML lisible, PDF, liens)
- Sur un **PDF**, le contenu est lu côté serveur (l'URL est passée à l'agent).
  Pour les fichiers **locaux** (`file://`), activer « Autoriser l'accès aux URL de
  fichier » dans les détails de l'extension

## Sécurité

- Le contenu des pages est traité comme une **donnée non fiable** : un texte
  malveillant dans une page ne peut pas donner d'ordres à l'agent.
- Toute écriture externe sensible (email, publication, e-commerce, CRM…) est
  précédée d'une **validation humaine** — insérée d'office par le serveur si le
  plan l'omettait. Les créations dans vos espaces Google (Sheets/Docs/Drive/
  Calendar) ne sont pas bloquées.
- Aucune donnée n'est envoyée ailleurs que sur votre instance Prompta
  (`host_permissions` limité au domaine).

## Configuration

Instance par défaut : `https://prompta-sjtf.onrender.com`. Pour la changer :
console du service worker de l'extension →
`chrome.storage.sync.set({ promptaBaseUrl: "https://votre-instance" })`.
