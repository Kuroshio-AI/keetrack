import * as XLSX from "xlsx";
import { quarterLabel, quarterOf, SAVING_TYPES, savingKg } from "./domain";
import { sampleHeaders, rowsToMatrix } from "./sample";
import type { RegisterRow, Saving } from "./types";

function downloadSheet(matrix: unknown[][], sheetName: string, name: string, format: "csv" | "xlsx"): void {
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const body = format === "csv"
    ? XLSX.utils.sheet_to_csv(sheet)
    : (() => { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, sheetName); return XLSX.write(book, { bookType: "xlsx", type: "array" }); })();
  const type = format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadRegister(format: "csv" | "xlsx", rows: RegisterRow[], name: string): void {
  downloadSheet([sampleHeaders, ...rowsToMatrix(rows)], "Register", name, format);
}

const SAVING_HEADERS = ["certificate_no", "quarter", "date", "type", "description", "quantity", "unit", "kg_co2e_per_unit", "kg_co2e_saved", "cost_saving_usd", "site", "evidence", "issued_date"];

// Every saving, oldest first, so the sheet reads like the spreadsheet it replaces.
export function downloadSavings(savings: Saving[], name: string): void {
  const rows = [...savings].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number)).map((saving) => [
    saving.number, quarterLabel(quarterOf(saving.date)), saving.date, SAVING_TYPES[saving.type].label, saving.description ?? "", saving.quantity, saving.unit,
    saving.factor, savingKg(saving), saving.costSaving ?? "", saving.site ?? "", saving.evidence ?? "", saving.issuedDate,
  ]);
  downloadSheet([SAVING_HEADERS, ...rows], "Savings", name, "xlsx");
}
