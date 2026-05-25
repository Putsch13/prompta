# Test manuel — protection `is_admin`

## Prérequis

- Migration `0019_protect_is_admin.sql` appliquée en base.
- Un compte utilisateur **non admin** connecté dans le SQL Editor (role `authenticated`).

## Test 1 — Escalade refusée

```sql
-- En tant qu'utilisateur authentifié (pas service_role) :
update profiles set is_admin = true where id = auth.uid();
-- Attendu : ERROR — « Modification de is_admin non autorisée »
```

## Test 2 — Promotion via service_role

```sql
-- Via le dashboard Supabase ou scripts seed (service_role) :
update profiles set is_admin = true where username = 'florent';
-- Attendu : succès
```

## Test 3 — Une seule ligne admin

```sql
select id, username, is_admin from profiles where is_admin = true;
-- Attendu : une seule ligne (votre compte admin)
```
