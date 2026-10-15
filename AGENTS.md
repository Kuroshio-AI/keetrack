<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Branches and deploys

This repo builds two client demos of KTrack from the same code. Each Vercel project deploys from its own branch, so the user decides when each site changes.

| Branch | Site | Vercel project | Build setting |
| --- | --- | --- | --- |
| `main` | Kee Safety demo, kuroshio-ktrack.vercel.app | `ktrack-demo` | none (default) |
| `fls` | DXB FLS certificate tracker | `ktrack-fls-demo`, not created yet; its Production Branch must be `fls` | `NEXT_PUBLIC_CLIENT=fls` |

- A push to a branch deploys that branch's site. Pushing either branch, merging between them, or running `vercel --prod` is outward-facing: do it only when the user asks.
- Kee work goes on `main`; FLS work goes on `fls`. On `fls`, FLS-only behaviour stays behind `IS_FLS` (`lib/client.ts`), so `main` can be merged into `fls` cleanly to bring Kee and shared fixes across.
- Run the FLS build locally with `NEXT_PUBLIC_CLIENT=fls npm run dev -- --port 3001`. A separate port keeps its browser data apart from the Kee build's.
- The repo is public. Never commit client files or client data: `contextforclient/` holds the FLS client's own spreadsheet and voice notes and is git-ignored.
