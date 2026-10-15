"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUp, BellOff, Plus, RotateCcw, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/app-provider";
import { DaysCell, LIGHTS } from "@/components/fls-panels";
import { useSortableRows } from "@/components/interior/sortable-table";
import { RollingNumber } from "@/components/interior/value-flash";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, addMonthsClamped, dateDiffDays, importRows, makeId } from "@/lib/domain";
import { buildingStatus, days, FLS_ASSET_TYPE, type BuildingStatus } from "@/lib/fls";
import type { AssetRecord } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Form = { name: string; category: string; provider: string; issued: string; expiry: string; remarks: string; muted: boolean };

const formFor = (record?: AssetRecord): Form => record
  ? { name: record.assetRef, category: record.site, provider: record.owner, issued: record.licenceIssuedDate ?? "", expiry: record.licenceExpiryDate ?? "", remarks: record.remarks ?? "", muted: record.status === "Retired" }
  : { name: "", category: "General", provider: "", issued: "", expiry: "", remarks: "", muted: false };

// One click fills Date of issue (today) and Date of expiry (the day before the same date that many months on). Any other term: type the expiry.
const RENEWAL_TERMS = [[6, "6 months"], [12, "1 year"], [24, "2 years"], [36, "3 years"]] as const;

const STATUS_FILTERS = { all: "All", red: "Red", amber: "Amber", green: "Green", undated: "No dates", muted: "Muted" };
const FILTER_HINTS: Record<StatusFilter, string> = { all: "Every building", red: "Due date passed or expired", amber: "Due within 14 days", green: "15 or more days to the due date", undated: "No certificate dates", muted: "Alerts muted" };
type StatusFilter = keyof typeof STATUS_FILTERS;
const statusKey = (status: BuildingStatus): StatusFilter => status.muted ? "muted" : status.light ?? "undated";
// Most urgent first: by days to the due date, then buildings without dates, then muted ones. The sort is stable, so ties keep the sheet's order.
const urgency = (status: BuildingStatus) => status.muted ? 2e9 : status.dueDays ?? 1e9;

type Row = { record: AssetRecord; status: BuildingStatus };
// Click a header to sort by it; click again to flip. Muted and undated buildings have no due date to sort by, so they stay at the end.
const COLUMNS = [
  { id: "building", label: "Building", value: ({ record }: Row) => record.assetRef },
  { id: "provider", label: "Service provider", value: ({ record }: Row) => record.owner, className: "w-[22%]" },
  { id: "due", label: "Due date", value: ({ status }: Row) => status.muted ? undefined : status.dueDays, className: "w-[20%]" },
  { id: "expires", label: "Expires", value: ({ record }: Row) => record.licenceExpiryDate, className: "w-[18%] pr-5" },
];
const rowId = ({ record }: Row) => record.id;
const sortValue = (row: Row, columnId: string) => COLUMNS.find((column) => column.id === columnId)?.value(row);
// interior's springs: CELL moves rows and pills, FILL grows the certificate-life bars.
const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const FILL = { type: "spring", stiffness: 210, damping: 34, mass: 0.9 } as const;

// The one cell that answers "does this building need me?": days to the due date in the sheet's colour, with the date under it.
function DueCell({ status }: { status: BuildingStatus }) {
  if (!status.dueDate || status.dueDays === undefined) return <span className="text-slate-400">No dates</span>;
  const light = !status.muted && status.light ? LIGHTS[status.light] : undefined;
  const label = status.muted ? "Alerts muted" : status.dueDays === 0 ? "Due today" : status.dueDays > 0 ? `In ${days(status.dueDays)}` : `${days(status.dueDays)} overdue`;
  return <div className="whitespace-nowrap">
    <div className={`flex items-center gap-2 font-semibold tabular-nums ${light?.text ?? "text-slate-500"}`}>{light ? <span className={`size-2 shrink-0 rounded-full ${light.dot}`} aria-hidden="true" /> : <BellOff className="size-3 shrink-0" aria-hidden="true" />}{label}</div>
    <div className="pl-4 text-xs tabular-nums text-slate-500">{formatDate(status.dueDate)}</div>
  </div>;
}

// How much of the certificate's year is used up: a bar from issue to expiry in the row's colour, full once it has expired.
function ExpiryCell({ record, status, demoDate }: Row & { demoDate: string }) {
  const { licenceIssuedDate: issued, licenceExpiryDate: expiry } = record;
  if (!expiry) return <span className="text-slate-400">—</span>;
  const span = issued ? dateDiffDays(expiry, issued) : 0;
  const used = issued && span > 0 ? Math.min(1, Math.max(0, dateDiffDays(demoDate, issued) / span)) : undefined;
  const fill = status.muted || !status.light ? "bg-slate-300" : LIGHTS[status.light].dot;
  return <div className="max-w-36">
    <div className="whitespace-nowrap tabular-nums">{formatDate(expiry)}</div>
    {used !== undefined && <div role="progressbar" aria-label="Certificate year used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} title={`Issued ${formatDate(issued!)} · ${Math.round(used * 100)}% of its term used`} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e9eef3]">
      <motion.div className={`h-full origin-left rounded-full ${fill}`} initial={{ scaleX: 0 }} animate={{ scaleX: used }} transition={FILL} />
    </div>}
  </div>;
}

// The FLS register: their tracker sheet as a live table, with each building editable in place.
export function BuildingsView() {
  const { state, update } = useApp();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // A record id, "new" while adding, or undefined when the panel is closed. Dashboard and Alerts link here with ?asset=.
  const [editing, setEditing] = useState<string | undefined>(() => searchParams.get("asset") ?? undefined);
  const [form, setForm] = useState<Form>(() => formFor(state.records.find((record) => record.id === searchParams.get("asset"))));
  const [error, setError] = useState("");
  // The building just saved, so its row can glow once where it landed.
  const [justSaved, setJustSaved] = useState("");
  const rows = useMemo(() => state.records.map((record) => ({ record, status: buildingStatus(record, state.demoDate) })).sort((a, b) => urgency(a.status) - urgency(b.status)), [state.records, state.demoDate]);
  const counts = rows.reduce<Record<string, number>>((total, { status }) => ({ ...total, [statusKey(status)]: (total[statusKey(status)] ?? 0) + 1 }), { all: rows.length });
  const categories = [...new Set(state.records.map((record) => record.site))];
  const providers = [...new Set(state.records.map((record) => record.owner))].sort();
  const visible = rows.filter(({ record, status }) => (statusFilter === "all" || statusKey(status) === statusFilter)
    && `${record.assetRef} ${record.site} ${record.owner} ${record.remarks ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const { ordered, toggle, ariaSort, sort } = useSortableRows({ rows: visible, getRowId: rowId, getValue: sortValue, defaultSort: { columnId: "due", direction: "asc" }, restoreOriginal: false });
  useEffect(() => { if (!justSaved) return; const timer = setTimeout(() => setJustSaved(""), 1600); return () => clearTimeout(timer); }, [justSaved]);
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
    if (saved) { setEditing(undefined); setJustSaved(name); }
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5">
        <div role="group" aria-label="Renewed today for" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-semibold text-navy"><RotateCcw className="size-4" aria-hidden="true" />Renewed today for</span>
          {RENEWAL_TERMS.map(([months, label]) => {
            const expiry = addDays(addMonthsClamped(state.demoDate, months), -1);
            const active = form.issued === state.demoDate && form.expiry === expiry;
            return <Button key={months} variant={active ? "default" : "outline"} size="sm" aria-pressed={active} onClick={() => set({ issued: state.demoDate, expiry })}>{label}</Button>;
          })}
        </div>
        <div className="flex gap-2"><Button variant="ghost" onClick={() => setEditing(undefined)}>Cancel</Button><Button onClick={save}>{editing === "new" ? "Add building" : "Save"}</Button></div>
      </div>
    </Card>}
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-3 border-b border-line">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search buildings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search buildings, providers, remarks" className="pl-9" /></div>
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">{(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((key) => {
          const active = statusFilter === key;
          const dot = key === "red" || key === "amber" || key === "green" ? LIGHTS[key].dot : undefined;
          return <button key={key} type="button" title={FILTER_HINTS[key]} aria-pressed={active} onClick={() => setStatusFilter(key)} className={`focus-ring relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-[color,border-color,transform] duration-150 active:scale-[.96] ${active ? "border-navy text-white" : "border-line bg-white text-slate-600 hover:border-slate-300"}`}>
            {active && <motion.span layoutId="status-pill" className="absolute -inset-px rounded-full bg-navy" transition={CELL} />}
            <span className="relative inline-flex items-center gap-1.5">{dot && <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />}{STATUS_FILTERS[key]}<RollingNumber value={counts[key] ?? 0} className={active ? "text-white/70" : "text-slate-400"} /></span>
          </button>;
        })}</div>
        <Button size="sm" onClick={() => open()}><Plus data-icon="inline-start" />Add building</Button>
      </CardHeader>
      <CardContent className="p-0">{state.records.length === 0
        ? <div className="px-5 py-12 text-center text-sm text-slate-500">No buildings yet. <Link href="/import" className="font-semibold text-accent underline underline-offset-2">Import your FLS DCD tracker</Link> or add one.</div>
        : visible.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500">No buildings match. <button type="button" className="focus-ring rounded font-semibold text-accent underline underline-offset-2" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Show all</button></div>
        : <Table>
          <TableHeader><TableRow>{COLUMNS.map(({ id, label, className = "" }) => {
            const direction = sort?.columnId === id ? sort.direction : undefined;
            return <TableHead key={id} aria-sort={ariaSort(id)} className={`${id === "building" ? "pl-5" : ""} ${className}`}>
              <button type="button" onClick={() => toggle(id)} title={`Sort by ${label.toLowerCase()}`} className={`focus-ring group -mx-1.5 inline-flex items-center gap-1.5 rounded px-1.5 py-1 uppercase tracking-[.08em] transition-colors ${direction ? "text-navy" : "hover:text-navy"}`}>
                {label}
                <motion.span aria-hidden="true" initial={false} animate={{ rotate: direction === "desc" ? 180 : 0, opacity: direction ? 1 : 0, scale: direction ? 1 : 0.72 }} transition={CELL} className={direction ? "" : "group-hover:!opacity-40"}><ArrowUp className="size-3" strokeWidth={2.5} /></motion.span>
              </button>
            </TableHead>;
          })}</TableRow></TableHeader>
          <TableBody><AnimatePresence initial={false}>{ordered.map(({ id, row: { record, status }, index }) => <motion.tr key={id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ layout: { ...CELL, delay: Math.min(index, 8) * 0.018 }, opacity: { duration: 0.2 } }} className={`cursor-pointer border-b border-line transition-colors hover:bg-[#f7fafc] ${editing === record.id ? "bg-[#e8f3f8]" : ""} ${justSaved === record.assetRef ? "row-glow" : ""} ${status.muted ? "text-slate-500" : ""}`} onClick={() => open(record)}>
            <TableCell className="py-3.5 pl-5"><button type="button" className={`focus-ring rounded text-left font-semibold ${status.muted ? "text-slate-500" : "text-navy"}`} onClick={(event) => { event.stopPropagation(); open(record); }}>{record.assetRef}</button>{record.remarks && <div className="text-xs text-slate-500">{record.remarks}</div>}</TableCell>
            <TableCell className={record.owner === "Not assigned" || status.muted ? "text-slate-400" : ""}>{record.owner}</TableCell>
            <TableCell><DueCell status={status} /></TableCell>
            <TableCell className={`pr-5 ${status.muted ? "text-slate-400" : "text-slate-600"}`}><ExpiryCell record={record} status={status} demoDate={state.demoDate} /></TableCell>
          </motion.tr>)}</AnimatePresence></TableBody>
        </Table>}
        <div role="status" className="sr-only">{sort ? `Sorted by ${COLUMNS.find((column) => column.id === sort.columnId)?.label}, ${sort.direction === "asc" ? "ascending" : "descending"}.` : ""}</div>
      </CardContent>
    </Card>
  </div>;
}
