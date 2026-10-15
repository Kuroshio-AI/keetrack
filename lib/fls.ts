import * as XLSX from "xlsx";
import { FLS_DUE_LEAD_DAYS } from "./client";
import { addDays, dateDiffDays, parseDateCell, SYNCED_FIELDS, trimValue } from "./domain";
import type { AppState, AssetRecord, ImportError, ImportPreview, RegisterRow } from "./types";
import { formatDate } from "./utils";

// Columns A–J of the FLS DCD (AMC) certificate tracker. F, G and H are formulas KTrack works out again, so only their place is checked.
export const FLS_HEADERS = ["Sl. No", "Building", "Frequency", "Date of Issue", "Date of Expiry", "Days Remaining for Expiry", "Due Date", "Days Remaining for Due Date", "Service Provider", "Remarks"];
export const FLS_ASSET_TYPE = "FLS DCD (AMC) certificate";

// "Sl. No" and "Sl.No" are the same header.
const headerKey = (value: unknown) => trimValue(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const isHeaderRow = (values: unknown[]) => FLS_HEADERS.every((header, index) => headerKey(values[index]) === headerKey(header));

// Sites the sheet says are someone else's, closed or on hold come in muted, so they never alert. Muting can be undone per building.
const isMuted = (provider: string, remarks = "") => /^not under us$/i.test(provider) || /closed|under renovation|client will renew/i.test(remarks);

// The first sheet with the tracker's header row wins; the title block above it (Project, Subject, Date) is ignored.
export function parseFlsWorkbook(buffer: ArrayBuffer, existing: AssetRecord[] = []): ImportPreview {
  // Dates stay Excel serial numbers: as JS dates they arrive at local midnight and would read a day early east of UTC.
  const workbook = XLSX.read(buffer, { type: "array" });
  for (const name of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: true });
    const headerIndex = matrix.findIndex(isHeaderRow);
    if (headerIndex !== -1) return readRows(matrix.slice(headerIndex + 1), headerIndex + 2, existing);
  }
  throw new Error(`Use the FLS DCD tracker layout: one header row with ${FLS_HEADERS.join(", ")}`);
}

function readRows(rows: unknown[][], firstRow: number, existing: AssetRecord[]): ImportPreview {
  const errors: ImportError[] = [];
  const duplicates: ImportError[] = [];
  const validRows: RegisterRow[] = [];
  const updates: RegisterRow[] = [];
  const known = new Map(existing.map((record) => [record.assetRef.trim().toLowerCase(), record]));
  const seen = new Set<string>();
  let section = "General";
  let totalRows = 0;
  rows.forEach((values, index) => {
    const cells = FLS_HEADERS.map((_, column) => values[column] ?? "");
    if (cells.slice(1).every((value) => !trimValue(value))) {
      // A label alone in the first column ("ADCB SITES:") starts the next group of buildings; a serial number alone is an unused row.
      if (typeof cells[0] === "string" && Number.isNaN(Number(cells[0]))) section = trimValue(cells[0]).replace(/:\s*$/, "");
      return;
    }
    totalRows += 1;
    const row = firstRow + index;
    const raw = Object.fromEntries(FLS_HEADERS.map((header, column) => [header, cells[column]]));
    const fail = (field: string, message: string) => { errors.push({ row, field, message, raw }); };
    const building = trimValue(cells[1]);
    if (!building) return fail("Building", "Building is required");
    const dates: (string | undefined)[] = [];
    for (const [column, field] of [[3, "Date of Issue"], [4, "Date of Expiry"]] as const) {
      const date = parseDateCell(cells[column]);
      if (trimValue(cells[column]) && !date) return fail(field, `${field} must be a date`);
      dates.push(date);
    }
    const [licenceIssuedDate, licenceExpiryDate] = dates;
    if (licenceIssuedDate && licenceExpiryDate && licenceExpiryDate < licenceIssuedDate) return fail("Date of Expiry", "Date of Expiry can't be before Date of Issue");
    const key = building.toLowerCase();
    if (seen.has(key)) { duplicates.push({ row, field: "Building", message: "the same building appears earlier in the sheet; skipped", raw }); return; }
    seen.add(key);
    const owner = trimValue(cells[8]) || "Not assigned";
    const remarks = trimValue(cells[9]) || undefined;
    const parsed: RegisterRow = { assetRef: building, recordType: "licence", assetType: FLS_ASSET_TYPE, site: section, owner, licenceIssuedDate, licenceExpiryDate, remarks, status: isMuted(owner, remarks) ? "Retired" : "Active" };
    const current = known.get(key);
    if (!current) validRows.push(parsed);
    else if (SYNCED_FIELDS.some((field) => current[field] !== parsed[field])) updates.push(parsed);
  });
  return { totalRows, validRows, errors, duplicates, updates };
}

export type Light = "green" | "amber" | "red";

// The sheet's traffic-light icons: green from 15 days left, amber 1 to 14, red on the day and after.
export const trafficLight = (days: number): Light => days >= 15 ? "green" : days >= 1 ? "amber" : "red";

export type BuildingStatus = { expiryDays?: number; dueDate?: string; dueDays?: number; light?: Light; muted: boolean };

// A building's colour follows its Due Date, which always turns before the expiry does.
export function buildingStatus(record: Pick<AssetRecord, "status" | "licenceExpiryDate">, demoDate: string): BuildingStatus {
  const muted = record.status === "Retired";
  if (!record.licenceExpiryDate) return { muted };
  const dueDate = addDays(record.licenceExpiryDate, -FLS_DUE_LEAD_DAYS);
  const dueDays = dateDiffDays(dueDate, demoDate);
  return { expiryDays: dateDiffDays(record.licenceExpiryDate, demoDate), dueDate, dueDays, light: trafficLight(dueDays), muted };
}

export const days = (count: number) => `${Math.abs(count)} day${Math.abs(count) === 1 ? "" : "s"}`;

function digestLine(record: AssetRecord, { expiryDays = 0, dueDays = 0 }: BuildingStatus): string {
  const expiry = expiryDays < 0 ? `expired ${days(expiryDays)} ago` : expiryDays === 0 ? "expires today" : `expires in ${days(expiryDays)}`;
  const due = expiryDays <= 0 ? "" : dueDays < 0 ? `due date passed ${days(dueDays)} ago, ` : dueDays === 0 ? "due today, " : `due in ${days(dueDays)}, `;
  return `• ${record.assetRef} (${record.owner}): ${due}${expiry}`;
}

// The morning message for the facility manager: red and amber buildings by name, the rest as counts. Muted buildings stay out.
export function digestText(state: AppState): string {
  const active = state.records.filter((record) => record.status === "Active").map((record) => ({ record, status: buildingStatus(record, state.demoDate) }));
  const red = active.filter(({ status }) => status.light === "red").sort((a, b) => (b.status.expiryDays ?? 0) - (a.status.expiryDays ?? 0));
  const amber = active.filter(({ status }) => status.light === "amber").sort((a, b) => (a.status.dueDays ?? 0) - (b.status.dueDays ?? 0));
  const green = active.filter(({ status }) => status.light === "green").length;
  const undated = active.filter(({ status }) => !status.light).map(({ record }) => record.assetRef);
  const muted = state.records.length - active.length;
  return [
    `DXB FLS · DCD certificate digest · ${formatDate(state.demoDate)}`,
    ...(red.length ? ["", `RED (${red.length}): due date passed or expired`, ...red.map(({ record, status }) => digestLine(record, status))] : []),
    ...(amber.length ? ["", `AMBER (${amber.length}): due within 14 days`, ...amber.map(({ record, status }) => digestLine(record, status))] : []),
    ...(undated.length ? ["", `No certificate dates (${undated.length}): ${undated.join(", ")}`] : []),
    "",
    `Green: ${green} · Muted: ${muted}`,
  ].join("\n");
}
