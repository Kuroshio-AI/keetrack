"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { ExternalLink, Printer, QrCode, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changeCertificateStatus, effectiveCertificateStatus } from "@/lib/domain";
import type { AssetRecord, Certificate } from "@/lib/types";

function snapshot(record: AssetRecord, certificate: Certificate, demoDate: string) {
  return { certificateNo: certificate.number, assetRef: record.assetRef, assetType: record.assetType, issuedDate: certificate.issuedDate, expiryDate: certificate.expiryDate, status: effectiveCertificateStatus(certificate, demoDate) };
}
type QrSnapshot = { image: string; url: string; key: string; createdAt: number };
type PrintSnapshot = ReturnType<typeof snapshot> & { result: string; qr: string };

export function CertificatesView() {
  const { state, update } = useApp();
  const currentState = useRef(state);
  useEffect(() => { currentState.current = state; }, [state]);
  const [qr, setQr] = useState<Record<string, QrSnapshot>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();
  const [printing, setPrinting] = useState<PrintSnapshot>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (printing) dialog.current?.showModal(); }, [printing]);
  const canChange = state.role === "Admin" || state.role === "Reviewer";
  const certificates = state.records.flatMap((record) => record.certificates.map((certificate) => ({ record, certificate })));

  async function makeQr(record: AssetRecord, certificate: Certificate): Promise<QrSnapshot | undefined> {
    setError(""); setBusy(certificate.id);
    const payload = snapshot(record, certificate, state.demoDate);
    try {
      const response = await fetch("/api/certificates/demo-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { verifyUrl?: string; error?: string };
      if (!response.ok || !body.verifyUrl) throw new Error(body.error ?? "QR could not be created. Try again.");
      const image = await QRCode.toDataURL(body.verifyUrl, { width: 320, margin: 4, color: { dark: "#0b3151", light: "#ffffff" } });
      const latestRecord = currentState.current.records.find((item) => item.id === record.id);
      const latestCertificate = latestRecord?.certificates.find((item) => item.id === certificate.id);
      if (!latestRecord || !latestCertificate || JSON.stringify(payload) !== JSON.stringify(snapshot(latestRecord, latestCertificate, currentState.current.demoDate))) throw new Error("Certificate changed while generating this QR. Please try again.");
      const result = { image, url: body.verifyUrl, key: JSON.stringify(payload), createdAt: Date.now() };
      setQr((current) => ({ ...current, [certificate.id]: result }));
      return result;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "QR generation failed. Try again."); }
    finally { setBusy(undefined); }
  }

  function changeStatus(record: AssetRecord, certificate: Certificate, status: "Revoked" | "Superseded") {
    if (!window.confirm(`${status === "Revoked" ? "Revoke" : "Supersede"} ${certificate.number} for ${record.assetRef}? This cannot be undone.`)) return;
    if (update((current) => changeCertificateStatus(current, record.id, certificate.id, status))) void makeQr(record, { ...certificate, status });
  }

  async function print(record: AssetRecord, certificate: Certificate) {
    const fresh = await makeQr(record, certificate);
    if (fresh) setPrinting({ ...snapshot(record, certificate, state.demoDate), result: certificate.result, qr: fresh.image });
  }

  return <div className="flex flex-col gap-5">
    <Card><CardHeader><div className="eyebrow">Certificate register</div><CardTitle>{certificates.length} certificate{certificates.length === 1 ? "" : "s"}</CardTitle></CardHeader>
      <CardContent>{certificates.length ? <div className="grid gap-4 xl:grid-cols-2">{certificates.map(({ record, certificate }) => {
        const details = snapshot(record, certificate, state.demoDate);
        const cached = qr[certificate.id];
        const currentQr = cached?.key === JSON.stringify(details) && Date.now() - cached.createdAt < 24 * 60 * 60 * 1000 ? cached : undefined;
        return <div key={certificate.id} className="min-w-0 rounded-xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">{record.assetRef} · {record.site}</div><h3 className="mt-1 break-all text-lg font-bold text-navy">{certificate.number}</h3><p className="mt-1 text-sm text-slate-500">{record.assetType}</p></div><Badge variant={details.status === "Valid" ? "success" : details.status === "Expired" ? "warning" : "danger"}>{details.status}</Badge></div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-3 text-sm"><div><div className="eyebrow">Issued</div><div className="mt-1 font-semibold text-navy">{certificate.issuedDate}</div></div><div><div className="eyebrow">Expires</div><div className="mt-1 font-semibold text-navy">{certificate.expiryDate}</div></div></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void print(record, certificate)}><Printer />Print</Button>
            <Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void makeQr(record, certificate)}><QrCode />{busy === certificate.id ? "Generating…" : currentQr ? "Refresh QR" : "Create QR"}</Button>
            {currentQr && <Button asChild variant="ghost" size="sm"><a href={currentQr.url} target="_blank" rel="noreferrer"><ExternalLink />Open verification</a></Button>}
            {canChange && (details.status === "Valid" || details.status === "Expired") && <>
              <Button variant="ghost" size="sm" className="text-danger" disabled={Boolean(busy)} onClick={() => changeStatus(record, certificate, "Revoked")}>Revoke</Button>
              <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => changeStatus(record, certificate, "Superseded")}>Supersede</Button>
            </>}
          </div>
          {currentQr && <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-line p-3 sm:flex-row"><img src={currentQr.image} alt={`QR code for ${certificate.number}`} className="size-48 shrink-0" /><p className="text-xs leading-relaxed text-slate-500">Signed demo snapshot: {details.status}. Expires in 24 hours. Old links keep their original status until expiry.</p></div>}
        </div>;
      })}</div> : <div className="rounded-lg border border-dashed border-line px-4 py-14 text-center"><ShieldCheck className="mx-auto size-9 text-[#b8cedc]" /><p className="mt-3 text-sm text-slate-500">Import a supplied certificate or approve a passed inspection to begin.</p></div>}
        {error && <p className="mt-4 rounded-lg bg-[#fff3f3] p-3 text-sm text-danger" role="alert">{error}</p>}
      </CardContent>
    </Card>
    {printing && createPortal(<dialog ref={dialog} aria-label="Certificate print preview" onClose={() => setPrinting(undefined)} className="certificate-print-area fixed inset-0 m-auto max-h-[95vh] w-[min(95vw,850px)] overflow-auto bg-white p-5 backdrop:bg-black/50 sm:p-10">
      <div className="print-hidden mb-5 flex justify-end gap-2"><Button onClick={() => window.print()}>Print / Save PDF</Button><Button variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
      <div className="mx-auto border-[8px] border-[#0b3151] p-1"><div className="border border-[#b8cedc] p-5 sm:p-10">
        <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.2em] text-accent">Kee Safety · KeeTrack</div><h2 className="mt-5 text-3xl font-black tracking-tight text-navy">Certificate of inspection</h2></div><Badge variant="warning">DEMO</Badge></div>
        <dl className="mt-8 grid gap-5 sm:grid-cols-2"><div><dt className="eyebrow">Certificate number</dt><dd className="mt-1 break-all text-lg font-bold text-navy">{printing.certificateNo}</dd></div><div><dt className="eyebrow">Result / status</dt><dd className="mt-1 font-bold text-navy">{printing.result} · {printing.status}</dd></div><div><dt className="eyebrow">Asset</dt><dd className="mt-1 font-semibold text-navy">{printing.assetRef}<span className="block text-sm font-normal">{printing.assetType}</span></dd></div><div><dt className="eyebrow">Validity</dt><dd className="mt-1 font-semibold text-navy">{printing.issuedDate} → {printing.expiryDate}</dd></div></dl>
        <img src={printing.qr} alt="Certificate verification QR" className="mt-5 size-48" />
        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-slate-500">Demo certificate · fictional data. QR verification is a signed snapshot valid for 24 hours; it is not live certification.</p>
      </div></div>
    </dialog>, document.body)}
  </div>;
}
