import assert from "node:assert/strict";
import test from "node:test";
import { parseFieldJob, parseFieldResult } from "./field";

const job = parseFieldJob({ assetRef: "LIF-014", assetType: "Horizontal Lifeline", site: "Northpoint Works", inspector: "Rory Chen", checklist: [{ id: "check-1", label: "Identity and markings legible" }, { id: "check-2", label: "Fixings secure" }] })!;
const jpeg = `data:image/jpeg;base64,${Buffer.alloc(1024).toString("base64")}`;
const signature = `data:image/png;base64,${Buffer.alloc(512).toString("base64")}`;
const valid = { results: { "check-1": "pass", "check-2": "na" }, notes: "Looks good", photos: [{ name: "a.jpg", dataUrl: jpeg, bytes: 1 }], signature };

test("phone results are accepted only when they match the job and stay within limits", () => {
  assert.ok(job);
  assert.equal(parseFieldJob({ ...job, checklist: [{ id: "x", label: "<script>" }] }), undefined);
  const parsed = parseFieldResult(valid, job);
  assert.ok((parsed?.photos[0].bytes ?? 0) >= 1024, "size is recomputed, not trusted");
  assert.equal(parseFieldResult({ ...valid, results: { ...valid.results, "check-9": "pass" } }, job), undefined, "unknown checklist id");
  assert.equal(parseFieldResult({ ...valid, results: { "check-1": "pass" } }, job), undefined, "missing result");
  assert.equal(parseFieldResult({ ...valid, photos: Array(4).fill(valid.photos[0]) }, job), undefined, "fourth photo");
  assert.equal(parseFieldResult({ ...valid, photos: [{ name: "big.jpg", dataUrl: `data:image/jpeg;base64,${Buffer.alloc(201 * 1024).toString("base64")}` }] }, job), undefined, "oversize photo");
  assert.equal(parseFieldResult({ ...valid, photos: [{ name: "a.png", dataUrl: signature }] }, job), undefined, "non-JPEG photo");
  assert.equal(parseFieldResult({ ...valid, signature: "" }, job), undefined, "missing signature");
});
