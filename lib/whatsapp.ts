import { createHash, timingSafeEqual } from "node:crypto";

export const TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts";
export const WHATSAPP_MAX_BODY_BYTES = 2_048;
export const WHATSAPP_COOLDOWN_MS = 3_000;
export const WHATSAPP_REPLAY_TTL_MS = 10 * 60 * 1_000;
export const WHATSAPP_REPLAY_MAX = 500;

const acceptedProviderStatuses = new Set(["accepted", "queued", "sending", "scheduled", "sent", "delivered"]);
const accountSidPattern = /^AC[a-f0-9]{32}$/i;
const authTokenPattern = /^[A-Za-z0-9]{32,128}$/;
const whatsappAddressPattern = /^whatsapp:\+\d{8,15}$/;
const contentSidPattern = /^HX[a-f0-9]{32}$/i;
const demoKeyPattern = /^[\x21-\x7e]{32,256}$/;
const alertIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const twilioMessageSidPattern = /^(?:SM|MM)[a-f0-9]{32}$/i;

type Environment = Readonly<Record<string, string | undefined>>;

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  contentSid: string;
  demoKey: string;
};

export type WhatsAppFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type HandlerOptions = {
  env?: Environment;
  fetch?: WhatsAppFetch;
  now?: () => number;
};

type CachedResponse = {
  expiresAt: number;
  status: number;
  body: Record<string, unknown>;
};

type ProviderResult =
  | { kind: "accepted"; providerStatus: string }
  | { kind: "rejected" }
  | { kind: "ambiguous" };

let lastAttemptAt: number | undefined;
let inFlight = false;
const replayCache = new Map<string, CachedResponse>();

// ponytail: this is intentionally a small warm-instance guard. Cold starts and multiple instances can reset or bypass it; the server-side demo key and Twilio-side checks remain the real boundary.
export function resetWhatsAppRuntimeForTests(): void {
  lastAttemptAt = undefined;
  inFlight = false;
  replayCache.clear();
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function textValue(env: Environment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function getTwilioConfig(env: Environment = process.env): TwilioConfig | undefined {
  const accountSid = textValue(env, "TWILIO_ACCOUNT_SID");
  const authToken = textValue(env, "TWILIO_AUTH_TOKEN");
  const from = textValue(env, "TWILIO_WHATSAPP_FROM");
  const to = textValue(env, "TWILIO_WHATSAPP_TO");
  const contentSid = textValue(env, "TWILIO_WHATSAPP_CONTENT_SID");
  const demoKey = textValue(env, "WHATSAPP_DEMO_SEND_KEY");
  if (!accountSid || !authToken || !from || !to || !contentSid || !demoKey) return undefined;
  if (!accountSidPattern.test(accountSid) || !authTokenPattern.test(authToken) || !whatsappAddressPattern.test(from) || !whatsappAddressPattern.test(to) || !contentSidPattern.test(contentSid) || !demoKeyPattern.test(demoKey)) return undefined;
  return { accountSid, authToken, from, to, contentSid, demoKey };
}

function sameOrigin(request: Request): boolean {
  const supplied = request.headers.get("origin");
  if (!supplied) return false;
  try { return new URL(supplied).origin === new URL(request.url).origin; } catch { return false; }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number.isSafeInteger(Number(declaredLength)) && Number(declaredLength) > WHATSAPP_MAX_BODY_BYTES) throw new Error("too-large");
  if (!request.body) {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > WHATSAPP_MAX_BODY_BYTES) throw new Error("too-large");
    return text;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > WHATSAPP_MAX_BODY_BYTES) throw new Error("too-large");
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function parseAlertId(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const candidate = value as Record<string, unknown>;
    if (Object.keys(candidate).length !== 1 || Object.keys(candidate)[0] !== "alertId") return undefined;
    return typeof candidate.alertId === "string" && alertIdPattern.test(candidate.alertId) ? candidate.alertId : undefined;
  } catch { return undefined; }
}

function pruneReplayCache(now: number): void {
  for (const [key, value] of replayCache) if (value.expiresAt <= now) replayCache.delete(key);
}

function getCachedResponse(alertId: string, now: number): CachedResponse | undefined {
  pruneReplayCache(now);
  return replayCache.get(alertId);
}

function cacheResponse(alertId: string, now: number, status: number, body: Record<string, unknown>): void {
  pruneReplayCache(now);
  while (replayCache.size >= WHATSAPP_REPLAY_MAX) {
    const first = replayCache.keys().next().value;
    if (first === undefined) break;
    replayCache.delete(first);
  }
  replayCache.set(alertId, { expiresAt: now + WHATSAPP_REPLAY_TTL_MS, status, body });
}

async function sendToTwilio(config: TwilioConfig, fetchImpl: WhatsAppFetch): Promise<ProviderResult> {
  const body = new URLSearchParams({ To: config.to, From: config.from, ContentSid: config.contentSid });
  let response: Response;
  try {
    response = await fetchImpl(`${TWILIO_MESSAGES_URL}/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch { return { kind: "ambiguous" }; }

  if (response.status !== 201) return response.status >= 400 && response.status < 500 ? { kind: "rejected" } : { kind: "ambiguous" };
  let text: string;
  try { text = await response.text(); } catch { return { kind: "ambiguous" }; }
  if (text.length > 16_384) return { kind: "ambiguous" };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return { kind: "ambiguous" };
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.sid !== "string" || !twilioMessageSidPattern.test(candidate.sid) || typeof candidate.status !== "string" || !acceptedProviderStatuses.has(candidate.status.toLowerCase())) return { kind: "ambiguous" };
    return { kind: "accepted", providerStatus: candidate.status.toLowerCase() };
  } catch { return { kind: "ambiguous" }; }
}

export function handleWhatsAppGet(env: Environment = process.env): Response {
  const config = getTwilioConfig(env);
  return json({ configured: Boolean(config), ...(config ? { recipientLabel: `WhatsApp ending in •••• ${config.to.slice(-4)}` } : {}) });
}

export async function handleWhatsAppPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const config = getTwilioConfig(options.env);
  if (!config) return json({ error: "WhatsApp trial is not configured." }, 503);
  if (!sameOrigin(request)) return json({ error: "Same-origin request required." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "Content-Type must be application/json." }, 415);
  const suppliedKey = request.headers.get("x-keetrack-demo-key") ?? "";
  if (!constantTimeEqual(suppliedKey, config.demoKey)) return json({ error: "Invalid demo access key." }, 401);

  let text: string;
  try { text = await readBoundedBody(request); } catch (error) { return json({ error: error instanceof Error && error.message === "too-large" ? "Request is too large." : "Request body could not be read." }, 413); }
  const alertId = parseAlertId(text);
  if (!alertId) return json({ error: "Request must contain only a safe alertId." }, 400);

  const now = options.now?.() ?? Date.now();
  const cached = getCachedResponse(alertId, now);
  if (cached) return json(cached.body, cached.status);
  if (inFlight) return json({ error: "Another WhatsApp trial send is in progress." }, 429);
  if (lastAttemptAt !== undefined && now - lastAttemptAt < WHATSAPP_COOLDOWN_MS) return json({ error: "Please wait before sending another WhatsApp trial message." }, 429);

  lastAttemptAt = now;
  inFlight = true;
  try {
    const result = await sendToTwilio(config, options.fetch ?? globalThis.fetch);
    if (result.kind === "accepted") {
      const body = { accepted: true, status: "accepted" };
      cacheResponse(alertId, now, 200, body);
      return json(body);
    }
    if (result.kind === "ambiguous") {
      const body = { error: "WhatsApp status is unconfirmed. Check Twilio before retrying." };
      cacheResponse(alertId, now, 503, body);
      return json(body, 503);
    }
    return json({ error: "Twilio rejected the trial message; no acceptance was returned." }, 502);
  } finally {
    inFlight = false;
  }
}
