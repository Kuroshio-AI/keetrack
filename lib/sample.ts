import { addDays } from "./domain";
import { REGISTER_HEADERS, type RegisterRow } from "./types";

export type SampleId = "1" | "2";

export function sampleRows(demoDate: string, sample: SampleId = "1"): RegisterRow[] {
  if (sample === "2") return [
    { assetRef: "ANC-201", recordType: "equipment", assetType: "Anchor Point", site: "Riverside Depot", owner: "Nora Iyer", serialNo: "AP-201-RD", assignedEngineer: "Dev Shah", inspectionDueDate: demoDate, inspectionIntervalMonths: 12, certificateNo: "CERT-DEMO-0201", certificateIssuedDate: addDays(demoDate, -365), certificateExpiryDate: addDays(demoDate, -1), retirementDueDate: addDays(demoDate, 30), status: "Active" },
    { assetRef: "LIC-202", recordType: "licence", assetType: "Work-at-Height Licence", site: "Riverside Depot", owner: "Amal Joseph", assignedEngineer: "Leah Wong", licenceExpiryDate: addDays(demoDate, 7), status: "Active" },
    { assetRef: "HAR-203", recordType: "equipment", assetType: "Full Body Harness", site: "Riverside Depot", owner: "Tara Menon", serialNo: "FBH-203-26", assignedEngineer: "Dev Shah", inspectionDueDate: addDays(demoDate, 90), inspectionIntervalMonths: 6, retirementDueDate: demoDate, status: "Active" },
    { assetRef: "SRL-204", recordType: "equipment", assetType: "Self-Retracting Lifeline", site: "Riverside Depot", owner: "Kiran Bose", serialNo: "SRL-204-25", assignedEngineer: "Leah Wong", inspectionDueDate: addDays(demoDate, 30), inspectionIntervalMonths: 6, certificateNo: "CERT-DEMO-0204", certificateIssuedDate: addDays(demoDate, -180), certificateExpiryDate: addDays(demoDate, 7), status: "Active" },
    { assetRef: "KIT-205", recordType: "equipment", assetType: "Rescue Kit", site: "Riverside Depot", owner: "Mira Das", serialNo: "RKT-205-26", assignedEngineer: "Dev Shah", inspectionDueDate: addDays(demoDate, 90), inspectionIntervalMonths: 12, certificateNo: "CERT-DEMO-0205", certificateIssuedDate: addDays(demoDate, -180), certificateExpiryDate: addDays(demoDate, 180), status: "Active" },
    { assetRef: "LIF-206", recordType: "equipment", assetType: "Horizontal Lifeline", site: "Riverside Depot", owner: "Omar Khan", serialNo: "HLL-206-23", assignedEngineer: "Leah Wong", inspectionDueDate: addDays(demoDate, -14), inspectionIntervalMonths: 6, retirementDueDate: addDays(demoDate, -7), status: "Retired" },
  ];
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
