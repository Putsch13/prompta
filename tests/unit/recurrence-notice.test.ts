/**
 * Détection d'intention RÉCURRENTE (lib/extension/instant-agent).
 *
 * Le planificateur ne produit que des plans one-shot. Sans ce signal,
 * « chaque lundi, envoie le rapport » partait une fois et l'utilisateur
 * repartait convaincu que son automatisation tournait — la panne de confiance
 * la plus coûteuse de l'audit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { recurrenceNotice } from "../../lib/extension/instant-agent";

test("ordres récurrents détectés (fr)", () => {
  for (const goal of [
    "chaque lundi, extrais les leads du CRM et envoie un rapport Slack",
    "Chaque jour à 9h, résume mes emails",
    "tous les matins, fais le point sur les ventes",
    "toutes les semaines, mets à jour le tableau",
    "envoie-moi un récap hebdomadaire",
    "rapport mensuel des dépenses",
  ]) {
    assert.ok(recurrenceNotice(goal), `non détecté : « ${goal} »`);
  }
});

test("ordres récurrents détectés (en)", () => {
  assert.ok(recurrenceNotice("every monday, send the sales report"));
  assert.ok(recurrenceNotice("daily summary of my inbox"));
});

test("ordres ponctuels NON happés", () => {
  for (const goal of [
    "résume cette page",
    "envoie ce brouillon à Marie",
    "compare les 3 devis ouverts",
    "extrais les leads du CRM maintenant",
    // « journalier » n'est pas une consigne de planification ici
    "explique-moi le chiffre d'affaires du mois de juin",
  ]) {
    assert.equal(recurrenceNotice(goal), undefined, `faux positif : « ${goal} »`);
  }
});

test("le message dit quoi faire, pas seulement ce qui manque", () => {
  const notice = recurrenceNotice("chaque lundi, envoie le rapport");
  assert.ok(notice?.includes("maintenant"));
  assert.ok(/planifie/i.test(notice ?? ""));
});
