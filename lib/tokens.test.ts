import assert from "node:assert/strict";
import test from "node:test";
import { createDemoToken, verifyDemoToken } from "./tokens";

const secret = "demo-only-secret-with-at-least-32-chars";
const snapshot = { certificateNo: "CERT-1", assetRef: "HAR-001", assetType: "Harness", issuedDate: "2026-01-01", expiryDate: "2026-12-31", status: "Valid" as const, asOf: "2026-01-02T00:00:00.000Z" };

test("demo certificate tokens verify and reject tampering", () => {
  const token = createDemoToken(snapshot, secret, Date.parse("2026-01-02T00:00:00Z"));
  assert.equal(verifyDemoToken(token, secret, Date.parse("2026-01-02T01:00:00Z")).ok, true);
  const tampered = `${token.slice(0, -1)}x`;
  assert.equal(verifyDemoToken(tampered, secret).ok, false);
});

test("demo certificate tokens expire after their TTL", () => {
  const now = Date.parse("2026-01-02T00:00:00Z");
  const token = createDemoToken(snapshot, secret, now);
  assert.equal(verifyDemoToken(token, secret, now + 86_400_001).ok, false);
});
