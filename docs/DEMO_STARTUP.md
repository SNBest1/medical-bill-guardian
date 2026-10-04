# Start the Medical Bill Guardian demo

From the repository folder, run:

```bash
npm run demo:start
```

Keep that terminal open while presenting. The command starts or reuses the website, patient/hospital text receiver, background worker, and Fish PDF receipt bridge. If the old tunnel is offline, it starts a new Cloudflare tunnel, saves its URL in the ignored environment files, updates the Fish receipt tool, and publishes the agent. It verifies both Fish agents and checks the public receipt endpoint before printing **DEMO READY**.

This is demo infrastructure. The intended patient product runs automatically within granted permissions. The three fictional patients and one shared patient phone are for showing different outcomes. Startup does not reset cases, place calls, approve a review, or post refunds.

## Before each presentation

- Run `npm run demo:start`, or `npm run demo:check` if everything is already running.
- Wait for **DEMO READY**. If a check fails, fix it before calling the hospital stand-in.
- Open http://localhost:3000/ and refresh the page.
- If rehearsing from the beginning, use **Restart this patient** deliberately. Starting the services preserves the existing case. Nessie refund credits survive local case resets, and duplicate protection prevents posting them twice.
- Pick Morgan, Harriet, or Theo. A new investigation command resumes an existing case; it does not implicitly reset it.
- Patient messages must come from `DEMO_PATIENT_PHONE`; hospital PDF messages must come from `DEMO_HOSPITAL_PHONE`. All three fictional patients share the patient phone, so switch the active investigation before using another patient's PDF.
- Verify patient texts receive replies and the PDF appears as read in the case. On the hospital call, receipt confirmation comes from the Fish receipt tool, not just the hospital saying they sent it.
- Leave the startup terminal running. Closing the tunnel breaks the agent's receipt check. A new tunnel URL must be republished; `demo:start` does this automatically.

## One-time prerequisites

- Install project dependencies with `npm ci`.
- Configure the ignored `.env` / `.env.local` files. Required: `GUARDIAN_WORKER_TOKEN`, `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `DEMO_PATIENT_PHONE`, `DEMO_HOSPITAL_PHONE`, `FISH_API_KEY`, `FISH_AGENT_ID`, `FISH_REVIEW_AGENT_ID`, and `FISH_RECEIPT_TOKEN`.
- Use tokens of at least 32 characters for worker and receipt authentication. Keep `DEMO_MODE` enabled. Enable `PHOTON_REPLY_TEXTS`, `PHOTON_DEMO_TEXTS`, and `PHOTON_UPDATE_TEXTS` for the text demo.
- Configure `FISH_PHONE_NUMBER_ID`, `FISH_TEST_TO_NUMBER` (equal to `DEMO_HOSPITAL_PHONE`), and `SPECTRUM_HOSPITAL_ASSIGNED_LINE` for calls. Both Fish agents must be active and published.
- Seed the Nessie sandbox using `node scripts/nessie-seed.mjs --apply`, then add everyday history with `node scripts/nessie-history.mjs`. These change sandbox data; they are not run on every startup.
- Install Cloudflare's official `cloudflared` CLI. The launcher finds it on PATH, in `data/tools/cloudflared`, or at `CLOUDFLARED_PATH`. Installation docs: https://developers.cloudflare.com/tunnel/downloads/ .
- Complete initial Fish receipt-tool setup and preserve ignored `data/fish-receipt-tool.json`. The existing setup is already complete on this machine. See the receipt-check section of README for initial setup; `demo:start` refreshes the existing tool without rewriting its prompt.

## Check and troubleshoot

```bash
npm run demo:check
node scripts/demo-start.mjs --dry-run
```

`demo:check` is read-only: it checks running services, published agents, tool URL and attachment, and receipt endpoint. With no selected case, a reachable receipt endpoint returns `unavailable`; that is an expected case result, not a connection failure.

Logs for services started by the launcher are in ignored `data/demo-logs/`. A failed service stops the startup command and the other services it owns, rather than silently leaving a partially working demo. Ctrl+C stops only services the launcher started; already-running services it reused are left alone.

- **“Receipt check isn't working”:** run `demo:check`. Restart with `demo:start` to restore the bridge/tunnel and refresh Fish's URL. A phone call already underway may need a new session to pick up the published configuration; the PDF does not need to be resent if the case says it was read.
- **No patient response:** check the receiver process, text flags and approved sender phone. Inspect `receiver.log` for forwarding failures. The worker retries definitely failed replies.
- **App exits with an unexpected Turbopack cache file:** stop the app, move only `.next/dev/cache/turbopack` to a temporary backup directory, then run `demo:start` again. Keep `.env` and `data/` intact.
- **Balance left:** calculated from fictional starting funds and actual Nessie transaction entries. Nessie's separate balance field remains fixed in this sandbox; it is explained in the account's source details.

## Public website mirror

The Devpost URL is https://medical-bill-guardian.vercel.app. It now uses the same local backend and cases. `npm run demo:start` restores/verifies the connection after its first publication. Run `npm run demo:publish` to repair or initially publish it. Keep this computer awake and online; Vercel provides the URL while the live services run here. See [public mirror notes](VERCEL_DEMO.md).
