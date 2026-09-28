"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquareReply, ShieldCheck, XCircle } from "lucide-react";
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

  function returnWork() {
    if (!selected || selected.status !== "Submitted" || !comment.trim() || !canReview) { setMessage(selected?.status === "Returned" ? "This inspection is already returned; resubmit it before reviewing again." : "A return needs a mandatory correction comment."); return; }
    if (update((current) => returnInspection(current, selected.id, comment, current.role))) { setComment(""); setMessage("Inspection returned with a correction request."); }
  }
  function approve() {
    if (!selected || selected.status !== "Submitted" || !canReview) { setMessage("Only a submitted inspection can be approved."); return; }
    if (selected.checklist.some((item) => item.result === "fail" || item.result === "pending")) { setMessage("This inspection cannot issue: every checklist item must pass or be N/A."); return; }
    if (!expiry || expiry < state.demoDate) { setMessage("Choose an expiry on or after the demo date."); return; }
    if (update((current) => approveInspection(current, selected.id, expiry, current.role))) setMessage("Certificate issued. Open Certificates to print or create its QR.");
  }
  return <div className="grid gap-5 xl:grid-cols-[.82fr_1.18fr]">
    <Card><CardHeader className="border-b border-line"><div className="eyebrow">Review queue</div><CardTitle>{queue.length} inspection{queue.length === 1 ? "" : "s"} to review</CardTitle></CardHeader><CardContent className="p-3 sm:p-4">{queue.length ? <div className="flex flex-col gap-1">{queue.map((inspection) => { const record = state.records.find((item) => item.id === inspection.assetId); return <button key={inspection.id} className={`focus-ring flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-left ${selected?.id === inspection.id ? "bg-[#e8f3f8]" : "hover:bg-paper"}`} onClick={() => setSelectedId(inspection.id)}><div className="min-w-0"><div className="font-semibold text-navy">{record?.assetRef ?? "Unknown asset"}</div><div className="truncate text-xs text-slate-500">{record?.assetType} · {inspection.inspector}</div></div><Badge variant={inspection.status === "Returned" ? "danger" : "warning"}>{inspection.status}</Badge></button>})}</div> : <div className="px-3 py-10 text-center text-sm text-slate-500">The review queue is clear.</div>}</CardContent></Card>
    {selected && selectedRecord ? <Card><CardHeader className="border-b border-line"><div className="flex items-start justify-between gap-3"><div><div className="eyebrow">{selectedRecord.assetRef} · {selectedRecord.site}</div><CardTitle className="mt-1">Review inspection</CardTitle></div><Badge variant={selected.status === "Returned" ? "danger" : "warning"}>{selected.status}</Badge></div></CardHeader><CardContent className="flex flex-col gap-5 p-5"><div className="grid gap-2">{selected.checklist.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><span className="text-slate-600">{item.label}</span><Badge variant={item.result === "fail" ? "danger" : item.result === "pass" || item.result === "na" ? "success" : "warning"}>{item.result}</Badge></div>)}</div>{selected.photos?.length ? <div><div className="eyebrow">Evidence photos</div><div className="mt-2 flex flex-wrap gap-2">{selected.photos.map((photo) => <img key={photo.id} src={photo.dataUrl} alt={photo.name} className="size-24 rounded-lg border border-line object-cover" />)}</div></div> : null}{selected.notes && <div className="rounded-lg bg-paper px-3 py-3 text-sm text-slate-600"><div className="eyebrow mb-1">Inspector notes</div>{selected.notes}</div>}<div><label className="eyebrow" htmlFor="review-comment">Correction comment for a return</label><Textarea id="review-comment" className="mt-1.5" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Required when sending this back…" disabled={!canReview || selected.status !== "Submitted"} /></div><div className="rounded-lg border border-[#b8cedc] bg-[#eef7fb] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-navy"><ShieldCheck className="size-4 text-accent" />Issue certificate</div><p className="mt-1 text-xs leading-relaxed text-slate-500">Expiry is explicit. The existing licence, certificate and retirement dates remain independent.</p><label className="eyebrow mt-4 block" htmlFor="certificate-expiry">Certificate expiry</label><Input id="certificate-expiry" type="date" className="mt-1.5 max-w-xs" value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={!canReview || selected.status !== "Submitted"} /></div>{message && <p className="text-sm text-navy" role="status">{message}</p>}{selected.status === "Returned" && <p className="text-sm text-danger">This item is waiting for the inspector to resubmit corrections.</p>}<div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4"><Button variant="outline" onClick={returnWork} disabled={!canReview || selected.status !== "Submitted"}><MessageSquareReply data-icon="inline-start" />Return with correction</Button><Button onClick={approve} disabled={!canReview || selected.status !== "Submitted" || selected.checklist.some((item) => item.result === "fail" || item.result === "pending")}><CheckCircle2 data-icon="inline-start" />Approve & issue</Button></div></CardContent></Card> : <Card><CardContent className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-500">Select a submitted inspection to review.</CardContent></Card>}
  </div>;
}
