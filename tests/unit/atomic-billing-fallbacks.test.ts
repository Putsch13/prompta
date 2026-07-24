import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { addCredits } from "../../lib/credits";
import { consumeFreeRunQuota } from "../../lib/billing/free-quota";
import {
  recordPlatformRunEconomics,
  PLATFORM_DAILY_COST_CAP_CENTS,
} from "../../lib/billing/circuit-breaker";

const TODAY = new Date().toISOString().split("T")[0];

type Row = Record<string, unknown> | null;

interface FakeCall {
  op: "rpc" | "insert" | "upsert" | "update" | "select";
  target: string; // nom de RPC ou table
  payload?: unknown;
}

/**
 * Fake minimal du client admin Supabase (chaînable). `selects` : ligne(s)
 * renvoyée(s) par maybeSingle/single — un tableau est consommé dans l'ordre
 * (la dernière valeur est réutilisée ensuite).
 */
function makeFakeAdmin(config: {
  rpc?: { data?: unknown; error?: { message: string } | null };
  selects?: Record<string, Row | Row[]>;
  insertErrors?: Record<string, { code?: string; message: string }>;
} = {}) {
  const calls: FakeCall[] = [];
  const selectQueues = new Map<string, Row[]>();
  for (const [table, rows] of Object.entries(config.selects ?? {})) {
    selectQueues.set(table, Array.isArray(rows) ? [...rows] : [rows]);
  }
  const nextRow = (table: string): Row => {
    const queue = selectQueues.get(table);
    if (!queue || queue.length === 0) return null;
    return queue.length > 1 ? (queue.shift() as Row) : queue[0];
  };

  const admin = {
    rpc(name: string, args: unknown) {
      calls.push({ op: "rpc", target: name, payload: args });
      const { data = null, error = null } = config.rpc ?? {};
      return Promise.resolve({ data, error });
    },
    from(table: string) {
      return {
        insert(row: unknown) {
          calls.push({ op: "insert", target: table, payload: row });
          return Promise.resolve({ error: config.insertErrors?.[table] ?? null });
        },
        upsert(row: unknown) {
          calls.push({ op: "upsert", target: table, payload: row });
          return Promise.resolve({ error: null });
        },
        update(row: unknown) {
          calls.push({ op: "update", target: table, payload: row });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        select() {
          calls.push({ op: "select", target: table });
          const chain = {
            eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: nextRow(table) }),
            single: () => Promise.resolve({ data: nextRow(table) }),
          };
          return chain;
        },
      };
    },
  };
  return { admin: admin as never, calls };
}

const USER = "00000000-0000-0000-0000-000000000001";

function silenceWarn(t: TestContext) {
  t.mock.method(console, "warn", () => {});
}

// ---------------------------------------------------------------------------
// addCredits
// ---------------------------------------------------------------------------

test("addCredits — RPC dispo : incrément atomique, pas de read-then-upsert", async () => {
  const { admin, calls } = makeFakeAdmin();

  await addCredits(USER, 1300, "purchase", "Pack 12 €", "cs_test_1", admin);

  const rpc = calls.find((c) => c.op === "rpc");
  assert.equal(rpc?.target, "add_credits");
  assert.deepEqual(rpc?.payload, { p_user_id: USER, p_amount_cents: 1300 });
  // Le ledger est inséré AVANT le solde (barrière d'idempotence).
  assert.equal(calls[0].op, "insert");
  assert.equal(calls[0].target, "credit_transactions");
  assert.ok(!calls.some((c) => c.op === "upsert"), "pas d'upsert quand la RPC répond");
  assert.ok(!calls.some((c) => c.op === "select" && c.target === "user_credits"));
});

test("addCredits — RPC absente : fallback read-then-upsert (solde + montant)", async (t) => {
  silenceWarn(t);
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function add_credits does not exist" } },
    selects: { user_credits: { balance_cents: 250 } },
  });

  await addCredits(USER, 100, "bonus", "Bonus", undefined, admin);

  const upsert = calls.find((c) => c.op === "upsert" && c.target === "user_credits");
  assert.ok(upsert, "fallback : upsert du solde attendu");
  assert.equal((upsert?.payload as { balance_cents: number }).balance_cents, 350);
});

test("addCredits — ledger dupliqué (23505) : retour anticipé, solde jamais touché", async () => {
  const { admin, calls } = makeFakeAdmin({
    insertErrors: { credit_transactions: { code: "23505", message: "duplicate key" } },
  });

  await addCredits(USER, 1300, "purchase", "Pack 12 €", "cs_test_1", admin);

  assert.ok(!calls.some((c) => c.op === "rpc"), "webhook rejoué : pas de second crédit");
  assert.ok(!calls.some((c) => c.op === "upsert"));
});

// ---------------------------------------------------------------------------
// consumeFreeRunQuota
// ---------------------------------------------------------------------------

test("consumeFreeRunQuota — RPC dispo : renvoie le booléen de la RPC", async () => {
  const ok = makeFakeAdmin({ rpc: { data: true } });
  assert.equal(await consumeFreeRunQuota(USER, ok.admin), true);
  assert.deepEqual(ok.calls.map((c) => c.op), ["rpc"], "aucun accès table quand la RPC répond");

  const ko = makeFakeAdmin({ rpc: { data: false } });
  assert.equal(await consumeFreeRunQuota(USER, ko.admin), false);
});

test("consumeFreeRunQuota — fallback, première run du jour : insert runs_today=1", async (t) => {
  silenceWarn(t);
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
  });

  assert.equal(await consumeFreeRunQuota(USER, admin), true);
  const insert = calls.find((c) => c.op === "insert");
  assert.equal(insert?.target, "free_run_quota");
  assert.equal((insert?.payload as { runs_today: number }).runs_today, 1);
});

test("consumeFreeRunQuota — fallback, insert en course (23505) : relit et respecte le quota", async (t) => {
  silenceWarn(t);
  const { admin } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
    selects: { free_run_quota: [null, { runs_today: 15, last_reset: TODAY }] },
    insertErrors: { free_run_quota: { code: "23505", message: "duplicate key" } },
  });

  // Bug d'origine : l'échec silencieux de l'insert renvoyait true hors quota.
  assert.equal(await consumeFreeRunQuota(USER, admin), false);
});

test("consumeFreeRunQuota — fallback, quota atteint : refuse sans écrire", async (t) => {
  silenceWarn(t);
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
    selects: { free_run_quota: { runs_today: 15, last_reset: TODAY } },
  });

  assert.equal(await consumeFreeRunQuota(USER, admin), false);
  assert.ok(!calls.some((c) => c.op === "update" || c.op === "insert"));
});

test("consumeFreeRunQuota — fallback, sous le quota : incrémente", async (t) => {
  silenceWarn(t);
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
    selects: { free_run_quota: { runs_today: 3, last_reset: TODAY } },
  });

  assert.equal(await consumeFreeRunQuota(USER, admin), true);
  const update = calls.find((c) => c.op === "update");
  assert.equal((update?.payload as { runs_today: number }).runs_today, 4);
});

test("consumeFreeRunQuota — fallback, nouveau jour : reset à 1", async (t) => {
  silenceWarn(t);
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
    selects: { free_run_quota: { runs_today: 15, last_reset: "2020-01-01" } },
  });

  assert.equal(await consumeFreeRunQuota(USER, admin), true);
  const update = calls.find((c) => c.op === "update");
  assert.deepEqual(update?.payload, { runs_today: 1, last_reset: TODAY });
});

// ---------------------------------------------------------------------------
// recordPlatformRunEconomics
// ---------------------------------------------------------------------------

const RUN_ECONOMICS = {
  userId: USER,
  runId: "00000000-0000-0000-0000-000000000002",
  runType: "agent" as const,
  actualCostCents: 100,
  billedCents: 160,
  marginCents: 60,
};

test("recordPlatformRunEconomics — RPC dispo : trace economics + incrément atomique", async () => {
  const { admin, calls } = makeFakeAdmin();

  await recordPlatformRunEconomics(RUN_ECONOMICS, admin);

  assert.equal(calls[0].op, "insert");
  assert.equal(calls[0].target, "platform_run_economics");
  const rpc = calls.find((c) => c.op === "rpc");
  assert.equal(rpc?.target, "record_platform_daily_cost");
  assert.deepEqual(rpc?.payload, {
    p_cost_cents: 100,
    p_margin_cents: 60,
    p_cap_cents: PLATFORM_DAILY_COST_CAP_CENTS,
  });
  assert.ok(
    !calls.some((c) => c.target === "platform_credit_guard"),
    "pas de read-then-write du guard quand la RPC répond"
  );
});

test("recordPlatformRunEconomics — fallback : cumule coût/marge du jour", async (t) => {
  silenceWarn(t);
  const guard = { daily_cost_cents: 500, daily_margin_cents: 200, is_paused: false, guard_day: TODAY };
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
    selects: { platform_credit_guard: guard },
  });

  await recordPlatformRunEconomics(RUN_ECONOMICS, admin);

  const update = calls.find((c) => c.op === "update" && c.target === "platform_credit_guard");
  const payload = update?.payload as { daily_cost_cents: number; daily_margin_cents: number; is_paused: boolean };
  assert.equal(payload.daily_cost_cents, 600);
  assert.equal(payload.daily_margin_cents, 260);
  assert.equal(payload.is_paused, false);
});

test("recordPlatformRunEconomics — fallback : déclenche le coupe-circuit au plafond", async (t) => {
  silenceWarn(t);
  const guard = {
    daily_cost_cents: PLATFORM_DAILY_COST_CAP_CENTS - 50,
    daily_margin_cents: 0,
    is_paused: false,
    guard_day: TODAY,
  };
  const { admin, calls } = makeFakeAdmin({
    rpc: { error: { message: "function does not exist" } },
    selects: { platform_credit_guard: guard },
  });

  await recordPlatformRunEconomics(RUN_ECONOMICS, admin);

  const update = calls.find((c) => c.op === "update" && c.target === "platform_credit_guard");
  const payload = update?.payload as { daily_cost_cents: number; is_paused: boolean };
  assert.equal(payload.daily_cost_cents, PLATFORM_DAILY_COST_CAP_CENTS + 50);
  assert.equal(payload.is_paused, true);
});
