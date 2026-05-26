# Marketplace agent runtime (`lib/agent/`)

Runtime des **agents/workflows marketplace** : manifeste Zod → orchestrateur → worker.

| Dossier | Rôle |
|---------|------|
| **`lib/agent/`** | Marketplace — manifeste, orchestrateur, worker |
| **`lib/agents/`** | Infra admin — budget, runner, anthropic |
| **`lib/admin-agents/`** | 7 implémentations admin (SEO, LinkedIn, etc.) |

Un seul schéma manifeste marketplace : `lib/agent/schema.ts` (`AgentManifestSchema`).
