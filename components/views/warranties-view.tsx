"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Edit3, FileBadge, Plus, Printer } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { WarrantyDocument, type WarrantyPrint } from "@/components/warranty-document";
import { blankWarranty, readWarranty, WarrantyFields, type WarrantyForm } from "@/components/warranty-fields";
import { normalizeRegisterRow, saveWarranty, warrantyFor } from "@/lib/domain";
import { warrantyPrint } from "@/lib/qr";
import type { AssetRecord, RegisterRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const NEW_ASSET = "new";
type FormState = WarrantyForm & { assetId: string; assetRef: string; assetType: string; site: string; owner: string; serialNo: string };
const blank: FormState = { ...blankWarranty, assetId: "", assetRef: "", assetType: "", site: "", owner: "", serialNo: "" };

export function WarrantiesView() {
  const { state, update } = useApp();
  // editing is the asset whose warranty is open in the form; undefined while adding a new one.
  const [form, setForm] = useState<FormState>();
  const [editing, setEditing] = useState<string>();
  const [formError, setFormError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();
  const [printing, setPrinting] = useState<WarrantyPrint>();
  const formCard = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (printing) dialog.current?.showModal(); }, [printing]);
  const canEdit = state.role !== "Manager";
  const warranties = state.records.flatMap((record) => { const warranty = warrantyFor(record, state.demoDate); return warranty ? [{ record, warranty }] : []; });
  const choices = state.records.filter((record) => !record.warranty);
  const chosen = state.records.find((record) => record.id === (editing ?? form?.assetId));
  const assetType = chosen?.assetType ?? form?.assetType ?? "";

  // The form sits above the list, so bring it into view when opened from a card further down.
  const reveal = () => requestAnimationFrame(() => formCard.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  function startAdd() { setEditing(undefined); setForm(blank); setFormError(""); reveal(); }
  function startEdit(record: AssetRecord) {
    const warranty = warrantyFor(record, state.demoDate);
    if (!warranty) return;
    setEditing(record.id); setFormError("");
    setForm({ ...blank, assetId: record.id, number: warranty.number, product: warranty.product, warrantyDate: warranty.warrantyDate, years: String(warranty.years), contractNo: warranty.contractNo ?? "", project: warranty.project ?? "", scope: warranty.scope ?? "", mainContractor: warranty.mainContractor ?? "" });
    reveal();
  }
  function close() { setForm(undefined); setEditing(undefined); setFormError(""); }

  function save() {
    if (!form || !canEdit) return;
    setFormError("");
    if (!form.assetId) { setFormError("Choose a register record, or New record if it isn't in the register yet."); return; }
    const parsed = readWarranty(form, assetType);
    if (!parsed.warranty) { setFormError(parsed.error ?? "Check the warranty details."); return; }
    let asset: string | RegisterRow = form.assetId;
    if (form.assetId === NEW_ASSET) {
      const normalized = normalizeRegisterRow({ asset_ref: form.assetRef, record_type: "equipment", asset_type: form.assetType, site: form.site, owner: form.owner, serial_no: form.serialNo, status: "Active" }, 1);
      if (!normalized.row) { setFormError(normalized.error?.message ?? "Check the record details."); return; }
      const assetRef = normalized.row.assetRef.toLowerCase();
      if (state.records.some((record) => record.assetRef.trim().toLowerCase() === assetRef)) { setFormError(`${normalized.row.assetRef} is already in the register. Choose it from the record list instead.`); return; }
      asset = normalized.row;
    }
    const warranty = parsed.warranty;
    if (update((current) => saveWarranty(current, asset, warranty))) close();
  }

  async function print(record: AssetRecord) {
    setError(""); setBusy(record.id);
    try { setPrinting(await warrantyPrint(record, state.demoDate)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Warranty could not be prepared. Try again."); }
    finally { setBusy(undefined); }
  }

  const field = (key: keyof FormState, label: string, placeholder?: string) => <div><Label htmlFor={`warranty-${key}`}>{label}</Label><Input id={`warranty-${key}`} className="mt-1.5" placeholder={placeholder} value={form?.[key] ?? ""} onChange={(event) => setForm((current) => current && { ...current, [key]: event.target.value })} /></div>;

  return <div className="flex flex-col gap-5">
    {form && <Card ref={formCard} className="scroll-mt-28">
      <CardHeader><div className="eyebrow">{editing ? "Warranty details" : "New warranty"}</div><CardTitle>{editing ? `${chosen?.assetRef} · ${form.number}` : "Type in the details from the warranty document."}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="warranty-asset">Register record *</Label><Select id="warranty-asset" className="mt-1.5" disabled={Boolean(editing)} value={form.assetId} onChange={(event) => setForm({ ...form, assetId: event.target.value })}>
          {editing ? <option value={form.assetId}>{chosen?.assetRef} · {chosen?.assetType} · {chosen?.site}</option> : <>
            <option value="" disabled>Choose a record…</option>
            <option value={NEW_ASSET}>New record (not in the register yet)</option>
            {choices.map((record) => <option key={record.id} value={record.id}>{record.assetRef} · {record.assetType} · {record.site}</option>)}
          </>}
        </Select></div>
        {form.assetId === NEW_ASSET && <>{field("assetRef", "Asset ref *")}{field("assetType", "Asset type *", "Horizontal Lifeline")}{field("site", "Site *")}{field("owner", "Client / owner *")}{field("serialNo", "Serial number")}</>}
        <Separator className="sm:col-span-2" />
        <WarrantyFields value={form} onChange={(next) => setForm({ ...form, ...next })} assetType={assetType} demoDate={state.demoDate} />
        {formError && <p className="text-sm text-danger sm:col-span-2" role="alert">{formError}</p>}
      </CardContent>
      <div className="flex justify-end gap-2 border-t border-line p-5"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={save}>Save warranty</Button></div>
    </Card>}
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><div className="eyebrow">Warranty register</div><CardTitle>{warranties.length} warrant{warranties.length === 1 ? "y" : "ies"}</CardTitle></div>{canEdit && <Button size="sm" onClick={startAdd}><Plus data-icon="inline-start" />Add warranty</Button>}</div></CardHeader>
      <CardContent>{warranties.length ? <div className="grid gap-4 xl:grid-cols-2">{warranties.map(({ record, warranty }) => <div key={record.id} className="min-w-0 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="eyebrow">{record.assetRef} · {record.site}</div><h3 className="mt-1 break-all text-lg font-bold text-navy">{warranty.number}</h3><p className="mt-1 text-sm text-slate-500">{warranty.product}</p></div><div className="flex flex-col items-end gap-1"><Badge variant={warranty.status === "Valid" ? "success" : "warning"}>{warranty.status}</Badge><span className="text-xs text-slate-500">{warranty.typedIn ? "Typed in" : "From first certificate"}</span></div></div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-3 text-sm"><div><div className="eyebrow">Warranty date</div><div className="mt-1 font-semibold text-navy">{formatDate(warranty.warrantyDate)}</div></div><div><div className="eyebrow">Valid until · {warranty.years} yr{warranty.years === 1 ? "" : "s"}</div><div className="mt-1 font-semibold text-navy">{formatDate(warranty.validUntil)}</div></div></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void print(record)}><Printer />{busy === record.id ? "Preparing…" : "Print"}</Button>
          {canEdit && <Button variant="ghost" size="sm" onClick={() => startEdit(record)}><Edit3 />{warranty.typedIn ? "Edit" : "Add details"}</Button>}
        </div>
      </div>)}</div> : <div className="rounded-lg border border-dashed border-line px-4 py-14 text-center"><FileBadge className="mx-auto size-9 text-[#b8cedc]" /><p className="mt-3 text-sm text-slate-500">Type in a warranty, or issue a certificate to start one.</p></div>}
        {error && <p className="mt-4 rounded-lg bg-[#fff3f3] p-3 text-sm text-danger" role="alert">{error}</p>}
      </CardContent>
    </Card>
    {printing && createPortal(<dialog ref={dialog} aria-label="Warranty print preview" onClose={() => setPrinting(undefined)} className="certificate-print-area animate-rise fixed inset-0 m-auto max-h-[95vh] w-[min(95vw,850px)] overflow-auto bg-white p-5 backdrop:bg-black/50 sm:p-10">
      <div className="print-hidden mb-5 flex justify-end gap-2"><Button onClick={() => window.print()}>Print / Save PDF</Button><Button variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
      <WarrantyDocument {...printing} />
    </dialog>, document.body)}
  </div>;
}
