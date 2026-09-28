import { strict as assert } from "node:assert";
import test from "node:test";
import { buildAlertEmailRequest, sendAlertEmail, type AlertEmailInput, type EmailJsConfig } from "./email";
import type { Alert } from "./types";

const config: EmailJsConfig = { serviceId: "service-demo", templateId: "template-keetrack", publicKey: "public-demo" };
const alert: Alert = {
  id: "alert-1",
  occurrenceKey: "deadline:asset-1:due7",
  type: "deadline",
  event: "Inspection due soon",
  assetId: "asset-1",
  assetRef: "HAR-001",
  owner: "Maya Singh",
  dueDate: "2026-10-05",
  timestamp: "2026-09-28T09:30:00.000Z",
  severity: "warning",
  tier: "due7",
  status: "open",
};
const input: AlertEmailInput = { alert, demoDate: "2026-09-28", assetType: "Full Body Harness", site: "Northpoint Works" };

test("EmailJS request contains only the approved alert fields", async () => {
  const requests: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
  await sendAlertEmail(input, {
    config,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { status: 200 } as Response;
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.emailjs.com/api/v1.0/email/send");
  const body = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["service_id", "template_id", "user_id", "template_params"].sort());
  const params = body.template_params as Record<string, unknown>;
  assert.deepEqual(Object.keys(params).sort(), ["alert_status", "asset_ref", "asset_type", "demo_date", "due_date", "event", "occurred_at", "owner", "severity", "site"]);
  assert.equal(params.asset_ref, "HAR-001");
  assert.equal(params.asset_type, "Full Body Harness");
  assert.equal(params.site, "Northpoint Works");
  assert.equal(params.alert_status, "open");
  assert.equal(params.to, undefined);
  assert.equal(alert.emailSentAt, undefined);
});

test("missing EmailJS configuration fails before a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => sendAlertEmail(input, { env: {}, fetch: async () => { calls += 1; return { status: 200 } as Response; } }),
    /not configured/,
  );
  assert.equal(calls, 0);
});

test("provider failure does not mark the alert as sent", async () => {
  await assert.rejects(
    () => sendAlertEmail(input, { config, fetch: async () => ({ status: 503 } as Response) }),
    /rejected.*503/,
  );
  assert.equal(alert.emailSentAt, undefined);
});

test("network failure stays unconfirmed and does not mark the alert as sent", async () => {
  await assert.rejects(
    () => sendAlertEmail(input, { config, fetch: async () => { throw new Error("offline"); } }),
    /unconfirmed.*inbox.*retrying/,
  );
  assert.equal(alert.emailSentAt, undefined);
});

test("oversized template fields are rejected before sending", async () => {
  const oversized = { ...input, alert: { ...alert, event: "x".repeat(161) } };
  await assert.rejects(
    () => sendAlertEmail(oversized, { config, fetch: async () => ({ status: 200 } as Response) }),
    /exceeds its limit/,
  );
});

test("request builder keeps recipient outside the browser payload", () => {
  const request = buildAlertEmailRequest(input, config);
  assert.equal("to_email" in request.template_params, false);
  assert.equal("recipient" in request.template_params, false);
});
