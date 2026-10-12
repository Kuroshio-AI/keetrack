import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createInspection, deleteRecord, nextDeadline, parseWarranty, removeWarranty, revokeWarranty, rowToRecord, saveWarranty, validateStoredState, warrantyFor } from "./domain";
import type { RegisterRow } from "./types";

const typed = { number: "KS-W-2021-118", product: "KeeLine® Horizontal Lifeline System", warrantyDate: "2021-11-01", years: 5, project: "Marina Tower" };
const newAsset: RegisterRow = { assetRef: "KL-0420", recordType: "equipment", assetType: "Horizontal Lifeline", site: "Marina Tower", owner: "Emaar", status: "Active" };

test("typed-in warranties are validated, stored with their asset and override the derived one", () => {
  assert.match(parseWarranty({ ...typed, warrantyDate: "" }).error ?? "", /date/);
  assert.match(parseWarranty({ ...typed, years: 0 }).error ?? "", /Duration/);
  assert.match(parseWarranty({ ...typed, number: "<b>1</b>" }).error ?? "", /number/);
  const warranty = parseWarranty({ ...typed, contractNo: "  " }).warranty!;
  assert.equal(warranty.contractNo, undefined, "blank optional fields are dropped");

  const state = saveWarranty(createInitialState("2026-10-09"), newAsset, warranty, "Admin", "2026-10-09T00:00:00.000Z");
  const record = state.records.find((item) => item.assetRef === "KL-0420")!;
  assert.equal(record.warranty?.project, "Marina Tower", "new asset and its warranty land in one save");
  assert.deepEqual(nextDeadline(record, "2026-10-09"), { key: "warranty", event: "Warranty expiry", date: "2026-11-01", severity: "warning", days: 23 });
  assert.ok(state.alerts.some((alert) => alert.event === "Warranty expiry" && alert.status === "open"));
  assert.equal(warrantyFor(record, "2026-11-02")?.status, "Expired");
  assert.equal(nextDeadline(record, "2026-11-02"), undefined, "an ended warranty stops being a deadline");

  const certified = { ...rowToRecord({ ...newAsset, assetRef: "CERT-018", certificateNo: "C-1", certificateIssuedDate: "2026-09-09", certificateExpiryDate: "2027-09-08" }), id: "cert-asset" };
  const withCertificate = { ...state, records: [...state.records, certified] };
  assert.equal(warrantyFor(certified, "2026-10-09")?.number, "WAR-CERT-018", "derived from the first certificate");
  assert.throws(() => saveWarranty(withCertificate, "cert-asset", warranty), /already on another record/);
  const detailed = saveWarranty(withCertificate, "cert-asset", { ...warranty, number: "WAR-CERT-018", years: 10 });
  assert.equal(warrantyFor(detailed.records[1], "2026-10-09")?.validUntil, "2031-11-01", "typed details replace the derived warranty");

  assert.ok(validateStoredState(state));
  assert.equal(validateStoredState({ ...state, records: [{ ...record, warranty: { ...warranty, years: "5" } }] }), false, "restored backups are checked");
});

test("warranties can be revoked or removed, and records deleted with what hangs off them", () => {
  const warranty = parseWarranty(typed).warranty!;
  const certified = { ...rowToRecord({ ...newAsset, certificateNo: "C-1", certificateIssuedDate: "2026-09-09", certificateExpiryDate: "2027-09-08" }), id: "asset-1" };
  const base = { ...createInitialState("2026-10-09"), records: [certified] };

  const revoked = revokeWarranty(base, "asset-1");
  const stored = revoked.records[0];
  assert.equal(warrantyFor(stored, "2026-10-09")?.status, "Revoked", "a derived warranty is stored so it stays revoked");
  assert.equal(stored.warranty?.revokedDate, "2026-10-09");
  assert.equal(removeWarranty(revoked, "asset-1"), revoked, "removing can't bring a revoked warranty back");
  assert.throws(() => saveWarranty(revoked, "asset-1", warranty), /revoked/);
  assert.ok(validateStoredState(revoked));

  const typedIn = saveWarranty(base, "asset-1", warranty);
  assert.equal(nextDeadline(typedIn.records[0], "2026-10-09")?.key, "warranty");
  const removed = removeWarranty(typedIn, "asset-1");
  assert.equal(warrantyFor(removed.records[0], "2026-10-09")?.number, `WAR-${newAsset.assetRef}`, "falls back to the certificate warranty");
  assert.equal(removed.alerts.some((alert) => alert.status === "open" && alert.event === "Warranty expiry"), false);

  const { state: inspected } = createInspection(typedIn, "asset-1");
  const deleted = deleteRecord(inspected, "asset-1");
  assert.equal(deleted.records.length + deleted.inspections.length + deleted.alerts.length, 0, "record, inspection and alerts all go");
  assert.equal(deleted.activity[0].event, "Record deleted");
});
