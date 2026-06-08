# Ajouter un connecteur — checklist

> Objectif : ajouter un outil = **éditer 2 fichiers de déclaration** + tests verts.
> Le masque, l'orchestrateur, le binding, le préflight et la publication
> consomment automatiquement la nouvelle déclaration (Piliers A→D).

---

## 1. Déclarer l'action + ses inputs

**Fichier : `lib/connectors/registry.ts`**

Ajoutez (ou complétez) un objet `Connector` dans `CONNECTORS`. Pour chaque
`ActionInput`, **`kind` est requis** (`input` / `resource` / `identity` /
`step_ref` / `static`).

```ts
{
  id: "monoutil",
  label: "MonOutil",
  authType: "oauth", // ou "api_key"
  category: "Productivité",
  why: "Phrase courte expliquant la valeur pour l'utilisateur final.",
  actions: [
    {
      id: "monoutil.create",
      label: "Créer un truc",
      inputs: [
        {
          key: "ressource_id",
          label: "Ressource",
          required: true,
          kind: "resource",                    // 👈 widget = resource_picker
          resourceType: "monoutil.ressource",  // 👈 doit exister dans resource-types.ts
          defaultScope: "end_user",
        },
        {
          key: "titre",
          label: "Titre",
          required: true,
          kind: "input",                       // 👈 widget = text/email/textarea
          defaultScope: "dynamic",
          help: "Titre visible par l'utilisateur final.",
          placeholder: "Mon super truc",
        },
      ],
    },
  ],
}
```

> ⚠️ Un input requis **sans** `help` ni `placeholder` est refusé par la CI
> (`registry-conformance.ts`).

---

## 2. Si l'action a une « ressource », déclarer le `resourceType`

**Fichier : `lib/connectors/resource-types.ts`**

```ts
"monoutil.ressource": {
  id: "monoutil.ressource",
  connectorId: "monoutil",
  label: "Ressource MonOutil",
  listVia: "composio",                       // ou "native"
  listAction: "MONOUTIL_LIST_RESSOURCES",    // action Composio OU "native:monoutil.ressource"
},
```

- **Composio par défaut** : pour la majorité des outils, déclarez l'action
  Composio (`MAJ_VERB_NOUN`) — le picker fonctionne sans code supplémentaire.
- **Natif uniquement** si l'API Composio n'expose pas l'inventaire (rare) :
  alors `listVia: "native"`, ajoutez un `case` dans `listNativeResources`
  (`lib/connectors/list-resources.ts`) qui retourne `ResourceListItem[]`.

---

## 3. Vérifier — un seul commande

```bash
npx tsc --noEmit                              # types OK
npx tsx --test tests/unit/registry-conformance.test.ts  # registre 100% conforme
npm run test:unit                             # rien d'autre n'est cassé
```

Si `registry-conformance.test.ts` échoue, le message d'erreur indique
exactement quelle règle n'est pas respectée (`required_input_missing_kind`,
`unknown_resource_type`, `forbidden_magic_default`, etc.).

---

## 4. Rien d'autre à toucher

Vous **ne devez pas** modifier :
- `lib/agent/orchestrator.ts` (consomme le Résolveur)
- `lib/agent/resolve-interface.ts` (consomme le Contrat)
- `lib/agent/contract.ts` (consomme le registre)
- `components/builder/canvas/NodeInspector.tsx` (consomme le Résolveur)
- `components/run/RunPanel.tsx` (consomme le manifest dérivé du Contrat)
- `app/api/run/agent/preflight/route.ts` (consomme le Résolveur)
- `lib/builder/validate-manifest-for-publish.ts` (consomme le Résolveur)

Tout ce qui précède est **déclaratif** : votre nouvel outil hérite
automatiquement du widget, du binding, du preflight, du masque abonné et de la
validation à la publication.

---

## 5. (Optionnel) Exécution native dédiée

Si vous voulez court-circuiter Composio pour la performance ou la robustesse
sur une action critique, ajoutez un handler dans
`lib/connectors/execute-native.ts` :

```ts
async function monoutilCreate(ctx: ExecuteContext, params: Record<string, string>): Promise<ExecuteResult> {
  // appel direct à l'API
}

export const NATIVE_HANDLERS: Record<string, NativeHandler> = {
  // …
  "monoutil.create": monoutilCreate,
};
```

L'orchestrateur utilise automatiquement le natif si présent, sinon il route
vers Composio (`lib/connectors/execute-composio.ts`).

---

## 6. Récapitulatif des règles CI

Le validateur `validateRegistry()` (vérifié par `registry-conformance.test.ts`)
vous interdit de merger :

1. Un `required: true` sans `kind`.
2. Un `kind: resource` ou `kind: identity` sans `resourceType` connu.
3. Un `resourceType` sans `listAction`.
4. Un `defaultValue` magique (ex. `"*"`) — utilisez une vraie valeur par défaut.
5. Un connecteur sans actions.
6. Une action sans inputs.
7. Un `required: true` avec `kind: input` mais sans `help` ni `placeholder`.

Si la CI passe, votre outil est **prêt** à être utilisé dans le builder, le
masque abonné et le runtime — sans aucun recâblage manuel.
