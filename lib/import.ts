import * as XLSX from "xlsx";
import { REGISTER_HEADERS, type ImportPreview } from "./types";
import { validateRegisterRows } from "./domain";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  if (!text.trim()) throw new Error("The file is empty");
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string", raw: true, cellDates: false }); }
  catch { throw new Error("Malformed CSV: rows or quotes could not be parsed"); }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The file is empty");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (!matrix.length) throw new Error("The file is empty");
  const headers = (matrix[0] ?? []).map((header) => String(header).trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers cannot be blank");
  const rows = matrix.slice(1).map((values) => {
    if (values.length > headers.length) throw new Error("A CSV row has a different number of columns");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, rows };
}

function checkHeaders(headers: string[]): void {
  const expected = REGISTER_HEADERS as readonly string[];
  if (headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) {
    throw new Error(`Unsupported layout. Use the Register worksheet with the fixed headers: ${expected.join(", ")}`);
  }
}

export function validateImport(headers: string[], rows: Record<string, unknown>[], existingAssetRefs: string[] = []): ImportPreview {
  checkHeaders(headers);
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`The register is limited to ${MAX_IMPORT_ROWS} rows per file`);
  const preview = validateRegisterRows(rows, existingAssetRefs);
  if (existingAssetRefs.length + preview.validRows.length > MAX_IMPORT_ROWS) throw new Error("The demo is limited to 500 total register records. Reduce the file before importing.");
  return preview;
}

export function parseRegisterWorkbook(buffer: ArrayBuffer, existingAssetRefs: string[] = []): ImportPreview {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("The file is larger than the 2MB limit");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellFormula: true, dense: false });
  if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== "Register") throw new Error("The workbook must contain exactly one worksheet named Register");
  const sheet = workbook.Sheets.Register;
  if (!sheet) throw new Error("The workbook is missing its Register worksheet");
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  if (range.e.r >= MAX_IMPORT_ROWS + 1) throw new Error(`The register is limited to ${MAX_IMPORT_ROWS} rows per file`);
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (!matrix.length) throw new Error("The Register worksheet is empty");
  const headers = (matrix[0] ?? []).map((value) => String(value).trim());
  const rows = matrix.slice(1).map((values) => Object.fromEntries((headers as string[]).map((header, index) => [header, values[index] ?? ""])));
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address] as { f?: string } | undefined;
    if (cell?.f) {
      const coordinates = XLSX.utils.decode_cell(address);
      if (coordinates.r === 0) throw new Error("Formulas are not allowed in Register headers");
      const rowIndex = coordinates.r - 1;
      const raw = rows[rowIndex];
      if (raw) raw[headers[coordinates.c]] = `=${cell.f}`;
    }
  }
  return validateImport(headers, rows, existingAssetRefs);
}

export function parseRegisterFile(file: File, existingAssetRefs: string[] = []): Promise<ImportPreview> {
  if (file.size > MAX_IMPORT_BYTES) return Promise.reject(new Error("The file is larger than the 2MB limit"));
  if (file.name.toLowerCase().endsWith(".csv")) {
    return file.arrayBuffer().then((bytes) => {
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("CSV must use UTF-8 encoding"); }
      const parsed = parseCsvText(text);
      return validateImport(parsed.headers, parsed.rows, existingAssetRefs);
    });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) return Promise.reject(new Error("Upload an .xlsx or .csv file"));
  return file.arrayBuffer().then((buffer) => parseRegisterWorkbook(buffer, existingAssetRefs));
}
