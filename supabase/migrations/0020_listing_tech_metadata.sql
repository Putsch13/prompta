-- Migration 0020: Ajoute tech_stack et integrations sur listings
-- Ces colonnes stockent les métadonnées techniques choisies par le builder.

alter table listings 
  add column if not exists tech_stack text[] default '{}',
  add column if not exists integrations text[] default '{}';

comment on column listings.tech_stack is 'Runtime/tech requis (ex: node-20, python-3.10, docker)';
comment on column listings.integrations is 'Intégrations/connecteurs (ex: notion, slack, github)';
