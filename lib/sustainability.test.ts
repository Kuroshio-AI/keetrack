import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { createInitialState, importRows, importSavings, parseSaving, quarterLabel, quarterOf, quarterRange, removeSaving, saveSaving, savingKg, totalKg, validateSavingRows, validateStoredState } from "./domain";
import { parseImportFile } from "./import";
import { bookBody, savingsMatrix, workbookSheets } from "./register-download";
import { sampleRows, sampleSavings } from "./sample";
import { SAVING_HEADERS } from "./types";

const paper = { type: "paper", date: "2026-09-18", quantity: 560, factor: 0.94, evidence: "Endoshred certificate SO/0926/19305" };
const at = "2026-10-12T08:00:00.000Z";

test("typed-in savings are validated and blank optional fields dropped", () => {
  assert.match(parseSaving({ ...paper, quantity: 0 }).error ?? "", /Quantity/);
  assert.match(parseSaving({ ...paper, date: "2026-02-30" }).error ?? "", /Date/);
  assert.match(parseSaving({ ...paper, type: "other" }).error ?? "", /Unit/, "Other needs its own unit");
  assert.match(parseSaving({ ...paper, description: "<b>paper</b>" }).error ?? "", /160/);
  assert.match(parseSaving({ ...paper, type: "toString" }).error ?? "", /type/);
  const saving = parseSaving({ ...paper, unit: "tonnes", site: "  " }).saving!;
  assert.equal(saving.unit, "kg", "fixed types keep their own unit");
  assert.equal(saving.site, undefined);
  assert.equal(parseSaving({ ...paper, type: "other", unit: " kWh " }).saving?.unit, "kWh");
});

test("CO₂e is quantity × factor, matching the Q3 deck", () => {
  assert.equal(savingKg({ quantity: 560, factor: 0.94 }), 526.4);
  assert.equal(savingKg({ quantity: 29, factor: 2.1752 }), 63.081);
  assert.equal(quarterOf("2026-09-18"), "2026-Q3");
  assert.equal(quarterOf("2026-10-01"), "2026-Q4");
  assert.equal(quarterLabel("2026-Q3"), "Q3 2026");
  assert.deepEqual(quarterRange("2026-Q4"), ["2026-10-01", "2026-12-31"]);
});

test("certificate numbers run per year, survive edits and are never reused", () => {
  const input = parseSaving(paper).saving!;
  let state = saveSaving(createInitialState("2026-10-12"), input, undefined, "Admin", at);
  state = saveSaving(state, { ...input, type: "pallets", unit: "pallets", quantity: 29, factor: 2.1752 }, undefined, "Admin", at);
  assert.deepEqual(state.savings?.map((saving) => saving.number), ["ENV-2026-002", "ENV-2026-001"]);
  assert.equal(totalKg(state.savings!), 589.481);

  const first = state.savings!.find((saving) => saving.number === "ENV-2026-001")!;
  state = saveSaving(state, { ...input, quantity: 600, evidence: undefined }, first.id, "Admin", at);
  const edited = state.savings!.find((saving) => saving.id === first.id)!;
  assert.equal(edited.number, "ENV-2026-001");
  assert.equal(edited.evidence, undefined, "a cleared optional field is removed on edit");

  state = removeSaving(state, state.savings!.find((saving) => saving.number === "ENV-2026-002")!.id);
  state = saveSaving(state, input, undefined, "Admin", at);
  assert.equal(state.savings![0].number, "ENV-2026-003");
  assert.equal(saveSaving({ ...state, demoDate: "2027-01-04" }, input, undefined, "Admin", at).savings![0].number, "ENV-2027-001");
  assert.equal(state.activity[0].event, "Saving recorded");

  assert.ok(validateStoredState(state));
  assert.ok(validateStoredState(createInitialState("2026-10-12")), "workspaces from before Sustainability stay valid");
  assert.equal(validateStoredState({ ...state, savings: [{ ...state.savings![0], quantity: -1 }] }), false);
  assert.equal(validateStoredState({ ...state, savingCounters: { 2026: "3" } }), false);
});

const asRows = (matrix: unknown[][]) => matrix.slice(1).map((values) => Object.fromEntries(SAVING_HEADERS.map((header, index) => [header, values[index] ?? ""])));
const xlsxFile = (sheet: string, matrix: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), sheet);
  return new File([XLSX.write(book, { bookType: "xlsx", type: "array" })], "upload.xlsx");
};

test("an exported Savings sheet imports back, skipping savings already in KeeTrack", async () => {
  const deck = [parseSaving(paper).saving!, parseSaving({ type: "deliveries", date: "2026-09-25", quantity: 4900, factor: 0.6337 }).saving!, parseSaving({ type: "pallets", date: "2026-09-30", quantity: 29, factor: 2.1752, costSaving: 261 }).saving!];
  const state = importSavings(createInitialState("2026-10-12"), [...deck].reverse(), "Admin", at);
  assert.deepEqual(state.savings!.map((saving) => [saving.number, saving.date]).reverse(), [["ENV-2026-001", "2026-09-18"], ["ENV-2026-002", "2026-09-25"], ["ENV-2026-003", "2026-09-30"]], "numbers follow the dates");

  const exported = savingsMatrix(state.savings!);
  assert.equal(validateSavingRows(asRows(exported), state.savings).duplicates.length, 3, "re-importing an export adds nothing twice");
  const elsewhere = validateSavingRows(asRows(exported));
  assert.deepEqual(elsewhere.validRows.map(savingKg), [526.4, 3105.13, 63.081]);
  assert.equal(elsewhere.validRows[2].costSaving, 261);

  // Typed in Excel: blank certificate number, short type key, a real date cell, a comma in the number and a trailing empty row.
  const typed = validateSavingRows([
    { certificate_no: "", type: "paper", date: 46283, quantity: "1,200", unit: "", kg_co2e_per_unit: 0.94, cost_saving_usd: "" },
    { certificate_no: "", type: "Fuel saving", date: "2026-10-01", quantity: 5, kg_co2e_per_unit: 1 },
    { certificate_no: "", type: "", date: "", quantity: "", kg_co2e_per_unit: "" },
  ]);
  assert.equal(typed.totalRows, 2, "empty rows are ignored");
  assert.deepEqual([typed.validRows[0].date, typed.validRows[0].quantity, typed.validRows[0].unit], ["2026-09-18", 1200, "kg"]);
  assert.deepEqual(typed.errors.map((error) => [error.row, error.message]), [[3, "Saving type must be Paper recycling, Pallet reuse, Delivery consolidation or Other."]]);

  const fromXlsx = await parseImportFile(xlsxFile("Savings", exported));
  assert.equal(fromXlsx.register, undefined);
  assert.equal(fromXlsx.savings?.validRows.length, 3);
  assert.equal((await parseImportFile(new File([XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(exported))], "savings.csv"))).savings?.validRows.length, 3);
  await assert.rejects(parseImportFile(xlsxFile("Savings", [["certificate_no", "date"]])), /Savings sheet/);
  await assert.rejects(parseImportFile(xlsxFile("Sheet1", exported)), /can only contain a Register worksheet, a Savings worksheet, or both/);
});

test("Demo Controls files carry the register and its savings together, as .xlsx sheets or one stacked .csv", async () => {
  const demoDate = "2026-10-12";
  const sheets = workbookSheets(sampleRows(demoDate, "1"), sampleSavings(demoDate, "1"));
  const xlsx = await parseImportFile(new File([bookBody(sheets, "xlsx")], "sample-1.xlsx"));
  assert.deepEqual([xlsx.register?.validRows.length, xlsx.savings?.validRows.length, xlsx.register?.errors.length, xlsx.savings?.errors.length], [6, 3, 0, 0]);

  const csv = bookBody(sheets, "csv") as string;
  const lines = csv.split("\n");
  assert.equal(lines[7], "", "a blank line separates the register from the savings");
  assert.equal(lines[8], SAVING_HEADERS.join(","));
  const parsed = await parseImportFile(new File([`${csv}\n,,2026-10-01,Paper recycling,,0,kg,0.94`], "sample-1.csv"));
  assert.deepEqual([parsed.register?.validRows.length, parsed.savings?.validRows.length], [6, 3]);
  assert.deepEqual(parsed.savings?.errors.map((error) => [error.row, error.field]), [[13, "Savings"]], "savings issues give the CSV line and name the sheet");

  // Importing a sample twice adds nothing the second time, though its savings carry no certificate numbers.
  const imported = importSavings(importRows(createInitialState(demoDate), xlsx.register!.validRows), xlsx.savings!.validRows);
  const again = await parseImportFile(new File([csv], "sample-1.csv"), imported.records.map((record) => record.assetRef), imported.savings);
  assert.deepEqual([again.register?.validRows.length, again.savings?.validRows.length, again.savings?.duplicates.length], [0, 0, 3]);

  for (const date of [demoDate, "2026-10-01", "2026-12-31"]) {
    for (const id of ["1", "2"] as const) assert.ok(sampleSavings(date, id).every((saving) => quarterOf(saving.date) === quarterOf(date)), `sample ${id} on ${date} stays in its quarter`);
  }

  const blank = await parseImportFile(new File([bookBody(workbookSheets([], []), "csv")], "template.csv"));
  assert.deepEqual([blank.register?.totalRows, blank.savings?.totalRows], [0, 0], "the blank template has both header rows and nothing else");
});
