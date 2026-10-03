# Medical Bill Guardian — parallel implementation handoff

Verified October 3, 2026, 18:22 EDT.

## Shared starting point

Repository: `/Users/neelavalareddy/Desktop/medical-bill-guardian`.
Current branch: `feature/guardian-workflow`. Main remains unchanged. There are substantial UNCOMMITTED and untracked changes shared with the UI chat. Do not reset, clean, stash, switch branches, or stage another chat's files. Do not create worktrees from HEAD yet: HEAD does not contain these changes. One integration owner must review and checkpoint the complete intended working tree, excluding secrets/data, before distributing that checkpoint to separate worktrees/branches. Push branches only. Merge only after the user explicitly authorizes it. Fetch teammates' work regularly; integrate deliberately rather than blindly pulling a dirty checkout.

Read repo AGENTS.md and the relevant local Next.js documentation before coding. The old CLAUDE.md handoff describes an earlier implementation; this file describes the current gaps. Never print or commit `.env.local`, `.env`, provider tokens, phone-routing IDs, or data/. Credentials and approved synthetic hospital/patient phones are already in ignored `.env.local`.

Product scope stays medical. Current fixture is $4,820 paid, six charges, five supporting clinical records, one uncertain $700 specialist consultation. Provider confirmation reduces gross bill to $4,120. Missing clinical evidence alone does not prove an erroneous charge. Self-pay demo refund is pending until synthetic credit matches; no real money moves. The proposed $4,200 → $1,900 story is not implemented. Insured corrections require a revised EOB; do not equate a gross correction to a patient refund.

Verification: 45 tests passed, one skipped; TypeScript passed. Latest backend additions have not had a production build or real transport rehearsal. Browser/audio visual QA remains unverified. No real phone calls or texts have been sent by this chat. Text permission question is still pending. No HIPAA compliance assurance exists. Keep DEMO_MODE=true and use synthetic records. Do not remove src/proxy.ts live-mode guard.

## What exists

- Next.js UI including a new evidence-driven Three.js case experience, consent gates, simulated two-voice conversation, written correction and refund tracking. Other Codex chat is “Show current UI and pull”, owns UI.
- SQLite case persistence; seeded mock workflow from discovery through notification/refund.
- Clinical findings have exact evidenceRecordIds.
- Insurance/EOB accounting and explicit unknown/pending/reprocessing states.
- Sourced Michigan Medicine price catalog; exact contextual matching required before calculating a review lead. Catalog is not the fictional demo hospital's contract.
- Nessie read adapter and repeatable discovery service; NESSIE_SANDBOX_DISCOVERY=true opts into real sandbox reads while staying in demo mode. New nonseed cases cannot use the seeded mock records.
- Spectrum Stable SDK 12.10.1 installed. Two approved demo phone contacts registered as shared users; registration is not proof of voice capability.
- Signed native Photon webhook endpoint /api/integrations/photon/webhook; raw-body HMAC, replay checks, approved sender, DM/text-only, explicit synthetic label and Case ID. Persists inbox before returning202.
- Inbox worker applies statement and marks event consumed in one SQLite transaction, deduplicating message IDs; active case operations defer processing.
- /api/integrations/tick and scripts/integration-worker.mjs poll discovery and drain inbox. Require a separate GUARDIAN_WORKER_TOKEN of at least32 chars. No token has been configured by this chat.
- Operator-only /api/cases/[id]/photon uses fixed request/summary templates and explicit authorized:true; PHOTON_DEMO_TEXTS=true required. SDK returns acceptance ID, not delivery confirmation. Persistent outbox suppresses duplicate sends; uncertain sends need operator recovery.
- Persistent operation guards cover run/analyze/statement/review/notify. Some remaining mutation endpoints still need the same guard. Ambiguous review contact failures retain the guard to prevent accidental redialing.

## Chat 1 — real voice transport (highest priority)

Own new services/voice/**, scripts/voice-* and docs/VOICE_REHEARSAL.md. Coordinate package/config changes through integration owner. Do not edit orchestrator, shared domain or UI without an agreed interface.

Implement the actual constrained synthetic hospital phone call through Spectrum Stable SIP. Read Photon Stable outbound voice docs first. SIP host sip.spectrum.photon.codes, TLS5061, registration off, project ID/secret Digest auth, verified project-owned iMessage From line, certificate verification on. Do not assume a pooled shared user's assigned line is authorized for SIP; verify it. Latest known project had shared messaging and no dedicated lines, so voice ownership may be a real blocker. If unsupported, report exactly what provider configuration is needed rather than claiming the call works.

Use a proper SIP client with bidirectional RTP, ideally baresip. Homebrew installation initially failed on bottle metadata; brew update completed afterward, but installation has NOT been retried. A client is not yet available. No OpenAI key exists; avoid designing a dependency on one. A teammate plays hospital billing; agent speech can be synthesized locally and played through call audio. Keep the script bounded and clearly operator-controlled where applicable. Implement next-turn/wrap-up/hang-up and a90-second limit. On drift or transport failure, preserve the browser-speech fallback. Never save a correction merely because a timer expired or a phone connected; require explicit scripted provider confirmation.

Acceptance: call connects to approved fictional hospital participant, both sides hear audio, hang-up works, five timed rehearsals succeed, failure does not create a financial result. Do not dial/send until explicit rehearsal authorization is confirmed. No real hospital/patient information.

## Chat 2 — Photon texts and statement delivery

Own services/communications/photon-*, app/api/integrations/photon/**, app/api/cases/[id]/photon/**, scripts/photon-* and docs/PHOTON_REHEARSAL.md. Request SQLite changes from Chat4 instead of editing db.ts concurrently.

Finish and validate the new Stable SDK/inbox/outbox implementation. Register a webhook only after a reachable public HTTPS URL is available; save its returned signing secret privately as SPECTRUM_WEBHOOK_SECRET. Project secret is NOT webhook signing secret. Expose only the webhook through a tunnel, not the unauthenticated full case app. Alternatively implement a local SDK message stream feeding the same durable inbox if that avoids a tunnel; dedupe across both sources. Attachments are not OCRed today: keep exact text intake for the rehearsal and retain manual upload fallback.

Messages must begin `Case: CASE-4821`, then `Synthetic demo statement`, then the supported statement grammar. Hospital sender must match DEMO_HOSPITAL_PHONE; patient sender cannot submit a hospital statement. Verify DM/platform/case/provider, reject groups and unsafe links. Add bounded streaming body reads. Confirm request and patient summary templates are accepted by the SDK. Distinguish sent/accepted/delivered/failed. Add recovery for uncertain outbox records without silently resending.

Acceptance: approved hospital receives synthetic request, its signed/streamed text becomes six bill items exactly once, patient receives truthful final summary, duplicate delivery and restart lose no statement or send twice. The user's explicit text-rehearsal permission is still pending; ask before any sends if not yet granted.

## Chat 3 — FinchNode clinical records (existing teammate owner)

Own services/medical/**, related medical adapter tests and docs/FINCHNODE_HANDOFF.md. Coordinate providers.ts with Chat4. Do not touch pricing or UI.

Finish the existing consented FinchNode integration. FINCHNODE_SUBJECT is empty; the recorded Connect session was still syncing and users was empty on the last check. Resolve subject/consent status with the teammate. Never guess a subject, skip consent, or attach separate sandbox records to the seeded University Hospital payment.

Retrieve and normalize encounters/imaging/procedures/medications with source IDs and dates. Match provider/service date to the actual synthetic payment/statement; exclude claims as clinical proof. Preserve insufficient-data states. Validate evidenceRecordIds point to real normalized records. Introduce an explicit synthetic-record integration mode only after matching data exists; DEMO_MODE currently selects mock records and the live guard must remain.

Acceptance: authorized synthetic subject yields inspectable matching evidence; unknown subject/partial records fail safely; no unrelated records appear in a case.

## Chat 4 — bank trigger, workflow reliability and financial recovery

Own lib/db.ts and db.test.ts, services/agent/**, services/banking/**, lib/providers.ts, domain.ts and core case mutation routes except Chat2's Photon route. All shared schema/API changes must be reported to other chats.

Complete the Nessie polling story with discoverHospitalPayments and the existing worker. Configure a separate worker token privately. Poll only the approved sandbox customer/account; bounded requests and visible failures. Merchant/category heuristics mean suspected healthcare, not verified hospital identity; use explicit merchant verification/allowlist for automatic actions. Discovery creates a case once and stops before records/contact without patient authorization. Support a persisted, scoped patient authorization if unattended investigation is required; never infer it from a payment.

Make all mutation routes use the same persisted operation guard, especially insurance, demo-refund, demo reset and any text/call completion. Prevent stale state overwrite across review/intake/insurance/reset. Add operator recovery for abandoned guards and uncertain outcomes: inspect stored/provider facts before any retry. Persist contact outcomes before notification; retry notification without calling billing again. Separate contact errors from record-read errors so safe read retries do not require unnecessary manual recovery.

For a paid bill, request/track refund; never pay again. Match actual confirmed credit by reference/amount/account when sandbox supports it. If no real refund API exists, use clearly synthetic credit and say so. For insured cases, revised EOB + patient balance must reconcile before asserting refund. No automatic settlement/payment authority.

Acceptance: repeated polls create one case; concurrent requests cannot duplicate contact or lose updates; restart recovery is safe; gross correction, patient liability and cash returned are separate facts.

## Chat 5 — pricing and insurance accuracy

Own services/reconciliation/pricing*, insurance*, services/research/**, app/api/pricing/**, app/api/research/**, reference-data/** and scripts/import-hospital-prices.py. Request domain/SQLite changes from Chat4. Do not edit clinical reconcile.ts unless agreed.

Finish realistic benchmark comparison using the actual item codes, units, setting, component, modifiers, provider, service date and payer/plan. Importer preserves public publisher rows but many units/contract dates are unknown: do not invent them. Only99285 has a code in the seeded statement; do not assume which CT/Xray/suture/medication procedures occurred. CASH applies to self-pay; NEGOTIATED requires matching insurance/network/plan; Medicare is a contextual benchmark unless legally/contractually relevant.

Public Michigan Medicine rates do not establish the fictional University Hospital's owed amount. Keep research comparisons distinct from adjudicated obligations and confirmed errors. Validate loader metadata and source freshness; rate methodologies may be bundled or percent-of-charge, so skip unsuitable unit comparisons. Extend EOB cases for secondary payer, pending/denied claims, noncovered charges, out-of-network and accumulators; unavailable variables remain unknown, not guessed. Existing EOB arithmetic should remain authoritative for the fixture.

Acceptance: incomplete context gives no exact fair-price claim; matching data produces cited reproducible comparison; insured gross reduction never becomes automatic same-dollar refund.

## Chat 6 — UI, end-to-end integration and demo submission

Existing UI chat owns components/experience/**, GuardianExperience, Dashboard, CaseView, related components/globals/layout and docs/DEMO_EXPERIENCE_PLAN.md. Do not run another UI author on those files simultaneously. Give this task to that owner or wait for an explicit handoff.

Finish visual/browser QA and wire real integration controls to the agreed backend contract. Preserve simulated/real labels and consent gates. Keep the uncertain specialist charge uncertain until provider confirmation. Show written correction, insured reprocessing or pending refund as appropriate. Evidence paths use evidenceRecordIds. Add clear errors/retry/recovery states for409/502 instead of an endless animation. Verify mobile, keyboard, reduced motion and WebGL fallback.

The integration owner checkpoints the dirty tree, distributes worktrees, coordinates schema/dependency changes and assembles feature branches without merging main. Keep secrets/data out. Run tests/typecheck/build after convergence; coordinate .next output with the running dev server. Test self-pay demo, insured demo, signed-message replay, operation concurrency, network failure and restart. Perform browser/audio QA and a timed4-minute presentation five times. Photo/upload fallback, scripted call fallback and exact bill should be prewarmed. Devpost describes integration honestly. Avoid unsupported bankruptcy/error-rate statistics unless sourced precisely.

Acceptance: one reproducible startup and rehearsal guide, clean feature branch/PR, validated4-minute flow, no fabricated savings or actual refund claims. User authorizes merge later.

## Suggested order

1. Integration owner checkpoints all intended current work so parallel worktrees contain it.
2. Chats1–5 work concurrently with the file ownership above. Existing UI owner continues Chat6.
3. Resolve actual SIP line/transport capability immediately; this is the biggest demo risk.
4. Resolve FinchNode subject and text permission/public endpoint while code work proceeds.
5. Integration owner converges changes and runs full checks/rehearsals; only then push feature branches/PR. Never merge without user instruction.
