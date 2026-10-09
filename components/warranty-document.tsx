import type { ReactNode } from "react";
import type { WarrantyDetails } from "@/lib/domain";
import { formatDate, formatLocalDate } from "@/lib/utils";

export type WarrantyPrint = WarrantyDetails & { assetRef: string; serialNo?: string; site: string; owner: string; asOf: string; qr: string };

export function Signature({ label, name, date, image }: { label: string; name: string; date?: string; image?: string }) {
  return <div><div className="h-12 border-b border-[#0b3151]/40">{image && <img src={image} alt="" className="h-full" />}</div><div className="mt-2 text-sm font-semibold text-navy">{name}</div><div className="text-xs text-slate-500">{label}{date ? ` · ${formatLocalDate(date)}` : ""}</div></div>;
}

// Each page is sized to one A4 sheet so the footer sits at the bottom of both printed pages.
function Page({ number, typedIn, className = "", children }: { number: number; typedIn: boolean; className?: string; children: ReactNode }) {
  return <div className={`mx-auto border-[8px] border-[#0b3151] p-1 ${className}`}><div className="flex min-h-[255mm] flex-col border border-[#b8cedc] px-8 py-6">
    {children}
    <footer className="mt-auto border-t border-line pt-2 text-[10px] leading-relaxed text-slate-500">
      <div className="flex justify-between gap-4 font-semibold text-navy"><span>Kee Safety LLC · Separating People From Hazards</span><span>Page {number} of 2</span></div>
      <div>PO Box 18448, Dubai Investment Park, near Green Community, Dubai, UAE · www.keesafety.ae · T +971-4-8859066 · menasales@keesafety.com · uaesales@keesafety.com</div>
      <div>Demo warranty · {typedIn ? "details typed in from the original warranty" : "fictional data"}. QR verification is a signed snapshot valid for 24 hours.</div>
    </footer>
  </div></div>;
}

export function WarrantyDocument(w: WarrantyPrint) {
  const registration: [string, ReactNode][] = [["Contract #", w.contractNo], ["Product", w.product], ["Scope", w.scope], ["Project", w.project], ["Site address", w.site], ["Client / owner", w.owner], ["Main contractor", w.mainContractor], ["Date of warranty", formatDate(w.warrantyDate)], ["Duration of warranty", `${w.years} year${w.years === 1 ? "" : "s"} from warranty date · until ${formatDate(w.validUntil)}`], ["Installer", "Kee Safety LLC"], ["Installer stamp", <div className="h-16" />]];
  const facts: [string, ReactNode][] = [["Asset", `${w.assetRef}${w.serialNo ? ` · ${w.serialNo}` : ""}`], ["Site", w.site], ["Client / owner", w.owner], ["Warranty period", `${formatDate(w.warrantyDate)} – ${formatDate(w.validUntil)}`]];
  const [brand, model] = w.product.split("®");
  return <div className="text-pretty text-[11.5px] leading-[1.5] text-ink">
    <Page number={1} typedIn={w.typedIn}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex gap-4">
          <img src="/kee-safety-logo.png" alt="Kee Safety" className="size-16 shrink-0" />
          <div><div className="text-xs font-bold uppercase tracking-[.2em] text-accent">Product warranty</div><h2 className="mt-1 text-balance text-2xl font-black leading-tight tracking-tight text-navy">{model === undefined ? w.product : <>{brand}<sup className="text-[.5em]">®</sup>{model}</>}</h2><div className="mt-2 text-slate-500">Document Ref. 713104326 · Warranty no. <span className="font-semibold text-navy">{w.number}</span></div></div>
        </div>
        <div className="shrink-0 text-center"><img src={w.qr} alt="Warranty verification QR" className="mx-auto size-28" /><div className="eyebrow">Scan to verify</div></div>
      </div>
      <div className="mt-5 flex items-center gap-6 rounded-lg bg-paper px-4 py-3">
        <dl className="flex flex-1 flex-wrap gap-x-10 gap-y-2">
          {facts.map(([label, value]) => <div key={label}><dt className="eyebrow">{label}</dt><dd className="mt-0.5 font-semibold text-navy">{value}</dd></div>)}
        </dl>
        {/* Same stamp as the approvals receipt. Dated "as of" because paper can't stay current; the QR is the live check. */}
        <div className={`stamp flex shrink-0 flex-col items-center rounded-lg border-2 px-3 py-1.5 outline outline-1 outline-offset-[3px] ${w.status === "Valid" ? "border-success text-success outline-success/40" : "border-warning text-warning outline-warning/40"}`}>
          <span className="text-[9px] font-bold uppercase tracking-[.22em] opacity-80">Warranty</span>
          <span className="text-xl font-black uppercase leading-tight tracking-[.16em]">{w.status}</span>
          <span className="font-mono text-[10px] font-semibold">as of {formatDate(w.asOf)}</span>
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        <p>Kee Safety LLC warrants that the {w.product} has been designed, manufactured and tested in accordance with the applicable product standards and requirements identified for the supplied system, including EN 795:2012 and CEN/TS 16415:2013, where applicable. Materials and finishes are selected to provide a functional, high-quality product fit for its intended purpose.</p>
        <p>Kee Safety LLC warrants that the {w.product} and its supplied components will be free from defects in materials and workmanship at the time of installation and handover. Subject to the terms of this warranty, any component confirmed to be defective during the applicable warranty period will be repaired or replaced following inspection and assessment by Kee Safety LLC or a Kee Safety Group-authorised competent person.</p>
        <p>This warranty is valid only where the system is used under normal operating conditions, for its intended purpose, and in accordance with the approved design, installation information, Operation &amp; Maintenance Manual and Kee Safety recommendations. Inspection, maintenance and recertification shall be carried out at the intervals required by the applicable regulations, standards, manufacturer instructions and site risk assessment. Where BS 7883:2019 applies, the system shall be managed in accordance with its relevant requirements.</p>
      </div>
      <h3 className="mt-5 text-sm font-bold text-navy">Warranty conditions and exclusions</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-accent">
        <li>The system must not be altered, relocated, repaired or modified without written approval from Kee Safety LLC or an authorised Kee Safety Group representative.</li>
        <li>The warranty does not cover damage or failure arising from misuse, abuse, unauthorised modification, incorrect use, accidental damage, impact, fire, chemical attack, abnormal environmental exposure, inadequate maintenance, or use outside the approved design parameters.</li>
        <li>Following a fall-arrest event, overload, suspected damage or any event that may affect system integrity, the system must be withdrawn from service and inspected by a competent person before further use.</li>
        <li>Any warranty claim is subject to inspection and confirmation that the reported defect is attributable to the supplied product or workmanship covered by this warranty.</li>
        <li>Kee Safety LLC reserves the right to reject a warranty claim where the above conditions have not been met.</li>
      </ul>
      <p className="mb-4 mt-4">Kee Safety LLC recommends an annual inspection and maintenance arrangement to support continued system performance and compliance. Details are available upon request.</p>
    </Page>
    <Page number={2} typedIn={w.typedIn} className="mt-6 break-before-page">
      <div className="text-xs font-bold uppercase tracking-[.2em] text-accent">{w.number}</div>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-navy">Customer product warranty registration</h2>
      <p className="mt-3">The end user / system owner shall complete this section and retain a copy with the project handover and maintenance records. A completed copy should be emailed to <span className="font-semibold text-navy">menasales@keesafety.com</span> with the subject “Warranty – [Project Name]”.</p>
      <dl className="mt-5 border-t border-[#0b3151]/40">
        {registration.map(([label, value]) => <div key={label} className="grid min-h-9 grid-cols-[150px_1fr] items-end gap-4 border-b border-[#0b3151]/25 py-1.5"><dt className="eyebrow">{label}</dt><dd className="font-semibold text-navy">{value}</dd></div>)}
      </dl>
      <div className="eyebrow mt-6">Authorised for Kee Safety LLC</div>
      <div className="mt-2 grid grid-cols-2 gap-8"><Signature label="General Manager – Middle East" name="Daniel Griffiths" /><div><div className="h-12 border-b border-[#0b3151]/40" /><div className="mt-2 text-xs text-slate-500">Date</div></div></div>
      <p className="mb-4 mt-6 text-slate-500">Note: This document should be read together with the project-specific approved drawings, calculations, handover documentation and Operation &amp; Maintenance Manual.</p>
    </Page>
  </div>;
}
