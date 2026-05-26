import { test } from "node:test";
import assert from "node:assert/strict";
import { inferOpenAITokenParam, resolveModelOrDefault } from "../../lib/llm/resolve-model";

test("inferOpenAITokenParam — modèles GPT-5.x", () => {
  assert.equal(inferOpenAITokenParam("gpt-5.4-mini"), "max_completion_tokens");
  assert.equal(inferOpenAITokenParam("gpt-5.5"), "max_completion_tokens");
});

test("inferOpenAITokenParam — série o", () => {
  assert.equal(inferOpenAITokenParam("o3-mini"), "max_completion_tokens");
});

test("resolveModelOrDefault — gpt-5.4-mini utilise max_completion_tokens", () => {
  const resolved = resolveModelOrDefault("gpt-5.4-mini");
  assert.equal(resolved.tokenParam, "max_completion_tokens");
});
