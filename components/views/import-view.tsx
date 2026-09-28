"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, FileText, Import as ImportIcon, RefreshCcw, Upload, XCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseRegisterFile } from "@/lib/import";
import { importRows, toExceptionCsv, validateRegisterRows } from "@/lib/domain";
import { rowToRaw, sampleRows } from "@/lib/sample";
import type { ImportError, ImportPreview } from "@/lib/types";

function download(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

function Stat({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "danger" | "success" }) {
  return <div className="rounded-lg border border-line bg-white px-4 py-3"><div className="eyebrow">{label}</div><div className={`mt-1 text-2xl font-bold tracking-[-.04em] ${tone === "danger" ? "text-danger" : tone === "success" ? "text-[#187348]" : "text-navy"}`}>{value}</div></div>;
}

export function ImportView() {
  const { state, update, hydrated, storageWarning } = useApp();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const sampleRequested = searchParams.get("sample") === "1";
  const [preview, setPreview] = useState<ImportPreview | undefined>(() => sampleRequested ? validateRegisterRows(sampleRows(state.demoDate).map(rowToRaw), state.records.map((record) => record.assetRef)) : undefined);
  const [fileName, setFileName] = useState(() => sampleRequested ? "keetrack-sample-register.csv" : "");
  const [error, setError] = useState("");
  const [lastImport, setLastImport] = useState<{ imported: number; skipped: number; errors: number; issues: ImportError[] }>();
  const [dragging, setDragging] = useState(false);

  async function processFile(file?: File) {
    if (!file) return;
    setFileName(file.name); setError(""); setPreview(undefined);
    try { setPreview(await parseRegisterFile(file, state.records.map((record) => record.assetRef))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This file could not be read"); }
  }

  function importValid() {
    if (!preview?.validRows.length || state.role === "Manager") return;
    const didSave = update((current) => importRows(current, preview.validRows));
    if (didSave) { setLastImport({ imported: preview.validRows.length, skipped: preview.duplicates.length, errors: preview.errors.length, issues: [...preview.errors, ...preview.duplicates] }); setPreview(undefined); setError(""); }
  }

  const allIssues = preview ? [...preview.errors, ...preview.duplicates] : [];
  return <div className="flex flex-col gap-6">
    {lastImport && <div role="status" className="rounded-lg border border-[#bde1ca] bg-[#effaf3] p-4 text-sm text-navy">Import saved: {lastImport.imported} imported · {lastImport.skipped} duplicates skipped · {lastImport.errors} errors.{lastImport.issues.length > 0 && <Button variant="outline" size="sm" className="ml-3" onClick={() => download("keetrack-import-exceptions.csv", toExceptionCsv(lastImport.issues), "text/csv;charset=utf-8")}>Download exception report</Button>}</div>}
    {storageWarning && <div className="rounded-lg border border-[#e7be6a] bg-[#fff8e8] px-4 py-3 text-sm text-[#6f4b00]" role="alert"><strong>Recovery needed.</strong> {storageWarning} Existing in-memory state is untouched until you choose an action in Demo Controls.</div>}
    {!hydrated && <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-slate-500">Restoring this browser’s local workspace…</div>}
    <p className="text-sm text-slate-500">Templates and sample data are available in <Link href="/demo-controls" className="font-semibold text-accent underline underline-offset-2">Demo Controls</Link>.</p>
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden"><CardHeader className="border-b border-line bg-[#f6fafc] pb-4"><div className="flex items-start justify-between gap-4"><div><div className="eyebrow text-accent">Register intake</div><CardTitle className="mt-1 text-xl">Upload a clean Register worksheet.</CardTitle><CardDescription className="mt-2 max-w-xl">One worksheet, fixed headers, 500 total register records. Validation runs in your browser before anything is saved.</CardDescription></div><div className="hidden rounded-lg bg-white p-2 text-accent shadow-sm sm:block"><FileSpreadsheet className="size-7" /></div></div></CardHeader><CardContent className="p-5 sm:p-7"><label htmlFor="register-file" className={`flex min-h-[212px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 text-center transition-colors ${dragging ? "border-accent bg-[#edf8fc]" : "border-[#b8cedc] bg-white hover:border-accent hover:bg-[#f8fcfe]"}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void processFile(event.dataTransfer.files[0]); }}><span className="grid size-12 place-items-center rounded-full bg-[#e8f3f8] text-accent"><Upload className="size-5" /></span><span className="mt-4 font-semibold text-navy">Drop .xlsx or .csv here</span><span className="mt-1 text-xs text-slate-500">or choose a file · max 2MB</span><Input ref={inputRef} id="register-file" type="file" accept=".xlsx,.csv" className="sr-only" onChange={(event) => void processFile(event.target.files?.[0])} /></label>{fileName && <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2 text-sm"><span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-accent" /><span className="truncate font-medium">{fileName}</span></span><Button variant="ghost" size="icon" aria-label="Clear selected file" onClick={() => { setFileName(""); setPreview(undefined); setError(""); if (inputRef.current) inputRef.current.value = ""; }}><XCircle /></Button></div>}{error && <div className="mt-4 flex gap-2 rounded-lg border border-[#f0c2c3] bg-[#fff3f3] px-3 py-3 text-sm text-danger" role="alert"><XCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}</CardContent></Card>
    </div>
    {preview && <Card><CardHeader className="flex-row items-center justify-between"><div><div className="eyebrow">Preflight result</div><CardTitle>Review before you commit.</CardTitle><CardDescription>Only valid rows will be added. Duplicate keys never overwrite existing records.</CardDescription></div><Button variant="ghost" size="sm" onClick={() => setPreview(undefined)}><RefreshCcw data-icon="inline-start" />Clear preview</Button></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3"><Stat label="Total rows" value={preview.totalRows} /><Stat label="Valid" value={preview.validRows.length} tone="success" /><Stat label="Errors + duplicates" value={allIssues.length} tone={allIssues.length ? "danger" : "normal"} /></div>{preview.validRows.length > 0 && <div className="mt-6 overflow-hidden rounded-lg border border-line"><Table><TableHeader><TableRow><TableHead>Asset ref</TableHead><TableHead>Type</TableHead><TableHead>Asset</TableHead><TableHead>Site</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{preview.validRows.slice(0, 8).map((row) => <TableRow key={row.assetRef}><TableCell className="font-semibold text-navy">{row.assetRef}</TableCell><TableCell><Badge variant="secondary">{row.recordType}</Badge></TableCell><TableCell>{row.assetType}</TableCell><TableCell>{row.site}</TableCell><TableCell>{row.owner}</TableCell><TableCell><Badge variant={row.status === "Active" ? "success" : "outline"}>{row.status}</Badge></TableCell></TableRow>)}</TableBody></Table>{preview.validRows.length > 8 && <div className="border-t border-line px-3 py-2 text-xs text-slate-500">Showing first 8 valid rows.</div>}</div>}{allIssues.length > 0 && <div className="mt-6 overflow-hidden rounded-lg border border-[#f0c2c3]"><div className="flex items-center justify-between bg-[#fff6f6] px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold text-danger"><XCircle className="size-4" />Rows needing attention</div><Button variant="outline" size="sm" onClick={() => download("keetrack-import-exceptions.csv", toExceptionCsv(allIssues), "text/csv;charset=utf-8")}><Download data-icon="inline-start" />Exception CSV</Button></div><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Field</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>{allIssues.slice(0, 10).map((issue, index) => <TableRow key={`${issue.row}-${index}`}><TableCell>{issue.row}</TableCell><TableCell>{issue.field ?? "—"}</TableCell><TableCell className="text-danger">{issue.message}</TableCell></TableRow>)}</TableBody></Table></div>} </CardContent><CardFooter className="justify-between gap-3 border-t border-line pt-5"><p className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="size-4 text-[#187348]" />All changes stay in this browser.</p><Button onClick={importValid} disabled={!preview.validRows.length || state.role === "Manager"}><ImportIcon data-icon="inline-start" />Import {preview.validRows.length} valid row{preview.validRows.length === 1 ? "" : "s"}</Button></CardFooter></Card>}
    {state.records.length > 0 && !preview && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#b8cedc] bg-[#eef7fb] px-4 py-3 text-sm text-navy"><span><strong>{state.records.length}</strong> record{state.records.length === 1 ? "" : "s"} currently in this browser.</span><Button asChild variant="outline" size="sm"><a href="/register">Open register</a></Button></div>}
  </div>;
}
