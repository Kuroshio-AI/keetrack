import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseCsvText, parseRegisterWorkbook, validateImport } from "./import";
import { validateRegisterRows } from "./domain";
import { REGISTER_HEADERS } from "./types";
import { rowToRaw, sampleRows } from "./sample";

test("fictional sample validates to exactly six rows", () => {
  const preview = validateImport([...REGISTER_HEADERS], sampleRows("2026-02-15").map(rowToRaw));
  assert.equal(preview.totalRows, 6);
  assert.equal(preview.validRows.length, 6);
  assert.equal(preview.errors.length, 0);
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
