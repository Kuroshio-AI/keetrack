"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ArrowRight, Camera, Check, ClipboardCheck, FileText, FileWarning, Loader2, Plus, Save, Send, Smartphone, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChecklistReportDialog } from "@/components/checklist-report";
import { ChecklistSections } from "@/components/checklist-sections";
import { IS_FLS } from "@/lib/client";
import { createInspection, deleteInspection, submitInspection, updateInspection } from "@/lib/domain";
import type { FieldResult, FieldSession } from "@/lib/field";
import { FLS_CHECKLISTS } from "@/lib/fls-checklists";
import { photoBytes, shrinkPhoto } from "@/lib/photos";
import type { ChecklistItem, InspectionPhoto } from "@/lib/types";
import { formatLocalDate } from "@/lib/utils";


type PhoneHandoff = { id: string; url: string; qr: string; inspectionId: string; assetRef: string; status: FieldSession["status"] };

export function InspectionsView() {
  const { state, update } = useApp();
  const searchParams = useSearchParams();
  // A building's panel links here with ?asset= to start its next checklist.
  const [assetId, setAssetId] = useState(() => state.records.find((record) => record.id === searchParams.get("asset") && record.status === "Active")?.id ?? state.records[0]?.id ?? "");
  const [report, setReport] = useState<string>();
  const [inspectionId, setInspectionId] = useState<string>();
  const [templateId, setTemplateId] = useState(FLS_CHECKLISTS[0].id);
  const [photoError, setPhotoError] = useState("");
  const approvalsLink = useRef<HTMLAnchorElement>(null);
  const selectedInspection = state.inspections.find((item) => item.id === inspectionId);
  const recent = useMemo(() => state.inspections.slice(0, 8), [state.inspections]);
  const canWork = state.role === "Admin" || state.role === "Engineer";
  const canEdit = canWork && (selectedInspection?.status === "Draft" || selectedInspection?.status === "Returned");
  const [phone, setPhone] = useState<PhoneHandoff>();
  const [phoneError, setPhoneError] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  // State lags a render behind, so a fast double-click would still create two sessions; the ref blocks it immediately.
  const phoneBusyNow = useRef(false);
  const phoneDialog = useRef<HTMLDialogElement>(null);
  const phoneId = phone?.id;
  const phoneInspectionId = phone?.inspectionId;
  useEffect(() => { if (phoneId) phoneDialog.current?.showModal(); }, [phoneId]);

  // The phone posts its result to the hand-off session; poll for it and apply it as a normal submission.
  useEffect(() => {
    if (!phoneId || !phoneInspectionId) return;
    let stopped = false;
    function receive(result: FieldResult): boolean {
      return update((current) => {
        const inspection = current.inspections.find((item) => item.id === phoneInspectionId);
        if (!inspection) return current;
        const photos = result.photos.length ? result.photos.map((photo, index): InspectionPhoto => ({ id: `photo-${Date.now()}-${index}`, name: photo.name, type: "image/jpeg", dataUrl: photo.dataUrl, bytes: photo.bytes })) : inspection.photos;
        return submitInspection(updateInspection(current, inspection.id, { checklist: inspection.checklist.map((item) => ({ ...item, result: result.results[item.id] ?? item.result })), notes: result.notes.trim() ? result.notes : inspection.notes, photos, signature: result.signature }), inspection.id);
      });
    }
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/field/${phoneId}`, { cache: "no-store" });
        if (stopped) return;
        if (response.status === 404) { clearInterval(timer); setPhoneError("This QR has expired. Close it and create a new one."); return; }
        if (!response.ok) return;
        const session = await response.json() as FieldSession;
        if (stopped) return;
        if (session.status === "submitted" && session.result) { clearInterval(timer); if (!receive(session.result)) { setPhoneError("The phone's answers arrived but could not be saved in this browser."); return; } }
        setPhone((current) => current?.id === phoneId ? { ...current, status: session.status } : current);
      } catch { /* a dropped poll just waits for the next one */ }
    }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [phoneId, phoneInspectionId, update]);

  async function inspectOnPhone() {
    if (!selectedInspection || !selectedRecord || phoneBusyNow.current) return;
    phoneBusyNow.current = true;
    setPhoneError(""); setPhoneBusy(true);
    try {
      const response = await fetch("/api/field", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetRef: selectedRecord.assetRef, assetType: selectedInspection.title ?? selectedRecord.assetType, site: selectedRecord.site, inspector: selectedInspection.inspector, checklist: selectedInspection.checklist.map(({ id, label, section }) => ({ id, label, section })) }) });
      const body = await response.json() as { id?: string; url?: string; error?: string };
      if (!response.ok || !body.id || !body.url) throw new Error(body.error ?? "The phone link could not be created. Try again.");
      setPhone({ id: body.id, url: body.url, qr: await QRCode.toDataURL(body.url, { width: 320, margin: 4, color: { dark: "#0b3151", light: "#ffffff" } }), inspectionId: selectedInspection.id, assetRef: selectedRecord.assetRef, status: "waiting" });
    } catch (reason) { setPhoneError(reason instanceof Error ? reason.message : "The phone link could not be created. Try again."); }
    finally { phoneBusyNow.current = false; setPhoneBusy(false); }
  }

  function start() {
    if (!assetId || !canWork) return;
    const result = createInspection(state, assetId, state.role, undefined, IS_FLS ? FLS_CHECKLISTS.find((template) => template.id === templateId) : undefined);
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
  const notOk = selectedInspection?.checklist.filter((item) => item.result === "fail").length ?? 0;
  return <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
    <Card><CardHeader><div className="eyebrow">{IS_FLS ? "Service visit" : "Inspection queue"}</div><CardTitle>{IS_FLS ? "Choose a building and a system." : "Choose a record."}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><div><label className="eyebrow" htmlFor="inspection-asset">{IS_FLS ? "Building" : "Asset"}</label><Select id="inspection-asset" className="mt-1.5" value={assetId} onChange={(event) => setAssetId(event.target.value)} disabled={!canWork || !state.records.length}><option value="">{IS_FLS ? "Select a building" : "Select an active record"}</option>{state.records.filter((record) => record.status === "Active").map((record) => <option key={record.id} value={record.id}>{IS_FLS ? record.assetRef : `${record.assetRef} · ${record.assetType}`}</option>)}</Select></div>{IS_FLS && <div><label className="eyebrow" htmlFor="inspection-template">PPM checklist</label><Select id="inspection-template" className="mt-1.5" value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={!canWork}>{FLS_CHECKLISTS.map((template) => <option key={template.id} value={template.id}>{template.title} · {template.sections.reduce((total, [, items]) => total + items.length, 0)} items</option>)}</Select></div>}<Button onClick={start} disabled={!assetId || !canWork}><Plus data-icon="inline-start" />{IS_FLS ? "Start checklist" : "Start inspection"}</Button>{!canWork && <p className="text-xs text-slate-500">Manager and Reviewer roles can read this queue. Switch to Engineer or Admin to work it.</p>}<div className="mt-3 border-t border-line pt-4"><div className="eyebrow">Recent drafts</div><div className="mt-2 flex flex-col gap-1">{recent.length ? recent.map((inspection) => { const record = state.records.find((item) => item.id === inspection.assetId); return <button key={inspection.id} className={`focus-ring flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${inspection.id === inspectionId ? "bg-[#e8f3f8]" : "hover:bg-paper"}`} onClick={() => { setInspectionId(inspection.id); setAssetId(inspection.assetId); }}><span className="min-w-0"><span className="block truncate font-semibold text-navy">{record?.assetRef ?? "Unknown"}</span>{inspection.title && <span className="block truncate text-xs text-slate-500">{inspection.title}</span>}</span><Badge variant={inspection.status === "Submitted" ? "warning" : inspection.status === "Issued" || inspection.status === "Approved" ? "success" : inspection.status === "Returned" ? "danger" : "outline"}>{inspection.status}</Badge></button>; }) : <p className="text-sm text-slate-500">{IS_FLS ? "No checklists yet." : "No inspections yet."}</p>}</div></div></CardContent></Card>
    {selectedInspection && selectedRecord ? <Card><CardHeader className="border-b border-line"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow">{selectedRecord.assetRef} · {selectedRecord.site}</div><CardTitle className="mt-1">{selectedInspection.title ?? "Field inspection"}</CardTitle></div><div className="flex items-center gap-2">{canEdit && <Button variant="secondary" size="sm" className="transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] disabled:cursor-wait disabled:opacity-100" disabled={phoneBusy} aria-busy={phoneBusy} onClick={() => void inspectOnPhone()}>{phoneBusy ? <Loader2 className="motion-safe:animate-spin" /> : <Smartphone />}{phoneBusy ? "Preparing QR…" : "Inspect on phone"}</Button>}<Badge variant={selectedInspection.status === "Submitted" ? "warning" : selectedInspection.status === "Issued" || selectedInspection.status === "Approved" ? "success" : selectedInspection.status === "Returned" ? "danger" : "outline"}>{selectedInspection.status}</Badge></div></div><p className="mt-2 text-sm text-slate-500">{IS_FLS ? `Technician: ${selectedInspection.inspector}. Answer every item, then send it to the client representative to approve.` : `Inspector: ${selectedInspection.inspector}. A failed or incomplete checklist cannot issue a certificate.`}</p>{phoneError && !phone && <p className="mt-2 text-xs text-danger" role="alert">{phoneError}</p>}</CardHeader><CardContent className="flex flex-col gap-5 p-5"><ChecklistSections key={selectedInspection.id} name={selectedInspection.id} items={selectedInspection.checklist} results={Object.fromEntries(selectedInspection.checklist.map((item) => [item.id, item.result === "pending" ? undefined : item.result]))} disabled={!canEdit} onAnswer={(answers) => patchChecklist(selectedInspection.checklist.map((item) => answers[item.id] ? { ...item, result: answers[item.id] } : item))} /><div><label className="eyebrow" htmlFor="inspection-notes">{IS_FLS ? "Comments" : "Notes"}</label><Textarea id="inspection-notes" className="mt-1.5" value={selectedInspection.notes} disabled={!canEdit} onChange={(event) => saveNotes(event.target.value)} placeholder="Record observations or corrections…" /></div><div className="rounded-lg border border-line bg-[#fbfcfd] p-4"><div className="flex items-center gap-2"><Camera className="size-4 text-accent" /><div><div className="text-sm font-semibold text-navy">Optional evidence photo</div><div className="text-xs text-slate-500">Any photo size works · shrunk automatically · 1MB per inspection</div></div></div><input aria-label="Attach inspection photo" className="mt-3 block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-[#e8f3f8] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-navy" type="file" accept="image/*" onChange={(event) => void addPhoto(event.target.files?.[0])} disabled={!canEdit} />{selectedInspection.photos?.map((photo) => <div key={photo.id} className="mt-3 flex items-center gap-3 rounded-md border border-line bg-white p-2"><img src={photo.dataUrl} alt={photo.name} className="size-14 rounded object-cover" /><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{photo.name}</span>{canEdit && <Button variant="ghost" size="sm" onClick={() => removePhoto(photo.id)}>Remove</Button>}</div>)}{photoError && <p className="mt-2 text-xs text-danger" role="alert">{photoError}</p>}</div>{selectedInspection.reviewerComment && <div className="flex gap-2 rounded-lg border border-[#f0c2c3] bg-[#fff6f6] px-3 py-3 text-sm text-danger"><FileWarning className="mt-0.5 size-4 shrink-0" /><span><strong>Returned for correction.</strong> {selectedInspection.reviewerComment}</span></div>}<div className="border-t border-line pt-4" aria-live="polite">{selectedInspection.status === "Submitted" ? <div className="animate-rise flex flex-wrap items-center gap-3 rounded-lg border border-success/25 bg-success/[.06] px-4 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="draw-check size-5" strokeWidth={3} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-navy">Sent for review{selectedInspection.submittedAt && ` · ${new Date(selectedInspection.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</div><div className="text-xs text-slate-600">{selectedRecord.assetRef} is in the Approvals queue. Editing is locked until a reviewer returns it.</div></div><Button asChild variant="outline" size="sm"><Link ref={approvalsLink} href="/approvals">Open Approvals<ArrowRight className="size-3.5" data-icon="inline-end" /></Link></Button></div> : selectedInspection.status === "Approved" ? <div className="animate-rise flex flex-wrap items-center gap-3 rounded-lg border border-success/25 bg-success/[.06] px-4 py-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="size-5" strokeWidth={3} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-navy">Approved{selectedInspection.reviewedAt && ` · ${formatLocalDate(selectedInspection.reviewedAt)}`}</div><div className="text-xs text-slate-600">{notOk ? `${notOk} Not Ok item${notOk === 1 ? "" : "s"} went to Alerts to follow up.` : "Every item Ok or N/A."}</div></div><Button variant="outline" size="sm" onClick={() => setReport(selectedInspection.id)}><FileText data-icon="inline-start" />View report</Button></div> : <div className="flex flex-wrap justify-end gap-2">{selectedInspection.status === "Draft" && canWork && <Button variant="ghost" className="mr-auto text-danger hover:bg-[#fff3f3]" onClick={removeDraft}><Trash2 data-icon="inline-start" />Delete draft</Button>}<Button variant="outline" onClick={() => saveNotes(selectedInspection.notes)} disabled={!canEdit}><Save data-icon="inline-start" />Save draft</Button><Button onClick={submit} disabled={!canEdit || selectedInspection.checklist.some((item) => item.result === "pending")}><Send data-icon="inline-start" />Submit for review</Button></div>}</div></CardContent></Card> : <Card><CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><ClipboardCheck className="size-10 text-[#b8cedc]" /><h2 className="mt-4 font-semibold text-navy">{IS_FLS ? "Start a PPM checklist" : "Start a field check"}</h2><p className="mt-2 max-w-sm text-sm text-slate-500">{IS_FLS ? "Choose a building and the system serviced, such as the fire alarm or a fire pump." : "Choose an active record and create a checklist."} The draft stays in this browser until you submit it.</p></CardContent></Card>}
    {report && <ChecklistReportDialog inspectionId={report} onClose={() => setReport(undefined)} />}
    {phone && createPortal(<dialog ref={phoneDialog} aria-labelledby="phone-title" onClose={() => { setPhone(undefined); setPhoneError(""); }} className="animate-rise fixed inset-0 m-auto w-[min(92vw,400px)] rounded-2xl bg-white p-6 text-center backdrop:bg-black/50">
      {phone.status === "submitted" ? <>
        <span className="pop-in mx-auto grid size-16 place-items-center rounded-full bg-success text-white"><Check className="draw-check size-8" strokeWidth={3} aria-hidden="true" /></span>
        <h2 id="phone-title" className="mt-4 text-xl font-bold text-navy">Received from phone</h2>
        <p className="mt-1 text-sm text-slate-600">The checklist, photos and signature are in. It’s waiting in Approvals.</p>
        <div className="mt-5 flex justify-center gap-2"><Button asChild><Link href="/approvals">Open Approvals<ArrowRight data-icon="inline-end" /></Link></Button><Button variant="outline" onClick={() => phoneDialog.current?.close()}>Close</Button></div>
      </> : <>
        <div className="eyebrow">{phone.assetRef} · {IS_FLS ? "PPM checklist" : "Field inspection"}</div>
        <h2 id="phone-title" className="mt-1 text-lg font-bold text-navy">Inspect on your phone</h2>
        {/* Once a phone holds the link, hide the QR so nobody else scans it; the server rejects other phones anyway. */}
        {phone.status === "opened" ? <div className="animate-rise mx-auto mt-3 flex size-56 flex-col items-center justify-center gap-2 px-2">
          <span className="grid size-14 place-items-center rounded-full bg-success/10 text-success"><Smartphone className="size-6" aria-hidden="true" /></span>
          <div className="mt-1 font-bold text-navy">Inspection in progress</div>
          <p className="text-xs leading-relaxed text-slate-600">A phone has opened this inspection. The link is locked to that phone.</p>
        </div> : <img src={phone.qr} alt="QR code that opens this inspection on a phone" className="mx-auto mt-3 size-56" />}
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-navy" aria-live="polite"><span className={`size-2 rounded-full ${phone.status === "opened" ? "bg-success" : "bg-warning motion-safe:animate-pulse"}`} aria-hidden="true" />{phone.status === "opened" ? "Waiting for the phone to submit" : "Scan with your phone camera"}</p>
        <p className="mt-1 text-xs text-slate-500">{phone.status === "opened" ? "Wrong phone? Cancel and create a new QR." : "Only the first phone to scan can use it · expires in 30 minutes."}</p>
        {phoneError && <p className="mt-3 rounded-lg bg-[#fff3f3] p-2 text-xs text-danger" role="alert">{phoneError}</p>}
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => phoneDialog.current?.close()}>Cancel</Button>
      </>}
    </dialog>, document.body)}
  </div>;
}
