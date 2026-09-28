# KeeTrack demo

KeeTrack is a local-first Kee Safety operations console for fictional register data. The default route is `/dashboard`; records, inspections, alerts and certificates are stored in one versioned `localStorage` document. EmailJS is available only for an explicitly requested single-alert email; there is no database, WhatsApp or background messaging integration.

## Setup

Use Node 24.x.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The token secret must be at least 32 characters. `NEXT_PUBLIC_APP_URL` is used to build QR verification URLs; when omitted in development, the request origin is used. Never expose `DEMO_CERT_TOKEN_SECRET` to the browser. To enable the manual alert action, set `NEXT_PUBLIC_EMAILJS_SERVICE_ID`, `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID` and `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`; leave them unset to keep email sending disabled.

Run the focused checks with:

```bash
npm run typecheck
npm test
npm run build
```

## Five-to-seven-minute walkthrough

1. Start on Dashboard. Open **Demo Controls** to download **Filled sample .xlsx**, then upload it in **Import**. You can also click **Preview filled sample** in Demo Controls to open the import review screen. The sample uses the visible demo date and includes HAR-001, LIF-014, LIC-023, ANC-009, a valid certificate and retired HAR-004.
2. Review the six valid rows and click **Import valid rows**. Open Dashboard to see the 30-day, 7-day, today and overdue queues.
3. Open Inspections, choose an active record, complete the checklist and submit it. A Reviewer or Admin can return it with a mandatory comment, or issue a certificate with an explicit expiry.
4. Open Certificates to print a branded DEMO certificate, create a QR snapshot and open the public `/verify?token=...` page. Tokens are signed, immutable payloads with a 24-hour TTL.
5. On Alerts, an Admin, Engineer or Reviewer can click **Send email** on one alert. The EmailJS template has the fixed `devops@kuroshioai.com` recipient; KeeTrack sends only when you click and has no automatic or bulk send action.
6. Use Demo Controls to download blank templates, set the app-only date, exercise deadline tiers, submit an explicit all-pass scenario, or reset the demo after confirmation. Reset returns to the empty Dashboard.

Production demo: [keetrack.vercel.app](https://keetrack.vercel.app) · source: [github.com/Kuroshio-AI/keetrack](https://github.com/Kuroshio-AI/keetrack).

## Register format and limits

`.xlsx` files must contain exactly one worksheet named `Register`. CSV files use the same fixed UTF-8 headers in the template: `asset_ref`, `record_type`, `asset_type`, `site`, `owner`, `serial_no`, `assigned_engineer`, `inspection_due_date`, `inspection_interval_months`, `licence_expiry_date`, `certificate_no`, `certificate_issued_date`, `certificate_expiry_date`, `retirement_due_date`, `status`. `asset_ref`, `record_type`, `asset_type`, `site` and `owner` are required. Date values are stored as calendar strings (`YYYY-MM-DD`), certificate fields are all-or-nothing, and certificate expiry cannot precede issue. Formula cells, malformed layouts, duplicate trimmed case-insensitive asset refs, files over 2MB and imports exceeding 500 total register records are rejected or reported per row. Duplicate rows never overwrite existing records.

The browser saves a complete next-state JSON document before updating the visible state. Unsupported or corrupted stored data enters recovery mode and blocks ordinary writes until **Start fresh** is explicitly confirmed in Demo Controls. Reset clears only KeeTrack’s operational local data.

Inspection evidence is optional fictional demo data. Only image MIME types are accepted, with a 200KB per-image and 1MB total local cap. No inspection or approval history is invented by register import.

## Verification snapshots

Creating a QR calls `POST /api/certificates/demo-token` with a small allowlisted certificate snapshot. The API signs it with an HMAC secret and returns a verification URL. `/verify?token=...` displays the captured status, dates and `asOf` timestamp; it is not a live certificate lookup. Old tokens remain valid until their own expiry even if a certificate is later revoked or superseded. QR generation can be retried without changing the approved certificate.

Future integrations such as a database, automated outbound delivery, customer identity and real certification evidence are intentionally outside this demo.

## Manual alert email

EmailJS uses the browser REST endpoint only after a user clicks **Send email** on an individual alert. The template recipient is fixed to `devops@kuroshioai.com`; KeeTrack sends only the alert event, asset reference/type, site, owner, severity, due date, demo date, status and occurrence timestamp. Notes, inspection evidence and contact lists are never included. The shared EmailJS account and mailbox quota are a demo dependency, so configure the three public values in `.env.local`, do not commit account values, and expect no scheduled or background delivery. A provider acceptance is recorded in localStorage; network failures remain unconfirmed and require a deliberate manual retry.

The provider template is versioned at [`docs/emailjs-template.html`](docs/emailjs-template.html). Keep its settings as follows: subject `[KeeTrack Demo] {{event}} — {{asset_ref}}`, fixed To and Reply-To `devops@kuroshioai.com`, From Name `KeeTrack Demo`, the default EmailJS sender, blank CC/BCC, and no auto-reply. Keep the template body limited to the allowlisted fields above.
