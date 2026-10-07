import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  WHATSAPP_WEBHOOK_MAX_BODY_BYTES,
  handleWhatsAppWebhookGet,
  handleWhatsAppWebhookPost,
  verifyWhatsAppSignature,
} from "./whatsapp-webhook";

const baseUrl = "https://keetrack.example/api/webhooks/whatsapp";
const env = { META_APP_SECRET: "app-secret", META_WHATSAPP_VERIFY_TOKEN: "verify-token" };

function eventBody(): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: [{ text: "olá" }] } }] }],
  });
}

function batchedEvent(entryCount: number, changesPerEntry: number): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: Array.from({ length: entryCount }, () => ({
      changes: Array.from({ length: changesPerEntry }, () => ({ field: "messages", value: {} })),
    })),
  });
}

function signature(body: Uint8Array | string, secret = env.META_APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function post(body: Uint8Array | string, headers: Record<string, string> = {}): Request {
  return new Request(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  });
}

test("webhook GET returns the challenge only after valid Meta verification", async () => {
  const request = new Request(`${baseUrl}?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123`);
  const response = handleWhatsAppWebhookGet(request, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await response.text(), "challenge-123");
  assert.equal((await handleWhatsAppWebhookGet(new Request(`${baseUrl}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`), env)).status, 403);
  assert.equal((await handleWhatsAppWebhookGet(new Request(`${baseUrl}?hub.mode=subscribe&hub.verify_token=verify-token`), env)).status, 403);
  assert.equal((await handleWhatsAppWebhookGet(new Request(`${baseUrl}?hub.verify_token=verify-token&hub.challenge=challenge-123`), env)).status, 403);
});

test("webhook POST verifies the HMAC over raw non-ASCII bytes and acknowledges valid events", async () => {
  const raw = new TextEncoder().encode(eventBody());
  assert.equal(verifyWhatsAppSignature(raw, signature(raw), env.META_APP_SECRET), true);
  assert.equal(verifyWhatsAppSignature(new TextEncoder().encode(`${eventBody()} `), signature(raw), env.META_APP_SECRET), false);
  const response = await handleWhatsAppWebhookPost(post(raw, { "X-Hub-Signature-256": signature(raw) }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
});

test("webhook POST rejects unavailable config, bad signatures and malformed envelopes", async () => {
  const raw = new TextEncoder().encode(eventBody());
  assert.equal((await handleWhatsAppWebhookPost(post(raw, { "X-Hub-Signature-256": signature(raw) }), {})).status, 503);
  assert.equal((await handleWhatsAppWebhookPost(post(raw), env)).status, 401);
  assert.equal((await handleWhatsAppWebhookPost(post(raw, { "X-Hub-Signature-256": signature(raw, "other-secret") }), env)).status, 401);

  const malformed = "{not-json";
  const malformedResponse = await handleWhatsAppWebhookPost(post(malformed, { "X-Hub-Signature-256": signature(malformed) }), env);
  assert.equal(malformedResponse.status, 400);
  const invalidEnvelope = JSON.stringify({ object: "other", entry: [] });
  const invalidResponse = await handleWhatsAppWebhookPost(post(invalidEnvelope, { "X-Hub-Signature-256": signature(invalidEnvelope) }), env);
  assert.equal(invalidResponse.status, 400);
});

test("webhook POST enforces the bounded streaming body limit", async () => {
  const raw = new Uint8Array(WHATSAPP_WEBHOOK_MAX_BODY_BYTES + 1);
  raw.fill(0x20);
  const response = await handleWhatsAppWebhookPost(post(raw, { "X-Hub-Signature-256": signature(raw) }), env);
  assert.equal(response.status, 413);
});

test("webhook accepts more than 100 changes when the aggregate batch stays within 1000", async () => {
  const raw = new TextEncoder().encode(batchedEvent(101, 1));
  const response = await handleWhatsAppWebhookPost(post(raw, { "X-Hub-Signature-256": signature(raw) }), env);
  assert.equal(response.status, 200);
});

test("webhook rejects an aggregate batch over 1000 changes across entries", async () => {
  const raw = new TextEncoder().encode(batchedEvent(2, 501));
  const response = await handleWhatsAppWebhookPost(post(raw, { "X-Hub-Signature-256": signature(raw) }), env);
  assert.equal(response.status, 400);
});
