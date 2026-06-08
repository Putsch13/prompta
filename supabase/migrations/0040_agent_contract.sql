-- 0040_agent_contract.sql
--
-- Pilier A du REFONTE-prompta-runtime.md : « Contrat d'agent »
-- (source unique de vérité pour ce qu'un agent demande/utilise au run).
--
-- On ajoute un snapshot du contrat sur la version d'agent publiée.
-- Les brouillons (CreateWizard) dérivent à la volée ; à la publication, on fige.
--
-- Ne supprime rien. La colonne reste optionnelle ; les versions antérieures
-- continuent de fonctionner via la dérivation à la volée côté serveur.

alter table listing_versions
  add column if not exists contract jsonb;

comment on column listing_versions.contract is
  'Snapshot du Contrat d''agent (interface dérivée des étapes) figé à la publication.';

-- Index facultatif pour requêtes futures (jsonb gin)
create index if not exists listing_versions_contract_gin
  on listing_versions using gin (contract jsonb_path_ops);
