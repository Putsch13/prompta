# Agents admin internes (Prompt Factory, SEO, modération…)

Implémentations des 7 agents ops appelés par `lib/agents/runner.ts`.

- **Ne pas confondre** avec `lib/agent/` (runtime marketplace utilisateur).
- Registre : `index.ts` → `AGENT_REGISTRY`
- Consommé par : `/api/agents/run`, `/api/cron/tick`, `/admin/agents`
