"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageSquareReply, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addMonthsClamped, approveInspection, returnInspection } from "@/lib/domain";

export function ApprovalsView() {
  const { state, update } = useApp();
  const [comment, setComment] = useState("");
  const [expiry, setExpiry] = useState(addMonthsClamped(state.demoDate, 12));
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState("");
  const queue = state.inspections.filter((inspection) => inspection.status === "Submitted" || inspection.status === "Returned");
  const canReview = state.role === "Admin" || state.role === "Reviewer";
  const selected = queue.find((inspection) => inspection.id === selectedId) ?? queue[0];
  const selectedRecord = state.records.find((record) => record.id === selected?.assetId);
  // Approved work leaves the queue, so keep its receipt on screen until the reviewer moves on.
  const [issuedId, setIssuedId] = useState<string>();
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const issued = state.inspections.find((inspection) => inspection.id === issuedId);
  const issuedRecord = state.records.find((record) => record.id === issued?.assetId);
  const issuedCertificate = issuedRecord?.certificates.find((certificate) => certificate.id === issued?.certificateId);
  function select(id?: string) { setSelectedId(id); setIssuedId(undefined); setMessage(""); }

  function returnWork() {
    if (!selected || selected.status !== "Submitted" || !comment.trim() || !canReview) { setMessage(selected?.status === "Returned" ? "This inspection is already returned; resubmit it before reviewing again." : "A return needs a mandatory correction comment."); return; }
    if (update((current) => returnInspection(current, selected.id, comment, current.role))) { setComment(""); setMessage("Inspection returned with a correction request."); }
  }
  function approve() {
    if (!selected || selected.status !== "Submitted" || !canReview) { setMessage("Only a submitted inspection can be approved."); return; }
    if (selected.checklist.some((item) => item.result === "fail" || item.result === "pending")) { setMessage("This inspection cannot issue: every checklist item must pass or be N/A."); return; }
    if (!expiry || expiry < state.demoDate) { setMessage("Choose an expiry on or after the demo date."); return; }
    flushSync(() => { if (update((current) => approveInspection(current, selected.id, expiry, current.role))) { setIssuedId(selected.id); setMessage(""); } });
    receiptHeading.current?.focus();
  }
  return <div className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
    <Card><CardHeader className="border-b border-line"><div className="eyebrow">Review queue</div><CardTitle>{queue.length} inspection{queue.length === 1 ? "" : "s"} to review</CardTitle></CardHeader><CardContent className="p-3 sm:p-4">{queue.length ? <div className="flex flex-col gap-1">{queue.map((inspection) => { const record = state.records.find((item) => item.id === inspection.assetId); return <button key={inspection.id} className={`focus-ring flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-left ${!issuedCertificate && selected?.id === inspection.id ? "bg-[#e8f3f8]" : "hover:bg-paper"}`} onClick={() => select(inspection.id)}><div className="min-w-0"><div className="font-semibold text-navy">{record?.assetRef ?? "Unknown asset"}</div><div className="truncate text-xs text-slate-500">{record?.assetType} · {inspection.inspector}</div></div><Badge variant={inspection.status === "Returned" ? "danger" : "warning"}>{inspection.status}</Badge></button>})}</div> : <div className="px-3 py-10 text-center text-sm text-slate-500">The review queue is clear.</div>}</CardContent></Card>
    {issuedCertificate && issuedRecord ? <Card className="animate-rise overflow-hidden">
      <div className="flex flex-col-reverse gap-5 border-b border-success/20 bg-success/[.06] px-5 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div className="min-w-0">
          <h2 ref={receiptHeading} tabIndex={-1} className="outline-none"><span className="eyebrow flex items-center gap-1.5 !text-success"><ShieldCheck className="size-3.5" aria-hidden="true" />Certificate issued</span><span className="mt-2 block break-all font-mono text-2xl font-bold tracking-tight text-navy sm:text-[28px]">{issuedCertificate.number}</span></h2>
          <p className="mt-1 text-sm text-slate-600">{issuedRecord.assetRef} · {issuedRecord.assetType} · {issuedRecord.site}</p>
        </div>
        <div aria-hidden="true" className="stamp flex shrink-0 flex-col items-center self-start rounded-lg border-2 border-success px-4 py-2 text-success outline outline-1 outline-offset-[3px] outline-success/40">
          <span className="text-[9px] font-bold uppercase tracking-[.22em] opacity-80">Quality gate</span>
          <span className="text-xl font-black uppercase leading-tight tracking-[.16em]">Issued</span>
          <span className="font-mono text-[10px] font-semibold">{issuedCertificate.issuedDate}</span>
        </div>
      </div>
      <CardContent className="flex flex-col gap-5 p-5 sm:px-7">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{[["Result", issuedCertificate.result], ["Expires", issuedCertificate.expiryDate], ["Next inspection", issued?.nextInspectionDate ?? "Not scheduled"]].map(([label, value]) => <div key={label}><dt className="eyebrow">{label}</dt><dd className="mt-1 font-mono text-sm font-semibold text-navy">{value}</dd></div>)}</dl>
        <p className="text-xs text-slate-500">The register, alerts and activity log are updated. Print it or create its QR from Certificates.</p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">{queue.length > 0 && <Button variant="outline" onClick={() => select()}>Review next · {queue.length} waiting</Button>}<Button asChild><Link href="/certificates">Open certificates<ArrowRight data-icon="inline-end" /></Link></Button></div>
      </CardContent>
    </Card> : selected && selectedRecord ? <Card><CardHeader className="border-b border-line"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow">{selectedRecord.assetRef} · {selectedRecord.site}</div><CardTitle className="mt-1">Review inspection</CardTitle></div><Badge variant={selected.status === "Returned" ? "danger" : "warning"}>{selected.status}</Badge></div></CardHeader><CardContent className="flex flex-col gap-5 p-5"><div className="grid gap-2">{selected.checklist.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span className="text-slate-600">{item.label}</span><Badge variant={item.result === "fail" ? "danger" : item.result === "pass" || item.result === "na" ? "success" : "warning"}>{item.result}</Badge></div>)}</div>{selected.photos?.length ? <div><div className="eyebrow">Evidence photos</div><div className="mt-2 flex flex-wrap gap-2">{selected.photos.map((photo) => <img key={photo.id} src={photo.dataUrl} alt={photo.name} className="size-24 rounded-lg border border-line object-cover" />)}</div></div> : null}{selected.notes && <div className="rounded-lg bg-paper px-3 py-3 text-sm text-slate-600"><div className="eyebrow mb-1">Inspector notes</div>{selected.notes}</div>}<div><label className="eyebrow" htmlFor="review-comment">Correction comment for a return</label><Textarea id="review-comment" className="mt-1.5" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Required when sending this back…" disabled={!canReview || selected.status !== "Submitted"} /></div><div className="rounded-lg border border-[#b8cedc] bg-[#eef7fb] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-navy"><ShieldCheck className="size-4 text-accent" />Issue certificate</div><p className="mt-1 text-xs leading-relaxed text-slate-500">Expiry is explicit. The existing licence, certificate and retirement dates remain independent.</p><label className="eyebrow mt-4 block" htmlFor="certificate-expiry">Certificate expiry</label><Input id="certificate-expiry" type="date" className="mt-1.5 max-w-xs" value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={!canReview || selected.status !== "Submitted"} /></div>{message && <p className="text-sm text-navy" role="status">{message}</p>}{selected.status === "Returned" && <p className="text-sm text-danger">This item is waiting for the inspector to resubmit corrections.</p>}<div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4"><Button variant="outline" onClick={returnWork} disabled={!canReview || selected.status !== "Submitted"}><MessageSquareReply data-icon="inline-start" />Return with correction</Button><Button onClick={approve} disabled={!canReview || selected.status !== "Submitted" || selected.checklist.some((item) => item.result === "fail" || item.result === "pending")}><CheckCircle2 data-icon="inline-start" />Approve & issue</Button></div></CardContent></Card> : <Card><CardContent className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-500">Select a submitted inspection to review.</CardContent></Card>}
  </div>;
}
