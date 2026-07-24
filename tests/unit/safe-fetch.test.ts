import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { Agent } from "undici";
import { isPrivateIp, makeGuardedLookup, safeFetch, EgressError } from "../../lib/agent/tools/safe-fetch";

test("isPrivateIp : plages IPv4 internes bloquées", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
});

test("isPrivateIp : IPv4 publiques autorisées", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "142.250.178.14", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test("isPrivateIp : IPv6 loopback / ULA / link-local / IPv4-mappé bloqués", () => {
  for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp("2001:4860:4860::8888"), false); // Google DNS public
});

test("isPrivateIp : IPv4-mappé en hexadécimal et NAT64 bloqués (contournements)", () => {
  assert.equal(isPrivateIp("::ffff:7f00:1"), true);   // = 127.0.0.1 en hex
  assert.equal(isPrivateIp("::ffff:a00:1"), true);    // = 10.0.0.1 en hex
  assert.equal(isPrivateIp("64:ff9b::7f00:1"), true); // NAT64
});

test("isPrivateIp : entrée non-IP refusée par prudence", () => {
  assert.equal(isPrivateIp("pas-une-ip"), true);
  assert.equal(isPrivateIp("999.999.999.999"), true);
});

// ---------------------------------------------------------------------------
// safeFetch : rejets syntaxiques AVANT tout réseau (hostnames/IP littérales)
// ---------------------------------------------------------------------------

test("safeFetch : hostnames et IP internes rejetés sans toucher le réseau", async () => {
  for (const url of [
    "http://localhost/x",
    "http://sous.localhost/x",
    "http://api.internal/x",
    "http://127.0.0.1/x",
    "http://[::1]/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://0x7f000001/",
    "http://2130706433/",
  ]) {
    await assert.rejects(safeFetch(url), /interdit|refusée/, url);
  }
});

test("safeFetch : protocoles non-http(s) et URL invalides rejetés", async () => {
  await assert.rejects(safeFetch("ftp://example.com/x"), /http\(s\)/);
  await assert.rejects(safeFetch("pas une url"), /URL invalide/);
});

// ---------------------------------------------------------------------------
// makeGuardedLookup : la garde DNS unitaire (résolveur mocké)
// ---------------------------------------------------------------------------

function runLookup(fn: LookupFunction, host: string, options: { all?: boolean; family?: number }) {
  return new Promise<{ err: Error | null; address: unknown; family: unknown }>((resolve) => {
    (fn as (h: string, o: object, cb: (err: Error | null, address: unknown, family?: unknown) => void) => void)(
      host,
      options,
      (err, address, family) => resolve({ err, address, family }),
    );
  });
}

test("makeGuardedLookup : résolution publique → adresses transmises telles quelles (all)", async () => {
  const lookup = makeGuardedLookup({
    resolve: async () => [{ address: "203.0.113.7", family: 4 }, { address: "2001:db8::7", family: 6 }],
  });
  const { err, address } = await runLookup(lookup, "exemple.test", { all: true });
  assert.equal(err, null);
  assert.deepEqual(address, [{ address: "203.0.113.7", family: 4 }, { address: "2001:db8::7", family: 6 }]);
});

test("makeGuardedLookup : mode scalaire (all absent) et filtre par famille", async () => {
  const lookup = makeGuardedLookup({
    resolve: async () => [{ address: "2001:db8::7", family: 6 }, { address: "203.0.113.7", family: 4 }],
  });
  const scalar = await runLookup(lookup, "exemple.test", {});
  assert.equal(scalar.err, null);
  assert.equal(scalar.address, "2001:db8::7");
  assert.equal(scalar.family, 6);

  const v4 = await runLookup(lookup, "exemple.test", { all: true, family: 4 });
  assert.deepEqual(v4.address, [{ address: "203.0.113.7", family: 4 }]);
});

test("makeGuardedLookup : UNE adresse privée dans la réponse suffit à tout bloquer", async () => {
  const lookup = makeGuardedLookup({
    resolve: async () => [{ address: "203.0.113.7", family: 4 }, { address: "10.0.0.1", family: 4 }],
  });
  const { err } = await runLookup(lookup, "evil.test", { all: true });
  assert.ok(err instanceof EgressError);
  assert.match(err.message, /IP privée/);
});

test("makeGuardedLookup : échec de résolution → « Hôte introuvable »", async () => {
  const lookup = makeGuardedLookup({
    resolve: async () => { throw new Error("ENOTFOUND"); },
  });
  const { err } = await runLookup(lookup, "inconnu.test", { all: true });
  assert.ok(err instanceof EgressError);
  assert.match(err.message, /introuvable/);
});

test("makeGuardedLookup : IP littérale validée sans appeler le résolveur", async () => {
  let called = 0;
  const lookup = makeGuardedLookup({ resolve: async () => { called++; return []; } });
  const pub = await runLookup(lookup, "203.0.113.7", { all: true });
  assert.equal(pub.err, null);
  assert.deepEqual(pub.address, [{ address: "203.0.113.7", family: 4 }]);
  const priv = await runLookup(lookup, "127.0.0.1", { all: true });
  assert.ok(priv.err instanceof EgressError);
  assert.equal(called, 0);
});

// ---------------------------------------------------------------------------
// safeFetch de bout en bout : l'épinglage anti-rebinding, sur serveur local
// ---------------------------------------------------------------------------

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

test("safeFetch : la connexion compose l'IP validée par la garde, Host d'origine conservé (résolution unique)", async () => {
  // « epingle.test » n'existe pas en vrai DNS : si fetch re-résolvait de son
  // côté (l'ancienne faille), la requête échouerait en ENOTFOUND. Elle ne peut
  // aboutir QUE si la socket compose l'adresse renvoyée par la garde.
  const server = createServer((req, res) => res.end(`ok:${req.headers.host}`));
  const port = await listen(server);
  let resolutions = 0;
  const dispatcher = new Agent({
    connect: {
      lookup: makeGuardedLookup({
        resolve: async () => { resolutions++; return [{ address: "127.0.0.1", family: 4 }]; },
        isPrivate: () => false, // test : 127.0.0.1 joue le rôle d'une IP publique
      }),
    },
  });
  try {
    const res = await safeFetch(`http://epingle.test:${port}/`, { dispatcher });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), `ok:epingle.test:${port}`);
    assert.equal(resolutions, 1); // une seule résolution : celle de la garde
  } finally {
    await dispatcher.close();
    server.close();
  }
});

test("safeFetch : rebinding public → privée n'atteint jamais le service interne", async () => {
  // 1ʳᵉ résolution : IP publique non routable (TEST-NET-3). S'il y avait une
  // 2ᵉ résolution (celle de l'attaque), elle renverrait 127.0.0.1 où écoute
  // un serveur témoin — qui ne doit JAMAIS être touché.
  let hits = 0;
  const canary = createServer((_req, res) => { hits++; res.end("secret"); });
  const port = await listen(canary);
  const answers: { address: string; family: number }[][] = [
    [{ address: "203.0.113.7", family: 4 }],
    [{ address: "127.0.0.1", family: 4 }],
  ];
  const dispatcher = new Agent({
    connect: {
      timeout: 500, // la connexion vers TEST-NET-3 doit échouer vite
      lookup: makeGuardedLookup({ resolve: async () => answers.shift() ?? [] }),
    },
  });
  try {
    await assert.rejects(safeFetch(`http://rebind.test:${port}/`, { dispatcher }));
    assert.equal(hits, 0, "le serveur interne a été atteint : épinglage cassé");
    assert.equal(answers.length, 1, "une seconde résolution DNS a eu lieu : épinglage cassé");
  } finally {
    await dispatcher.close();
    canary.close();
  }
});

test("safeFetch : hôte résolvant en privé → EgressError propre (dépiautée du « fetch failed »)", async () => {
  const dispatcher = new Agent({
    connect: { lookup: makeGuardedLookup({ resolve: async () => [{ address: "10.0.0.1", family: 4 }] }) },
  });
  try {
    await assert.rejects(safeFetch("http://interne.test/", { dispatcher }), (err: unknown) => {
      assert.ok(err instanceof EgressError);
      assert.match((err as Error).message, /IP privée/);
      return true;
    });
  } finally {
    await dispatcher.close();
  }
});

test("safeFetch : chaque redirection est re-validée (IP littérale privée bloquée au hop 2)", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/go") {
      res.writeHead(302, { location: `http://127.0.0.1:${(server.address() as AddressInfo).port}/final` });
      res.end();
    } else {
      res.end("final");
    }
  });
  const port = await listen(server);
  const dispatcher = new Agent({
    connect: {
      lookup: makeGuardedLookup({
        resolve: async () => [{ address: "127.0.0.1", family: 4 }],
        isPrivate: () => false,
      }),
    },
  });
  try {
    await assert.rejects(safeFetch(`http://epingle.test:${port}/go`, { dispatcher }), /interne interdit/);
  } finally {
    await dispatcher.close();
    server.close();
  }
});

test("safeFetch : redirection vers un hostname résolvant en privé → bloquée par la garde du hop 2", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/go") {
      res.writeHead(302, { location: `http://cible-interne.test:${(server.address() as AddressInfo).port}/` });
      res.end();
    } else {
      res.end("final");
    }
  });
  const port = await listen(server);
  const dispatcher = new Agent({
    connect: {
      lookup: makeGuardedLookup({
        resolve: async (host) =>
          host === "cible-interne.test" ? [{ address: "10.0.0.1", family: 4 }] : [{ address: "127.0.0.1", family: 4 }],
        isPrivate: (ip) => ip !== "127.0.0.1", // test : seule 127.0.0.1 « publique », le 10.x reste privé
      }),
    },
  });
  try {
    await assert.rejects(safeFetch(`http://depart.test:${port}/go`, { dispatcher }), /IP privée/);
  } finally {
    await dispatcher.close();
    server.close();
  }
});

test("safeFetch : les redirections suivies aboutissent quand chaque hop est public", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/go") {
      res.writeHead(302, { location: `http://suivant.test:${(server.address() as AddressInfo).port}/final` });
      res.end();
    } else {
      res.end(`ok:${req.headers.host}:${req.url}`);
    }
  });
  const port = await listen(server);
  const resolved: string[] = [];
  const dispatcher = new Agent({
    connect: {
      lookup: makeGuardedLookup({
        resolve: async (host) => { resolved.push(host); return [{ address: "127.0.0.1", family: 4 }]; },
        isPrivate: () => false,
      }),
    },
  });
  try {
    const res = await safeFetch(`http://depart.test:${port}/go`, { dispatcher });
    assert.equal(await res.text(), `ok:suivant.test:${port}:/final`);
    assert.deepEqual(resolved, ["depart.test", "suivant.test"]); // ré-épinglage à chaque hop
  } finally {
    await dispatcher.close();
    server.close();
  }
});
