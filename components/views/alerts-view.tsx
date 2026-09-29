"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Check, Filter, History, Mail, MessageCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { acknowledgeAlert } from "@/lib/domain";
import { EMAIL_CC, EMAIL_RECIPIENT, getEmailJsConfig, sendAlertEmail } from "@/lib/email";
import type { Alert } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

type EmailFeedback = {
  state: "sending" | "sent" | "error";
  message: string;
};

type WhatsAppConfigState = {
  phase: "loading" | "ready" | "error";
  configured: boolean;
  message?: string;
};

export function AlertsView() {
  const { state, update, storageWarning } = useApp();
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [asset, setAsset] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<Record<string, EmailFeedback>>({});
  const [localAccepted, setLocalAccepted] = useState<Record<string, string>>({});
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppConfigState>({ phase: "loading", configured: false });
  const [whatsappFeedback, setWhatsappFeedback] = useState<Record<string, EmailFeedback>>({});
  const [whatsappLocalAccepted, setWhatsappLocalAccepted] = useState<Record<string, string>>({});
  const lastEmailRequestAt = useRef(0);
  const emailInFlight = useRef(false);
  const lastWhatsAppRequestAt = useRef(0);
  const whatsappInFlight = useRef(false);
  const emailConfigured = Boolean(getEmailJsConfig());
  const isEmailSending = Object.values(emailFeedback).some((feedback) => feedback.state === "sending");
  const isWhatsAppSending = Object.values(whatsappFeedback).some((feedback) => feedback.state === "sending");
  const whatsappConfigured = whatsappStatus.phase === "ready" && whatsappStatus.configured;

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    fetch("/api/alerts/whatsapp", { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => undefined);
        if (!response.ok || !body || typeof body !== "object") throw new Error("Trial messaging configuration is unavailable.");
        const candidate = body as Record<string, unknown>;
        if (!ignore) setWhatsappStatus({ phase: "ready", configured: candidate.configured === true });
      })
      .catch((reason) => {
        if (!ignore && !(reason instanceof DOMException && reason.name === "AbortError")) setWhatsappStatus({ phase: "error", configured: false, message: "Trial messaging configuration is unavailable." });
      });
    return () => { ignore = true; controller.abort(); };
  }, []);
  const visible = useMemo(() => state.alerts
    .filter((alert) => (status === "all" || (status === "acknowledged" ? alert.status === "open" && Boolean(alert.acknowledgedAt) : alert.status === status))
      && (type === "all" || alert.type === type)
      && (severity === "all" || alert.severity === severity)
      && `${alert.assetRef ?? ""} ${alert.event} ${alert.owner ?? ""}`.toLowerCase().includes(asset.toLowerCase()))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [state.alerts, status, type, severity, asset]);
  const openCount = state.alerts.filter((alert) => alert.status === "open").length;

  function tierLabel(tier: string | undefined) {
    return tier === "due30" ? "Due within 30 days" : tier === "due7" ? "Due within 7 days" : tier === "today" ? "Due today" : tier === "overdue" ? "Overdue" : tier;
  }

  function setFeedback(alertId: string, feedback: EmailFeedback) {
    setEmailFeedback((current) => ({ ...current, [alertId]: feedback }));
  }

  function setWhatsAppFeedback(alertId: string, feedback: EmailFeedback) {
    setWhatsappFeedback((current) => ({ ...current, [alertId]: feedback }));
  }

  async function sendEmail(alert: Alert) {
    const existingFeedback = emailFeedback[alert.id];
    if (existingFeedback?.state === "sending" || alert.emailSentAt || localAccepted[alert.id]) return;
    if (emailInFlight.current) {
      setFeedback(alert.id, { state: "error", message: "Another alert email is sending. Wait for its result before trying again." });
      return;
    }
    if (!emailConfigured) {
      setFeedback(alert.id, { state: "error", message: "Email is not configured for this demo. No request was sent." });
      return;
    }
    if (storageWarning) {
      setFeedback(alert.id, { state: "error", message: "Storage recovery is required before sending can be recorded. No request was sent." });
      return;
    }
    const now = Date.now();
    if (now - lastEmailRequestAt.current < 1_000) {
      setFeedback(alert.id, { state: "error", message: "Please wait a moment before sending another alert email." });
      return;
    }
    lastEmailRequestAt.current = now;
    emailInFlight.current = true;
    setFeedback(alert.id, { state: "sending", message: "Sending alert email…" });

    const record = state.records.find((item) => item.id === alert.assetId);
    try {
      await sendAlertEmail({ alert, demoDate: state.demoDate, assetType: record?.assetType, site: record?.site });
      const acceptedAt = new Date().toISOString();
      const didPersist = update((current) => {
        if (!current.alerts.some((item) => item.id === alert.id)) return current;
        return { ...current, alerts: current.alerts.map((item) => item.id === alert.id ? { ...item, emailSentAt: acceptedAt } : item) };
      });
      setLocalAccepted((current) => ({ ...current, [alert.id]: acceptedAt }));
      setFeedback(alert.id, {
        state: "sent",
        message: didPersist
          ? "Email accepted by EmailJS; sent status saved in this browser."
          : "Email accepted by EmailJS, but sent status could not be saved. Do not retry in this browser.",
      });
    } catch (reason) {
      setFeedback(alert.id, { state: "error", message: reason instanceof Error ? reason.message : "Email was not accepted; delivery is unconfirmed. Retry manually." });
    } finally {
      emailInFlight.current = false;
    }
  }

  async function sendWhatsAppTest(alert: Alert) {
    const existingFeedback = whatsappFeedback[alert.id];
    if (existingFeedback?.state === "sending" || alert.whatsappSentAt || whatsappLocalAccepted[alert.id]) return;
    if (whatsappInFlight.current) {
      setWhatsAppFeedback(alert.id, { state: "error", message: "Another WhatsApp trial request is sending. Wait for its result before trying again." });
      return;
    }
    if (!whatsappConfigured) {
      setWhatsAppFeedback(alert.id, { state: "error", message: "WhatsApp trial is not configured. See Demo Controls for details." });
      return;
    }
    if (storageWarning) {
      setWhatsAppFeedback(alert.id, { state: "error", message: "Storage recovery is required before a send can be recorded. No request was sent." });
      return;
    }
    const now = Date.now();
    if (now - lastWhatsAppRequestAt.current < 3_000) {
      setWhatsAppFeedback(alert.id, { state: "error", message: "Please wait before sending another WhatsApp trial message." });
      return;
    }
    lastWhatsAppRequestAt.current = now;
    whatsappInFlight.current = true;
    setWhatsAppFeedback(alert.id, { state: "sending", message: "Sending fixed WhatsApp trial message…" });
    try {
      let response: Response;
      try {
        response = await fetch("/api/alerts/whatsapp", {
          method: "POST",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: alert.id }),
        });
      } catch {
        throw new Error("WhatsApp status is unconfirmed. Check Twilio before retrying.");
      }
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok || !body || typeof body !== "object" || (body as Record<string, unknown>).accepted !== true) {
        const message = body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string" ? (body as Record<string, string>).error : "WhatsApp status is unconfirmed. Check Twilio before retrying.";
        throw new Error(message);
      }
      const acceptedAt = new Date().toISOString();
      const didPersist = update((current) => {
        if (!current.alerts.some((item) => item.id === alert.id)) return current;
        return { ...current, alerts: current.alerts.map((item) => item.id === alert.id ? { ...item, whatsappSentAt: acceptedAt } : item) };
      });
      setWhatsappLocalAccepted((current) => ({ ...current, [alert.id]: acceptedAt }));
      setWhatsAppFeedback(alert.id, {
        state: "sent",
        message: didPersist
          ? "WhatsApp request accepted by Twilio; delivery is not confirmed. Acceptance saved in this browser."
          : "WhatsApp request accepted by Twilio; delivery is not confirmed. Acceptance could not be saved, so do not retry in this browser.",
      });
    } catch (reason) {
      setWhatsAppFeedback(alert.id, { state: "error", message: reason instanceof Error ? reason.message : "WhatsApp status is unconfirmed. Check Twilio before retrying." });
    } finally {
      whatsappInFlight.current = false;
    }
  }

  return <Card>
    <CardHeader className="border-b border-line">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="eyebrow">Attention queue · {openCount} open</div>
          <CardTitle>Alerts</CardTitle>
          {state.role !== "Manager" && emailConfigured && <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500" role="status">Manual email to {EMAIL_RECIPIENT}; CC {EMAIL_CC}. Sends only when you click.</p>}
          {state.role !== "Manager" && !emailConfigured && <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500" role="status">Email is not configured for this demo.</p>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sr-only" htmlFor="alert-status">Status</label>
          <Select id="alert-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="history">History</option>
            <option value="all">All status</option>
          </Select>
          <label className="sr-only" htmlFor="alert-type">Type</label>
          <Select id="alert-type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All types</option>
            <option value="deadline">Deadline</option>
            <option value="review">Review</option>
            <option value="certificate">Certificate</option>
          </Select>
          <label className="sr-only" htmlFor="alert-severity">Severity</label>
          <Select id="alert-severity" value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="all">All severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </Select>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input aria-label="Filter alerts by asset" value={asset} onChange={(event) => setAsset(event.target.value)} placeholder="Asset / owner" className="pl-9" />
          </div>
          </div>
        </div>
      {state.role !== "Manager" && <p className="text-xs leading-relaxed text-slate-500" role="status">
        {!whatsappConfigured && <>{whatsappStatus.phase === "loading" ? "Checking WhatsApp configuration…" : whatsappStatus.message ?? "WhatsApp trial is not configured."} </>}
        <Link href="/demo-controls#whatsapp-trial" className="font-semibold text-accent underline underline-offset-2">WhatsApp demo settings</Link>
      </p>}
    </CardHeader>
    <CardContent className="p-4 sm:p-5">
      {visible.length ? <div className="flex flex-col gap-2">
        {visible.map((alert) => {
          const feedback = emailFeedback[alert.id];
          const emailSent = Boolean(alert.emailSentAt || localAccepted[alert.id] || feedback?.state === "sent");
          const whatsappAlertFeedback = whatsappFeedback[alert.id];
          const whatsappSent = Boolean(alert.whatsappSentAt || whatsappLocalAccepted[alert.id] || whatsappAlertFeedback?.state === "sent");
          const canSend = state.role !== "Manager" && emailConfigured;
          return <div key={alert.id} className={`flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${alert.status === "open" ? "border-line bg-white" : "border-line bg-paper opacity-80"}`}>
            <div className="flex min-w-0 items-start gap-3">
              <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${alert.severity === "critical" ? "bg-[#fde8e8] text-danger" : alert.severity === "warning" ? "bg-[#fff2d7] text-[#8a5d00]" : "bg-[#e8f3f8] text-accent"}`}>
                {alert.status === "resolved" ? <Check className="size-4" /> : alert.status === "history" ? <History className="size-4" /> : <BellRing className="size-4" />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy">
                  <Link href={alert.assetId ? `/register?asset=${alert.assetId}` : "/alerts"} className="underline-offset-2 hover:underline">{alert.event}</Link>
                  <Badge variant="outline">{alert.severity}</Badge>
                  {alert.tier && <Badge variant={alert.tier === "overdue" ? "danger" : alert.tier === "due30" ? "secondary" : "warning"}>{tierLabel(alert.tier)}</Badge>}
                </div>
                <div className="mt-1 text-xs text-slate-500">{alert.assetRef ?? "System"}{alert.owner ? ` · ${alert.owner}` : ""}{alert.dueDate ? ` · due ${formatDate(alert.dueDate)}` : ""}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[.08em] text-slate-400">{formatDateTime(alert.timestamp)}{alert.acknowledgedBy && alert.acknowledgedAt ? ` · acknowledged by ${alert.acknowledgedBy} at ${formatDateTime(alert.acknowledgedAt)}` : ""}</div>
                {feedback && <div className={`mt-2 text-xs ${feedback.state === "error" ? "text-danger" : feedback.state === "sent" ? "text-[#187348]" : "text-slate-500"}`} role={feedback.state === "error" ? "alert" : "status"} aria-live="polite">{feedback.message}</div>}
                {whatsappAlertFeedback && <div className={`mt-2 text-xs ${whatsappAlertFeedback.state === "error" ? "text-danger" : whatsappAlertFeedback.state === "sent" ? "text-[#187348]" : "text-slate-500"}`} role={whatsappAlertFeedback.state === "error" ? "alert" : "status"} aria-live="polite">{whatsappAlertFeedback.message}</div>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {state.role !== "Manager" && alert.status === "open" && !alert.acknowledgedAt && <Button variant="outline" size="sm" onClick={() => update((current) => acknowledgeAlert(current, alert.id))}><Check data-icon="inline-start" />Acknowledge</Button>}
              {canSend && <Button variant="outline" size="sm" disabled={Boolean(storageWarning) || isEmailSending || Boolean(feedback?.state === "sending" || emailSent)} onClick={() => void sendEmail(alert)}><Mail data-icon="inline-start" />{feedback?.state === "sending" ? "Sending…" : emailSent ? "Email accepted" : "Send email"}</Button>}
              {state.role !== "Manager" && <Button variant="outline" size="sm" disabled={!whatsappConfigured || Boolean(storageWarning) || isWhatsAppSending || Boolean(whatsappAlertFeedback?.state === "sending" || whatsappSent)} onClick={() => void sendWhatsAppTest(alert)}><MessageCircle data-icon="inline-start" />{whatsappAlertFeedback?.state === "sending" ? "Sending…" : whatsappSent ? "WhatsApp accepted" : "Send WhatsApp test"}</Button>}
              {alert.status === "resolved" && <span className="flex items-center gap-1 text-xs font-semibold text-[#187348]"><RotateCcw className="size-3" />Resolved by condition</span>}
            </div>
          </div>;
        })}
      </div> : <div className="flex flex-col items-center justify-center px-4 py-16 text-center"><BellRing className="size-10 text-[#b8cedc]" /><h2 className="mt-4 font-semibold text-navy">No alerts in this view</h2><p className="mt-2 text-sm text-slate-500">Try a different filter or change the demo date.</p></div>}
    </CardContent>
  </Card>;
}
