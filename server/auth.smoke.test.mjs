import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";

async function pingServer() {
  try {
    const res = await fetch(`${BASE_URL}/api/clinics`);
    return res.ok;
  } catch {
    return false;
  }
}

async function requireServerOrSkip(t) {
  const ok = await pingServer();
  if (!ok) {
    t.skip(`Smoke tests skipped: server is not reachable at ${BASE_URL}`);
    return false;
  }
  return true;
}

test("api includes x-request-id header", async (t) => {
  if (!(await requireServerOrSkip(t))) return;

  const res = await fetch(`${BASE_URL}/api/clinics`);
  assert.equal(res.ok, true);
  assert.ok(res.headers.get("x-request-id"));
});

test("unauthenticated session endpoint returns requestId", async (t) => {
  if (!(await requireServerOrSkip(t))) return;

  const res = await fetch(`${BASE_URL}/api/auth/session`);
  assert.equal(res.status, 401);

  const body = await res.json();
  assert.equal(body.authenticated, false);
  assert.ok(body.requestId);
});

test("login failure paths include requestId", async (t) => {
  if (!(await requireServerOrSkip(t))) return;

  const email = `smoke-${Date.now()}@example.edu`;
  const password = "smoke-pass-123";

  const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(registerRes.status, 201);

  const wrongPasswordRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(wrongPasswordRes.status, 401);
  const wrongPasswordBody = await wrongPasswordRes.json();
  assert.ok(wrongPasswordBody.requestId);

  const unverifiedRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(unverifiedRes.status, 403);
  const unverifiedBody = await unverifiedRes.json();
  assert.equal(unverifiedBody.error, "email_not_verified");
  assert.ok(unverifiedBody.requestId);
});
