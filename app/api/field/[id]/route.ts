import { NextResponse } from "next/server";
import { fieldStore, loadSession, parseFieldResult, redis, sameOrigin, sessionKey, uuidPattern, type FieldSession } from "@/lib/field";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store" };
const missing = () => NextResponse.json({ error: "This link has expired. Ask for a new QR." }, { status: 404, headers: noStore });
const unconfigured = () => NextResponse.json({ error: "Phone hand-off needs Upstash Redis (KV_REST_API_URL and KV_REST_API_TOKEN)." }, { status: 503 });
const unavailable = () => NextResponse.json({ error: "The phone link could not be reached. Try again." }, { status: 502 });

// The phone opens with ?phone=1 so the laptop can show "Phone connected"; the laptop polls without it.
export async function GET(request: Request, { params }: Context) {
  const store = fieldStore();
  if (!store) return unconfigured();
  const { id } = await params;
  if (!uuidPattern.test(id)) return missing();
  try {
    const session = await loadSession(store, id);
    if (!session) return missing();
    if (new URL(request.url).searchParams.get("phone") === "1" && session.status === "waiting") {
      session.status = "opened";
      await redis(store, ["SET", sessionKey(id), JSON.stringify(session), "XX", "KEEPTTL"]);
    }
    return NextResponse.json(session, { headers: noStore });
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
    const result = parseFieldResult(body, session.job);
    if (!result) return NextResponse.json({ error: "Answer every item and sign before submitting." }, { status: 400 });
    const next: FieldSession = { ...session, status: "submitted", result };
    await redis(store, ["SET", sessionKey(id), JSON.stringify(next), "XX", "KEEPTTL"]);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch { return unavailable(); }
}
