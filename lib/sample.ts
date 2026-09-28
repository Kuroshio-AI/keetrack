import { addDays } from "./domain";
import { REGISTER_HEADERS, type RegisterRow } from "./types";

export function sampleRows(demoDate: string): RegisterRow[] {
  return [
    { assetRef: "HAR-001", recordType: "equipment", assetType: "Full Body Harness", site: "Northpoint Works", owner: "Maya Singh", serialNo: "FBH-001-26", assignedEngineer: "Leo Hart", inspectionDueDate: addDays(demoDate, 7), inspectionIntervalMonths: 6, status: "Active" },
    { assetRef: "LIF-014", recordType: "equipment", assetType: "Horizontal Lifeline", site: "Northpoint Works", owner: "Rory Chen", serialNo: "HLL-014-24", assignedEngineer: "Leo Hart", inspectionDueDate: addDays(demoDate, -3), inspectionIntervalMonths: 6, status: "Active" },
    { assetRef: "LIC-023", recordType: "licence", assetType: "Work-at-Height Licence", site: "Harbour Plant", owner: "Aisha Khan", assignedEngineer: "Priya Das", licenceExpiryDate: addDays(demoDate, 30), status: "Active" },
    { assetRef: "ANC-009", recordType: "equipment", assetType: "Anchor Point", site: "Harbour Plant", owner: "Jon Bell", assignedEngineer: "Priya Das", inspectionDueDate: demoDate, inspectionIntervalMonths: 12, status: "Active" },
    { assetRef: "CERT-018", recordType: "equipment", assetType: "Roof Access Kit", site: "East Yard", owner: "Maya Singh", certificateNo: "CERT-2026-0018", certificateIssuedDate: addDays(demoDate, -30), certificateExpiryDate: addDays(demoDate, 335), status: "Active" },
    { assetRef: "HAR-004", recordType: "equipment", assetType: "Full Body Harness", site: "Northpoint Works", owner: "Rory Chen", serialNo: "FBH-004-22", status: "Retired" },
  ];
}

export function rowsToMatrix(rows: RegisterRow[]): (string | number)[][] {
  return rows.map((row) => [row.assetRef, row.recordType, row.assetType, row.site, row.owner, row.serialNo ?? "", row.assignedEngineer ?? "", row.inspectionDueDate ?? "", row.inspectionIntervalMonths ?? "", row.licenceExpiryDate ?? "", row.certificateNo ?? "", row.certificateIssuedDate ?? "", row.certificateExpiryDate ?? "", row.retirementDueDate ?? "", row.status]);
}

export function rowToRaw(row: RegisterRow): Record<string, string | number> {
  return {
    asset_ref: row.assetRef, record_type: row.recordType, asset_type: row.assetType, site: row.site, owner: row.owner,
    serial_no: row.serialNo ?? "", assigned_engineer: row.assignedEngineer ?? "", inspection_due_date: row.inspectionDueDate ?? "",
    inspection_interval_months: row.inspectionIntervalMonths ?? "", licence_expiry_date: row.licenceExpiryDate ?? "", certificate_no: row.certificateNo ?? "",
    certificate_issued_date: row.certificateIssuedDate ?? "", certificate_expiry_date: row.certificateExpiryDate ?? "", retirement_due_date: row.retirementDueDate ?? "", status: row.status,
  };
}

export const sampleHeaders = [...REGISTER_HEADERS];
