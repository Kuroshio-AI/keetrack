"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { digestText, trafficLight, type Light } from "@/lib/fls";

export const LIGHTS: Record<Light, { dot: string; text: string; label: string }> = {
  green: { dot: "bg-[#269663]", text: "text-[#187348]", label: "Green" },
  amber: { dot: "bg-[#d99512]", text: "text-[#8a5d00]", label: "Amber" },
  red: { dot: "bg-danger", text: "text-danger", label: "Red" },
};

// One of the sheet's "days remaining" cells: the count with its traffic-light dot.
export function DaysCell({ days }: { days?: number }) {
  if (days === undefined) return <span className="text-slate-400">—</span>;
  const light = LIGHTS[trafficLight(days)];
  return <span className={`inline-flex items-center gap-2 font-semibold tabular-nums ${light.text}`} title={light.label}><span className={`size-2.5 shrink-0 rounded-full ${light.dot}`} aria-hidden="true" />{days}</span>;
}

// The demo stands in for the scheduled morning message: the same text, sent from the presenter's own WhatsApp or mail app.
export function DigestCard() {
  const { state } = useApp();
  const [copied, setCopied] = useState("");
  const text = digestText(state);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied("Copied."); } catch { setCopied("Copy didn't work in this browser. Select the text instead."); }
  }
  return <Card>
    <CardHeader>
      <div className="eyebrow">Daily digest</div>
      <CardTitle>The morning message, ready to send.</CardTitle>
      <CardDescription>In production this goes to the facility manager by WhatsApp and email every morning. In this demo you send it yourself.</CardDescription>
    </CardHeader>
    <CardContent>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-paper p-4 text-xs leading-relaxed text-navy">{text}</pre>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild size="sm"><a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle data-icon="inline-start" />Open in WhatsApp</a></Button>
        <Button asChild variant="outline" size="sm"><a href={`mailto:?subject=${encodeURIComponent(text.split("\n")[0])}&body=${encodeURIComponent(text)}`}><Mail data-icon="inline-start" />Email</a></Button>
        <Button variant="outline" size="sm" onClick={() => void copy()}><Copy data-icon="inline-start" />Copy</Button>
        {copied && <span className="text-xs text-slate-500" role="status">{copied}</span>}
      </div>
    </CardContent>
  </Card>;
}
