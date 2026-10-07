# KeeTrack demo

KeeTrack is a local-first Kee Safety operations console for fictional register data. The default route is `/dashboard`; records, inspections, alerts and certificates are stored in one versioned `localStorage` document. EmailJS and Meta WhatsApp Cloud API are available only for explicitly requested single-alert actions; there is no database or background messaging integration.

## Setup

Use Node 24.x.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The token secret must be at least 32 characters. `NEXT_PUBLIC_APP_URL` is used to build QR verification URLs; when omitted in development, the request origin is used. Never expose `DEMO_CERT_TOKEN_SECRET` or the Meta variables to the browser. EmailJS uses the three `NEXT_PUBLIC_EMAILJS_*` values; outbound WhatsApp requires `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TO` and the secure 32+ character `META_WHATSAPP_SEND_KEY` in the server environment. `META_WHATSAPP_TEMPLATE_NAME`, `META_WHATSAPP_TEMPLATE_LANGUAGE` and `META_GRAPH_API_VERSION` have safe defaults. Leave the channel values unset to keep WhatsApp disabled.

Run the focused checks with:

```bash
npm run typecheck
npm test
npm run build
```

## Five-to-seven-minute walkthrough

1. Start on Dashboard. Open **Demo Controls** to download **Filled sample 1** for inspections and approvals or **Filled sample 2** for renewals and retirement, then upload it in **Import**. You can preview either sample from its link; both use the visible demo date, contain six records and have no inspection history until you create it through the workflow.
2. Review the six valid rows and click **Import valid rows**. Open Dashboard to see the 30-day, 7-day, today and overdue queues.
3. Open Inspections, choose an active record, complete the checklist and submit it. A Reviewer or Admin can return it with a mandatory comment, or issue a certificate with an explicit expiry.
4. Open Certificates to print a branded DEMO certificate, create a QR snapshot and open the public `/verify?token=...` page. Tokens are signed, immutable payloads with a 24-hour TTL.
5. On Alerts, an Admin, Engineer or Reviewer can click **Send email** on one alert. The EmailJS template has fixed To `devops@kuroshioai.com` and CC `noufal@kuroshioai.com`; KeeTrack sends only when you click and has no automatic or bulk send action.
6. Open **Demo Controls → WhatsApp Cloud API** to check the server-selected template and masked recipient. On Alerts, enter the private operator key and click **Send WhatsApp alert** on one alert. KeeTrack sends only the five approved alert details and records local API acceptance; delivery remains unconfirmed.
7. Use Demo Controls to download blank templates, set the app-only date, exercise deadline tiers, submit an explicit all-pass scenario, or reset the demo after confirmation. Reset returns to the empty Dashboard.

Production demo: [keetrack.vercel.app](https://keetrack.vercel.app) · source: [github.com/Kuroshio-AI/keetrack](https://github.com/Kuroshio-AI/keetrack).

## Register format and limits

`.xlsx` files must contain exactly one worksheet named `Register`. CSV files use the same fixed UTF-8 headers in the template: `asset_ref`, `record_type`, `asset_type`, `site`, `owner`, `serial_no`, `assigned_engineer`, `inspection_due_date`, `inspection_interval_months`, `licence_expiry_date`, `certificate_no`, `certificate_issued_date`, `certificate_expiry_date`, `retirement_due_date`, `status`. `asset_ref`, `record_type`, `asset_type`, `site` and `owner` are required. Date values are stored as calendar strings (`YYYY-MM-DD`), certificate fields are all-or-nothing, and certificate expiry cannot precede issue. Formula cells, malformed layouts, duplicate trimmed case-insensitive asset refs, files over 2MB and imports exceeding 500 total register records are rejected or reported per row. Duplicate rows never overwrite existing records.

The browser saves a complete next-state JSON document before updating the visible state. Unsupported or corrupted stored data enters recovery mode and blocks ordinary writes until **Start fresh** is explicitly confirmed in Demo Controls. Reset clears only KeeTrack’s operational local data.

Inspection evidence is optional fictional demo data. Only image MIME types are accepted, with a 200KB per-image and 1MB total local cap. No inspection or approval history is invented by register import.

## Verification snapshots

Creating a QR calls `POST /api/certificates/demo-token` with a small allowlisted certificate snapshot. The API signs it with an HMAC secret and returns a verification URL. `/verify?token=...` displays the captured status, dates and `asOf` timestamp; it is not a live certificate lookup. Old tokens remain valid until their own expiry even if a certificate is later revoked or superseded. QR generation can be retried without changing the approved certificate.

Future integrations such as a database, automated outbound delivery, customer identity and real certification evidence are intentionally outside this demo.

## Manual alert email

EmailJS uses the browser REST endpoint only after a user clicks **Send email** on an individual alert. The template has fixed To `devops@kuroshioai.com` and CC `noufal@kuroshioai.com`; KeeTrack sends only the alert event, asset reference/type, site, owner, severity, due date, demo date, status and occurrence timestamp. Notes, inspection evidence and contact lists are never included. The shared EmailJS account and mailbox quota are a demo dependency, so configure the three public values in `.env.local`, do not commit account values, and expect no scheduled or background delivery. A provider acceptance is recorded in localStorage; network failures remain unconfirmed and require a deliberate manual retry.

The provider template is versioned at [`docs/emailjs-template.html`](docs/emailjs-template.html). Keep its settings as follows: subject `[KeeTrack Demo] {{event}} — {{asset_ref}}`, fixed To and Reply-To `devops@kuroshioai.com`, fixed CC `noufal@kuroshioai.com`, From Name `KeeTrack Demo`, the default EmailJS sender, blank BCC, and no auto-reply. Keep the template body limited to the allowlisted fields above.

## WhatsApp Cloud API

The WhatsApp action is a manual, one-alert operation. The browser posts a same-origin JSON allowlist to `/api/alerts/whatsapp` with `alertId`, `event`, `assetRef`, `site`, `severity` and `dueDate`. The browser derives those values from the selected alert and its matching local record, sends no owner, notes, evidence, contact list or arbitrary message body, and never chooses the recipient, phone number ID, template or Meta access token. Missing asset, site or due date values are sent as `Not applicable`.

The server requires `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TO` and `META_WHATSAPP_SEND_KEY`. The send key is a secure production-only operator secret of at least 32 characters. It is supplied in the `X-KeeTrack-Send-Key` header, compared in constant time, never returned by GET, and held only in React state while the Alerts page is open. It must never be the Meta access token or app secret. `META_WHATSAPP_TEMPLATE_NAME` defaults to `keetrack_alert_demo`, `META_WHATSAPP_TEMPLATE_LANGUAGE` defaults to `en_US`, and `META_GRAPH_API_VERSION` defaults to `v26.0`. Keep all of these values in the server environment, never in browser code or the repository.

To replace an expired access token without a redeploy, connect Upstash for Redis from the Vercel Marketplace so the project has `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Demo Controls then shows a **Meta access token** box. Anyone can submit it, but a token is saved only after Meta confirms it can use `META_WHATSAPP_PHONE_NUMBER_ID`, so only someone who already controls that number can change it. The saved token lives in Redis, overrides `META_WHATSAPP_ACCESS_TOKEN`, and is never returned to the browser.

The approved template must have these five body text parameters in this exact order:

```text
KeeTrack demo alert
Event: {{1}}
Asset: {{2}}
Site: {{3}}
Severity: {{4}}
Due date: {{5}}
View details: https://keetrack.vercel.app/alerts
```

The template name, language, parameter order and approved category are ultimately controlled by Meta. A successful response with a valid WhatsApp message ID means Meta accepted the API request; it does not confirm delivery. Network, timeout and malformed-provider responses remain unconfirmed and are cached so the browser does not automatically retry an ambiguous request. 4xx responses are redacted as provider rejection. Accepted and ambiguous results use a bounded warm-instance replay cache for 10 minutes, with a three-second per-instance cooldown and a maximum of 500 alert keys. These module-local guards are not full customer authentication or a durable global quota; cold starts and multiple instances can reset or bypass them. There are no scheduled, background or bulk sends.

For production, complete the local Meta app and business onboarding/migration before deployment and use a separate production sender. Keep the user's existing WhatsApp Business phone app number outside this migration. The deployed Meta app must be published, have the WhatsApp Business Account connected, and subscribe to the `messages` field for webhook callbacks. Configure the fixed recipient and approved `keetrack_alert_demo` template in the production server environment.

## WhatsApp webhook

The optional `/api/webhooks/whatsapp` route supports Meta's verification challenge and signed event callbacks. Set `META_APP_SECRET` and `META_WHATSAPP_VERIFY_TOKEN` in the server environment, then configure that callback URL in the published Meta app. GET verification compares the token in constant time and returns the challenge as plain text. POST requests are accepted only with a valid `X-Hub-Signature-256` HMAC over the raw request bytes and a basic WhatsApp event envelope; unsigned callbacks are rejected.

This demo authenticates and acknowledges valid callbacks only. It has no backend database: callback events are not persisted, do not trigger inbound replies or automatic messages, and are not used to mark local alerts delivered. Delivery remains unconfirmed in KeeTrack even when a webhook callback is received. The send key is a private key known to the demo operator, so this flow is suitable for the controlled demo and does not provide full customer authentication or durable global rate limiting.
