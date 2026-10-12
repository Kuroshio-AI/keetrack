"use client";

import { Fragment, useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Download, Edit3, Leaf, Plus, Printer, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { QuarterCertificate, SavingCertificate } from "@/components/sustainability-certificate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseSaving, quarterLabel, quarterOf, removeSaving, SAVING_TYPES, saveSaving, savingKg, todayString, totalKg } from "@/lib/domain";
import { downloadSavings } from "@/lib/register-download";
import type { Saving, SavingType } from "@/lib/types";
import { formatAmount, formatDate, formatUsd } from "@/lib/utils";

// Text as typed; numbers are read on save so a half-typed "0." isn't fought over.
type FormState = { type: SavingType; date: string; quantity: string; unit: string; factor: string; description: string; site: string; evidence: string; costSaving: string };
const defaultFactor = (type: SavingType) => String(SAVING_TYPES[type].factor ?? "");
const number = (text: string) => text.trim() ? Number(text) : NaN;

function readSaving(form: FormState) {
  return parseSaving({ ...form, quantity: number(form.quantity), factor: number(form.factor), costSaving: form.costSaving.trim() ? Number(form.costSaving) : undefined });
}

export function SustainabilityView() {
  const { state, update } = useApp();
  const savings = state.savings ?? [];
  // Opens on the latest quarter with savings: early in a quarter, the one just ended is the one being reported.
  const [quarter, setQuarter] = useState(() => savings.map((saving) => quarterOf(saving.date)).sort().at(-1) ?? quarterOf(state.demoDate));
  // editing is the saving open in the form; undefined while adding a new one.
  const [form, setForm] = useState<FormState>();
  const [editing, setEditing] = useState<string>();
  const [formError, setFormError] = useState("");
  const [printing, setPrinting] = useState<{ saving: Saving } | { quarter: string }>();
  const formCard = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (printing) dialog.current?.showModal(); }, [printing]);
  const canEdit = state.role !== "Manager";
  // Same roles that can revoke a certificate or warranty.
  const canRemove = state.role === "Admin" || state.role === "Reviewer";

  const quarters = [...new Set([quarterOf(state.demoDate), ...savings.map((saving) => quarterOf(saving.date))])].sort().reverse();
  const rows = savings.filter((saving) => quarterOf(saving.date) === quarter).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const cost = rows.reduce((sum, saving) => sum + (saving.costSaving ?? 0), 0);
  const byType = (Object.keys(SAVING_TYPES) as SavingType[]).flatMap((type) => { const ofType = rows.filter((saving) => saving.type === type); return ofType.length ? [{ type, kg: totalKg(ofType) }] : []; });
  const preview = form && readSaving(form).saving;
  // One quarter shows at a time, so point at the others; otherwise savings dated last quarter look missing.
  const elsewhere = quarters.flatMap((item) => { const count = item === quarter ? 0 : savings.filter((saving) => quarterOf(saving.date) === item).length; return count ? [{ item, count }] : []; });
  const elsewhereCount = elsewhere.reduce((sum, { count }) => sum + count, 0);

  // The form sits above the list, so bring it into view when opened from a row further down.
  const reveal = () => requestAnimationFrame(() => formCard.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  function startAdd() { setEditing(undefined); setFormError(""); setForm({ type: "paper", date: state.demoDate, quantity: "", unit: "", factor: defaultFactor("paper"), description: "", site: "", evidence: "", costSaving: "" }); reveal(); }
  function startEdit(saving: Saving) {
    setEditing(saving.id); setFormError("");
    setForm({ type: saving.type, date: saving.date, quantity: String(saving.quantity), unit: saving.type === "other" ? saving.unit : "", factor: String(saving.factor), description: saving.description ?? "", site: saving.site ?? "", evidence: saving.evidence ?? "", costSaving: saving.costSaving === undefined ? "" : String(saving.costSaving) });
    reveal();
  }
  function close() { setForm(undefined); setEditing(undefined); setFormError(""); }
  // A new type brings its own factor, unless the factor was already typed over.
  function changeType(type: SavingType) { setForm((current) => current && { ...current, type, factor: current.factor === defaultFactor(current.type) ? defaultFactor(type) : current.factor }); }

  function save() {
    if (!form || !canEdit) return;
    const parsed = readSaving(form);
    if (!parsed.saving) { setFormError(parsed.error ?? "Check the saving details."); return; }
    const saving = parsed.saving;
    if (update((current) => saveSaving(current, saving, editing))) { setQuarter(quarterOf(saving.date)); close(); }
  }
  function remove(saving: Saving) {
    if (!window.confirm(`Remove ${saving.number} (${SAVING_TYPES[saving.type].label}, ${formatAmount(savingKg(saving))} kg CO₂e)? Its certificate number won't be used again.`)) return;
    if (update((current) => removeSaving(current, saving.id)) && editing === saving.id) close();
  }

  const unit = form?.type === "other" ? form.unit.trim() || "units" : form && SAVING_TYPES[form.type].unit;
  const field = (key: keyof FormState, label: string, props: ComponentProps<typeof Input> = {}) => <div><Label htmlFor={`saving-${key}`}>{label}</Label><Input id={`saving-${key}`} className="mt-1.5" value={form?.[key] ?? ""} onChange={(event) => setForm((current) => current && { ...current, [key]: event.target.value })} {...props} /></div>;

  return <div className="flex flex-col gap-5">
    <Card><CardContent className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Label htmlFor="saving-quarter">Quarter</Label><Select id="saving-quarter" className="h-8 w-auto py-0 font-semibold text-navy" value={quarter} onChange={(event) => setQuarter(event.target.value)}>{quarters.map((item) => <option key={item} value={item}>{quarterLabel(item)}</option>)}</Select></div>
        {/* One row, weight rising to the primary action on the right; full-width stack on phones. */}
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button variant="outline" size="sm" disabled={!savings.length} onClick={() => downloadSavings(savings, `ktrack-savings-${todayString()}`)}><Download data-icon="inline-start" />Export .xlsx</Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => setPrinting({ quarter })}><Printer data-icon="inline-start" />Print {quarterLabel(quarter)}</Button>
          {canEdit && <Button size="sm" onClick={startAdd}><Plus data-icon="inline-start" />Add saving</Button>}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-baseline gap-x-3"><span className="text-5xl font-bold tracking-[-.03em] tabular-nums text-success">{formatAmount(totalKg(rows))}</span><span className="text-lg font-semibold text-navy">kg CO₂e saved</span></div>
      <p className="mt-1 text-sm text-slate-500">{rows.length} saving{rows.length === 1 ? "" : "s"}{cost > 0 ? ` · ${formatUsd(cost)} cost saved` : ""}</p>
      {elsewhereCount > 0 && <p className="mt-1 text-sm text-slate-500">{elsewhereCount} more saving{elsewhereCount === 1 ? "" : "s"} in other quarters: {elsewhere.map(({ item, count }, index) => <Fragment key={item}>{index > 0 && " · "}<button type="button" className="focus-ring rounded font-semibold text-accent underline underline-offset-2" onClick={() => setQuarter(item)}>{quarterLabel(item)} ({count})</button></Fragment>)}</p>}
      {byType.length > 0 && <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">{byType.map(({ type, kg }) => <div key={type}><dt className="eyebrow">{SAVING_TYPES[type].label}</dt><dd className="mt-0.5 font-semibold tabular-nums text-navy">{formatAmount(kg)} kg</dd></div>)}</dl>}
    </CardContent></Card>

    {form && <Card ref={formCard} className="scroll-mt-28">
      <CardHeader><div className="eyebrow">{editing ? "Edit saving" : "New saving"}</div><CardTitle>{editing ? savings.find((saving) => saving.id === editing)?.number : "Type in the saving, as you would in the spreadsheet."}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="saving-type">Type *</Label><Select id="saving-type" className="mt-1.5" value={form.type} onChange={(event) => changeType(event.target.value as SavingType)}>{(Object.keys(SAVING_TYPES) as SavingType[]).map((type) => <option key={type} value={type}>{SAVING_TYPES[type].label}</option>)}</Select></div>
        {field("date", "Date *", { type: "date" })}
        {form.type === "other" && field("unit", "Unit *", { placeholder: "kWh, litres, kg…" })}
        {field("quantity", `Quantity (${unit}) *`, { type: "number", min: 0, step: "any", inputMode: "decimal" })}
        {field("factor", "kg CO₂e per unit *", { type: "number", min: 0, step: "any", inputMode: "decimal" })}
        <p className="text-sm text-slate-500 sm:col-span-2" aria-live="polite">{preview ? <>{formatAmount(preview.quantity)} {preview.unit} × {preview.factor} = <span className="font-semibold text-success">{formatAmount(savingKg(preview))} kg CO₂e saved</span></> : "Enter the quantity and factor to see the saving."}</p>
        <Separator className="sm:col-span-2" />
        <div className="eyebrow sm:col-span-2">On the certificate · optional</div>
        {field("description", "Description", { placeholder: "Consolidated Abu Dhabi and KSA deliveries" })}
        {field("site", "Site", { placeholder: "Warehouse No. 4, DIP 1" })}
        {field("evidence", "Evidence reference", { placeholder: "Endoshred certificate SO/0926/19305" })}
        {field("costSaving", "Cost saving (USD)", { type: "number", min: 0, step: "any", inputMode: "decimal" })}
        {formError && <p className="text-sm text-danger sm:col-span-2" role="alert">{formError}</p>}
      </CardContent>
      <div className="flex justify-end gap-2 border-t border-line p-5"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={save}>Save saving</Button></div>
    </Card>}

    <Card><CardHeader><div className="eyebrow">{quarterLabel(quarter)}</div><CardTitle>Savings and certificates</CardTitle></CardHeader>
      <CardContent>{rows.length ? <Table>
        <TableHeader><TableRow><TableHead>Certificate</TableHead><TableHead>Saving</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="whitespace-nowrap text-right">kg CO₂e</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((saving) => <TableRow key={saving.id}>
          <TableCell className="whitespace-nowrap"><div className="font-mono text-xs font-semibold text-navy">{saving.number}</div><div className="mt-0.5 text-xs text-slate-500">{formatDate(saving.date)}</div></TableCell>
          <TableCell className="min-w-[180px]"><div className="font-semibold text-navy">{SAVING_TYPES[saving.type].label}</div>{saving.description && <div className="text-xs text-slate-500">{saving.description}</div>}</TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">{formatAmount(saving.quantity)} {saving.unit}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums text-success">{formatAmount(savingKg(saving))}</TableCell>
          {/* Print is the row's main job, so it keeps its label; edit and remove use the usual pencil and bin. */}
          <TableCell><div className="flex items-center justify-end gap-1">
            <Button variant="outline" size="sm" onClick={() => setPrinting({ saving })}><Printer />Print</Button>
            {canEdit && <Button variant="ghost" size="icon" className="size-8" title="Edit" aria-label={`Edit ${saving.number}`} onClick={() => startEdit(saving)}><Edit3 /></Button>}
            {canRemove && <Button variant="ghost" size="icon" className="size-8 text-danger" title="Remove" aria-label={`Remove ${saving.number}`} onClick={() => remove(saving)}><Trash2 /></Button>}
          </div></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <div className="rounded-lg border border-dashed border-line px-4 py-14 text-center"><Leaf className="mx-auto size-9 text-[#b8cedc]" /><p className="mt-3 text-sm text-slate-500">No savings recorded for {quarterLabel(quarter)}.</p></div>}</CardContent>
    </Card>

    {printing && createPortal(<dialog ref={dialog} aria-label="Sustainability certificate print preview" onClose={() => setPrinting(undefined)} className="certificate-print-area animate-rise fixed inset-0 m-auto max-h-[95vh] w-[min(95vw,850px)] overflow-auto bg-white p-5 backdrop:bg-black/50 sm:p-10">
      <div className="print-hidden mb-5 flex justify-end gap-2"><Button onClick={() => window.print()}>Print / Save PDF</Button><Button variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
      {"saving" in printing ? <SavingCertificate saving={printing.saving} /> : <QuarterCertificate quarter={printing.quarter} savings={savings.filter((saving) => quarterOf(saving.date) === printing.quarter)} issued={state.demoDate} />}
    </dialog>, document.body)}
  </div>;
}
