/**
 * HTTP integration test against a running MineSafe AI server.
 *
 *   BASE_URL=http://localhost:3000 npm test -- tests/api.smoke.test.mjs
 *
 * Skipped automatically when BASE_URL is not set, so `npm test` stays green
 * without a server.
 */
import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL;
const options = BASE_URL ? {} : { skip: "BASE_URL not set - start the server and set BASE_URL to run this test" };

test("health endpoint reports database status", options, async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.database, "up");
});

test("login issues a session cookie for a supervisor", options, async () => {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "supervisor", password: "Super@123", role: "supervisor" }),
  });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("set-cookie")?.includes("ms_session="));
});

test("dashboard snapshot requires authentication", options, async () => {
  const res = await fetch(`${BASE_URL}/api/dashboard`);
  assert.equal(res.status, 401);
});

test("ingestion rejects a malformed payload with 422", options, async () => {
  const res = await fetch(`${BASE_URL}/api/ingest/sensor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ helmet_id: "HELMET-001", gas_raw: 999999 }),
  });
  assert.equal(res.status, 422);
});

test("ingestion rejects a payload without any sensor field", options, async () => {
  const res = await fetch(`${BASE_URL}/api/ingest/sensor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ helmet_id: "HELMET-001" }),
  });
  assert.equal(res.status, 422);
});

test("gas spike ingestion raises a critical alert (simulated)", options, async () => {
  const ingest = await fetch(`${BASE_URL}/api/ingest/sensor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      helmet_id: "HELMET-TEST-99",
      worker_id: "WORKER-001",
      gas_raw: 1800,
      temperature_c: 33,
      accel_x: 0.1,
      accel_y: 0.1,
      accel_z: 0.99,
      battery_percent: 70,
      source: "simulated",
    }),
  });
  assert.equal(ingest.status, 201);
  const body = await ingest.json();
  assert.equal(body.buzzerCommand, "ON");
  assert.ok(body.alerts.some((a) => a.ruleId === "GAS_CRITICAL"));
});

test("threshold validation rejects an impossible configuration", options, async () => {
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin@123", role: "admin" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const res = await fetch(`${BASE_URL}/api/settings/thresholds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ gasWarning: 1500, gasCritical: 900 }),
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(Array.isArray(body.details) && body.details.length > 0);
});
