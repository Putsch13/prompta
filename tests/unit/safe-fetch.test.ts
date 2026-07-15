import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp } from "../../lib/agent/tools/safe-fetch";

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
