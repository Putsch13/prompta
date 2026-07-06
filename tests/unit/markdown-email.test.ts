import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToEmailHtml, looksLikeHtml } from "@/lib/email/markdown-to-html";

test("markdownToEmailHtml : titres, gras, listes, liens", () => {
  const html = markdownToEmailHtml(
    "# Rapport\n\n**Important** : voir [le site](https://example.com)\n\n- point un\n- point deux\n\n1. étape\n2. suite",
  );
  assert.match(html, /<h2[^>]*>Rapport<\/h2>/);
  assert.match(html, /<strong>Important<\/strong>/);
  assert.match(html, /<a href="https:\/\/example\.com"[^>]*>le site<\/a>/);
  assert.match(html, /<ul[^>]*>[\s\S]*<li[^>]*>point un<\/li>/);
  assert.match(html, /<ol[^>]*>[\s\S]*<li[^>]*>étape<\/li>/);
});

test("markdownToEmailHtml : échappe le HTML injecté", () => {
  const html = markdownToEmailHtml("<script>alert(1)</script> et **ok**");
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("looksLikeHtml : détecte le HTML existant", () => {
  assert.equal(looksLikeHtml("<p>déjà html</p>"), true);
  assert.equal(looksLikeHtml("# juste du markdown"), false);
});
