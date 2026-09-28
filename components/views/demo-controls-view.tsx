"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, RotateCcw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addMonthsClamped, approveInspection, createInspection, setDeadlineShortcut, submitInspection, updateInspection } from "@/lib/domain";

export function DemoControlsView() {
  const { state, setDemoDate, update, clearOperationalData, storageWarning } = useApp();
  const [assetId, setAssetId] = useState(state.records[0]?.id ?? "");
  const [certificateExpiry, setCertificateExpiry] = useState(addMonthsClamped(state.demoDate, 12));
  const [message, setMessage] = useState("");
  const selected = state.records.find((record) => record.id === assetId);
  const submitted = state.inspections.find((inspection) => inspection.status === "Submitted");

  function shortcut(days: number) { if (!assetId) return; if (update((current) => setDeadlineShortcut(current, assetId, days))) setMessage(`${selected?.assetRef ?? "Record"} is now ${days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "due today" : `due in ${days} days`}.`); }
  function simulateSubmitted() {
    if (!assetId) return;
    update((current) => {
      const result = createInspection(current, assetId);
      const passed = result.inspection.checklist.map((item) => ({ ...item, result: "pass" as const }));
      return submitInspection(updateInspection(result.state, result.inspection.id, { checklist: passed, notes: "Explicit demo checklist submission." }), result.inspection.id);
    });
    setMessage("A passed demo inspection is waiting in Approvals.");
  }
  function simulateApproval() {
    if (!submitted) { setMessage("Submit a demo inspection first."); return; }
    if (!certificateExpiry || certificateExpiry < state.demoDate) { setMessage("Choose an expiry on or after the demo date."); return; }
    if (update((current) => approveInspection(current, submitted.id, certificateExpiry))) setMessage("Demo certificate issued. Open Certificates to print or create its QR.");
  }
  function reset() {
    if (window.confirm("Reset this demo? All local operational records, inspections, alerts and certificates will be cleared.")) { if (clearOperationalData()) window.location.assign("/import"); }
  }
  return <div className="grid gap-5 lg:grid-cols-2">
    {storageWarning && <Card className="border-[#e7be6a] bg-[#fffaf0] lg:col-span-2"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-[#a36b00]" /><div><div className="font-semibold text-navy">Storage recovery is waiting for you.</div><p className="mt-1 text-sm text-slate-600">KeeTrack has not overwritten the unreadable stored bytes. Start fresh only after confirming that recovery is not needed.</p></div></div><Button variant="destructive" onClick={() => { if (window.confirm("Start a new empty demo and discard the unreadable local state?") && clearOperationalData()) window.location.assign("/import"); }}>Start fresh</Button></CardContent></Card>}
    <Card><CardHeader><div className="eyebrow">Visible clock</div><CardTitle>Move the demo date.</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm leading-relaxed text-slate-500">Deadline tiers recalculate after every action. This changes only KeeTrack’s date, never the operating system.</p><div><label className="eyebrow" htmlFor="demo-date">Demo date</label><div className="relative mt-1.5"><CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent" /><Input id="demo-date" type="date" className="pl-9" value={state.demoDate} onChange={(event) => setDemoDate(event.target.value)} /></div></div><Badge variant="secondary">{state.alerts.filter((alert) => alert.status === "open").length} open alerts will be reconciled</Badge></CardContent></Card>
    <Card><CardHeader><div className="eyebrow">Deadline simulator</div><CardTitle>Exercise an active record.</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Select aria-label="Simulation record" value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">Choose a record</option>{state.records.filter((record) => record.status === "Active").map((record) => <option key={record.id} value={record.id}>{record.assetRef} · {record.assetType}</option>)}</Select><div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => shortcut(30)} disabled={!assetId}>Due in 30d</Button><Button variant="outline" size="sm" onClick={() => shortcut(7)} disabled={!assetId}>Due in 7d</Button><Button variant="outline" size="sm" onClick={() => shortcut(0)} disabled={!assetId}>Due today</Button><Button variant="outline" size="sm" onClick={() => shortcut(-1)} disabled={!assetId}>Overdue</Button></div><div className="border-t border-line pt-4"><div className="eyebrow">Review shortcut</div><p className="mt-1 text-xs text-slate-500">Creates an explicit all-pass checklist for the selected record.</p><Button className="mt-3 w-full" variant="secondary" onClick={simulateSubmitted} disabled={!assetId}><Sparkles data-icon="inline-start" />Submit demo inspection</Button></div></CardContent></Card>
    <Card><CardHeader><div className="eyebrow">Approval simulator</div><CardTitle>Issue a demo certificate.</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm leading-relaxed text-slate-500">Approving creates one certificate and schedules the next inspection by its interval. Licence and retirement dates stay independent.</p><div><label className="eyebrow" htmlFor="sim-expiry">Expiry date</label><Input id="sim-expiry" type="date" className="mt-1.5" value={certificateExpiry} onChange={(event) => setCertificateExpiry(event.target.value)} /></div><Button onClick={simulateApproval} disabled={!submitted}><ShieldAlert data-icon="inline-start" />Approve submitted inspection</Button>{message && <p className="text-sm text-navy" role="status">{message}</p>}<Button asChild variant="ghost" className="justify-start px-0"><Link href="/approvals">Open approval queue <RotateCcw data-icon="inline-end" /></Link></Button></CardContent></Card>
    <Card className="border-[#efc4c4]"><CardHeader><div className="eyebrow text-danger">Destructive action</div><CardTitle>Reset this demo.</CardTitle></CardHeader><CardContent><p className="text-sm leading-relaxed text-slate-500">Clears operational records, alerts, inspections and certificates from this browser, then returns to Import.</p><Button variant="destructive" className="mt-4" onClick={reset}><Trash2 data-icon="inline-start" />Reset operational data</Button></CardContent></Card>
  </div>;
}
