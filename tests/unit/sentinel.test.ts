/**
 * Aiguillage tac au tac ↔ mission (lib/extension/sentinel).
 *
 * C'est le SEUL point de décision entre « réponse streamée » et « bascule en
 * agent complet ». Un faux négatif perd la demande de l'utilisateur : le mot
 * « MISSION » s'affiche en clair et aucun run n'est créé.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSentinelLead,
  couldBecomeSentinel,
  isTrailingSentinel,
} from "../../lib/extension/sentinel";

test("tête de flux : sentinelle nue et habillages markdown", () => {
  assert.equal(isSentinelLead("MISSION"), true);
  assert.equal(isSentinelLead("**MISSION**"), true);
  assert.equal(isSentinelLead("« MISSION »"), true);
  assert.equal(isSentinelLead("MISSION : je m'en occupe"), true);
  assert.equal(isSentinelLead("Mission"), true);
});

test("tête de flux : frontière de mot respectée", () => {
  assert.equal(isSentinelLead("Missionnaire en Afrique"), false);
  assert.equal(isSentinelLead("Bonjour !"), false);
});

test("tampon de tête : un préfixe reste ambigu, un écart tranche", () => {
  assert.equal(couldBecomeSentinel("MIS"), true);
  assert.equal(couldBecomeSentinel("**M"), true);
  assert.equal(couldBecomeSentinel("Bon"), false);
});

// ── Rattrapage fin de flux ─────────────────────────────────────────────────

test("RÉGRESSION — sentinelle après un préambule est rattrapée", () => {
  // Le cas qui perdait la demande : le modèle narre puis émet la sentinelle.
  assert.equal(isTrailingSentinel("D'accord, je m'en occupe.\nMISSION"), true);
  assert.equal(isTrailingSentinel("Très bien.\n\n**MISSION**"), true);
  assert.equal(isTrailingSentinel("Je vais faire ça pour toi.\nMISSION."), true);
});

test("rattrapage : une vraie réponse qui PARLE de mission n'est pas happée", () => {
  // Dernière ligne non réduite à la sentinelle → régime 1 préservé.
  assert.equal(
    isTrailingSentinel("Voici le résumé :\nLa mission de l'entreprise est d'aider les PME."),
    false,
  );
  // Sentinelle au milieu, pas en dernière ligne.
  assert.equal(isTrailingSentinel("MISSION\nest un mot anglais.\nVoilà."), false);
});

test("rattrapage : borné en longueur pour ne pas happer une longue réponse", () => {
  const long = `${"Une explication détaillée. ".repeat(20)}\nMISSION`;
  assert.ok(long.length > 240);
  assert.equal(isTrailingSentinel(long), false);
});

test("rattrapage : le cas mono-ligne reste au détecteur de tête", () => {
  assert.equal(isTrailingSentinel("MISSION"), false);
  assert.equal(isTrailingSentinel(""), false);
});
