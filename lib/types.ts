export const REGISTER_HEADERS = [
  "asset_ref",
  "record_type",
  "asset_type",
  "site",
  "owner",
  "serial_no",
  "assigned_engineer",
  "inspection_due_date",
  "inspection_interval_months",
  "licence_expiry_date",
  "certificate_no",
  "certificate_issued_date",
  "certificate_expiry_date",
  "retirement_due_date",
  "status",
] as const;

export type RegisterHeader = (typeof REGISTER_HEADERS)[number];
export type RecordType = "equipment" | "licence";
export type AssetStatus = "Active" | "Retired";
export type Role = "Admin" | "Engineer" | "Reviewer" | "Manager";
export type InspectionStatus = "Draft" | "Submitted" | "Returned" | "Approved" | "Issued";
export type CertificateStatus = "Valid" | "Expired" | "Revoked" | "Superseded";
export type AlertStatus = "open" | "resolved" | "history";
export type AlertSeverity = "info" | "warning" | "critical";
export type DeadlineTier = "due30" | "due7" | "today" | "overdue";

export type RegisterRow = {
  assetRef: string;
  recordType: RecordType;
  assetType: string;
  site: string;
  owner: string;
  serialNo?: string;
  assignedEngineer?: string;
  inspectionDueDate?: string;
  inspectionIntervalMonths?: number;
  licenceExpiryDate?: string;
  certificateNo?: string;
  certificateIssuedDate?: string;
  certificateExpiryDate?: string;
  retirementDueDate?: string;
  status: AssetStatus;
};

export type Certificate = {
  id: string;
  number: string;
  issuedDate: string;
  expiryDate: string;
  result: "Pass" | "Fail";
  status: CertificateStatus;
  sourceInspectionId?: string;
  token?: string;
  verifyUrl?: string;
  tokenIssuedAt?: string;
};

// Typed in from the original warranty document; replaces the one derived from the first certificate.
export type Warranty = {
  number: string;
  product: string;
  warrantyDate: string;
  years: number;
  contractNo?: string;
  project?: string;
  scope?: string;
  mainContractor?: string;
};

export type AssetRecord = RegisterRow & {
  id: string;
  warranty?: Warranty;
  certificates: Certificate[];
  activity: Activity[];
  createdAt: string;
  updatedAt: string;
};

export type ChecklistItem = {
  id: string;
  label: string;
  result: "pass" | "fail" | "na" | "pending";
};

export type InspectionPhoto = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  bytes: number;
};

export type Inspection = {
  id: string;
  assetId: string;
  inspector: string;
  checklist: ChecklistItem[];
  photos?: InspectionPhoto[];
  // PNG drawn on the phone hand-off page; shown on the certificate's "Inspected by" line.
  signature?: string;
  notes: string;
  status: InspectionStatus;
  reviewerComment?: string;
  submittedAt?: string;
  reviewedAt?: string;
  certificateId?: string;
  nextInspectionDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type Alert = {
  id: string;
  occurrenceKey: string;
  type: "deadline" | "review" | "certificate" | "system";
  event: string;
  assetId?: string;
  assetRef?: string;
  owner?: string;
  dueDate?: string;
  timestamp: string;
  severity: AlertSeverity;
  tier?: DeadlineTier;
  status: AlertStatus;
  acknowledgedBy?: Role;
  acknowledgedAt?: string;
  emailSentAt?: string;
  whatsappSentAt?: string;
};

export type Activity = {
  id: string;
  event: string;
  detail: string;
  actor: Role | "system";
  timestamp: string;
};

export type AppState = {
  version: 1;
  demoDate: string;
  role: Role;
  records: AssetRecord[];
  inspections: Inspection[];
  alerts: Alert[];
  activity: Activity[];
};

export type ImportError = {
  row: number;
  field?: string;
  message: string;
  raw?: Record<string, unknown>;
};

export type ImportPreview = {
  totalRows: number;
  validRows: RegisterRow[];
  errors: ImportError[];
  duplicates: ImportError[];
};
