import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts";
export const WHATSAPP_MAX_BODY_BYTES = 2_048;
export const WHATSAPP_COOLDOWN_MS = 3_000;
export const WHATSAPP_REPLAY_TTL_MS = 10 * 60 * 1_000;
export const WHATSAPP_REPLAY_MAX = 500;
export const WHATSAPP_AUTH_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const WHATSAPP_AUTH_COOKIE_NAME = "keetrack_whatsapp_auth";

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

const WHATSAPP_AUTH_PURPOSE = "keetrack-whatsapp-browser-authorization-v1";

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

function json(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json", ...extraHeaders },
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
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") return false;
    const hostHeader = request.headers.get("host");
    const host = hostHeader?.trim();
    if (hostHeader !== null && !host) return false;
    const expectedUrl = host ? new URL(`${requestUrl.protocol}//${host}`) : new URL(requestUrl.origin);
    const suppliedUrl = new URL(supplied);
    if (suppliedUrl.protocol !== "http:" && suppliedUrl.protocol !== "https:") return false;
    if (expectedUrl.username || expectedUrl.password || suppliedUrl.username || suppliedUrl.password) return false;
    if (expectedUrl.pathname !== "/" || expectedUrl.search || expectedUrl.hash || suppliedUrl.pathname !== "/" || suppliedUrl.search || suppliedUrl.hash) return false;
    return suppliedUrl.origin === expectedUrl.origin;
  } catch { return false; }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function signAuthorizationExpiry(expiry: number, demoKey: string): string {
  return createHmac("sha256", demoKey).update(`${WHATSAPP_AUTH_PURPOSE}|${expiry}`).digest("base64url");
}

function authorizationCookieValue(expiry: number, demoKey: string): string {
  return `v1.${expiry}.${signAuthorizationExpiry(expiry, demoKey)}`;
}

function readCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === WHATSAPP_AUTH_COOKIE_NAME) return part.slice(separator + 1).trim();
  }
  return undefined;
}

function hasValidAuthorizationCookie(request: Request, demoKey: string, now: number): boolean {
  const value = readCookie(request);
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expiry = Number(parts[1]);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + WHATSAPP_AUTH_TTL_MS) return false;
  const expected = signAuthorizationExpiry(expiry, demoKey);
  const supplied = parts[2];
  if (!/^[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
  return constantTimeEqual(supplied, expected);
}

function cookieHeader(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${WHATSAPP_AUTH_COOKIE_NAME}=${value}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict; Path=/api/alerts/whatsapp${secure}`;
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

function hasDemoKey(request: Request, config: TwilioConfig): boolean {
  return constantTimeEqual(request.headers.get("x-keetrack-demo-key") ?? "", config.demoKey);
}

export function handleWhatsAppGet(request: Request, options: HandlerOptions = {}): Response {
  const config = getTwilioConfig(options.env);
  const now = options.now?.() ?? Date.now();
  const authorized = Boolean(config && hasValidAuthorizationCookie(request, config.demoKey, now));
  return json({ configured: Boolean(config), authorized, ...(config ? { recipientLabel: `WhatsApp ending in •••• ${config.to.slice(-4)}` } : {}) });
}

export function handleWhatsAppSetup(request: Request, options: HandlerOptions = {}): Response {
  const config = getTwilioConfig(options.env);
  if (!config) return json({ error: "WhatsApp trial is not configured." }, 503);
  if (!sameOrigin(request)) return json({ error: "Same-origin request required." }, 403);
  if (!hasDemoKey(request, config)) return json({ error: "Invalid demo access key." }, 401);
  const now = options.now?.() ?? Date.now();
  const expiry = now + WHATSAPP_AUTH_TTL_MS;
  return json({ authorized: true }, 200, { "Set-Cookie": cookieHeader(request, authorizationCookieValue(expiry, config.demoKey), Math.floor(WHATSAPP_AUTH_TTL_MS / 1_000)) });
}

export function handleWhatsAppDelete(request: Request): Response {
  if (!sameOrigin(request)) return json({ error: "Same-origin request required." }, 403);
  return json({ authorized: false }, 200, { "Set-Cookie": cookieHeader(request, "", 0) });
}

export async function handleWhatsAppPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const config = getTwilioConfig(options.env);
  if (!config) return json({ error: "WhatsApp trial is not configured." }, 503);
  if (!sameOrigin(request)) return json({ error: "Same-origin request required." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "Content-Type must be application/json." }, 415);
  const now = options.now?.() ?? Date.now();
  if (!hasValidAuthorizationCookie(request, config.demoKey, now) && !hasDemoKey(request, config)) return json({ error: "WhatsApp authorization required." }, 401);

  let text: string;
  try { text = await readBoundedBody(request); } catch (error) { return json({ error: error instanceof Error && error.message === "too-large" ? "Request is too large." : "Request body could not be read." }, 413); }
  const alertId = parseAlertId(text);
  if (!alertId) return json({ error: "Request must contain only a safe alertId." }, 400);

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
