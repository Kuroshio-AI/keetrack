import { NextResponse } from "next/server";
import { SESSION_TTL_SECONDS, fieldStore, parseFieldJob, redis, sameOrigin, sessionKey } from "@/lib/field";

export const runtime = "nodejs";

// ponytail: sessions are unauthenticated, bounded only by the 30-minute expiry and 8KB job size; add a rate limit if this leaves the demo.
export async function POST(request: Request) {
  const store = fieldStore();
  if (!store) return NextResponse.json({ error: "Phone hand-off needs Upstash Redis (KV_REST_API_URL and KV_REST_API_TOKEN)." }, { status: 503 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  const text = await request.text();
  if (text.length > 8_192) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const job = parseFieldJob(body);
  if (!job) return NextResponse.json({ error: "Inspection details are invalid" }, { status: 400 });
  let origin: string;
  try { const url = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url); if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol"); origin = url.origin; } catch { return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is invalid" }, { status: 500 }); }
  const id = crypto.randomUUID();
  try { await redis(store, ["SET", sessionKey(id), JSON.stringify({ job, status: "waiting" }), "EX", String(SESSION_TTL_SECONDS)]); }
  catch { return NextResponse.json({ error: "The phone link could not be saved. Try again." }, { status: 502 }); }
  return NextResponse.json({ id, url: `${origin}/field/${id}` }, { headers: { "Cache-Control": "no-store" } });
}
