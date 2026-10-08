import type {
  Activity,
  Alert,
  AlertSeverity,
  AppState,
  AssetRecord,
  AssetStatus,
  Certificate,
  CertificateStatus,
  ChecklistItem,
  DeadlineTier,
  Inspection,
  InspectionStatus,
  ImportError,
  ImportPreview,
  RegisterHeader,
  RegisterRow,
  RecordType,
  Role,
} from "./types";
import { REGISTER_HEADERS } from "./types";

export const STORAGE_KEY = "keetrack-demo-state";
export const STORAGE_VERSION = 1 as const;

export const nowIso = (): string => new Date().toISOString();

export function makeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? Math.random().toString(36).slice(2, 12)}`;
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function todayString(date = new Date()): string {
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => index === 0 ? String(part).padStart(4, "0") : String(part).padStart(2, "0"))
    .join("-");
}

export function dateDiffDays(target: string, base: string): number {
  return Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const value = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return todayString(value);
}

export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, 1));
  const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, maxDay));
  return todayString(next);
}

export function createInitialState(demoDate = todayString()): AppState {
  return { version: STORAGE_VERSION, demoDate, role: "Admin", records: [], inspections: [], alerts: [], activity: [] };
}

export function isRole(value: unknown): value is Role {
  return value === "Admin" || value === "Engineer" || value === "Reviewer" || value === "Manager";
}

export function validateStoredState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  const isText = (item: unknown) => typeof item === "string";
  const isTimestamp = (item: unknown) => isText(item) && !Number.isNaN(Date.parse(item));
  const isOptionalDate = (item: unknown) => item === undefined || isDateString(item);
  const isActivity = (item: unknown): item is Activity => Boolean(item && typeof item === "object" && isText((item as Activity).id) && isText((item as Activity).event) && isText((item as Activity).detail) && isTimestamp((item as Activity).timestamp) && (isRole((item as Activity).actor) || (item as Activity).actor === "system"));
  const isCertificate = (item: unknown): item is Certificate => {
    if (!item || typeof item !== "object") return false;
    const certificate = item as Partial<Certificate>;
    return isText(certificate.id) && isText(certificate.number) && isDateString(certificate.issuedDate) && isDateString(certificate.expiryDate)
      && ["Pass", "Fail"].includes(certificate.result as string) && ["Valid", "Expired", "Revoked", "Superseded"].includes(certificate.status as string);
  };
  const isRecord = (item: unknown): item is AssetRecord => {
    if (!item || typeof item !== "object") return false;
    const record = item as Partial<AssetRecord>;
    return isText(record.id) && isText(record.assetRef) && ["equipment", "licence"].includes(record.recordType as string)
      && isText(record.assetType) && isText(record.site) && isText(record.owner) && ["Active", "Retired"].includes(record.status as string)
      && isTimestamp(record.createdAt) && isTimestamp(record.updatedAt)
      && (record.serialNo === undefined || isText(record.serialNo)) && (record.assignedEngineer === undefined || isText(record.assignedEngineer))
      && (record.inspectionIntervalMonths === undefined || (Number.isSafeInteger(record.inspectionIntervalMonths) && record.inspectionIntervalMonths > 0))
      && isOptionalDate(record.inspectionDueDate) && isOptionalDate(record.licenceExpiryDate) && isOptionalDate(record.certificateIssuedDate) && isOptionalDate(record.certificateExpiryDate) && isOptionalDate(record.retirementDueDate)
      && Array.isArray(record.certificates) && record.certificates.every(isCertificate) && Array.isArray(record.activity) && record.activity.every(isActivity);
  };
  const isInspection = (item: unknown): boolean => {
    if (!item || typeof item !== "object") return false;
    const inspection = item as Partial<Inspection>;
    return isText(inspection.id) && isText(inspection.assetId) && isText(inspection.inspector)
      && ["Draft", "Submitted", "Returned", "Approved", "Issued"].includes(inspection.status as string)
      && Array.isArray(inspection.checklist) && inspection.checklist.every((check) => Boolean(check && typeof check === "object" && isText((check as ChecklistItem).id) && isText((check as ChecklistItem).label) && ["pass", "fail", "na", "pending"].includes((check as ChecklistItem).result)))
      && (!inspection.photos || (Array.isArray(inspection.photos) && inspection.photos.every((photo) => Boolean(photo && typeof photo === "object" && isText(photo.id) && isText(photo.name) && isText(photo.type) && isText(photo.dataUrl) && typeof photo.bytes === "number" && photo.bytes <= 200 * 1024))))
      && (inspection.signature === undefined || (typeof inspection.signature === "string" && inspection.signature.startsWith("data:image/png;base64,") && inspection.signature.length <= 90_000))
      && isText(inspection.notes) && isTimestamp(inspection.createdAt) && isTimestamp(inspection.updatedAt) && isOptionalDate(inspection.nextInspectionDate)
      && (inspection.submittedAt === undefined || isTimestamp(inspection.submittedAt)) && (inspection.reviewedAt === undefined || isTimestamp(inspection.reviewedAt));
  };
  const isAlert = (item: unknown): boolean => {
    if (!item || typeof item !== "object") return false;
    const alert = item as Partial<Alert>;
    return isText(alert.id) && isText(alert.occurrenceKey) && ["deadline", "review", "certificate", "system"].includes(alert.type as string)
      && isText(alert.event) && isTimestamp(alert.timestamp) && ["info", "warning", "critical"].includes(alert.severity as string) && ["open", "resolved", "history"].includes(alert.status as string)
      && isOptionalDate(alert.dueDate) && (alert.acknowledgedAt === undefined || isTimestamp(alert.acknowledgedAt))
      && (alert.emailSentAt === undefined || isTimestamp(alert.emailSentAt))
      && (alert.whatsappSentAt === undefined || isTimestamp(alert.whatsappSentAt));
  };
  return candidate.version === STORAGE_VERSION
    && isDateString(candidate.demoDate)
    && isRole(candidate.role)
    && Array.isArray(candidate.records) && candidate.records.every(isRecord)
    && Array.isArray(candidate.inspections) && candidate.inspections.every(isInspection)
    && Array.isArray(candidate.alerts) && candidate.alerts.every(isAlert)
    && Array.isArray(candidate.activity) && candidate.activity.every(isActivity);
}

export function trimValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function parseDateCell(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (isDateString(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return todayString(value);
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2_958_465) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? undefined : todayString(date);
  }
  return undefined;
}

function parseRecordType(value: unknown): RecordType | undefined {
  const normalized = trimValue(value).toLowerCase();
  return normalized === "equipment" || normalized === "licence" ? normalized : undefined;
}

function parseStatus(value: unknown): AssetStatus | undefined {
  const normalized = trimValue(value).toLowerCase();
  if (!normalized || normalized === "active") return "Active";
  if (normalized === "retired") return "Retired";
  return undefined;
}

function importError(row: number, message: string, field?: string, raw?: Record<string, unknown>): ImportError {
  return { row, field, message, raw };
}

export function normalizeRegisterRow(raw: Record<string, unknown>, row: number): { row?: RegisterRow; error?: ImportError } {
  const assetRef = trimValue(raw.asset_ref);
  const recordType = parseRecordType(raw.record_type);
  const assetType = trimValue(raw.asset_type);
  const site = trimValue(raw.site);
  const owner = trimValue(raw.owner);
  if (!assetRef) return { error: importError(row, "asset_ref is required", "asset_ref", raw) };
  if (!recordType) return { error: importError(row, "record_type must be equipment or licence", "record_type", raw) };
  if (!assetType) return { error: importError(row, "asset_type is required", "asset_type", raw) };
  if (!site) return { error: importError(row, "site is required", "site", raw) };
  if (!owner) return { error: importError(row, "owner is required", "owner", raw) };
  const status = parseStatus(raw.status);
  if (!status) return { error: importError(row, "status must be Active or Retired", "status", raw) };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trimStart().startsWith("=")) {
      return { error: importError(row, "formulas are not allowed", key, raw) };
    }
  }
  const dateFields = ["inspection_due_date", "licence_expiry_date", "certificate_issued_date", "certificate_expiry_date", "retirement_due_date"] as const;
  const dates: Partial<Record<(typeof dateFields)[number], string>> = {};
  for (const field of dateFields) {
    const value = raw[field];
    if (value === undefined || value === null || value === "") continue;
    const parsed = parseDateCell(value);
    if (!parsed) return { error: importError(row, `${field} must be a valid YYYY-MM-DD date`, field, raw) };
    dates[field] = parsed;
  }
  const certificateFields = ["certificate_no", "certificate_issued_date", "certificate_expiry_date"] as const;
  if (certificateFields.some((field) => trimValue(raw[field])) && certificateFields.some((field) => !trimValue(raw[field]))) {
    return { error: importError(row, "certificate_no, issued date and expiry date must be supplied together", "certificate_no", raw) };
  }
  if (dates.certificate_issued_date && dates.certificate_expiry_date && dates.certificate_expiry_date < dates.certificate_issued_date) {
    return { error: importError(row, "certificate expiry must be on or after issue date", "certificate_expiry_date", raw) };
  }
  const intervalText = trimValue(raw.inspection_interval_months);
  const inspectionIntervalMonths = intervalText ? Number(intervalText) : undefined;
  if (intervalText && (inspectionIntervalMonths === undefined || !Number.isInteger(inspectionIntervalMonths) || inspectionIntervalMonths <= 0)) {
    return { error: importError(row, "inspection_interval_months must be a positive whole number", "inspection_interval_months", raw) };
  }
  return {
    row: {
      assetRef,
      recordType,
      assetType,
      site,
      owner,
      serialNo: trimValue(raw.serial_no) || undefined,
      assignedEngineer: trimValue(raw.assigned_engineer) || undefined,
      inspectionDueDate: dates.inspection_due_date,
      inspectionIntervalMonths,
      licenceExpiryDate: dates.licence_expiry_date,
      certificateNo: trimValue(raw.certificate_no) || undefined,
      certificateIssuedDate: dates.certificate_issued_date,
      certificateExpiryDate: dates.certificate_expiry_date,
      retirementDueDate: dates.retirement_due_date,
      status,
    },
  };
}

export function validateRegisterRows(rows: Record<string, unknown>[], existingAssetRefs: string[] = []): ImportPreview {
  const errors: ImportError[] = [];
  const duplicates: ImportError[] = [];
  const validRows: RegisterRow[] = [];
  const seen = new Set(existingAssetRefs.map((value) => value.trim().toLowerCase()));
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeRegisterRow(raw, rowNumber);
    if (normalized.error) {
      errors.push(normalized.error);
      return;
    }
    const key = normalized.row!.assetRef.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(importError(rowNumber, "duplicate asset_ref skipped without overwrite", "asset_ref", raw));
      return;
    }
    seen.add(key);
    validRows.push(normalized.row!);
  });
  return { totalRows: rows.length, validRows, errors, duplicates };
}

export function rowToRecord(row: RegisterRow, actor: Role = "Admin", timestamp = nowIso()): AssetRecord {
  return {
    ...row,
    id: makeId("asset"),
    certificates: row.certificateNo && row.certificateIssuedDate && row.certificateExpiryDate ? [{
      id: makeId("cert"), number: row.certificateNo, issuedDate: row.certificateIssuedDate, expiryDate: row.certificateExpiryDate,
      result: "Pass", status: "Valid",
    }] : [],
    activity: [{ id: makeId("activity"), event: "Imported", detail: "Register row imported", actor, timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function deadlineTier(days: number): DeadlineTier | undefined {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "due7";
  if (days <= 30) return "due30";
  return undefined;
}

export function effectiveCertificateStatus(certificate: Certificate, demoDate: string): CertificateStatus {
  return certificate.status === "Valid" && certificate.expiryDate < demoDate ? "Expired" : certificate.status;
}

type Deadline = { key: string; event: string; date: string; severity: AlertSeverity };

function recordDeadlines(record: AssetRecord, demoDate: string): Deadline[] {
  if (record.status === "Retired") return [];
  const deadlines: Deadline[] = [];
  if (record.inspectionDueDate) deadlines.push({ key: "inspection", event: "Inspection due", date: record.inspectionDueDate, severity: "warning" });
  if (record.licenceExpiryDate) deadlines.push({ key: "licence", event: "Licence expiry", date: record.licenceExpiryDate, severity: "critical" });
  const currentCertificate = [...record.certificates].reverse().find((certificate) => certificate.status === "Valid" || certificate.status === "Expired");
  if (currentCertificate) deadlines.push({ key: `certificate:${currentCertificate.id}`, event: "Certificate expiry", date: currentCertificate.expiryDate, severity: "critical" });
  if (record.retirementDueDate) deadlines.push({ key: "retirement", event: "Retirement due", date: record.retirementDueDate, severity: "warning" });
  return deadlines;
}

// The most urgent obligation on a record, using the same dates as the alert tiers.
export function nextDeadline(record: AssetRecord, demoDate: string): (Deadline & { days: number }) | undefined {
  return recordDeadlines(record, demoDate).map((deadline) => ({ ...deadline, days: dateDiffDays(deadline.date, demoDate) })).sort((a, b) => a.days - b.days)[0];
}

export function recalculateAlerts(state: AppState, timestamp = nowIso()): AppState {
  const next = state.alerts.map((alert) => ({ ...alert }));
  const currentKeys = new Set<string>();
  for (const record of state.records) {
    for (const certificate of record.certificates) {
      if (effectiveCertificateStatus(certificate, state.demoDate) === "Expired" && !next.some((alert) => alert.occurrenceKey === `certificate:${certificate.id}:Expired`)) next.push(certificateAlert(record, { ...certificate, status: "Expired" }, "Certificate expired", timestamp));
    }
    for (const deadline of recordDeadlines(record, state.demoDate)) {
      const tier = deadlineTier(dateDiffDays(deadline.date, state.demoDate));
      if (!tier) continue;
      const occurrenceKey = `${record.id}:${deadline.key}:${deadline.date}`;
      currentKeys.add(occurrenceKey);
      const sameTier = next.find((alert) => alert.occurrenceKey === occurrenceKey && alert.tier === tier && alert.status === "open");
      if (sameTier) { sameTier.owner = record.owner; sameTier.assetRef = record.assetRef; continue; }
      next.forEach((alert) => {
        if (alert.occurrenceKey === occurrenceKey && alert.status === "open") alert.status = "resolved";
      });
      next.push({ id: makeId("alert"), occurrenceKey, type: "deadline", event: deadline.event, assetId: record.id, assetRef: record.assetRef, owner: record.owner, dueDate: deadline.date, timestamp, severity: tier === "overdue" ? "critical" : deadline.severity, tier, status: "open" });
    }
  }
  next.forEach((alert) => {
    if (alert.type === "deadline" && alert.status === "open" && !currentKeys.has(alert.occurrenceKey)) alert.status = "resolved";
  });
  return { ...state, alerts: next };
}

function activity(event: string, detail: string, actor: Role | "system", timestamp: string): Activity {
  return { id: makeId("activity"), event, detail, actor, timestamp };
}

function certificateAlert(record: AssetRecord, certificate: Certificate, event: string, timestamp: string): Alert {
  return { id: makeId("alert"), occurrenceKey: `certificate:${certificate.id}:${certificate.status}`, type: "certificate", event, assetId: record.id, assetRef: record.assetRef, owner: record.owner, dueDate: certificate.expiryDate, timestamp, severity: certificate.status === "Revoked" || certificate.status === "Expired" ? "critical" : "info", status: "history" };
}

export function importRows(state: AppState, rows: RegisterRow[], actor = state.role, timestamp = nowIso()): AppState {
  if (!rows.length) return state;
  if (state.records.length + rows.length > 500) throw new Error("The demo is limited to 500 total register records. No rows were saved.");
  const seen = new Set(state.records.map((record) => record.assetRef.trim().toLowerCase()));
  for (const row of rows) {
    const key = row.assetRef.trim().toLowerCase();
    if (seen.has(key)) throw new Error("The register changed since this preview. Preview the file again to skip duplicates.");
    seen.add(key);
  }
  const imported = rows.map((row) => rowToRecord(row, actor, timestamp));
  const next: AppState = { ...state, records: [...state.records, ...imported], activity: [activity("Register imported", `${rows.length} record${rows.length === 1 ? "" : "s"} added`, actor, timestamp), ...state.activity] };
  return recalculateAlerts(next, timestamp);
}

export function getRecord(state: AppState, assetId: string): AssetRecord | undefined {
  return state.records.find((record) => record.id === assetId);
}

const DEFAULT_CHECKLIST = ["Identity and markings legible", "Components free from visible damage", "Fixings and anchor points secure", "Storage and use conditions acceptable"];

export function createInspection(state: AppState, assetId: string, actor = state.role, timestamp = nowIso()): { state: AppState; inspection: Inspection } {
  const record = getRecord(state, assetId);
  if (record?.status !== "Active") throw new Error("Choose an active record to inspect.");
  const checklist: ChecklistItem[] = DEFAULT_CHECKLIST.map((label, index) => ({ id: `check-${index + 1}`, label, result: "pending" }));
  const inspection: Inspection = { id: makeId("inspection"), assetId, inspector: record.assignedEngineer || actor, checklist, notes: "", status: "Draft", createdAt: timestamp, updatedAt: timestamp };
  return { state: { ...state, inspections: [inspection, ...state.inspections] }, inspection };
}

export function updateInspection(state: AppState, id: string, patch: Partial<Pick<Inspection, "checklist" | "notes" | "photos" | "signature">>, timestamp = nowIso()): AppState {
  if (patch.photos && (patch.photos.some((photo) => photo.bytes > 200 * 1024) || patch.photos.reduce((total, photo) => total + photo.bytes, 0) > 1024 * 1024)) throw new Error("Evidence exceeds the local photo limit.");
  return { ...state, inspections: state.inspections.map((item) => item.id === id && (item.status === "Draft" || item.status === "Returned") ? { ...item, ...patch, updatedAt: timestamp } : item) };
}

// Only never-submitted drafts can go; anything reviewed stays in the audit trail.
export function deleteInspection(state: AppState, id: string): AppState {
  return { ...state, inspections: state.inspections.filter((item) => item.id !== id || item.status !== "Draft") };
}

export function submitInspection(state: AppState, id: string, timestamp = nowIso()): AppState {
  const inspection = state.inspections.find((item) => item.id === id);
  if (!inspection || !inspection.checklist.length || (inspection.status !== "Draft" && inspection.status !== "Returned") || !inspection.checklist.every((item) => item.result !== "pending")) return state;
  const next: AppState = { ...state, inspections: state.inspections.map((item) => item.id === id ? { ...item, status: "Submitted", submittedAt: timestamp, updatedAt: timestamp } : item), alerts: state.alerts.map((alert) => alert.occurrenceKey.startsWith(`returned:${id}`) ? { ...alert, status: "resolved" as const } : alert) };
  const record = getRecord(state, inspection.assetId);
  if (!record) return next;
  const alert: Alert = { id: makeId("alert"), occurrenceKey: `review:${id}:${timestamp}`, type: "review", event: "Inspection submitted for review", assetId: record.id, assetRef: record.assetRef, owner: record.owner, timestamp, severity: "info", status: "open" };
  return { ...next, records: next.records.map((item) => item.id === record.id ? { ...item, activity: [activity("Inspection submitted", "Awaiting review", state.role, timestamp), ...item.activity] } : item), alerts: [alert, ...next.alerts], activity: [activity("Inspection submitted", `${record.assetRef} awaiting review`, state.role, timestamp), ...state.activity] };
}

export function returnInspection(state: AppState, id: string, comment: string, actor = state.role, timestamp = nowIso()): AppState {
  const inspection = state.inspections.find((item) => item.id === id);
  if (!inspection || inspection.status !== "Submitted" || !comment.trim()) return state;
  const record = getRecord(state, inspection.assetId);
  const returnedAlert: Alert | undefined = record ? { id: makeId("alert"), occurrenceKey: `returned:${id}:${timestamp}`, type: "review", event: "Inspection returned for correction", assetId: record.id, assetRef: record.assetRef, owner: record.owner, timestamp, severity: "warning", status: "open" } : undefined;
  return { ...state, inspections: state.inspections.map((item) => item.id === id ? { ...item, status: "Returned", reviewerComment: comment.trim(), reviewedAt: timestamp, updatedAt: timestamp } : item), alerts: [...(returnedAlert ? [returnedAlert] : []), ...state.alerts.map((alert) => alert.occurrenceKey.startsWith(`review:${id}`) ? { ...alert, status: "resolved" as const } : alert)], activity: [activity("Inspection returned", comment.trim(), actor, timestamp), ...state.activity] };
}

export function approveInspection(state: AppState, id: string, expiryDate: string, actor = state.role, timestamp = nowIso()): AppState {
  const inspection = state.inspections.find((item) => item.id === id);
  if (!inspection || !inspection.checklist.length || inspection.status !== "Submitted" || !isDateString(expiryDate) || expiryDate < state.demoDate || inspection.checklist.some((item) => item.result === "fail" || item.result === "pending")) return state;
  if (inspection.certificateId) return state;
  const record = getRecord(state, inspection.assetId);
  if (!record) return state;
  const number = `CERT-${state.demoDate.replaceAll("-", "")}-${String(state.records.reduce((total, item) => total + item.certificates.length, 0) + 1).padStart(4, "0")}`;
  const certificate: Certificate = { id: makeId("cert"), number, issuedDate: state.demoDate, expiryDate, result: "Pass", status: "Valid", sourceInspectionId: id };
  const nextInspectionDate = record.inspectionIntervalMonths ? addMonthsClamped(state.demoDate, record.inspectionIntervalMonths) : undefined;
  const next: AppState = {
    ...state,
    inspections: state.inspections.map((item) => item.id === id ? { ...item, status: "Issued", certificateId: certificate.id, nextInspectionDate, reviewedAt: timestamp, updatedAt: timestamp } : item),
    records: state.records.map((item) => item.id === record.id ? { ...item, inspectionDueDate: nextInspectionDate, certificates: [...item.certificates.map((cert) => (cert.status === "Valid" || cert.status === "Expired") ? { ...cert, status: "Superseded" as const } : cert), certificate], certificateNo: certificate.number, certificateIssuedDate: certificate.issuedDate, certificateExpiryDate: certificate.expiryDate, activity: [activity("Certificate issued", certificate.number, actor, timestamp), ...item.activity], updatedAt: timestamp } : item),
    alerts: [certificateAlert(record, certificate, "Certificate issued", timestamp), ...record.certificates.filter((cert) => cert.status === "Valid" || cert.status === "Expired").map((cert) => certificateAlert(record, { ...cert, status: "Superseded" }, "Certificate superseded", timestamp)), ...state.alerts.map((alert): Alert => alert.occurrenceKey.startsWith(`review:${id}`) || alert.occurrenceKey.startsWith(`returned:${id}`) ? { ...alert, status: "resolved" } : alert)],
    activity: [activity("Certificate issued", `${record.assetRef} · ${certificate.number}`, actor, timestamp), ...state.activity],
  };
  return recalculateAlerts(next, timestamp);
}

export function setRole(state: AppState, role: Role): AppState {
  return { ...state, role };
}

export function setDemoDate(state: AppState, demoDate: string, timestamp = nowIso()): AppState {
  if (!isDateString(demoDate)) return state;
  return recalculateAlerts({ ...state, demoDate, activity: [activity("Demo date changed", demoDate, state.role, timestamp), ...state.activity] }, timestamp);
}

export function setDeadlineShortcut(state: AppState, assetId: string, daysFromToday: number, timestamp = nowIso()): AppState {
  const record = getRecord(state, assetId);
  if (!record) return state;
  const inspectionDueDate = addDays(state.demoDate, daysFromToday);
  return recalculateAlerts({ ...state, records: state.records.map((item) => item.id === assetId ? { ...item, inspectionDueDate, updatedAt: timestamp } : item) }, timestamp);
}

export function acknowledgeAlert(state: AppState, alertId: string, actor = state.role, timestamp = nowIso()): AppState {
  return { ...state, alerts: state.alerts.map((alert) => alert.id === alertId && alert.status === "open" ? { ...alert, acknowledgedBy: actor, acknowledgedAt: timestamp } : alert) };
}

export function revokeCertificate(state: AppState, assetId: string, certificateId: string, actor = state.role, timestamp = nowIso()): AppState {
  return changeCertificateStatus(state, assetId, certificateId, "Revoked", actor, timestamp);
}

export function changeCertificateStatus(state: AppState, assetId: string, certificateId: string, status: "Revoked" | "Superseded", actor = state.role, timestamp = nowIso()): AppState {
  const record = getRecord(state, assetId);
  const certificate = record?.certificates.find((item) => item.id === certificateId);
  if (!record || !certificate || certificate.status === "Revoked" || certificate.status === "Superseded") return state;
  const event = `Certificate ${status.toLowerCase()}`;
  return recalculateAlerts({ ...state, records: state.records.map((item) => item.id === assetId ? { ...item, certificates: item.certificates.map((cert) => cert.id === certificateId ? { ...cert, status, token: undefined, verifyUrl: undefined, tokenIssuedAt: undefined } : cert), activity: [activity(event, certificate.number, actor, timestamp), ...item.activity], updatedAt: timestamp } : item), alerts: [certificateAlert(record, { ...certificate, status }, event, timestamp), ...state.alerts], activity: [activity(event, `${record.assetRef} · ${certificate.number}`, actor, timestamp), ...state.activity] }, timestamp);
}

export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toExceptionCsv(errors: ImportError[]): string {
  const lines = ["row,field,message", ...errors.map((error) => [error.row, error.field ?? "", error.message].map(escapeCsvCell).join(","))];
  return `${lines.join("\n")}\n`;
}

export function recordToRawRow(record: AssetRecord): Record<RegisterHeader, string | number> {
  return {
    asset_ref: record.assetRef, record_type: record.recordType, asset_type: record.assetType, site: record.site, owner: record.owner,
    serial_no: record.serialNo ?? "", assigned_engineer: record.assignedEngineer ?? "", inspection_due_date: record.inspectionDueDate ?? "",
    inspection_interval_months: record.inspectionIntervalMonths ?? "", licence_expiry_date: record.licenceExpiryDate ?? "", certificate_no: record.certificateNo ?? "",
    certificate_issued_date: record.certificateIssuedDate ?? "", certificate_expiry_date: record.certificateExpiryDate ?? "", retirement_due_date: record.retirementDueDate ?? "", status: record.status,
  };
}
