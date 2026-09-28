"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, BarChart3, BellRing, BookOpenCheck, CalendarCheck, ChevronRight, ClipboardList, FileCheck2, Import, Menu, Settings2, ShieldCheck, X } from "lucide-react";
import { AppProvider, useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ImportView } from "@/components/views/import-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { RegisterView } from "@/components/views/register-view";
import { InspectionsView } from "@/components/views/inspections-view";
import { ApprovalsView } from "@/components/views/approvals-view";
import { CertificatesView } from "@/components/views/certificates-view";
import { AlertsView } from "@/components/views/alerts-view";
import { DemoControlsView } from "@/components/views/demo-controls-view";
import type { Role } from "@/lib/types";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "register", label: "Register", icon: ClipboardList },
  { id: "inspections", label: "Inspections", icon: CalendarCheck },
  { id: "approvals", label: "Approvals", icon: BookOpenCheck },
  { id: "certificates", label: "Certificates", icon: ShieldCheck },
  { id: "alerts", label: "Alerts", icon: BellRing },
  { id: "import", label: "Import", icon: Import },
  { id: "demo-controls", label: "Demo Controls", icon: Settings2 },
] as const;

const titles: Record<string, { eyebrow: string; title: string; description: string }> = {
  import: { eyebrow: "Register intake", title: "Import register", description: "Validate a local register and review the rows before importing." },
  dashboard: { eyebrow: "Operations overview", title: "Dashboard", description: "Deadlines, review work and recent movement for this demo date." },
  register: { eyebrow: "Asset register", title: "Asset register", description: "Search equipment, licences and their linked obligations." },
  inspections: { eyebrow: "Field work", title: "Inspections", description: "Draft a mobile-friendly checklist, then send it for review." },
  approvals: { eyebrow: "Quality gate", title: "Approvals", description: "Return work with a correction, or issue a certificate with an explicit expiry." },
  certificates: { eyebrow: "Attestation", title: "Certificates", description: "Print a branded demo certificate and share a time-bound public snapshot." },
  alerts: { eyebrow: "Attention queue", title: "Alerts", description: "Acknowledge an alert without losing the underlying obligation." },
  "demo-controls": { eyebrow: "Scenario lab", title: "Demo Controls", description: "Download templates and sample data, change the demo date and exercise the main workflows." },
};

function View({ view }: { view: string }): ReactNode {
  switch (view) {
    case "dashboard": return <DashboardView />;
    case "register": return <RegisterView />;
    case "inspections": return <InspectionsView />;
    case "approvals": return <ApprovalsView />;
    case "certificates": return <CertificatesView />;
    case "alerts": return <AlertsView />;
    case "demo-controls": return <DemoControlsView />;
    case "import": return <ImportView />;
    default: return <DashboardView />;
  }
}

function AppFrame({ initialView }: { initialView: string }) {
  const pathname = usePathname();
  const view = pathname?.split("/")[1] || initialView || "dashboard";
  const { state, setRole, saveError, storageWarning, hydrated } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const firstNavLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => { const media = window.matchMedia("(max-width: 1023px)"); const updateMobile = () => setIsMobile(media.matches); updateMobile(); media.addEventListener("change", updateMobile); return () => media.removeEventListener("change", updateMobile); }, []);
  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key === "Tab") {
        const items = sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        const first = items?.[0]; const last = items?.[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey); firstNavLink.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; menuButton.current?.focus(); };
  }, [mobileOpen, isMobile]);
  const meta = titles[view] ?? titles.dashboard;
  const openAlerts = state.alerts.filter((alert) => alert.status === "open").length;

  return <div className="app-grid min-h-screen lg:flex">
    <aside ref={sidebar} aria-hidden={isMobile && !mobileOpen} inert={isMobile && !mobileOpen ? true : undefined} className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-[#17496d] bg-[#0b3151] px-4 py-5 text-white transition-transform lg:static lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between px-2">
        <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 focus-ring rounded-md">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-[#0b3151] shadow-lg"><span className="text-xl font-black">K</span></span>
          <span><span className="block text-[19px] font-bold tracking-[-.03em]">KeeTrack</span><span className="block text-[10px] font-bold uppercase tracking-[.15em] text-[#a8c7dd]">Kee Safety operations</span></span>
        </Link>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 lg:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></Button>
      </div>
      <div className="mx-2 mt-8 rounded-lg border border-[#467493] bg-[#123e60] px-3 py-3"><div className="flex items-center justify-between"><span className="eyebrow text-[#bad2e1]">Environment</span><Badge variant="warning" className="px-2 py-0.5 text-[9px]">Demo mode</Badge></div><p className="mt-2 text-xs leading-relaxed text-[#d6e7f1]">Local-first workspace. Records stay in this browser.</p></div>
      <nav className="mt-7 flex flex-1 flex-col gap-1" aria-label="Primary navigation">
        <span className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#80a9c2]">Workspace</span>
        {nav.slice(0, 7).map(({ id, label, icon: Icon }, index) => <Link ref={index === 0 ? firstNavLink : undefined} key={id} href={`/${id}`} onClick={() => setMobileOpen(false)} tabIndex={isMobile && !mobileOpen ? -1 : 0} className={`focus-ring group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${view === id ? "bg-white text-[#0b3151]" : "text-[#d1e3ed] hover:bg-white/10 hover:text-white"}`}><Icon className="size-[17px]" aria-hidden="true" /><span>{label}</span>{id === "alerts" && openAlerts > 0 ? <span className={`ml-auto grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${view === id ? "bg-[#fde8e8] text-[#a52e35]" : "bg-[#d74349] text-white"}`}>{openAlerts}</span> : <ChevronRight className={`ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-60 ${view === id ? "hidden" : ""}`} />}</Link>)}
        <Separator className="my-5 bg-[#2a5774]" />
        <span className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#80a9c2]">Sandbox</span>
        <Link href="/demo-controls" onClick={() => setMobileOpen(false)} tabIndex={isMobile && !mobileOpen ? -1 : 0} className={`focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${view === "demo-controls" ? "bg-white text-[#0b3151]" : "text-[#d1e3ed] hover:bg-white/10 hover:text-white"}`}><Settings2 className="size-[17px]" /><span>Demo Controls</span></Link>
      </nav>
      <div className="border-t border-[#2a5774] px-2 pt-4 text-[11px] leading-relaxed text-[#9cbed2]"><div className="flex items-center gap-2"><Activity className="size-3" />EmailJS only when requested</div><div className="mt-1">v1.0 · fictional demo data</div></div>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-[#071d30]/50 lg:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main inert={isMobile && mobileOpen ? true : undefined} className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur print-hidden"><div className="flex min-h-[76px] flex-col justify-center gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 lg:px-10"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="-ml-2 lg:hidden" ref={menuButton} aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></Button><div className="min-w-0"><div className="eyebrow">{meta.eyebrow}</div><h1 className="truncate text-xl font-bold tracking-[-.03em] text-navy sm:text-2xl">{meta.title}</h1></div></div><div className="flex items-center justify-end gap-2 sm:gap-3"><div className="text-right"><div className="eyebrow">Demo date</div><div className="text-xs font-bold text-navy sm:text-sm">{state.demoDate}</div></div><label className="sr-only" htmlFor="role-switcher">Current role</label><Select id="role-switcher" value={state.role} onChange={(event) => setRole(event.target.value as Role)} className="w-[125px] bg-white text-xs font-semibold sm:w-[145px]"><option>Admin</option><option>Engineer</option><option>Reviewer</option><option>Manager</option></Select></div></div></header>
      <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><div className="mb-7 max-w-3xl text-sm leading-relaxed text-slate-600">{meta.description}</div>{(saveError || storageWarning) && <div role="alert" className="mb-5 rounded-lg border border-[#f0c2c3] bg-[#fff3f3] p-4 text-sm text-danger">{saveError || storageWarning}{storageWarning && <Link className="ml-2 underline" href="/demo-controls">Open recovery controls</Link>}</div>}{hydrated ? <View view={view} /> : <p role="status">Restoring this browser workspace…</p>}</div>
    </main>
  </div>;
}

export function AppShell({ initialView }: { initialView: string }) { return <AppProvider><AppFrame initialView={initialView} /></AppProvider>; }
