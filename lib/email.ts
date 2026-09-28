import type { Alert } from "./types";

export const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";
export const EMAIL_RECIPIENT = "devops@kuroshioai.com";
export const EMAIL_CC = "noufal@kuroshioai.com";

const LIMITS = {
  event: 160,
  asset_ref: 80,
  asset_type: 120,
  site: 120,
  owner: 120,
  severity: 16,
  due_date: 10,
  demo_date: 10,
  alert_status: 16,
  occurred_at: 40,
} as const;

export type EmailJsConfig = {
  serviceId: string;
  templateId: string;
  publicKey: string;
};

export type AlertEmailParams = {
  event: string;
  asset_ref: string;
  asset_type: string;
  site: string;
  owner: string;
  severity: string;
  due_date: string;
  demo_date: string;
  alert_status: string;
  occurred_at: string;
};

export type AlertEmailInput = {
  alert: Alert;
  demoDate: string;
  assetType?: string;
  site?: string;
};

type EmailJsRequest = {
  service_id: string;
  template_id: string;
  user_id: string;
  template_params: AlertEmailParams;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SendAlertEmailOptions = {
  config?: EmailJsConfig;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: FetchLike;
};

function defaultEnv(): Readonly<Record<string, string | undefined>> {
  return {
    NEXT_PUBLIC_EMAILJS_SERVICE_ID: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
    NEXT_PUBLIC_EMAILJS_TEMPLATE_ID: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
    NEXT_PUBLIC_EMAILJS_PUBLIC_KEY: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
  };
}

function configuredValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function getEmailJsConfig(env: Readonly<Record<string, string | undefined>> = defaultEnv()): EmailJsConfig | undefined {
  const serviceId = configuredValue(env.NEXT_PUBLIC_EMAILJS_SERVICE_ID);
  const templateId = configuredValue(env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID);
  const publicKey = configuredValue(env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY);
  return serviceId && templateId && publicKey ? { serviceId, templateId, publicKey } : undefined;
}

function bounded(name: keyof typeof LIMITS, value: string): string {
  const normalized = value.trim();
  if (normalized.length > LIMITS[name]) throw new Error(`Email field ${name} exceeds its limit.`);
  return normalized;
}

export function buildAlertEmailParams({ alert, demoDate, assetType, site }: AlertEmailInput): AlertEmailParams {
  return {
    event: bounded("event", alert.event),
    asset_ref: bounded("asset_ref", alert.assetRef ?? "System"),
    asset_type: bounded("asset_type", assetType ?? "System"),
    site: bounded("site", site ?? "System"),
    owner: bounded("owner", alert.owner ?? "System"),
    severity: bounded("severity", alert.severity),
    due_date: bounded("due_date", alert.dueDate ?? "—"),
    demo_date: bounded("demo_date", demoDate),
    alert_status: bounded("alert_status", alert.status),
    occurred_at: bounded("occurred_at", alert.timestamp),
  };
}

export function buildAlertEmailRequest(input: AlertEmailInput, config: EmailJsConfig): EmailJsRequest {
  return {
    service_id: config.serviceId,
    template_id: config.templateId,
    user_id: config.publicKey,
    template_params: buildAlertEmailParams(input),
  };
}

export async function sendAlertEmail(input: AlertEmailInput, options: SendAlertEmailOptions = {}): Promise<void> {
  const config = options.config ?? getEmailJsConfig(options.env);
  if (!config) throw new Error("EmailJS is not configured.");

  const request = buildAlertEmailRequest(input, config);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Email sending is unavailable in this browser.");

  let response: Response;
  try {
    response = await fetchImpl(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("EmailJS request failed; delivery is unconfirmed. Check the inbox before retrying to avoid duplicates.");
  }

  if (response.status !== 200) throw new Error(`EmailJS rejected the request (${response.status}); delivery is unconfirmed. Check the inbox before retrying to avoid duplicates.`);
}
