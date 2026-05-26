import type { AgentManifest } from "@/lib/agent/schema";

/** Cas d'usage signature Prompta — démo vente freelances / PME. */
export const SIGNATURE_AGENT_SLUG = "assistant-email-pro";

export const SIGNATURE_EMAIL_AGENT: {
  title: string;
  description: string;
  tags: string[];
  models: string[];
  manifest: AgentManifest;
} = {
  title: "Assistant Email Pro",
  description:
    "Transforme un email reçu en réponse professionnelle prête à envoyer. Idéal pour freelances, consultants et PME qui veulent gagner 15 minutes par message.",
  tags: ["email", "productivité", "freelance", "b2b"],
  models: ["gpt-5.4", "claude-sonnet-4-6"],
  manifest: {
    inputs: [
      {
        key: "email_recu",
        label: "Email reçu",
        type: "textarea",
        required: true,
        help: "Collez le message entrant tel quel.",
      },
      {
        key: "ton_souhaite",
        label: "Ton souhaité",
        type: "text",
        required: false,
        help: "Ex. chaleureux, formel, direct…",
      },
      {
        key: "langue",
        label: "Langue de réponse",
        type: "text",
        required: false,
        help: "Ex. français, anglais…",
      },
    ],
    secrets: ["openai"],
    connectors: [],
    tools: [],
    steps: [
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Tu es un assistant email B2B expert.

Analyse l'email suivant et produis un résumé structuré :
- Expéditeur / contexte
- Demande ou problème principal
- Urgence (basse / moyenne / haute)
- Points à clarifier avant de répondre

Email reçu :
{{email_recu}}`,
      },
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `À partir de cette analyse :
{{step_0_output}}

Rédige une réponse email professionnelle prête à envoyer.

Contraintes :
- Ton : {{ton_souhaite}} (défaut : professionnel et chaleureux)
- Langue : {{langue}} (défaut : même langue que l'email reçu)
- Structure : accueil → réponse point par point → prochaine étape → formule de politesse
- Pas de placeholders du type [Votre nom] — utilise des formulations génériques si info manquante

Retourne UNIQUEMENT le corps de l'email (objet sur la première ligne après "Objet:").`,
      },
    ],
    limits: {
      max_steps: 5,
      max_tokens: 8000,
      timeout_ms: 90000,
      max_tool_calls: 0,
      max_output_bytes: 51200,
    },
    outputs: ["result"],
  },
};
