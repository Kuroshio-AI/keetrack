import assert from "node:assert/strict";
import test from "node:test";
import {
  handleWhatsAppDelete,
  handleWhatsAppGet,
  handleWhatsAppPost,
  handleWhatsAppSetup,
  resetWhatsAppRuntimeForTests,
  WHATSAPP_AUTH_TTL_MS,
  WHATSAPP_AUTH_COOKIE_NAME,
  type WhatsAppFetch,
} from "./whatsapp";

const baseUrl = "https://keetrack.example/api/alerts/whatsapp";
const env = {
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "b".repeat(32),
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
  TWILIO_WHATSAPP_TO: "whatsapp:+15551234567",
  TWILIO_WHATSAPP_CONTENT_SID: `HX${"c".repeat(32)}`,
  WHATSAPP_DEMO_SEND_KEY: "demo-key-" + "d".repeat(32),
};
const messageSid = `MM${"e".repeat(32)}`;

function request(body: unknown, key = env.WHATSAPP_DEMO_SEND_KEY, headers: Record<string, string> = {}): Request {
  return new Request(baseUrl, {
    method: "POST",
    headers: { Origin: "https://keetrack.example", "Content-Type": "application/json", "x-keetrack-demo-key": key, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function cookieRequest(body: unknown, cookie: string, headers: Record<string, string> = {}): Request {
  return new Request(baseUrl, {
    method: "POST",
    headers: { Origin: "https://keetrack.example", "Content-Type": "application/json", Cookie: cookie, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(cookie?: string, url = baseUrl): Request {
  return new Request(url, {
    headers: { Origin: "https://keetrack.example", ...(cookie ? { Cookie: cookie } : {}) },
  });
}

function setupRequest(key = env.WHATSAPP_DEMO_SEND_KEY, url = baseUrl, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { Origin: "https://keetrack.example", "Content-Type": "application/json", "x-keetrack-demo-key": key, ...headers },
    body: "{}",
  });
}

function deleteRequest(url = baseUrl, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "DELETE", headers: { Origin: "https://keetrack.example", ...headers } });
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  return value.split(";", 1)[0];
}

function acceptedFetch(calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>): WhatsAppFetch {
  return async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ sid: messageSid, status: "queued" }), { status: 201 });
  };
}

test.beforeEach(() => resetWhatsAppRuntimeForTests());

test("GET exposes only configuration state and masked recipient", async () => {
  const response = handleWhatsAppGet(getRequest(), { env });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(body, { configured: true, authorized: false, recipientLabel: "WhatsApp ending in •••• 4567" });
  assert.equal(JSON.stringify(body).includes("+15551234567"), false);
  assert.equal(handleWhatsAppGet(getRequest(), { env: {} }).status, 200);
  assert.deepEqual(await handleWhatsAppGet(getRequest(), { env: {} }).json(), { configured: false, authorized: false });
});

test("setup creates a signed 30-day browser cookie without contacting Twilio", async () => {
  let providerCalls = 0;
  const response = handleWhatsAppSetup(setupRequest(), { env, now: () => 1_000, fetch: async () => { providerCalls += 1; return new Response(); } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authorized: true });
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, new RegExp(`^${WHATSAPP_AUTH_COOKIE_NAME}=`));
  assert.match(setCookie, /Max-Age=2592000/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api\/alerts\/whatsapp/);
  assert.match(setCookie, /Secure/);
  assert.equal(setCookie.includes(env.WHATSAPP_DEMO_SEND_KEY), false);
  assert.equal(providerCalls, 0);
  const cookie = cookieFrom(response);
  const authorized = handleWhatsAppGet(getRequest(cookie), { env, now: () => 1_001 });
  assert.deepEqual(await authorized.json(), { configured: true, authorized: true, recipientLabel: "WhatsApp ending in •••• 4567" });
});

test("authorization cookie rejects tampering, expiry and key rotation", async () => {
  const setup = handleWhatsAppSetup(setupRequest(), { env, now: () => 1_000 });
  const cookie = cookieFrom(setup);
  const [name, value] = cookie.split("=", 2);
  const tampered = `${name}=${value.slice(0, -1)}${value.endsWith("a") ? "b" : "a"}`;
  assert.equal((await handleWhatsAppGet(getRequest(tampered), { env, now: () => 1_001 }).json() as Record<string, unknown>).authorized, false);
  assert.equal((await handleWhatsAppGet(getRequest(cookie), { env, now: () => WHATSAPP_AUTH_TTL_MS + 1_000 }).json() as Record<string, unknown>).authorized, false);
  const rotatedEnv = { ...env, WHATSAPP_DEMO_SEND_KEY: "rotated-key-" + "r".repeat(32) };
  assert.equal((await handleWhatsAppGet(getRequest(cookie), { env: rotatedEnv, now: () => 1_001 }).json() as Record<string, unknown>).authorized, false);
});

test("setup and logout require same-origin requests and logout expires the cookie", async () => {
  const wrongSetup = handleWhatsAppSetup(setupRequest(env.WHATSAPP_DEMO_SEND_KEY, baseUrl, { Origin: "https://evil.example" }), { env });
  assert.equal(wrongSetup.status, 403);
  const wrongKey = handleWhatsAppSetup(setupRequest("wrong-key"), { env });
  assert.equal(wrongKey.status, 401);
  const setup = handleWhatsAppSetup(setupRequest(), { env, now: () => 1_000 });
  const cookie = cookieFrom(setup);
  const logout = handleWhatsAppDelete(deleteRequest());
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { authorized: false });
  const cleared = logout.headers.get("set-cookie") ?? "";
  assert.match(cleared, new RegExp(`^${WHATSAPP_AUTH_COOKIE_NAME}=`));
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
  assert.equal(handleWhatsAppDelete(deleteRequest(baseUrl, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await handleWhatsAppGet(getRequest(cookie), { env, now: () => 1_001 }).json() as Record<string, unknown>).authorized, true);
});

test("invalid demo access key fails before any Twilio fetch", async () => {
  let calls = 0;
  const response = await handleWhatsAppPost(request({ alertId: "alert-1" }, "wrong-key"), { env, fetch: async () => { calls += 1; return new Response(); } });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("a valid browser cookie authorizes sending without resending the demo key", async () => {
  const setup = handleWhatsAppSetup(setupRequest(), { env, now: () => 1_000 });
  const cookie = cookieFrom(setup);
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const response = await handleWhatsAppPost(cookieRequest({ alertId: "alert-cookie" }, cookie), { env, fetch: acceptedFetch(calls), now: () => 1_001 });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("invalid origin, content type, extra fields and unsafe ids are rejected", async () => {
  const wrongOrigin = await handleWhatsAppPost(request({ alertId: "alert-1" }, env.WHATSAPP_DEMO_SEND_KEY, { Origin: "https://evil.example" }), { env });
  assert.equal(wrongOrigin.status, 403);
  const wrongType = await handleWhatsAppPost(request({ alertId: "alert-1" }, env.WHATSAPP_DEMO_SEND_KEY, { "Content-Type": "text/plain" }), { env });
  assert.equal(wrongType.status, 415);
  const extraField = await handleWhatsAppPost(request({ alertId: "alert-1", body: "private" }), { env });
  assert.equal(extraField.status, 400);
  const unsafeId = await handleWhatsAppPost(request({ alertId: "alert/1" }), { env });
  assert.equal(unsafeId.status, 400);
  const oversized = await handleWhatsAppPost(request(JSON.stringify({ alertId: "alert-1", pad: "x".repeat(2_100) })), { env });
  assert.equal(oversized.status, 413);
});

test("same-origin uses the actual Host header when Next normalizes Request.url", async () => {
  const localRequest = new Request("http://localhost:3001/api/alerts/whatsapp", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:3001",
      Host: "127.0.0.1:3001",
      "Content-Type": "application/json",
      "x-keetrack-demo-key": env.WHATSAPP_DEMO_SEND_KEY,
    },
    body: JSON.stringify({ alertId: "host-header" }),
  });
  const accepted = await handleWhatsAppPost(localRequest, { env, fetch: acceptedFetch([]), now: () => 1_000 });
  assert.equal(accepted.status, 200);

  resetWhatsAppRuntimeForTests();
  const hostileOrigin = new Request("http://localhost:3001/api/alerts/whatsapp", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3001",
      Host: "127.0.0.1:3001",
      "Content-Type": "application/json",
      "x-keetrack-demo-key": env.WHATSAPP_DEMO_SEND_KEY,
    },
    body: JSON.stringify({ alertId: "host-header" }),
  });
  assert.equal((await handleWhatsAppPost(hostileOrigin, { env, fetch: acceptedFetch([]), now: () => 1_000 })).status, 403);

  resetWhatsAppRuntimeForTests();
  const secureAlias = new Request("https://localhost:3443/api/alerts/whatsapp", {
    method: "POST",
    headers: {
      Origin: "https://127.0.0.1:3443",
      Host: "127.0.0.1:3443",
      "Content-Type": "application/json",
      "x-keetrack-demo-key": env.WHATSAPP_DEMO_SEND_KEY,
    },
    body: JSON.stringify({ alertId: "https-alias" }),
  });
  assert.equal((await handleWhatsAppPost(secureAlias, { env, fetch: acceptedFetch([]), now: () => 1_000 })).status, 200);
});

test("Twilio receives only fixed addresses and content template fields", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const response = await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch: acceptedFetch(calls), now: () => 1_000 });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, status: "accepted" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`);
  const form = new URLSearchParams(String(calls[0].init?.body));
  assert.deepEqual([...form.keys()].sort(), ["ContentSid", "From", "To"].sort());
  assert.equal(form.get("To"), env.TWILIO_WHATSAPP_TO);
  assert.equal(form.get("From"), env.TWILIO_WHATSAPP_FROM);
  assert.equal(form.get("ContentSid"), env.TWILIO_WHATSAPP_CONTENT_SID);
  assert.equal(form.has("Body"), false);
  assert.equal(calls[0].init?.headers && new Headers(calls[0].init.headers).get("authorization"), `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`);
});

test("success replay is deduplicated and cooldown applies per instance", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetch = acceptedFetch(calls);
  assert.equal((await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch, now: () => 1_000 })).status, 200);
  assert.equal((await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch, now: () => 1_001 })).status, 200);
  assert.equal((await handleWhatsAppPost(request({ alertId: "alert-2" }), { env, fetch, now: () => 1_002 })).status, 429);
  assert.equal(calls.length, 1);
  assert.equal((await handleWhatsAppPost(request({ alertId: "alert-2" }), { env, fetch, now: () => 4_001 })).status, 200);
  assert.equal(calls.length, 2);
});

test("ambiguous provider results are cached and never claim delivery", async () => {
  let calls = 0;
  const fetch: WhatsAppFetch = async () => { calls += 1; throw new Error("network"); };
  const first = await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch, now: () => 1_000 });
  const second = await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch, now: () => 1_001 });
  assert.equal(first.status, 503);
  assert.deepEqual(await first.clone().json(), { error: "WhatsApp status is unconfirmed. Check Twilio before retrying." });
  assert.equal(second.status, 503);
  assert.deepEqual(await second.json(), { error: "WhatsApp status is unconfirmed. Check Twilio before retrying." });
  assert.equal(calls, 1);
});

test("provider rejection and malformed accepted response are redacted", async () => {
  const rejected = await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch: async () => new Response("secret provider body", { status: 401 }), now: () => 1_000 });
  assert.equal(rejected.status, 502);
  assert.deepEqual(await rejected.json(), { error: "Twilio rejected the trial message; no acceptance was returned." });
  resetWhatsAppRuntimeForTests();
  const malformed = await handleWhatsAppPost(request({ alertId: "alert-1" }), { env, fetch: async () => new Response(JSON.stringify({ sid: "MMbad", status: "queued" }), { status: 201 }), now: () => 1_000 });
  assert.equal(malformed.status, 503);
});
