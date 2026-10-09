import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, nextDeadline, parseWarranty, rowToRecord, saveWarranty, validateStoredState, warrantyFor } from "./domain";
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
