import * as XLSX from "xlsx";
import { savingToRaw, type SavingInput } from "./domain";
import { sampleHeaders, rowsToMatrix } from "./sample";
import { SAVING_HEADERS, type RegisterRow, type Saving } from "./types";

type Sheets = [name: string, matrix: unknown[][]][];

// A CSV has no sheets, so they stack with a blank row between; the Import tab splits them again at the Savings headers.
export function bookBody(sheets: Sheets, format: "csv" | "xlsx"): string | ArrayBuffer {
  if (format === "csv") return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(sheets.flatMap(([, matrix], index) => index ? [[], ...matrix] : matrix)), { strip: true });
  const book = XLSX.utils.book_new();
  for (const [name, matrix] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), name);
  return XLSX.write(book, { bookType: "xlsx", type: "array" });
}

function downloadBook(sheets: Sheets, name: string, format: "csv" | "xlsx"): void {
  const type = format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const url = URL.createObjectURL(new Blob([bookBody(sheets, format)], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Oldest first, so the sheet reads like the spreadsheet it replaces.
export function savingsMatrix(savings: (SavingInput & Partial<Pick<Saving, "number" | "issuedDate">>)[]): unknown[][] {
  const rows = [...savings].sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? "").localeCompare(b.number ?? "")).map((saving) => { const raw = savingToRaw(saving); return SAVING_HEADERS.map((header) => raw[header]); });
  return [[...SAVING_HEADERS], ...rows];
}

export const workbookSheets = (rows: RegisterRow[], savings: SavingInput[]): Sheets => [["Register", [sampleHeaders, ...rowsToMatrix(rows)]], ["Savings", savingsMatrix(savings)]];

// Demo Controls templates and samples: the register and its sustainability savings in one file.
export function downloadRegister(format: "csv" | "xlsx", rows: RegisterRow[], savings: SavingInput[], name: string): void {
  downloadBook(workbookSheets(rows, savings), name, format);
}

export function downloadSavings(savings: Saving[], name: string): void {
  downloadBook([["Savings", savingsMatrix(savings)]], name, "xlsx");
}
