# KeeTrack demo

KeeTrack is a local-first Kee Safety operations console for fictional register data. The default route is `/dashboard`; records, inspections, alerts and certificates are stored in one versioned `localStorage` document. EmailJS and a Twilio WhatsApp trial are available only for explicitly requested single-alert actions; there is no database or background messaging integration.

## Setup

Use Node 24.x.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The token secret must be at least 32 characters. `NEXT_PUBLIC_APP_URL` is used to build QR verification URLs; when omitted in development, the request origin is used. Never expose `DEMO_CERT_TOKEN_SECRET` or the Twilio variables to the browser. EmailJS uses the three `NEXT_PUBLIC_EMAILJS_*` values; the WhatsApp trial requires all five `TWILIO_*` values in the server environment. Leave either set of values unset to keep that channel disabled.

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
6. Open **Demo Controls → WhatsApp trial** to check configuration and the sample message. Reconnect the recipient in the Twilio trial console, then click **Send WhatsApp test** on one alert. No demo access key is required. The message is always the fixed system-downtime sample; the selected alert is used only to mark local state.
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

## Trial WhatsApp

The WhatsApp action posts same-origin `alertId` JSON to `/api/alerts/whatsapp`; the browser never chooses the recipient, sender, template, message body or private register details. The server requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO` and `TWILIO_WHATSAPP_CONTENT_SID`. Keep these values in the server environment, never in browser code or the repository. Demo Controls shows configuration status, the masked recipient and the fixed sample. There is no separate demo access key or browser authorization; anyone with access to this public demo can request the fixed message to the configured recipient.

This specific trial requires reconnecting the WhatsApp recipient in the Twilio console for each console session and supports only predefined template content.

Every trial send uses this generic fictional sample: `Alert: System downtime detected. Engineers notified. ETA to resolution: 2 hours. Reply STATUS for updates. Test message from Twilio.` A successful Twilio acceptance is not delivery confirmation. Network, timeout and malformed-provider responses say to check Twilio before retrying; the action never retries automatically. Accepted and ambiguous results are held in a bounded warm-instance replay cache for 10 minutes, with a three-second per-instance cooldown and a maximum of 500 alert keys. Cold starts or multiple server instances can reset or bypass those in-memory protections; they are not authentication or a global quota limit. Add authentication and shared rate limiting before expanding access or recipients. There are no scheduled, background or bulk sends.
