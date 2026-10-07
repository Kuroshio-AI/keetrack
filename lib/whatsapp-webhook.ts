import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const WHATSAPP_WEBHOOK_MAX_BODY_BYTES = 1_048_576;

type Environment = Readonly<Record<string, string | undefined>>;

export type WhatsAppWebhookConfig = Readonly<{
  appSecret: string;
  verifyToken: string;
}>;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

function rawValue(env: Environment, name: string): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validSetting(value: string | undefined): value is string {
  return Boolean(value && value.length <= 4_096 && !/[\r\n\u0000]/.test(value));
}

export function getWhatsAppWebhookConfig(env: Environment = process.env): WhatsAppWebhookConfig | undefined {
  const appSecret = rawValue(env, "META_APP_SECRET");
  const verifyToken = rawValue(env, "META_WHATSAPP_VERIFY_TOKEN");
  if (!validSetting(appSecret) || !validSetting(verifyToken)) return undefined;
  return { appSecret, verifyToken };
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

function signatureBytes(value: string | null): Buffer | undefined {
  if (!value || !/^sha256=[0-9a-f]{64}$/i.test(value)) return undefined;
  return Buffer.from(value.slice("sha256=".length), "hex");
}

export function verifyWhatsAppSignature(body: Uint8Array, signature: string | null, appSecret: string): boolean {
  const supplied = signatureBytes(signature);
  if (!supplied || !validSetting(appSecret)) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function readBoundedBytes(request: Request): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isSafeInteger(Number(declaredLength)) && Number(declaredLength) > WHATSAPP_WEBHOOK_MAX_BODY_BYTES) throw new Error("too-large");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > WHATSAPP_WEBHOOK_MAX_BODY_BYTES) throw new Error("too-large");
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isWhatsAppWebhookEvent(value: unknown): boolean {
  if (!isRecord(value) || value.object !== "whatsapp_business_account" || !Array.isArray(value.entry) || value.entry.length < 1) return false;
  let changeCount = 0;
  for (const entry of value.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes) || entry.changes.length < 1) return false;
    changeCount += entry.changes.length;
    if (changeCount > 1_000) return false;
    if (!entry.changes.every((change) => isRecord(change) && change.field === "messages" && isRecord(change.value))) return false;
  }
  return true;
}

function parseEvent(bytes: Uint8Array): unknown | undefined {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(decoded) as unknown;
  } catch {
    return undefined;
  }
}

export function handleWhatsAppWebhookGet(request: Request, env: Environment = process.env): Response {
  const config = getWhatsAppWebhookConfig(env);
  if (!config) return json({ error: "WhatsApp webhook is not configured." }, 503);
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return text("Forbidden", 403);
  }
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !verifyToken || challenge === null || challenge.length === 0 || challenge.length > 4_096 || !constantTimeStringEqual(verifyToken, config.verifyToken)) return text("Forbidden", 403);
  return text(challenge);
}

export async function handleWhatsAppWebhookPost(request: Request, env: Environment = process.env): Promise<Response> {
  const config = getWhatsAppWebhookConfig(env);
  if (!config) return json({ error: "WhatsApp webhook is not configured." }, 503);
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBytes(request);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "too-large" ? "Webhook payload is too large." : "Webhook payload could not be read." }, 413);
  }
  if (!verifyWhatsAppSignature(bytes, request.headers.get("x-hub-signature-256"), config.appSecret)) return json({ error: "Invalid webhook signature." }, 401);
  const event = parseEvent(bytes);
  if (!isWhatsAppWebhookEvent(event)) return json({ error: "Invalid WhatsApp webhook event." }, 400);
  // This demo authenticates and acknowledges callbacks only. It does not persist them,
  // send inbound replies, or use them to mark local alerts delivered.
  return json({ received: true });
}
