import * as XLSX from "xlsx";
import { sampleHeaders, rowsToMatrix } from "./sample";
import type { RegisterRow } from "./types";

export function downloadRegister(format: "csv" | "xlsx", rows: RegisterRow[], name: string): void {
  const sheet = XLSX.utils.aoa_to_sheet([sampleHeaders, ...rowsToMatrix(rows)]);
  const body = format === "csv"
    ? XLSX.utils.sheet_to_csv(sheet)
    : (() => { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Register"); return XLSX.write(book, { bookType: "xlsx", type: "array" }); })();
  const type = format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
