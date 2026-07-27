/**
 * Prédicat unique « connexion lançable » (lib/connections.isConnectionUsable).
 *
 * Il gouverne à la fois le gate du planificateur (409 « connecteur manquant »,
 * récupérable via OAuth + reprise) et celui du worker. Quand les deux
 * divergeaient, le 409 ne partait pas et le run mourait en texte brut, sans
 * bouton « Connecter » ni mission mémorisée.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isConnectionUsable } from "../../lib/connections";

const past = new Date(Date.now() - 3_600_000).toISOString();
const future = new Date(Date.now() + 3_600_000).toISOString();

test("connecté, token valide → lançable", () => {
  assert.equal(isConnectionUsable({ status: "connected", expires_at: future }), true);
  // Pas d'expiration renseignée (jetons sans TTL) → lançable.
  assert.equal(isConnectionUsable({ status: "connected", expires_at: null }), true);
});

test("RÉGRESSION — connecté mais token périmé SANS refresh → PAS lançable", () => {
  // Le cas qui produisait une pastille verte puis un run mort : les connexions
  // Composio ne stockent jamais de refresh_token_enc.
  assert.equal(isConnectionUsable({ status: "connected", expires_at: past }), false);
  assert.equal(
    isConnectionUsable({ status: "connected", expires_at: past, refresh_token_enc: null }),
    false,
  );
});

test("token périmé AVEC refresh → lançable (ravivé à l'exécution)", () => {
  // Un access token Google expire toutes les heures : bloquer ici refuserait
  // des runs parfaitement lançables.
  assert.equal(
    isConnectionUsable({ status: "connected", expires_at: past, refresh_token_enc: "enc" }),
    true,
  );
  assert.equal(
    isConnectionUsable({ status: "expired", expires_at: past, refresh_token_enc: "enc" }),
    true,
  );
});

test("status expired sans refresh, ou déconnecté → pas lançable", () => {
  assert.equal(isConnectionUsable({ status: "expired", expires_at: future }), false);
  assert.equal(isConnectionUsable({ status: "disconnected" }), false);
  assert.equal(isConnectionUsable({ status: null }), false);
  assert.equal(isConnectionUsable({}), false);
});
