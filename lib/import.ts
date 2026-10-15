import * as XLSX from "xlsx";
import { REGISTER_HEADERS, SAVING_HEADERS, type AssetRecord, type ImportPreview, type Saving } from "./types";
import { validateRegisterRows, validateSavingRows, type SavingsPreview } from "./domain";
import { IS_FLS } from "./client";
import { parseFlsWorkbook } from "./fls";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

function csvMatrix(text: string): unknown[][] {
  if (!text.trim()) throw new Error("The file is empty");
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string", raw: true, cellDates: false }); }
  catch { throw new Error("Malformed CSV: rows or quotes could not be parsed"); }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The file is empty");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (!matrix.length) throw new Error("The file is empty");
  return matrix;
}

const cellText = (value: unknown) => String(value ?? "").trim();
const isBlankRow = (values: unknown[]) => values.every((value) => !cellText(value));
// SheetJS pads every row to the widest one, so a header row ends at its last filled cell.
function headerRow(values: unknown[] = []): string[] {
  const headers = values.map(cellText);
  while (headers.length && !headers.at(-1)) headers.pop();
  return headers;
}

function toObjects(matrix: unknown[][]): { headers: string[]; rows: Record<string, unknown>[] } {
  const headers = headerRow(matrix[0]);
  if (!headers.length || headers.some((header) => !header)) throw new Error("Headers cannot be blank");
  const rows = matrix.slice(1).map((values) => {
    if (values.slice(headers.length).some(cellText)) throw new Error("A row has more columns than its headers");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, rows };
}

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  return toObjects(csvMatrix(text));
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
  if (!workbook.SheetNames.includes("Register") || workbook.SheetNames.some((name) => name !== "Register" && name !== "Savings")) throw new Error("The workbook must contain a Register worksheet; a Savings worksheet beside it is optional");
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

// A file can carry the register, the savings or both. Either part may be missing; the Import tab shows what it found.
export type FilePreview = { register?: ImportPreview; savings?: SavingsPreview };

const isSavingsLayout = (headers: string[]) => headers.length === SAVING_HEADERS.length && headers.every((header, index) => header === SAVING_HEADERS[index]);

function savingsPreview(matrix: unknown[][], existingSavings: Saving[], firstRow = 2): SavingsPreview {
  const { headers, rows } = toObjects(matrix);
  if (!isSavingsLayout(headers)) throw new Error(`Unsupported layout. Use the Savings sheet that Sustainability exports, with the headers: ${SAVING_HEADERS.join(", ")}`);
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Savings imports are limited to ${MAX_IMPORT_ROWS} rows per file`);
  return validateSavingRows(rows, existingSavings, firstRow);
}

// A workbook holds a Register sheet, a Savings sheet or both. A CSV has no sheets, so its savings block sits under the
// register, after a blank row, starting at its own header row. Savings formula cells are read by their saved value.
export async function parseImportFile(file: File, existingAssetRefs: string[] = [], existingSavings: Saving[] = [], existingRecords: AssetRecord[] = []): Promise<FilePreview> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("The file is larger than the 2MB limit");
  const name = file.name.toLowerCase();
  // The FLS build reads the client's own tracker sheet as it is, and nothing else.
  if (IS_FLS) {
    if (!name.endsWith(".xlsx")) throw new Error("Upload the FLS DCD tracker as an .xlsx file");
    const register = parseFlsWorkbook(await file.arrayBuffer(), existingRecords);
    if (existingRecords.length + register.validRows.length > MAX_IMPORT_ROWS) throw new Error(`The demo is limited to ${MAX_IMPORT_ROWS} buildings in total. Reduce the file before importing.`);
    return { register };
  }
  if (name.endsWith(".csv")) {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error("CSV must use UTF-8 encoding"); }
    const matrix = csvMatrix(text);
    const split = matrix.findIndex((values) => isSavingsLayout(headerRow(values)));
    const registerRows = split === -1 ? [...matrix] : matrix.slice(0, split);
    while (registerRows.length && isBlankRow(registerRows[registerRows.length - 1])) registerRows.pop();
    const register = registerRows.length ? toObjects(registerRows) : undefined;
    return {
      register: register && validateImport(register.headers, register.rows, existingAssetRefs),
      savings: split === -1 ? undefined : savingsPreview(matrix.slice(split), existingSavings, split + 2),
    };
  }
  if (!name.endsWith(".xlsx")) throw new Error("Upload an .xlsx or .csv file");
  const buffer = await file.arrayBuffer();
  const sheets = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames;
  if (!sheets.length || sheets.some((sheet) => sheet !== "Register" && sheet !== "Savings")) throw new Error("The workbook can only contain a Register worksheet, a Savings worksheet, or both");
  const savingsSheet = sheets.includes("Savings") ? XLSX.read(buffer, { type: "array", cellDates: true }).Sheets.Savings : undefined;
  return {
    register: sheets.includes("Register") ? parseRegisterWorkbook(buffer, existingAssetRefs) : undefined,
    savings: savingsSheet && savingsPreview(XLSX.utils.sheet_to_json<unknown[]>(savingsSheet, { header: 1, defval: "", raw: true }), existingSavings),
  };
}
