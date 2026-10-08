import { NextResponse } from "next/server";
import { SESSION_TTL_SECONDS, claimKey, fieldStore, loadSession, parseFieldResult, redis, sameOrigin, sessionKey, uuidPattern, type FieldSession } from "@/lib/field";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store" };
const missing = () => NextResponse.json({ error: "This link has expired. Ask for a new QR." }, { status: 404, headers: noStore });
const unconfigured = () => NextResponse.json({ error: "Phone hand-off needs Upstash Redis (KV_REST_API_URL and KV_REST_API_TOKEN)." }, { status: 503 });
const unavailable = () => NextResponse.json({ error: "The phone link could not be reached. Try again." }, { status: 502 });
const elsewhere = () => NextResponse.json({ error: "This inspection is already in progress on another phone." }, { status: 409, headers: noStore });

// The phone opens with ?phone=1 (plus its claim on reload) and is locked in as the only phone; the laptop polls without it.
export async function GET(request: Request, { params }: Context) {
  const store = fieldStore();
  if (!store) return unconfigured();
  const { id } = await params;
  if (!uuidPattern.test(id)) return missing();
  try {
    const session = await loadSession(store, id);
    if (!session) return missing();
    const query = new URL(request.url).searchParams;
    if (query.get("phone") !== "1" || session.status === "submitted") return NextResponse.json(session, { headers: noStore });
    const fresh = crypto.randomUUID();
    const won = await redis(store, ["SET", claimKey(id), fresh, "NX", "EX", String(SESSION_TTL_SECONDS)]) === "OK";
    const claim = won ? fresh : query.get("claim");
    if (!won && (!claim || await redis(store, ["GET", claimKey(id)]) !== claim)) return elsewhere();
    if (session.status === "waiting") {
      session.status = "opened";
      await redis(store, ["SET", sessionKey(id), JSON.stringify(session), "XX", "KEEPTTL"]);
    }
    return NextResponse.json({ ...session, claim }, { headers: noStore });
  } catch { return unavailable(); }
}

export async function POST(request: Request, { params }: Context) {
  const store = fieldStore();
  if (!store) return unconfigured();
  const { id } = await params;
  if (!uuidPattern.test(id)) return missing();
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  const text = await request.text();
  if (text.length > 1_200_000) return NextResponse.json({ error: "Photos are too large to send" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const session = await loadSession(store, id);
    if (!session) return missing();
    if (session.status === "submitted") return NextResponse.json({ error: "This inspection was already submitted." }, { status: 409 });
    const claim = body && typeof body === "object" ? (body as { claim?: unknown }).claim : undefined;
    if (typeof claim !== "string" || await redis(store, ["GET", claimKey(id)]) !== claim) return elsewhere();
    const result = parseFieldResult(body, session.job);
    if (!result) return NextResponse.json({ error: "Answer every item and sign before submitting." }, { status: 400 });
    const next: FieldSession = { ...session, status: "submitted", result };
    await redis(store, ["SET", sessionKey(id), JSON.stringify(next), "XX", "KEEPTTL"]);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch { return unavailable(); }
}
