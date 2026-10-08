import { photoBytes } from "@/lib/photos";

// A phone hand-off session: the laptop posts the job, the phone posts the result, the laptop polls for it.
export type FieldJob = { assetRef: string; assetType: string; site: string; inspector: string; checklist: { id: string; label: string }[] };
export type FieldResult = { results: Record<string, "pass" | "fail" | "na">; notes: string; photos: { name: string; dataUrl: string; bytes: number }[]; signature: string };
export type FieldSession = { job: FieldJob; status: "waiting" | "opened" | "submitted"; result?: FieldResult };

export const SESSION_TTL_SECONDS = 30 * 60;
export const MAX_PHONE_PHOTOS = 3;
export const sessionKey = (id: string) => `field:${id}`;
// Set once, atomically, by the first phone to open the link; every later request must present it.
export const claimKey = (id: string) => `field:${id}:claim`;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isText = (value: unknown, max = 160): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\u0000-\u001f]/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const jpeg = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const png = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export function parseFieldJob(body: unknown): FieldJob | undefined {
  if (!isRecord(body) || ![body.assetRef, body.assetType, body.site, body.inspector].every((value) => isText(value)) || !Array.isArray(body.checklist) || !body.checklist.length || body.checklist.length > 12) return undefined;
  const checklist = body.checklist.map((item) => isRecord(item) && isText(item.id, 40) && isText(item.label, 200) ? { id: item.id, label: item.label } : undefined);
  if (checklist.some((item) => !item) || new Set(checklist.map((item) => item?.id)).size !== checklist.length) return undefined;
  return { assetRef: body.assetRef as string, assetType: body.assetType as string, site: body.site as string, inspector: body.inspector as string, checklist: checklist as FieldJob["checklist"] };
}

// The phone is untrusted: results must cover exactly the job's checklist, and sizes are recomputed here.
export function parseFieldResult(body: unknown, job: FieldJob): FieldResult | undefined {
  if (!isRecord(body) || !isRecord(body.results) || typeof body.notes !== "string" || body.notes.length > 2000 || !Array.isArray(body.photos) || body.photos.length > MAX_PHONE_PHOTOS || typeof body.signature !== "string") return undefined;
  const results = body.results;
  const ids = job.checklist.map((item) => item.id);
  if (Object.keys(results).length !== ids.length || !ids.every((id) => ["pass", "fail", "na"].includes(results[id] as string))) return undefined;
  const photos = body.photos.map((photo) => isRecord(photo) && isText(photo.name, 120) && typeof photo.dataUrl === "string" && jpeg.test(photo.dataUrl) && photoBytes(photo.dataUrl) <= 200 * 1024 ? { name: photo.name, dataUrl: photo.dataUrl, bytes: photoBytes(photo.dataUrl) } : undefined);
  if (photos.some((photo) => !photo) || !png.test(body.signature) || photoBytes(body.signature) > 60 * 1024) return undefined;
  return { results: results as FieldResult["results"], notes: body.notes, photos: photos as FieldResult["photos"], signature: body.signature };
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  try { return origin !== null && new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

type Store = { url: string; token: string };

// Upstash Redis REST settings from the Vercel Marketplace integration; same request shape as lib/whatsapp.ts.
export function fieldStore(env: Record<string, string | undefined> = process.env): Store | undefined {
  const url = env.KV_REST_API_URL?.trim();
  const token = env.KV_REST_API_TOKEN?.trim();
  return url?.startsWith("https://") && token ? { url: url.replace(/\/+$/, ""), token } : undefined;
}

export async function redis(store: Store, command: string[]): Promise<unknown> {
  const response = await fetch(store.url, { method: "POST", headers: { Authorization: `Bearer ${store.token}`, "Content-Type": "application/json" }, body: JSON.stringify(command), signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error("field-store");
  const value: unknown = await response.json();
  return isRecord(value) ? value.result : undefined;
}

export async function loadSession(store: Store, id: string): Promise<FieldSession | undefined> {
  const raw = await redis(store, ["GET", sessionKey(id)]);
  if (typeof raw !== "string") return undefined;
  try { return JSON.parse(raw) as FieldSession; } catch { return undefined; }
}
