import type { ReactNode } from "react";
import { KEE_ADDRESS } from "@/components/warranty-document";
import { quarterLabel, quarterRange, SAVING_TYPES, savingKg, totalKg } from "@/lib/domain";
import type { Saving } from "@/lib/types";
import { formatAmount, formatDate, formatUsd } from "@/lib/utils";

// Laid out like a supplier's certificate of destruction: one A4 sheet, title centred, signature and date along the bottom.
function Frame({ reference, issued, title, subtitle, children }: { reference: string; issued: string; title: string; subtitle?: string; children: ReactNode }) {
  return <div className="text-pretty border border-line text-[12px] leading-[1.55] text-ink print:border-0">
    <div className="flex min-h-[255mm] flex-col px-10 py-8">
      <div className="flex items-start justify-between gap-6">
        <img src="/kee-safety-logo.png" alt="Kee Safety" className="size-16" />
        <div className="text-right font-mono text-[11px] text-slate-500"><div className="font-semibold text-navy">{reference}</div><div>Issued {formatDate(issued)}</div></div>
      </div>
      <div className="mt-8 text-center">
        <div className="text-[54px] font-black uppercase leading-none tracking-[.1em] text-success">Certificate</div>
        <div className="mx-auto mt-3 flex max-w-[280px] items-center gap-3 text-[11px] font-bold uppercase tracking-[.3em] text-navy"><span className="h-px flex-1 bg-[#0b3151]/40" />of<span className="h-px flex-1 bg-[#0b3151]/40" /></div>
        <div className="mt-2 text-lg font-semibold uppercase tracking-[.22em] text-navy">{title}</div>
        {subtitle && <div className="mt-1 text-slate-500">{subtitle}</div>}
      </div>
      {children}
      <p className="mt-8 text-center text-[15px] font-semibold italic text-success">Use less. Move less. Waste less.</p>
      <div className="mt-auto grid grid-cols-[1fr_auto_1fr] items-end gap-8 pt-10">
        <div className="text-center"><div className="border-b border-[#0b3151]/50 pb-1 font-semibold text-navy">{formatDate(issued)}</div><div className="eyebrow mt-1.5">Date</div></div>
        <div className="grid size-20 place-items-center rounded-full border-2 border-success/50 p-3 outline outline-1 outline-offset-[3px] outline-success/25"><img src="/kee-safety-logo.png" alt="" /></div>
        <div className="text-center"><div className="border-b border-[#0b3151]/50 pb-1 pt-10 text-[10px] text-slate-500">Authorised for Kee Safety LLC</div><div className="eyebrow mt-1.5">Signature</div></div>
      </div>
      <footer className="mt-6 border-t border-line pt-2 text-center text-[10px] leading-relaxed text-slate-500">
        <div>{KEE_ADDRESS}</div>
        <div>Demo certificate · figures typed in from Kee Safety&apos;s own records.</div>
      </footer>
    </div>
  </div>;
}

function Labelled({ items }: { items: [string, ReactNode][] }) {
  return <dl className="mt-8 space-y-1">{items.map(([label, value]) => <div key={label}><dt className="inline font-bold uppercase tracking-[.06em] text-accent">{label}: </dt><dd className="inline font-semibold text-navy">{value}</dd></div>)}</dl>;
}

const quantity = (saving: Saving) => `${formatAmount(saving.quantity)} ${saving.unit}`;

export function SavingCertificate({ saving }: { saving: Saving }) {
  const kg = savingKg(saving);
  const details: [string, ReactNode][] = [["Date", formatDate(saving.date)], ["Initiative", SAVING_TYPES[saving.type].label], ...(saving.description ? [["Description", saving.description] as [string, ReactNode]] : []), ["Quantity", quantity(saving)], ["Emission factor", `${saving.factor} kg CO₂e per unit`], ...(saving.costSaving !== undefined ? [["Cost saving", formatUsd(saving.costSaving)] as [string, ReactNode]] : [])];
  return <Frame reference={saving.number} issued={saving.issuedDate} title="Environmental saving">
    <Labelled items={[["Organisation", "Kee Safety LLC"], ...(saving.site ? [["Site", saving.site] as [string, ReactNode]] : []), ["Certificate no", saving.number], ...(saving.evidence ? [["Evidence", saving.evidence] as [string, ReactNode]] : [])]} />
    <p className="mt-5">This is to certify that Kee Safety LLC recorded the environmental saving set out below. The CO₂e saved is the recorded quantity multiplied by the stated emission factor.</p>
    <div className="mt-6 grid grid-cols-[1fr_auto] items-center gap-8 rounded-lg border border-[#0b3151]/25 px-6 py-5">
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5">{details.map(([label, value]) => <div key={label} className="contents"><dt className="text-accent">{label}</dt><dd className="font-semibold text-navy">{value}</dd></div>)}</dl>
      <div className="border-l border-line pl-8 text-center">
        <div className="eyebrow">CO₂e saved</div>
        <div className="mt-1 text-[44px] font-black leading-none tabular-nums text-success">{formatAmount(kg)}</div>
        <div className="mt-1 font-bold text-success">kg CO₂e</div>
        <div className="mt-2 font-mono text-[10px] text-slate-500">{quantity(saving)} × {saving.factor}</div>
      </div>
    </div>
  </Frame>;
}

export function QuarterCertificate({ quarter, savings, issued }: { quarter: string; savings: Saving[]; issued: string }) {
  const [from, to] = quarterRange(quarter);
  const cost = savings.reduce((sum, saving) => sum + (saving.costSaving ?? 0), 0);
  const rows = [...savings].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  return <Frame reference={`${quarterLabel(quarter)} summary`} issued={issued} title="Environmental savings" subtitle={`${quarterLabel(quarter)} · ${formatDate(from)} – ${formatDate(to)}`}>
    <p className="mt-8">This is to certify that Kee Safety LLC recorded the environmental savings below during {quarterLabel(quarter)}. Each CO₂e figure is the recorded quantity multiplied by its stated emission factor.</p>
    <div className="mt-6 text-center">
      <div className="eyebrow">Total CO₂e saved</div>
      <div className="mt-1 text-[44px] font-black leading-none tabular-nums text-success">{formatAmount(totalKg(rows))} <span className="text-xl font-bold">kg CO₂e</span></div>
      {cost > 0 && <div className="mt-2 font-semibold text-navy">{formatUsd(cost)} cost saved</div>}
    </div>
    <table className="mt-6 w-full border-collapse text-left text-[11px]">
      <thead><tr className="border-b border-[#0b3151]/40 text-[10px] uppercase tracking-[.08em] text-accent">{["Certificate", "Initiative", "Quantity", "Factor", "kg CO₂e"].map((head, index) => <th key={head} className={`whitespace-nowrap py-1.5 pr-3 font-bold ${index > 1 ? "text-right" : ""}`}>{head}</th>)}</tr></thead>
      <tbody>{rows.map((saving) => <tr key={saving.id} className="break-inside-avoid border-b border-line align-top">
        <td className="whitespace-nowrap py-1.5 pr-3"><div className="font-mono font-semibold text-navy">{saving.number}</div><div className="text-slate-500">{formatDate(saving.date)}</div></td>
        <td className="py-1.5 pr-3"><div className="font-semibold text-navy">{SAVING_TYPES[saving.type].label}</div>{saving.description && <div className="text-slate-500">{saving.description}</div>}</td>
        <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{quantity(saving)}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums">{saving.factor}</td>
        <td className="py-1.5 text-right font-semibold tabular-nums text-navy">{formatAmount(savingKg(saving))}</td>
      </tr>)}</tbody>
      <tfoot><tr className="border-t-2 border-[#0b3151]/40"><td colSpan={4} className="py-2 pr-3 text-right font-bold uppercase tracking-[.06em] text-navy">Total</td><td className="py-2 text-right font-black tabular-nums text-success">{formatAmount(totalKg(rows))}</td></tr></tfoot>
    </table>
  </Frame>;
}
