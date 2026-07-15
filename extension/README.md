# Prompta Everywhere — extension Chrome

Une barre de commande disponible sur **toutes** vos pages (web, PDF, fichiers locaux) :
décrivez une mission en langage naturel, Prompta crée l'agent et l'exécute immédiatement,
avec suivi des étapes en direct dans le panneau.

Exemples d'ordres, depuis n'importe quelle page :
- « Résume leur produit dans un Google Sheets déposé sur mon Drive, et envoie-moi le lien. »
- « Explore leur site (pages produits) et fais-moi un comparatif dans un Doc. »
- « Ajoute tous les produits de ce PDF sur mon Shopify » *(passera par une validation humaine avant l'écriture).*

## Installation (mode développeur)

1. Ouvrir `chrome://extensions`
2. Activer **Mode développeur** (interrupteur en haut à droite)
3. **Charger l'extension non empaquetée** → sélectionner ce dossier `extension/`
4. Être connecté à Prompta dans un onglet du même navigateur (la session est partagée)

## Utilisation

- **Alt+P** ou clic sur l'icône de l'extension (ou le bouton flottant « P » en bas à droite)
- Le bouton **connexions** montre l'état de chaque app (vert = utilisable)
- La case **exploration du site** autorise l'agent à suivre les liens de la page
  (outil `web_fetch` côté serveur : HTML lisible, PDF, liens)
- Clic droit sur une sélection → **« Prompta : agir sur la sélection »**
- Sur un **PDF**, le contenu est lu côté serveur (l'URL est passée à l'agent)

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
