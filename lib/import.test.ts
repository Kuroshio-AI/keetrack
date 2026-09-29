import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseCsvText, parseRegisterWorkbook, validateImport } from "./import";
import { addDays, approveInspection, createInitialState, createInspection, importRows, submitInspection, updateInspection, validateRegisterRows } from "./domain";
import { REGISTER_HEADERS } from "./types";
import { rowToRaw, rowsToMatrix, sampleRows } from "./sample";

test("both fictional samples round-trip through CSV and XLSX", () => {
  const demoDate = "2026-02-15";
  assert.deepEqual(sampleRows(demoDate), sampleRows(demoDate, "1"));
  for (const sample of ["1", "2"] as const) {
    const rows = sampleRows(demoDate, sample);
    assert.equal(rows.length, 6);
    const sheet = XLSX.utils.aoa_to_sheet([[...REGISTER_HEADERS], ...rowsToMatrix(rows)]);
    const csv = parseCsvText(XLSX.utils.sheet_to_csv(sheet));
    const csvPreview = validateImport(csv.headers, csv.rows);
    assert.equal(csvPreview.totalRows, 6);
    assert.equal(csvPreview.validRows.length, 6);
    assert.equal(csvPreview.errors.length, 0);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Register");
    const xlsxPreview = parseRegisterWorkbook(XLSX.write(book, { bookType: "xlsx", type: "array" }));
    assert.equal(xlsxPreview.totalRows, 6);
    assert.equal(xlsxPreview.validRows.length, 6);
    assert.equal(xlsxPreview.errors.length, 0);
  }
});

test("both samples import together and reimporting them is rejected", () => {
  const demoDate = "2026-02-15";
  const rows = [...sampleRows(demoDate, "1"), ...sampleRows(demoDate, "2")];
  assert.equal(new Set(rows.map((row) => row.assetRef)).size, 12);
  const imported = importRows(createInitialState(demoDate), rows, "Admin", "2026-02-15T12:00:00.000Z");
  assert.equal(imported.records.length, 12);
  const duplicatePreview = validateRegisterRows(rows.map(rowToRaw), imported.records.map((record) => record.assetRef));
  assert.equal(duplicatePreview.validRows.length, 0);
  assert.equal(duplicatePreview.duplicates.length, 12);
  assert.throws(() => importRows(imported, rows, "Admin", "2026-02-15T12:00:00.000Z"), /register changed/);
});

test("sample 2 exposes renewal deadlines and excludes the retired record", () => {
  const demoDate = "2026-02-15";
  const state = importRows(createInitialState(demoDate), sampleRows(demoDate, "2"), "Admin", "2026-02-15T12:00:00.000Z");
  const openDeadlines = state.alerts.filter((alert) => alert.status === "open" && alert.type === "deadline");
  assert.equal(openDeadlines.length, 7);
  assert.equal(openDeadlines.filter((alert) => alert.assetRef === "ANC-201").length, 3);
  assert.equal(openDeadlines.filter((alert) => alert.assetRef === "LIC-202").length, 1);
  assert.equal(openDeadlines.filter((alert) => alert.assetRef === "HAR-203").length, 1);
  assert.equal(openDeadlines.filter((alert) => alert.assetRef === "SRL-204").length, 2);
  assert.equal(openDeadlines.filter((alert) => alert.assetRef === "KIT-205").length, 0);
  assert.equal(openDeadlines.filter((alert) => alert.assetRef === "LIF-206").length, 0);
  assert.equal(state.alerts.filter((alert) => alert.status === "history" && alert.event === "Certificate expired").length, 1);
  assert.equal(state.records.find((record) => record.assetRef === "LIF-206")?.status, "Retired");
  assert.equal(state.alerts.filter((alert) => alert.assetRef === "LIF-206").length, 0);
});

test("sample 2 renewal supersedes the expired certificate and keeps retirement due", () => {
  const demoDate = "2026-02-15";
  const imported = importRows(createInitialState(demoDate), sampleRows(demoDate, "2"), "Admin", "2026-02-15T12:00:00.000Z");
  const record = imported.records.find((item) => item.assetRef === "ANC-201")!;
  const oldCertificateId = record.certificates[0].id;
  const created = createInspection(imported, record.id, "Admin", "2026-02-15T13:00:00.000Z");
  const passed = created.inspection.checklist.map((item) => ({ ...item, result: "pass" as const }));
  const ready = updateInspection(created.state, created.inspection.id, { checklist: passed }, "2026-02-15T13:01:00.000Z");
  const submitted = submitInspection(ready, created.inspection.id, "2026-02-15T13:02:00.000Z");
  const renewed = approveInspection(submitted, created.inspection.id, addDays(demoDate, 365), "Admin", "2026-02-15T13:03:00.000Z");
  const renewedRecord = renewed.records.find((item) => item.assetRef === "ANC-201")!;
  assert.equal(renewedRecord.retirementDueDate, addDays(demoDate, 30));
  assert.equal(renewedRecord.certificates.find((certificate) => certificate.id === oldCertificateId)?.status, "Superseded");
  assert.equal(renewed.alerts.some((alert) => alert.assetRef === "ANC-201" && alert.event === "Certificate superseded"), true);
  assert.equal(renewed.alerts.some((alert) => alert.assetRef === "ANC-201" && alert.event === "Retirement due" && alert.status === "open" && alert.dueDate === addDays(demoDate, 30)), true);
});

test("import rejects malformed layouts, dates, formulas and incomplete certificates", () => {
  assert.throws(() => validateImport(["asset_ref"], []), /fixed headers/);
  const raw = { asset_ref: "BAD-1", record_type: "equipment", asset_type: "Harness", site: "Site", owner: "Owner", inspection_due_date: "2026-02-31", status: "Active" };
  const invalid = validateRegisterRows([raw, { ...raw, asset_ref: "FORMULA", asset_type: "=SUM(A1:A2)" }, { ...raw, asset_ref: "CERT", inspection_due_date: "2026-02-01", certificate_no: "CERT-1", certificate_issued_date: "2026-02-05" }]);
  assert.equal(invalid.validRows.length, 0);
  assert.equal(invalid.errors.length, 3);
});

test("duplicate asset refs are skipped case-insensitively without overwriting", () => {
  const row = rowToRaw(sampleRows("2026-02-15")[0]);
  const preview = validateRegisterRows([{ ...row, asset_ref: " har-001 " }, { ...row, asset_ref: "HAR-001" }], ["HAR-001"]);
  assert.equal(preview.validRows.length, 0);
  assert.equal(preview.duplicates.length, 2);
});

test("row and file limits are enforced", () => {
  const row = rowToRaw(sampleRows("2026-02-15")[0]);
  assert.throws(() => validateImport([...REGISTER_HEADERS], Array.from({ length: 501 }, () => row)), /500 rows/);
  assert.equal(parseCsvText(`${REGISTER_HEADERS.join(",")}\n${REGISTER_HEADERS.map(() => "\"quoted, value\"").join(",")}`).rows.length, 1);
});

test("xlsx formula cells are reported without dropping other rows", () => {
  const formulaRow = Array<string>(REGISTER_HEADERS.length).fill(""); formulaRow[0] = "FORMULA"; formulaRow[1] = "equipment"; formulaRow[2] = "Harness"; formulaRow[3] = "Site"; formulaRow[4] = "Owner"; formulaRow[14] = "Active";
  const goodRow = Array<string>(REGISTER_HEADERS.length).fill(""); goodRow[0] = "GOOD"; goodRow[1] = "equipment"; goodRow[2] = "Anchor"; goodRow[3] = "Site"; goodRow[4] = "Owner"; goodRow[7] = "2026-02-15"; goodRow[14] = "Active";
  const sheet = XLSX.utils.aoa_to_sheet([[...REGISTER_HEADERS], formulaRow, goodRow]);
  sheet.C2 = { t: "s", v: "equipment", f: "BAD()" };
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Register");
  const result = parseRegisterWorkbook(XLSX.write(book, { bookType: "xlsx", type: "array" }));
  assert.equal(result.validRows.length, 1);
  assert.equal(result.errors.length, 1);
  const headerFormula = XLSX.utils.aoa_to_sheet([[...REGISTER_HEADERS]]);
  headerFormula.A1 = { t: "s", v: "asset_ref", f: "BAD()" };
  const headerBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(headerBook, headerFormula, "Register");
  assert.throws(() => parseRegisterWorkbook(XLSX.write(headerBook, { bookType: "xlsx", type: "array" })), /headers/);
});
