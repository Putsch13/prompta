# Soumettre Prompta partout au Chrome Web Store

*Guide opérationnel — préparé le 16 juillet 2026. Tout le paquet est prêt :
il reste les étapes que seul le propriétaire du compte peut faire.*

## Pourquoi c'est LA priorité

L'installation ZIP en mode développeur perd ~90 % des utilisateurs. Le Store
remplace 5 étapes techniques par un clic « Ajouter à Chrome ».

## 1. Compte développeur (une fois, 5 $)

1. Va sur https://chrome.google.com/webstore/devconsole
2. Connecte le compte Google qui possédera l'extension (utilise un compte
   « société », pas un perso).
3. Paie les 5 $ de frais d'inscription uniques.

## 2. Paquet à téléverser

```bash
npm run build        # le prebuild régénère public/downloads/prompta-everywhere.zip
```

Le ZIP à soumettre est `public/downloads/prompta-everywhere.zip` (icônes DA
« AI Core » 16/48/128 incluses ; `extension/icons/icon512.png` sert d'icône de
listing). Version manifest : 0.6.0.

## 3. Fiche du listing (copier-coller)

- **Nom** : Prompta partout — l'assistant IA qui agit
- **Résumé (132 car. max)** : L'IA qui voit tes pages, agit sur tes apps
  (Gmail, Sheets, Notion…) et pilote ton navigateur — avec ton feu vert.
- **Description** : reprendre les sections de la landing (deux régimes tac au
  tac / mission, 1 000+ apps, validation humaine, dossier de run). Terminer
  par : « Compte gratuit requis — 2 € de crédits IA offerts, sans carte. »
- **Catégorie** : Productivité / Outils
- **Langue** : Français
- **Captures d'écran (1280×800, 3-5)** : panneau ouvert sur un site, une
  mission en cours avec étapes, une validation humaine, la page connexions.
- **Icône du listing** : `extension/icons/icon512.png` (redimensionner à 128
  si demandé).

## 4. Confidentialité (onglet « Privacy »)

- **Single purpose** : « Assistant IA : lit la page affichée à la demande de
  l'utilisateur et exécute des actions qu'il valide. »
- **Privacy policy URL** : https://prompta-sjtf.onrender.com/legal/privacy
- **Justification des permissions** :
  - `storage` — mémoriser les préférences du panneau (modèle choisi…)
  - `contextMenus` — entrée « agir sur la sélection »
  - `activeTab` + `scripting` — lire la page active quand l'utilisateur le demande
  - `tabs` — lister/lire les onglets que l'utilisateur coche explicitement
  - `alarms` — maintenir le suivi des missions de pilotage en cours
  - `host_permissions` (prompta-sjtf.onrender.com) — API du service (session)
- **Usage de données** : contenu de page envoyé au backend uniquement sur
  action explicite de l'utilisateur ; pas de revente ; jetons OAuth chiffrés.

⚠️ Les permissions larges (`content_scripts` sur tout http/https + `tabs`)
déclenchent une review manuelle : compter 3-10 jours ouvrés, et soigner les
justifications ci-dessus (c'est le cœur de la valeur produit, assume-le).

## 5. Après validation

1. Récupère l'URL du listing (`https://chromewebstore.google.com/detail/<id>`)
2. Ajoute sur Render la variable d'env :
   `NEXT_PUBLIC_CHROME_STORE_URL=<url du listing>`
3. Redéploie : la page /prompta-partout bascule automatiquement sur le bouton
   « Ajouter à Chrome » (le ZIP devient la méthode avancée repliée).

## 6. Mises à jour

Bump `version` dans `extension/manifest.json`, `npm run build`, téléverser le
nouveau ZIP dans la console. Les utilisateurs Store sont mis à jour tout seuls
(fini le « recharge l'extension »).
