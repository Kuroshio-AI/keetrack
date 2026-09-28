"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CircleAlert, ClipboardCheck, FileClock, ShieldAlert } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateDiffDays } from "@/lib/domain";

function Kpi({ label, value, detail, icon: Icon, tone = "navy" }: { label: string; value: number; detail: string; icon: typeof CalendarClock; tone?: "navy" | "amber" | "red" | "green" }) {
  return <Card className="relative overflow-hidden"><div className={`absolute inset-x-0 top-0 h-1 ${tone === "amber" ? "bg-[#d99512]" : tone === "red" ? "bg-danger" : tone === "green" ? "bg-[#269663]" : "bg-accent"}`} /><CardContent className="flex items-start justify-between gap-3 p-5"><div><div className="eyebrow">{label}</div><div className="mt-2 text-3xl font-bold tracking-[-.06em] text-navy">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div><span className={`grid size-10 place-items-center rounded-lg ${tone === "amber" ? "bg-[#fff2d7] text-[#8a5d00]" : tone === "red" ? "bg-[#fde8e8] text-danger" : tone === "green" ? "bg-[#e7f4ed] text-[#187348]" : "bg-[#e8f3f8] text-accent"}`}><Icon className="size-5" /></span></CardContent></Card>;
}

export function DashboardView() {
  const { state } = useApp();
  const open = state.alerts.filter((alert) => alert.status === "open");
  const overdue = open.filter((alert) => alert.tier === "overdue").length;
  const due7 = open.filter((alert) => alert.tier === "due7" || alert.tier === "today").length;
  const due30 = open.filter((alert) => ["due30", "due7", "today"].includes(alert.tier ?? "")).length;
  const review = state.inspections.filter((inspection) => inspection.status === "Submitted").length;
  const todayActions = open.filter((alert) => ["due7", "today", "overdue"].includes(alert.tier ?? "")).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 6);
  return <div className="flex flex-col gap-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Due within 30 days" value={due30} detail="active obligations" icon={CalendarClock} tone="navy" /><Kpi label="Due within 7 days" value={due7} detail="today included" icon={FileClock} tone="amber" /><Kpi label="Overdue" value={overdue} detail="needs action" icon={ShieldAlert} tone="red" /><Kpi label="Awaiting review" value={review} detail="submitted inspections" icon={ClipboardCheck} tone="green" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Card><CardHeader className="flex-row items-center justify-between"><div><div className="eyebrow">Today’s work</div><CardTitle>What should move next?</CardTitle></div><Button asChild variant="ghost" size="sm"><Link href="/alerts">Open alert queue <ArrowUpRight data-icon="inline-end" /></Link></Button></CardHeader><CardContent>{todayActions.length ? <div className="flex flex-col gap-2">{todayActions.map((item) => { const days = dateDiffDays(item.dueDate ?? state.demoDate, state.demoDate); return <Link href={`/register?asset=${item.assetId ?? ""}`} key={item.id} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-paper px-3 py-3 transition-colors hover:border-accent"><div className="flex min-w-0 items-center gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-md ${days < 0 ? "bg-[#fde8e8] text-danger" : "bg-[#fff2d7] text-[#8a5d00]"}`}><CircleAlert className="size-4" /></span><div className="min-w-0"><div className="truncate text-sm font-semibold text-navy">{item.assetRef} · {item.event}</div><div className="truncate text-xs text-slate-500">{item.owner} · {item.dueDate ?? "No date"}</div></div></div><div className="shrink-0 text-right"><Badge variant={days < 0 ? "danger" : "warning"}>{days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}</Badge></div></Link>; })}</div> : <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-slate-500">No active work falls within seven days.</div>}</CardContent></Card>
      <Card><CardHeader><div className="eyebrow">Recent activity</div><CardTitle>Recent activity</CardTitle></CardHeader><CardContent>{state.activity.length ? <div className="flex flex-col gap-4">{state.activity.slice(0, 6).map((item) => <div key={item.id} className="flex gap-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-accent" /><div className="min-w-0"><div className="text-sm font-semibold text-navy">{item.event}</div><div className="truncate text-xs text-slate-500">{item.detail}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">{item.timestamp.slice(0, 16).replace("T", " ")} · {item.actor}</div></div></div>)}</div> : <p className="text-sm text-slate-500">Import the fictional sample to start a local activity trail.</p>}</CardContent></Card>
    </div>
    <div className="rounded-xl border border-[#b8cedc] bg-[#eef7fb] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="eyebrow text-accent">Demo signal</div><p className="mt-1 text-sm leading-relaxed text-navy">The visible date is <strong>{state.demoDate}</strong>. Move it in Demo Controls to exercise date tiers; the operating system clock never changes.</p></div><Button asChild variant="outline" size="sm"><Link href="/demo-controls">Open controls <ArrowUpRight data-icon="inline-end" /></Link></Button></div></div>
  </div>;
}
