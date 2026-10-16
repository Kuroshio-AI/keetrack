// No "use client": only client views render it, and it takes a callback.
import { Fragment, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Signature } from "@/components/warranty-document";
import { RESULT_LABELS } from "@/lib/client";
import type { AssetRecord, Inspection } from "@/lib/types";
import { formatLocalDate } from "@/lib/utils";

const COLUMNS = ["pass", "fail", "na"] as const;

// The filled-in PPM form, laid out like the service provider's paper one: a tick per item, then both sign-offs.
function ChecklistReport({ inspection, record }: { inspection: Inspection; record: AssetRecord }) {
  const count = (result: (typeof COLUMNS)[number]) => inspection.checklist.filter((item) => item.result === result).length;
  const approved = inspection.status === "Approved";
  const facts: [string, string][] = [["Building", record.assetRef], ["Category", record.site], ["Service provider", record.owner], ["Technician", inspection.inspector], ["Submitted", inspection.submittedAt ? formatLocalDate(inspection.submittedAt) : "Not yet"], ["Approved", approved && inspection.reviewedAt ? formatLocalDate(inspection.reviewedAt) : "Not yet"]];
  return <div className="border-[8px] border-[#0b3151] p-1 text-[11.5px] leading-[1.5] text-ink"><div className="border border-[#b8cedc] px-8 py-6">
    <div className="flex items-start justify-between gap-6">
      <div className="flex gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#0b3151] text-2xl font-black text-white" aria-hidden="true">K</span>
        <div><div className="text-xs font-bold uppercase tracking-[.2em] text-accent">PPM checklist · Service report</div><h2 className="mt-1 text-2xl font-black leading-tight tracking-tight text-navy">{inspection.title ?? "Inspection"}</h2><div className="mt-1 text-slate-500">Inspection, testing and maintenance · {record.assetRef}</div></div>
      </div>
      <div className={`stamp flex shrink-0 flex-col items-center rounded-lg border-2 px-3 py-1.5 outline outline-1 outline-offset-[3px] ${approved ? "border-success text-success outline-success/40" : "border-warning text-[#8a5d00] outline-warning/40"}`}>
        <span className="text-[9px] font-bold uppercase tracking-[.22em] opacity-80">Client sign-off</span>
        <span className="text-xl font-black uppercase leading-tight tracking-[.16em]">{approved ? "Approved" : "Pending"}</span>
      </div>
    </div>
    <dl className="mt-5 grid grid-cols-3 gap-x-8 gap-y-2 rounded-lg bg-paper px-4 py-3">{facts.map(([label, value]) => <div key={label}><dt className="eyebrow">{label}</dt><dd className="mt-0.5 font-semibold text-navy">{value}</dd></div>)}</dl>
    <table className="mt-5 w-full border-collapse">
      <thead><tr className="border-b-2 border-[#0b3151] text-left text-[10px] font-bold uppercase tracking-[.08em] text-navy"><th className="w-10 py-1.5">No.</th><th className="py-1.5">Activity</th>{COLUMNS.map((result) => <th key={result} className="w-14 py-1.5 text-center">{RESULT_LABELS[result]}<div className="font-mono text-[11px] text-slate-500">{count(result)}</div></th>)}</tr></thead>
      <tbody>{inspection.checklist.map((item, index, list) => {
        const heading = item.section && item.section !== list[index - 1]?.section;
        const number = index + 1 - list.slice(0, index).filter((other) => other.section !== item.section).length;
        return <Fragment key={item.id}>
          {heading && <tr className="break-inside-avoid"><th colSpan={5} className="bg-paper px-2 pb-1 pt-2.5 text-left text-[10px] font-bold uppercase tracking-[.14em] text-accent">{item.section}</th></tr>}
          <tr className={`break-inside-avoid border-b border-line align-top ${item.result === "fail" ? "bg-[#fff6f6]" : ""}`}>
            <td className="py-1.5 font-mono text-slate-500">{number}</td>
            <td className={`py-1.5 pr-3 ${item.result === "fail" ? "font-semibold text-danger" : ""}`}>{item.label}</td>
            {COLUMNS.map((result) => <td key={result} className={`py-1.5 text-center text-sm font-black ${result === "fail" ? "text-danger" : result === "pass" ? "text-success" : "text-slate-500"}`}>{item.result === result ? "✓" : ""}</td>)}
          </tr>
        </Fragment>;
      })}</tbody>
    </table>
    <div className="mt-5 break-inside-avoid"><div className="eyebrow">Comments</div><p className="mt-1 min-h-10 whitespace-pre-wrap rounded-lg border border-line px-3 py-2">{inspection.notes.trim() || "None."}</p></div>
    {inspection.photos?.length ? <div className="mt-4 break-inside-avoid"><div className="eyebrow">Photos</div><div className="mt-1.5 flex flex-wrap gap-2">{inspection.photos.map((photo) => <img key={photo.id} src={photo.dataUrl} alt={photo.name} className="size-28 rounded-md border border-line object-cover" />)}</div></div> : null}
    <div className="mt-6 grid break-inside-avoid grid-cols-2 gap-8">
      <Signature label="Service provider technician" name={inspection.inspector} date={inspection.submittedAt} image={inspection.signature} />
      <Signature label="Client representative" name={approved ? "Approved in KTrack" : "Awaiting approval"} date={approved ? inspection.reviewedAt : undefined} />
    </div>
    <footer className="mt-6 border-t border-line pt-2 text-[10px] text-slate-500">KTrack · DXB FLS compliance · Demo service report. Records stay in this browser.</footer>
  </div></div>;
}

// Print preview for one checklist; Print / Save PDF prints only this dialog (see .certificate-print-area in globals.css).
export function ChecklistReportDialog({ inspectionId, onClose }: { inspectionId: string; onClose: () => void }) {
  const { state } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const inspection = state.inspections.find((item) => item.id === inspectionId);
  const record = state.records.find((item) => item.id === inspection?.assetId);
  useEffect(() => { dialog.current?.showModal(); }, []);
  if (!inspection || !record) return null;
  return createPortal(<dialog ref={dialog} aria-label={`${inspection.title ?? "Checklist"} report`} onClose={onClose} className="certificate-print-area animate-rise fixed inset-0 m-auto max-h-[95vh] w-[min(95vw,850px)] overflow-auto bg-white p-5 backdrop:bg-black/50 sm:p-10">
    <div className="print-hidden mb-5 flex justify-end gap-2"><Button onClick={() => window.print()}><Printer data-icon="inline-start" />Print / Save PDF</Button><Button variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
    <ChecklistReport inspection={inspection} record={record} />
  </dialog>, document.body);
}
