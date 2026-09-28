"use client";

import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { ArrowRight, Camera, Check, CheckCircle2, Circle, ClipboardCheck, FileWarning, MinusCircle, Plus, Save, Send, Trash2, XCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createInspection, deleteInspection, submitInspection, updateInspection } from "@/lib/domain";
import type { ChecklistItem, InspectionPhoto } from "@/lib/types";

const RESULTS = [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "na", label: "N/A" }] as const;
const RESULT_ICON = { pending: Circle, pass: CheckCircle2, fail: XCircle, na: MinusCircle };
const RESULT_TONE = { pending: "text-slate-300", pass: "text-success", fail: "text-danger", na: "text-slate-400" };
const RESULT_SELECTED = { pass: "bg-success text-white", fail: "bg-danger text-white", na: "bg-slate-500 text-white" };

// Phone photos run 2–5MB; resize in the browser so they fit the 200KB-per-photo local limit.
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let dataUrl = "";
  for (const quality of [0.8, 0.6, 0.4]) { dataUrl = canvas.toDataURL("image/jpeg", quality); if (photoBytes(dataUrl) <= 200 * 1024) break; }
  return dataUrl;
}
const photoBytes = (dataUrl: string) => Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4);

export function InspectionsView() {
  const { state, update } = useApp();
  const [assetId, setAssetId] = useState(state.records[0]?.id ?? "");
  const [inspectionId, setInspectionId] = useState<string>();
  const [photoError, setPhotoError] = useState("");
  const approvalsLink = useRef<HTMLAnchorElement>(null);
  const selectedInspection = state.inspections.find((item) => item.id === inspectionId);
  const recent = useMemo(() => state.inspections.slice(0, 8), [state.inspections]);
  const canWork = state.role === "Admin" || state.role === "Engineer";
  const canEdit = canWork && (selectedInspection?.status === "Draft" || selectedInspection?.status === "Returned");

  function start() {
    if (!assetId || !canWork) return;
    const result = createInspection(state, assetId);
    if (update(() => result.state)) setInspectionId(result.inspection.id);
  }
  function patchChecklist(checklist: ChecklistItem[]) { if (selectedInspection) update((current) => updateInspection(current, selectedInspection.id, { checklist })); }
  function saveNotes(notes: string) { if (selectedInspection) update((current) => updateInspection(current, selectedInspection.id, { notes })); }
  // The submit button is replaced by the confirmation, so hand focus to its next step.
  function submit() { if (selectedInspection && flushSync(() => update((current) => submitInspection(current, selectedInspection.id)))) approvalsLink.current?.focus(); }
  async function addPhoto(file?: File) {
    setPhotoError("");
    if (!file || !selectedInspection) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Only image files can be attached."); return; }
    let dataUrl: string;
    try { dataUrl = await shrinkPhoto(file); } catch { setPhotoError("This image could not be read. Please choose another file."); return; }
    const bytes = photoBytes(dataUrl);
    if (bytes > 200 * 1024) { setPhotoError("This photo is still over 200KB after resizing. Please choose another file."); return; }
    if ((selectedInspection.photos ?? []).reduce((total, photo) => total + photo.bytes, 0) + bytes > 1024 * 1024) { setPhotoError("The inspection has reached its 1MB local photo limit."); return; }
    const photo: InspectionPhoto = { id: `photo-${Date.now()}`, name: file.name, type: "image/jpeg", dataUrl, bytes };
    update((current) => { const inspection = current.inspections.find((item) => item.id === selectedInspection.id); return inspection ? updateInspection(current, inspection.id, { photos: [...(inspection.photos ?? []), photo] }) : current; });
  }
  function removeDraft() {
    if (!selectedInspection || !window.confirm(`Delete this draft inspection for ${selectedRecord?.assetRef ?? "this asset"}? This cannot be undone.`)) return;
    if (update((current) => deleteInspection(current, selectedInspection.id))) setInspectionId(undefined);
  }
  function removePhoto(photoId: string) { if (!selectedInspection) return; update((current) => { const inspection = current.inspections.find((item) => item.id === selectedInspection.id); return inspection ? updateInspection(current, inspection.id, { photos: (inspection.photos ?? []).filter((photo) => photo.id !== photoId) }) : current; }); }
  const selectedRecord = state.records.find((record) => record.id === selectedInspection?.assetId);
  return <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
    <Card><CardHeader><div className="eyebrow">Inspection queue</div><CardTitle>Choose a record.</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><div><label className="eyebrow" htmlFor="inspection-asset">Asset</label><Select id="inspection-asset" className="mt-1.5" value={assetId} onChange={(event) => setAssetId(event.target.value)} disabled={!canWork || !state.records.length}><option value="">Select an active record</option>{state.records.filter((record) => record.status === "Active").map((record) => <option key={record.id} value={record.id}>{record.assetRef} · {record.assetType}</option>)}</Select></div><Button onClick={start} disabled={!assetId || !canWork}><Plus data-icon="inline-start" />Start inspection</Button>{!canWork && <p className="text-xs text-slate-500">Manager and Reviewer roles can read this queue. Switch to Engineer or Admin to work it.</p>}<div className="mt-3 border-t border-line pt-4"><div className="eyebrow">Recent drafts</div><div className="mt-2 flex flex-col gap-1">{recent.length ? recent.map((inspection) => { const record = state.records.find((item) => item.id === inspection.assetId); return <button key={inspection.id} className={`focus-ring flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${inspection.id === inspectionId ? "bg-[#e8f3f8]" : "hover:bg-paper"}`} onClick={() => { setInspectionId(inspection.id); setAssetId(inspection.assetId); }}><span className="truncate font-semibold text-navy">{record?.assetRef ?? "Unknown"}</span><Badge variant={inspection.status === "Submitted" ? "warning" : inspection.status === "Issued" ? "success" : inspection.status === "Returned" ? "danger" : "outline"}>{inspection.status}</Badge></button>; }) : <p className="text-sm text-slate-500">No inspections yet.</p>}</div></div></CardContent></Card>
    {selectedInspection && selectedRecord ? <Card><CardHeader className="border-b border-line"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow">{selectedRecord.assetRef} · {selectedRecord.site}</div><CardTitle className="mt-1">Field inspection</CardTitle></div><Badge variant={selectedInspection.status === "Submitted" ? "warning" : selectedInspection.status === "Issued" ? "success" : selectedInspection.status === "Returned" ? "danger" : "outline"}>{selectedInspection.status}</Badge></div><p className="mt-2 text-sm text-slate-500">Inspector: {selectedInspection.inspector}. A failed or incomplete checklist cannot issue a certificate.</p></CardHeader><CardContent className="flex flex-col gap-5 p-5"><div className="flex flex-col gap-2">{selectedInspection.checklist.map((item) => { const Icon = RESULT_ICON[item.result]; return <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-3 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-2 text-sm font-medium text-navy"><Icon className={`mt-0.5 size-4 shrink-0 ${RESULT_TONE[item.result]}`} aria-hidden="true" />{item.label}</span><div role="radiogroup" aria-label={`${item.label} result`} className="grid shrink-0 grid-cols-3 gap-1 rounded-lg border border-line bg-white p-1 sm:w-[204px]">{RESULTS.map(({ value, label }) => <label key={value} className={`relative ${canEdit ? "cursor-pointer" : "cursor-not-allowed"}`}><input type="radio" className="peer sr-only" name={`${selectedInspection.id}-${item.id}`} value={value} checked={item.result === value} disabled={!canEdit} onChange={() => patchChecklist(selectedInspection.checklist.map((candidate) => candidate.id === item.id ? { ...candidate, result: value } : candidate))} /><span className={`block rounded-md px-2 py-2 text-center text-sm font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-1 ${item.result === value ? RESULT_SELECTED[value] : `text-slate-600 ${canEdit ? "hover:bg-paper" : "opacity-50"}`}`}>{label}</span></label>)}</div></div>; })}</div><div><label className="eyebrow" htmlFor="inspection-notes">Notes</label><Textarea id="inspection-notes" className="mt-1.5" value={selectedInspection.notes} disabled={!canEdit} onChange={(event) => saveNotes(event.target.value)} placeholder="Record observations or corrections…" /></div><div className="rounded-lg border border-line bg-[#fbfcfd] p-4"><div className="flex items-center gap-2"><Camera className="size-4 text-accent" /><div><div className="text-sm font-semibold text-navy">Optional evidence photo</div><div className="text-xs text-slate-500">Large photos are resized automatically · 1MB total per inspection</div></div></div><input aria-label="Attach inspection photo" className="mt-3 block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-[#e8f3f8] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-navy" type="file" accept="image/*" onChange={(event) => void addPhoto(event.target.files?.[0])} disabled={!canEdit} />{selectedInspection.photos?.map((photo) => <div key={photo.id} className="mt-3 flex items-center gap-3 rounded-md border border-line bg-white p-2"><img src={photo.dataUrl} alt={photo.name} className="size-14 rounded object-cover" /><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{photo.name}</span>{canEdit && <Button variant="ghost" size="sm" onClick={() => removePhoto(photo.id)}>Remove</Button>}</div>)}{photoError && <p className="mt-2 text-xs text-danger" role="alert">{photoError}</p>}</div>{selectedInspection.reviewerComment && <div className="flex gap-2 rounded-lg border border-[#f0c2c3] bg-[#fff6f6] px-3 py-3 text-sm text-danger"><FileWarning className="mt-0.5 size-4 shrink-0" /><span><strong>Returned for correction.</strong> {selectedInspection.reviewerComment}</span></div>}<div className="border-t border-line pt-4" aria-live="polite">{selectedInspection.status === "Submitted" ? <div className="animate-rise flex flex-wrap items-center gap-3 rounded-lg border border-success/25 bg-success/[.06] px-4 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="draw-check size-5" strokeWidth={3} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-navy">Sent for review{selectedInspection.submittedAt && ` · ${new Date(selectedInspection.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</div><div className="text-xs text-slate-600">{selectedRecord.assetRef} is in the Approvals queue. Editing is locked until a reviewer returns it.</div></div><Button asChild variant="outline" size="sm"><Link ref={approvalsLink} href="/approvals">Open Approvals<ArrowRight className="size-3.5" data-icon="inline-end" /></Link></Button></div> : <div className="flex flex-wrap justify-end gap-2">{selectedInspection.status === "Draft" && canWork && <Button variant="ghost" className="mr-auto text-danger hover:bg-[#fff3f3]" onClick={removeDraft}><Trash2 data-icon="inline-start" />Delete draft</Button>}<Button variant="outline" onClick={() => saveNotes(selectedInspection.notes)} disabled={!canEdit}><Save data-icon="inline-start" />Save draft</Button><Button onClick={submit} disabled={!canEdit || selectedInspection.checklist.some((item) => item.result === "pending")}><Send data-icon="inline-start" />Submit for review</Button></div>}</div></CardContent></Card> : <Card><CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><ClipboardCheck className="size-10 text-[#b8cedc]" /><h2 className="mt-4 font-semibold text-navy">Start a field check</h2><p className="mt-2 max-w-sm text-sm text-slate-500">Choose an active record and create a checklist. The draft stays in this browser until you submit it.</p></CardContent></Card>}
  </div>;
}
