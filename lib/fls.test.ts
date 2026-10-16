import assert from "node:assert/strict";
import test, { before } from "node:test";
import * as XLSX from "xlsx";
import type { AppState } from "./types";

// The FLS build is chosen at build time; node --test runs each file in its own process, so setting it here touches no other test.
process.env.NEXT_PUBLIC_CLIENT = "fls";
let fls: typeof import("./domain") & typeof import("./fls");
before(async () => { fls = { ...await import("./domain"), ...await import("./fls") }; });

const serial = (date: string) => (Date.parse(`${date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
const header = ["Sl. No", "Building", "Frequency", "Date of Issue", "Date of Expiry", "Days Remaining for Expiry", "Due Date", "Days Remaining for Due Date", "Service Provider", "Remarks"];

// Fictional buildings laid out like the client's tracker: a title block, the header on row 8, then a second group under a divider.
function workbook(rows: unknown[][]): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[], ["", "", "", "Project :", "Demo FLS"], ["", "", "", "Subject :", "FLS DCD (AMC) certificate tracker"], [], [], [], ["FLS DCD (AMC) certificate tracker"], header, ...rows]), "FLS DCD");
  return XLSX.write(book, { bookType: "xlsx", type: "array" });
}

const sheetRows = [
  [1, "Harbour View Residence", "Annually", "", "", "", "", "", "", ""],
  [2, "Palm Court ", "Annually", serial("2026-02-18"), serial("2027-02-17"), 185, serial("2027-02-02"), 170, "M/s. Fireguard ", ""],
  [3, "Old Mill", "Annually", serial("2023-09-22"), serial("2024-09-22"), -693, serial("2024-09-07"), -708, "NOT Under Us", ""],
  [4, "Lakeside Tower", "Annually", serial("2025-08-29"), serial("2026-08-28"), 12, serial("2026-08-13"), -3, "Fireguard", ""],
  [9],
  ["BANK SITES:"],
  [5, "Branch One", "Annually", serial("2025-03-14"), serial("2026-03-13"), -156, serial("2026-02-26"), -171, "Fireguard", "Under Renovation"],
  [6, "Palm Court", "Annually", serial("2026-02-18"), serial("2027-02-17"), 185, serial("2027-02-02"), 170, "Fireguard", ""],
  [7, "Bad Dates", "Annually", serial("2026-05-01"), serial("2026-01-01"), "", "", "", "Fireguard", ""],
];

test("the tracker sheet imports by section, trims names, keeps exact dates and mutes on-hold sites", () => {
  const preview = fls.parseFlsWorkbook(workbook(sheetRows));
  assert.equal(preview.totalRows, 7);
  assert.deepEqual(preview.validRows.map((row) => [row.assetRef, row.site, row.owner, row.status]), [
    ["Harbour View Residence", "General", "Not assigned", "Active"],
    ["Palm Court", "General", "M/s. Fireguard", "Active"],
    ["Old Mill", "General", "NOT Under Us", "Retired"],
    ["Lakeside Tower", "General", "Fireguard", "Active"],
    ["Branch One", "BANK SITES", "Fireguard", "Retired"],
  ]);
  const palm = preview.validRows[1];
  assert.equal(palm.licenceIssuedDate, "2026-02-18");
  assert.equal(palm.licenceExpiryDate, "2027-02-17");
  assert.equal(preview.validRows[0].licenceExpiryDate, undefined);
  assert.equal(preview.validRows[4].remarks, "Under Renovation");
  assert.deepEqual(preview.duplicates.map((issue) => issue.row), [16]);
  assert.deepEqual(preview.errors.map((issue) => [issue.row, issue.field]), [[17, "Date of Expiry"]]);
  assert.throws(() => fls.parseFlsWorkbook(XLSX.write({ SheetNames: ["Sheet1"], Sheets: { Sheet1: XLSX.utils.aoa_to_sheet([["Building", "Expiry"]]) } }, { bookType: "xlsx", type: "array" })), /FLS DCD tracker layout/);
});

test("re-uploading the sheet updates only the buildings whose values changed", () => {
  const records = fls.parseFlsWorkbook(workbook(sheetRows)).validRows.map((row) => fls.rowToRecord(row, "Admin", "2026-08-16T00:00:00.000Z"));
  const same = fls.parseFlsWorkbook(workbook(sheetRows), records);
  assert.equal(same.validRows.length + (same.updates?.length ?? 0), 0);
  const renewed = sheetRows.map((row) => row[1] === "Lakeside Tower" ? [4, "Lakeside Tower", "Annually", serial("2026-08-20"), serial("2027-08-19"), "", "", "", "Fireguard", ""] : row);
  const preview = fls.parseFlsWorkbook(workbook(renewed), records);
  assert.deepEqual(preview.updates?.map((row) => row.assetRef), ["Lakeside Tower"]);
  const state = fls.updateRecords({ ...fls.createInitialState("2026-08-16"), records }, preview.updates ?? [], "Admin", "2026-08-16T00:00:00.000Z");
  assert.equal(state.records.find((record) => record.assetRef === "Lakeside Tower")?.licenceExpiryDate, "2027-08-19");
  assert.equal(state.records.find((record) => record.assetRef === "Palm Court")?.activity.length, 1);
  assert.equal(state.activity[0].event, "Register synced");
});

test("the traffic light turns amber under 15 days and red on the day", () => {
  assert.deepEqual([15, 14, 1, 0, -1].map((days) => fls.trafficLight(days)), ["green", "amber", "amber", "red", "red"]);
});

test("alerts fire 30, 15 (due date), 7 and 0 days before expiry, then overdue", () => {
  const record = fls.rowToRecord({ assetRef: "Palm Court", recordType: "licence", assetType: "FLS DCD (AMC) certificate", site: "General", owner: "Fireguard", licenceExpiryDate: "2026-11-16", status: "Active" }, "Admin", "2026-10-01T00:00:00.000Z");
  let state: AppState = { ...fls.createInitialState("2026-10-16"), records: [record] };
  const open = (demoDate: string) => {
    state = fls.recalculateAlerts({ ...state, demoDate });
    return state.alerts.filter((alert) => alert.status === "open").map((alert) => `${alert.event}:${alert.tier}`).sort();
  };
  assert.deepEqual(open("2026-10-16"), []);
  assert.deepEqual(open("2026-10-17"), ["Certificate expiry:due30"]);
  assert.deepEqual(open("2026-10-31"), ["Certificate expiry:due30"]);
  assert.deepEqual(open("2026-11-01"), ["Certificate expiry:due30", "Renewal due:today"]);
  assert.deepEqual(open("2026-11-09"), ["Certificate expiry:due7", "Renewal due:overdue"]);
  assert.deepEqual(open("2026-11-16"), ["Certificate expiry:today", "Renewal due:overdue"]);
  assert.deepEqual(open("2026-11-17"), ["Certificate expiry:overdue"]);
  const deadline = fls.nextDeadline(record, "2026-10-20");
  assert.equal(deadline && fls.deadlineLabel(deadline), "Renewal due in 12 days");
  assert.deepEqual(fls.buildingStatus(record, "2026-08-16"), { expiryDays: 92, dueDate: "2026-11-01", dueDays: 77, light: "green", muted: false });
});

test("the digest names red and amber buildings and leaves muted ones out", () => {
  const records = fls.parseFlsWorkbook(workbook([...sheetRows, [8, "Quay House", "Annually", serial("2025-09-05"), serial("2026-09-05"), "", "", "", "Fireguard", ""]])).validRows.map((row) => fls.rowToRecord(row));
  const text = fls.digestText({ ...fls.createInitialState("2026-08-16"), records });
  assert.match(text, /RED \(1\)[^]*Lakeside Tower \(Fireguard\): due date passed 3 days ago, expires in 12 days/);
  assert.match(text, /AMBER \(1\)[^]*Quay House \(Fireguard\): due in 5 days, expires in 20 days/);
  assert.match(text, /No certificate dates \(1\): Harbour View Residence/);
  assert.match(text, /Green: 1 · Muted: 2/);
  assert.doesNotMatch(text, /Old Mill|Branch One/);
});

test("every PPM checklist fits the phone hand-off and keeps unique ids", async () => {
  const { FLS_CHECKLISTS, checklistFrom } = await import("./fls-checklists");
  const { parseFieldJob } = await import("./field");
  assert.equal(new Set(FLS_CHECKLISTS.map((template) => template.id)).size, FLS_CHECKLISTS.length);
  for (const template of FLS_CHECKLISTS) {
    const checklist = checklistFrom(template).map(({ id, label, section }) => ({ id, label, section }));
    const body = { assetRef: "Palm Court", assetType: template.title, site: "General", inspector: "Admin", checklist };
    assert.ok(parseFieldJob(body), `${template.title} is rejected by the phone hand-off`);
    // app/api/field/route.ts refuses a job over 32KB.
    assert.ok(JSON.stringify(body).length < 32_768, `${template.title} is too large to send to a phone`);
  }
});

test("an FLS checklist is approved with its Not Ok items and issues no certificate", async () => {
  const { FLS_CHECKLISTS } = await import("./fls-checklists");
  const template = FLS_CHECKLISTS.find((item) => item.id === "breeching-inlet")!;
  let state = fls.importRows({ ...fls.createInitialState("2026-10-16"), role: "Admin" }, [{ assetRef: "Palm Court", recordType: "licence", assetType: fls.FLS_ASSET_TYPE, site: "General", owner: "Fireguard", status: "Active" }]);
  const created = fls.createInspection(state, state.records[0].id, "Admin", "2026-10-16T08:00:00.000Z", template);
  assert.equal(created.inspection.title, "Breeching inlet");
  assert.equal(created.inspection.checklist[0].section, "Inspection");
  state = fls.submitInspection(created.state, created.inspection.id);
  assert.equal(fls.approveChecklist(state, created.inspection.id).inspections[0].status, "Draft", "unanswered items can't be submitted or approved");
  const answered = created.inspection.checklist.map((item, index) => ({ ...item, result: index === 0 ? "fail" as const : "pass" as const }));
  state = fls.submitInspection(fls.updateInspection(created.state, created.inspection.id, { checklist: answered }), created.inspection.id);
  const approved = fls.approveChecklist(state, created.inspection.id, "Admin", "2026-10-16T09:00:00.000Z");
  assert.equal(approved.inspections[0].status, "Approved");
  assert.equal(approved.records[0].certificates.length, 0);
  assert.equal(approved.alerts.some((alert) => alert.type === "review" && alert.status === "open"), false);
  assert.match(approved.records[0].activity[0].detail, /Breeching inlet · 1 Not Ok/);
  assert.ok(fls.validateStoredState(approved));
});
