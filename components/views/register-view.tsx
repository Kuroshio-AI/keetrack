"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, Edit3, FileBadge, Plus, Search, ShieldCheck, UserRound } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { blankWarranty, readWarranty, WarrantyFields, type WarrantyForm } from "@/components/warranty-fields";
import { dateDiffDays, deadlineTier, effectiveCertificateStatus, importRows, makeId, nextDeadline, normalizeRegisterRow, recalculateAlerts, saveWarranty, warrantyFor } from "@/lib/domain";
import type { AssetRecord, RecordType } from "@/lib/types";
import { formatDate, formatLocalDate } from "@/lib/utils";

type FormState = { assetRef: string; recordType: RecordType; assetType: string; site: string; owner: string; assignedEngineer: string; serialNo: string; inspectionIntervalMonths: string; inspectionDueDate: string; licenceExpiryDate: string; retirementDueDate: string; status: "Active" | "Retired" };
const emptyForm: FormState = { assetRef: "", recordType: "equipment", assetType: "", site: "", owner: "", assignedEngineer: "", serialNo: "", inspectionIntervalMonths: "", inspectionDueDate: "", licenceExpiryDate: "", retirementDueDate: "", status: "Active" };
function formFor(record?: AssetRecord): FormState { return record ? { assetRef: record.assetRef, recordType: record.recordType, assetType: record.assetType, site: record.site, owner: record.owner, assignedEngineer: record.assignedEngineer ?? "", serialNo: record.serialNo ?? "", inspectionIntervalMonths: String(record.inspectionIntervalMonths ?? ""), inspectionDueDate: record.inspectionDueDate ?? "", licenceExpiryDate: record.licenceExpiryDate ?? "", retirementDueDate: record.retirementDueDate ?? "", status: record.status } : emptyForm; }

export function RegisterView() {
  const { state, update } = useApp();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(() => searchParams.get("asset") ?? undefined);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  // A warranty can ride along with a new equipment record, old or newly bought; licences have none.
  const [warranty, setWarranty] = useState<WarrantyForm>();
  const canEdit = state.role !== "Manager";
  const visible = useMemo(() => state.records.filter((record) => (statusFilter === "all" || record.status === statusFilter) && `${record.assetRef} ${record.assetType} ${record.site} ${record.owner}`.toLowerCase().includes(query.toLowerCase())), [state.records, query, statusFilter]);
  const selected = state.records.find((record) => record.id === selectedId) ?? visible[0];

  function startCreate() { setSelectedId(undefined); setForm(emptyForm); setFormError(""); setWarranty(undefined); setEditing(true); }
  function startEdit(record: AssetRecord) { setSelectedId(record.id); setForm(formFor(record)); setFormError(""); setWarranty(undefined); setEditing(true); }
  const warrantyAllowed = !selectedId && form.recordType === "equipment";
  // Keyboard focus follows the section: into its first field on open, back to the button on remove.
  function openWarranty() { setWarranty(blankWarranty); requestAnimationFrame(() => document.getElementById("warranty-number")?.focus()); }
  function removeWarranty() { setWarranty(undefined); requestAnimationFrame(() => document.getElementById("add-warranty")?.focus()); }
  function saveForm() {
    if (!canEdit) return;
    setFormError("");
    const parsed = normalizeRegisterRow({ asset_ref: form.assetRef, record_type: form.recordType, asset_type: form.assetType, site: form.site, owner: form.owner, serial_no: form.serialNo, assigned_engineer: form.assignedEngineer, inspection_due_date: form.inspectionDueDate, inspection_interval_months: form.inspectionIntervalMonths, licence_expiry_date: form.licenceExpiryDate, retirement_due_date: form.retirementDueDate, status: form.status }, 1);
    if (!parsed.row) { setFormError(parsed.error?.message ?? "Invalid record"); return; }
    const row = parsed.row;
    const withWarranty = warrantyAllowed && warranty ? readWarranty(warranty, row.assetType) : undefined;
    if (withWarranty && !withWarranty.warranty) { setFormError(withWarranty.error ?? "Check the warranty details."); return; }
    const typed = withWarranty?.warranty;
    let created: string | undefined;
    const saved = update((current) => {
      if (current.records.some((record) => record.id !== selectedId && record.assetRef.trim().toLowerCase() === row.assetRef.toLowerCase())) throw new Error("That asset_ref already exists.");
      if (!selectedId) { const next = typed ? saveWarranty(current, row, typed) : importRows(current, [row]); created = next.records[next.records.length - 1]?.id; return next; }
      const timestamp = new Date().toISOString();
      const event = { id: makeId("activity"), event: "Record updated", detail: row.assetRef, actor: current.role, timestamp };
      // Certificate history is changed only through issuance and certificate actions.
      const { certificateNo, certificateIssuedDate, certificateExpiryDate, ...fields } = row;
      return recalculateAlerts({ ...current, records: current.records.map((record) => record.id === selectedId ? { ...record, ...fields, updatedAt: timestamp, activity: [event, ...record.activity] } : record), activity: [event, ...current.activity] });
    });
    // Show the record just added rather than whichever is first in the list.
    if (saved) { setEditing(false); setFormError(""); if (created) setSelectedId(created); }
  }

  return <div className="grid gap-5 xl:grid-cols-[.95fr_1.05fr]">
    <Card className="min-h-[580px]"><CardHeader className="gap-4 border-b border-line"><div className="flex items-center justify-between gap-3"><div><div className="eyebrow">{state.records.length} records</div><CardTitle>Register</CardTitle></div>{canEdit && <Button size="sm" onClick={startCreate}><Plus data-icon="inline-start" />Add record</Button>}</div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search register" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ref, asset, site or owner" className="pl-9" /></div><Select aria-label="Filter record status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option>Active</option><option>Retired</option></Select></CardHeader><CardContent className="p-3 sm:p-4">{visible.length ? <div className="flex flex-col gap-1">{visible.map((record) => <button key={record.id} className={`focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selected?.id === record.id ? "bg-[#e8f3f8]" : "hover:bg-paper"}`} onClick={() => { setSelectedId(record.id); setEditing(false); }}><div className="flex min-w-0 items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${record.status === "Retired" ? "bg-[#eef0f2] text-slate-500" : "bg-[#e8f3f8] text-accent"}`}>{record.status === "Retired" ? <Archive className="size-4" /> : <ShieldCheck className="size-4" />}</span><span className="min-w-0"><span className="block truncate font-semibold text-navy">{record.assetRef}</span><span className="block truncate text-xs text-slate-500">{record.assetType} · {record.site}</span></span></div><RecordBadge record={record} demoDate={state.demoDate} /></button>)}</div> : <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-slate-500">No records match this search.</div>}</CardContent></Card>
    <div className="flex flex-col gap-5">{editing ? <Card><CardHeader><div className="eyebrow">{selectedId ? "Edit record" : "New record"}</div><CardTitle>{selectedId ? "Keep the register current." : "Add an operational record."}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="asset-ref">Asset ref *</Label><Input id="asset-ref" className="mt-1.5" value={form.assetRef} onChange={(event) => setForm({ ...form, assetRef: event.target.value })} /></div><div><Label htmlFor="record-type">Record type *</Label><Select id="record-type" className="mt-1.5" value={form.recordType} onChange={(event) => setForm({ ...form, recordType: event.target.value as RecordType })}><option value="equipment">Equipment</option><option value="licence">Licence</option></Select></div><div><Label htmlFor="asset-type">Asset type *</Label><Input id="asset-type" className="mt-1.5" value={form.assetType} onChange={(event) => setForm({ ...form, assetType: event.target.value })} /></div><div><Label htmlFor="site">Site *</Label><Input id="site" className="mt-1.5" value={form.site} onChange={(event) => setForm({ ...form, site: event.target.value })} /></div><div><Label htmlFor="owner">Owner *</Label><Input id="owner" className="mt-1.5" value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} /></div><div><Label htmlFor="engineer">Assigned engineer</Label><Input id="engineer" className="mt-1.5" value={form.assignedEngineer} onChange={(event) => setForm({ ...form, assignedEngineer: event.target.value })} /></div><div><Label htmlFor="serial-no">Serial number</Label><Input id="serial-no" className="mt-1.5" value={form.serialNo} onChange={(event) => setForm({ ...form, serialNo: event.target.value })} /></div><div><Label htmlFor="inspection-interval">Inspection interval (months)</Label><Input id="inspection-interval" type="number" min="1" step="1" className="mt-1.5" value={form.inspectionIntervalMonths} onChange={(event) => setForm({ ...form, inspectionIntervalMonths: event.target.value })} /></div><div><Label htmlFor="inspection-date">Inspection due</Label><Input id="inspection-date" type="date" className="mt-1.5" value={form.inspectionDueDate} onChange={(event) => setForm({ ...form, inspectionDueDate: event.target.value })} /></div><div><Label htmlFor="licence-date">Licence expiry</Label><Input id="licence-date" type="date" className="mt-1.5" value={form.licenceExpiryDate} onChange={(event) => setForm({ ...form, licenceExpiryDate: event.target.value })} /></div><div><Label htmlFor="retire-date">Retirement due</Label><Input id="retire-date" type="date" className="mt-1.5" value={form.retirementDueDate} onChange={(event) => setForm({ ...form, retirementDueDate: event.target.value })} /></div><div><Label htmlFor="status">Status</Label><Select id="status" className="mt-1.5" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "Active" | "Retired" })}><option>Active</option><option>Retired</option></Select></div>{warrantyAllowed && (warranty ? <section aria-labelledby="record-warranty-title" className="animate-rise grid gap-4 rounded-xl border border-line bg-paper p-4 sm:col-span-2 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 sm:col-span-2"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-accent shadow-sm"><FileBadge className="size-4" aria-hidden="true" /></span><div><div className="eyebrow">Optional</div><div id="record-warranty-title" className="font-semibold text-navy">Warranty</div></div></div><Button variant="ghost" size="sm" onClick={removeWarranty}>Remove</Button></div>
        <WarrantyFields value={warranty} onChange={setWarranty} assetType={form.assetType} demoDate={state.demoDate} />
      </section> : <button id="add-warranty" type="button" onClick={openWarranty} className="focus-ring group flex w-full items-center gap-3 rounded-xl border border-dashed border-[#b8cedc] px-4 py-3 text-left transition-[transform,background-color,border-color] duration-150 ease-out hover:border-accent hover:bg-[#f8fcfe] active:scale-[0.99] sm:col-span-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e8f3f8] text-accent"><FileBadge className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-navy">Add warranty</span><span className="block text-xs text-slate-500">Optional · type in the details from its warranty document</span></span>
        <Plus className="size-4 text-slate-400 transition-colors group-hover:text-accent" aria-hidden="true" />
      </button>)}{formError && <p className="sm:col-span-2 text-sm text-danger" role="alert">{formError}</p>}</CardContent><div className="flex justify-end gap-2 border-t border-line p-5"><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={saveForm}>{warrantyAllowed && warranty ? "Save record and warranty" : "Save record"}</Button></div></Card> : selected ? <RecordDetail record={selected} onEdit={canEdit ? () => startEdit(selected) : undefined} demoDate={state.demoDate} /> : <Card><CardContent className="p-8 text-center text-sm text-slate-500">Import or create a record to see its details.</CardContent></Card>}</div>
  </div>;
}

// Same tiers as Dashboard and Alerts, so an overdue record never shows a green "Active".
function RecordBadge({ record, demoDate }: { record: AssetRecord; demoDate: string }) {
  const deadline = nextDeadline(record, demoDate);
  const tier = deadline && deadlineTier(deadline.days);
  if (!deadline || !tier) return <Badge className="shrink-0" variant={record.status === "Active" ? "success" : "outline"}>{record.status}</Badge>;
  return <Badge className="shrink-0" variant={tier === "overdue" ? "danger" : tier === "due30" ? "secondary" : "warning"} title={`${deadline.event} · ${formatDate(deadline.date)}`}>{tier === "overdue" ? `${-deadline.days}d overdue` : tier === "today" ? "Due today" : `Due in ${deadline.days}d`}</Badge>;
}

function RecordDetail({ record, onEdit, demoDate }: { record: AssetRecord; onEdit?: () => void; demoDate: string }) {
  const inspectionDays = record.inspectionDueDate ? dateDiffDays(record.inspectionDueDate, demoDate) : undefined;
  const warranty = warrantyFor(record, demoDate);
  return <Card><CardHeader className="border-b border-line"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow">Record detail</div><CardTitle className="mt-1 text-2xl">{record.assetRef}</CardTitle><p className="mt-1 text-sm text-slate-500">{record.assetType} · {record.site}</p></div><div className="flex items-center gap-2"><RecordBadge record={record} demoDate={demoDate} />{onEdit && <Button variant="outline" size="sm" onClick={onEdit}><Edit3 data-icon="inline-start" />Edit</Button>}</div></div></CardHeader><CardContent className="flex flex-col gap-6 p-5"><div className="grid gap-4 sm:grid-cols-2"><div><div className="eyebrow">Owner</div><div className="mt-1 flex items-center gap-2 font-semibold text-navy"><UserRound className="size-4 text-accent" />{record.owner}</div></div><div><div className="eyebrow">Assigned engineer</div><div className="mt-1 font-semibold text-navy">{record.assignedEngineer ?? "Unassigned"}</div></div><div><div className="eyebrow">Inspection</div><div className="mt-1 font-semibold text-navy">{record.inspectionDueDate ? formatDate(record.inspectionDueDate) : "No date"}{inspectionDays !== undefined && <span className="ml-2 text-xs font-medium text-slate-500">({inspectionDays < 0 ? `${Math.abs(inspectionDays)}d overdue` : `${inspectionDays}d`})</span>}</div></div><div><div className="eyebrow">Licence expiry</div><div className="mt-1 font-semibold text-navy">{record.licenceExpiryDate ? formatDate(record.licenceExpiryDate) : "No date"}</div></div><div><div className="eyebrow">Retirement due</div><div className="mt-1 font-semibold text-navy">{record.retirementDueDate ? formatDate(record.retirementDueDate) : "No date"}</div></div><div><div className="eyebrow">Inspection interval</div><div className="mt-1 font-semibold text-navy">{record.inspectionIntervalMonths ? `${record.inspectionIntervalMonths} months` : "One-off"}</div></div><div><div className="eyebrow">Serial number</div><div className="mt-1 font-semibold text-navy">{record.serialNo ?? "Not supplied"}</div></div>{record.recordType === "equipment" && <div><div className="eyebrow">Warranty</div><div className="mt-1 font-semibold text-navy">{warranty ? <Link href="/warranties" className="underline-offset-4 hover:underline">{warranty.number} · {warranty.status === "Valid" ? "until" : "ended"} {formatDate(warranty.validUntil)}</Link> : "None"}</div></div>}</div><Separator /><div><div className="eyebrow">Certificate history</div>{record.certificates.length ? <div className="mt-3 flex flex-col gap-2">{record.certificates.map((certificate) => <div key={certificate.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2"><span className="font-semibold text-navy">{certificate.number}</span><span className="text-xs text-slate-500">{formatDate(certificate.issuedDate)} → {formatDate(certificate.expiryDate)} · {effectiveCertificateStatus(certificate, demoDate)}</span></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No certificate history.</p>}</div><div><div className="eyebrow">Activity</div><div className="mt-3 flex flex-col gap-2">{record.activity.slice(0, 4).map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span className="text-slate-600">{item.event} · {item.detail}</span><span className="shrink-0 text-xs text-slate-400">{formatLocalDate(item.timestamp)}</span></div>)}</div></div></CardContent></Card>;
}
