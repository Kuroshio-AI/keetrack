import { createHmac, timingSafeEqual } from "node:crypto";

export const TOKEN_TTL_SECONDS = 24 * 60 * 60;

export type DemoTokenSnapshot = {
  certificateNo: string;
  assetRef: string;
  assetType: string;
  issuedDate: string;
  expiryDate: string;
  status: "Valid" | "Expired" | "Revoked" | "Superseded";
  asOf: string;
  exp: number;
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(value).digest());
}

export function createDemoToken(snapshot: Omit<DemoTokenSnapshot, "exp">, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error("DEMO_CERT_TOKEN_SECRET must be at least 32 characters");
  const payload: DemoTokenSnapshot = { ...snapshot, exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

function isSnapshot(value: unknown): value is DemoTokenSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoTokenSnapshot>;
  return [candidate.certificateNo, candidate.assetRef, candidate.assetType, candidate.issuedDate, candidate.expiryDate, candidate.status, candidate.asOf].every((item) => typeof item === "string")
    && ["Valid", "Expired", "Revoked", "Superseded"].includes(candidate.status as string)
    && typeof candidate.exp === "number" && Number.isSafeInteger(candidate.exp);
}

export function verifyDemoToken(token: string, secret: string, now = Date.now()): { ok: true; snapshot: DemoTokenSnapshot } | { ok: false; error: string } {
  if (secret.length < 32) return { ok: false, error: "Token verification is not configured" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "Invalid token" };
  const [encoded, provided] = parts;
  if (!encoded || !provided || token.length > 4096) return { ok: false, error: "Invalid token" };
  const expected = sign(encoded, secret);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, error: "Invalid token signature" };
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { return { ok: false, error: "Invalid token payload" }; }
  if (!isSnapshot(parsed)) return { ok: false, error: "Invalid token payload" };
  if (parsed.exp <= Math.floor(now / 1000)) return { ok: false, error: "This token has expired" };
  return { ok: true, snapshot: parsed };
}
