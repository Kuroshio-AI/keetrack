"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BellOff, Plus, RotateCcw, Search, X } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { DaysCell } from "@/components/fls-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, addMonthsClamped, importRows, makeId } from "@/lib/domain";
import { buildingStatus, FLS_ASSET_TYPE } from "@/lib/fls";
import type { AssetRecord } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Form = { name: string; category: string; provider: string; issued: string; expiry: string; remarks: string; muted: boolean };

const formFor = (record?: AssetRecord): Form => record
  ? { name: record.assetRef, category: record.site, provider: record.owner, issued: record.licenceIssuedDate ?? "", expiry: record.licenceExpiryDate ?? "", remarks: record.remarks ?? "", muted: record.status === "Retired" }
  : { name: "", category: "General", provider: "", issued: "", expiry: "", remarks: "", muted: false };

const STATUS_FILTERS = { all: "All statuses", red: "Red · due date passed or expired", amber: "Amber · due within 14 days", green: "Green", undated: "No certificate dates", muted: "Muted" };
type StatusFilter = keyof typeof STATUS_FILTERS;

// The FLS register: their tracker sheet as a live table, with each building editable in place.
export function BuildingsView() {
  const { state, update } = useApp();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [provider, setProvider] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // A record id, "new" while adding, or undefined when the panel is closed. Dashboard and Alerts link here with ?asset=.
  const [editing, setEditing] = useState<string | undefined>(() => searchParams.get("asset") ?? undefined);
  const [form, setForm] = useState<Form>(() => formFor(state.records.find((record) => record.id === searchParams.get("asset"))));
  const [error, setError] = useState("");
  const rows = useMemo(() => state.records.map((record) => ({ record, status: buildingStatus(record, state.demoDate) })), [state.records, state.demoDate]);
  const categories = [...new Set(state.records.map((record) => record.site))];
  const providers = [...new Set(state.records.map((record) => record.owner))].sort();
  const visible = rows.filter(({ record, status }) => (category === "all" || record.site === category) && (provider === "all" || record.owner === provider)
    && (statusFilter === "all" || (statusFilter === "muted" ? status.muted : !status.muted && (statusFilter === "undated" ? !status.light : status.light === statusFilter)))
    && `${record.assetRef} ${record.owner} ${record.remarks ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const preview = buildingStatus({ licenceExpiryDate: form.expiry || undefined, status: form.muted ? "Retired" : "Active" }, state.demoDate);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  // The panel sits above the table, so bring it into view when a row far down is clicked.
  function open(record?: AssetRecord) { setEditing(record?.id ?? "new"); setForm(formFor(record)); setError(""); requestAnimationFrame(() => document.getElementById("building-panel")?.scrollIntoView({ block: "start" })); }

  function save() {
    setError("");
    const name = form.name.trim();
    if (!name) { setError("Building is required."); return; }
    if (form.issued && form.expiry && form.expiry < form.issued) { setError("Date of Expiry can't be before Date of Issue."); return; }
    const fields = { site: form.category.trim() || "General", owner: form.provider.trim() || "Not assigned", licenceIssuedDate: form.issued || undefined, licenceExpiryDate: form.expiry || undefined, remarks: form.remarks.trim() || undefined, status: form.muted ? "Retired" as const : "Active" as const };
    const saved = update((current) => {
      if (current.records.some((record) => record.id !== editing && record.assetRef.trim().toLowerCase() === name.toLowerCase())) throw new Error(`${name} is already in the list.`);
      if (editing === "new") return importRows(current, [{ assetRef: name, recordType: "licence", assetType: FLS_ASSET_TYPE, ...fields }]);
      const timestamp = new Date().toISOString();
      const event = { id: makeId("activity"), event: "Building updated", detail: name, actor: current.role, timestamp };
      return { ...current, records: current.records.map((record) => record.id === editing ? { ...record, assetRef: name, ...fields, updatedAt: timestamp, activity: [event, ...record.activity] } : record), activity: [event, ...current.activity] };
    });
    if (saved) setEditing(undefined);
  }

  return <div className="flex flex-col gap-5">
    {editing && <Card id="building-panel" className="animate-rise scroll-mt-24">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-line">
        <div className="min-w-0">
          <div className="eyebrow">{editing === "new" ? "New building" : "Edit building"}</div>
          <CardTitle className="truncate text-xl">{editing === "new" ? "Add a building to track." : form.name}</CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">{preview.dueDate ? <>
            <span className="inline-flex items-center gap-2">Due {formatDate(preview.dueDate)} <DaysCell days={preview.dueDays} /></span>
            <span className="inline-flex items-center gap-2">Expires {formatDate(form.expiry)} <DaysCell days={preview.expiryDays} /></span>
          </> : "No certificate dates yet."}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditing(undefined)}><X /></Button>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <div><Label htmlFor="fls-name">Building *</Label><Input id="fls-name" className="mt-1.5" value={form.name} onChange={(event) => set({ name: event.target.value })} /></div>
        <div><Label htmlFor="fls-category">Category</Label><Input id="fls-category" list="fls-categories" className="mt-1.5" value={form.category} onChange={(event) => set({ category: event.target.value })} /></div>
        <div><Label htmlFor="fls-provider">Service provider</Label><Input id="fls-provider" list="fls-providers" className="mt-1.5" value={form.provider} onChange={(event) => set({ provider: event.target.value })} /></div>
        <div><Label htmlFor="fls-issued">Date of issue</Label><Input id="fls-issued" type="date" className="mt-1.5" value={form.issued} onChange={(event) => set({ issued: event.target.value })} /></div>
        <div><Label htmlFor="fls-expiry">Date of expiry</Label><Input id="fls-expiry" type="date" className="mt-1.5" value={form.expiry} onChange={(event) => set({ expiry: event.target.value })} /></div>
        <div><Label htmlFor="fls-remarks">Remarks</Label><Input id="fls-remarks" className="mt-1.5" value={form.remarks} onChange={(event) => set({ remarks: event.target.value })} /></div>
        <label className="flex items-start gap-3 rounded-lg border border-line bg-paper px-3 py-3 text-sm sm:col-span-2 lg:col-span-3">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#0b3151]" checked={form.muted} onChange={(event) => set({ muted: event.target.checked })} />
          <span><span className="font-semibold text-navy">Mute alerts for this building</span><span className="block text-xs text-slate-500">For sites that are closed, under renovation, renewed by the client or not under you. It stays in the list without alerting.</span></span>
        </label>
        {error && <p className="text-sm text-danger sm:col-span-2 lg:col-span-3" role="alert">{error}</p>}
        <datalist id="fls-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
        <datalist id="fls-providers">{providers.map((item) => <option key={item} value={item} />)}</datalist>
      </CardContent>
      <div className="flex flex-wrap justify-between gap-2 border-t border-line p-5">
        <Button variant="outline" onClick={() => set({ issued: state.demoDate, expiry: addDays(addMonthsClamped(state.demoDate, 12), -1) })}><RotateCcw data-icon="inline-start" />Renewed today: fill in a year</Button>
        <div className="flex gap-2"><Button variant="ghost" onClick={() => setEditing(undefined)}>Cancel</Button><Button onClick={save}>{editing === "new" ? "Add building" : "Save"}</Button></div>
      </div>
    </Card>}
    <Card>
      <CardHeader className="gap-4 border-b border-line">
        <div className="flex items-center justify-between gap-3"><div><div className="eyebrow">{state.records.length} buildings · as of {formatDate(state.demoDate)}</div><CardTitle>FLS DCD (AMC) certificates</CardTitle></div><Button size="sm" onClick={() => open()}><Plus data-icon="inline-start" />Add building</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search buildings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Building, provider or remark" className="pl-9" /></div>
          <Select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</Select>
          <Select aria-label="Filter by service provider" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="all">All providers</option>{providers.map((item) => <option key={item}>{item}</option>)}</Select>
          <Select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>{Object.entries(STATUS_FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">{state.records.length === 0
        ? <div className="px-5 py-12 text-center text-sm text-slate-500">No buildings yet. <Link href="/import" className="font-semibold text-accent underline underline-offset-2">Import your FLS DCD tracker</Link> or add one.</div>
        : visible.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500">No buildings match these filters.</div>
        : <Table>
          <TableHeader><TableRow><TableHead>Building</TableHead><TableHead>Service provider</TableHead><TableHead>Date of issue</TableHead><TableHead>Date of expiry</TableHead><TableHead className="text-right">Days to expiry</TableHead><TableHead>Due date</TableHead><TableHead className="text-right">Days to due date</TableHead><TableHead>Remarks</TableHead></TableRow></TableHeader>
          <TableBody>{visible.map(({ record, status }) => <TableRow key={record.id} className={`cursor-pointer ${editing === record.id ? "bg-[#e8f3f8]" : ""} ${status.muted ? "opacity-60" : ""}`} onClick={() => open(record)}>
            <TableCell><button type="button" className="focus-ring rounded text-left font-semibold text-navy" onClick={(event) => { event.stopPropagation(); open(record); }}>{record.assetRef}</button><div className="flex items-center gap-2 text-xs text-slate-500">{record.site}{status.muted && <Badge variant="outline" className="px-1.5 py-0 text-[9px]"><BellOff className="mr-1 size-2.5" aria-hidden="true" />Muted</Badge>}</div></TableCell>
            <TableCell>{record.owner}</TableCell>
            <TableCell className="whitespace-nowrap">{record.licenceIssuedDate ? formatDate(record.licenceIssuedDate) : "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{record.licenceExpiryDate ? formatDate(record.licenceExpiryDate) : "—"}</TableCell>
            <TableCell className="text-right"><DaysCell days={status.expiryDays} /></TableCell>
            <TableCell className="whitespace-nowrap">{status.dueDate ? formatDate(status.dueDate) : "—"}</TableCell>
            <TableCell className="text-right"><DaysCell days={status.dueDays} /></TableCell>
            <TableCell className="text-xs text-slate-500">{record.remarks ?? ""}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </CardContent>
    </Card>
  </div>;
}
