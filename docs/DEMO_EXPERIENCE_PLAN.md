# Medical Bill Guardian: The Bill Opens Up

Design and implementation contract · October 3, 2026
Status: plan only. Implement in the existing Next.js repository. No deployment or additional generated assets required by this plan.

## 1. The decision

Build an interactive investigation whose main interface is the patient's bill. The visitor watches the same object become understandable, asks to inspect a charge, authorizes a conversation, and sees a documented outcome.

**The signature moment:** six charges peel out of one statement into a spatial evidence diagram. Five connect to their corresponding records. The $700 specialist consultation remains without a connection. Selecting it opens the actual evidence and the precise question Guardian proposes asking billing. During the simulated call, those same objects support the conversation. Only after the provider result is saved does the charge move into a correction receipt.

This is the concept to execute. Do not turn it into another hero illustration followed by feature cards.

**Visitor takeaway:** “It found something worth questioning, showed me why, asked with my permission, and tracked what happened.”

**Judge takeaway:** “I can inspect the chain from payment to medical evidence to authorized action to confirmed outcome.”

### Why the present design misses

- Its 3D documents are decorative replicas disconnected from the case. The current canvas even uses generic charge labels that differ from the actual fixture.
- Scrolling reveals a predetermined correction before the visitor investigates or authorizes anything.
- The shield appears because time passed in an animation, not because a meaningful product event occurred.
- The landing experience and case workspace have different visual identities and repeat the explanation.
- The actual evidence and conversation are visually subordinate to a long marketing page.
- Passing TypeScript and a production build has not established visual quality. Browser inspection was unavailable during the previous implementation.

## 2. Lock the story before designing

Keep the working synthetic, already-paid, self-pay case. Do not inflate the result to make the demo dramatic.

| Fact | Value |
| --- | --- |
| Provider | University Hospital |
| Visit | September 28, 2026, emergency care after an accident |
| Invoice | UH-48291 |
| Already paid | $4,820 |
| Emergency room | $1,100 |
| CT scan | $1,800 |
| X-ray | $450 |
| Suture repair | $600 |
| Medication | $170 |
| Specialist consultation | $700 |
| Initial finding | No matching specialist encounter in available records |
| Mock provider's explanation | Consultation duplicated services included in the emergency charge |
| Confirmed corrected total | $4,120 |
| Refund initially owed | $700 pending |
| Refund received | Only after the explicit synthetic-credit action succeeds |

Do not show the $700 as savings before confirmation. A supported clinical service does not establish a fair price. Keep price review and insurance context available in supporting details, but they are not the main self-pay demonstration. If the case has an insured/reprocessing state, the ending must reflect that state instead of presenting a patient refund.

The “80% of bills contain errors” claim stays out. Optional context below the opening: “41% of adults reported medical or dental debt in KFF's 2022 survey,” with the date and [source](https://www.kff.org/health-costs/kff-health-care-debt-survey/). This is background context, not evidence that this bill is wrong.

No invented patient name, testimonial, recovery story, financial hardship, or live integration success. The human voice comes from the language and burden relieved.

## 3. Art direction: a precision instrument for a human problem

### Visual identity

The scene is an illuminated paper statement on a deep blue-black studio surface. Paper feels tactile; the interface is sharp and readable. Evidence uses clear, thin paths and small source excerpts. Rose is reserved for a question requiring attention. Confirmation is communicated by words and geometry, not a celebration effect.

| Token | Locked choice |
| --- | --- |
| Main background | `#111B24` |
| Raised surface | `#1B2935` |
| Paper | `#F2F4F5` |
| Main text on dark | `#F2F4F5` |
| Secondary text on dark | `#A9B8C5` |
| Attention accent | `#D7A5B0` |
| Rules / connectors | `#536779` |
| Text on paper | `#182631` |
| Display and UI | Existing Manrope; 600–800 for titles, 400–500 body |
| Evidence metadata | System monospace; only identifiers, dates, amounts, tool labels |

Use one softbox reflection, directional rim light, paper shadows, and restrained depth of field if it does not blur information. Create the lighting procedurally. Avoid a glossy plastic appearance, purple glow, decorative particles, floating badges, and mirrored chrome that renders black without an environment map.

Paper corners: 4px. UI panels: 10px. Buttons: 6px. No large collection of pill badges. Main text needs verified contrast, including on a projector.

### Composition

At 1440×900: 72px navigation, 56px side margins, an approximately 430px reading/decision column and the remaining width for the investigation stage. The 3D subject occupies 55–65% of the available stage height. No tiny object stranded in a huge canvas.

Headline: 64–76px desktop, 40–46px mobile, at most two or three deliberate lines. Body: 17–18px desktop, 16px mobile. Evidence text: at least 14px, never miniature canvas text as the only readable source.

The point of visual continuity is object identity: same invoice, same charge order, same selected $700 item. Camera changes are motivated by the task, not a tour around an arbitrary sculpture.

## 4. Experience storyboard

### Opening: a question, not a result

Route `/`. One strong first viewport, then a short “how it works” explanation and the sourced context. Remove the current three-viewport marketing sequence and repeated metrics/features.

**Headline:** “You paid the bill.\nDid you owe it?”

**Supporting copy:** “Guardian checks the charges against your records and helps you follow up with billing.”

**Primary action:** “Open demo case” for a new seeded case; “Resume demo case” when it has progressed.

**Secondary action:** “How it works,” an anchor to a compact explanation with three verbs: Understand, Ask, Follow through.

The stage displays the actual seeded hospital statement front-on at a slight angle, with $4,820 readable. A payment stub behind it shows “Paid.” On pointer movement the paper can respond by no more than 3 degrees. On initial scroll, the payment stub and invoice align at their shared amount, communicating how a transaction becomes a case. This is an illustrative introduction; it never mutates case state.

Small persistent header label: “Interactive demo · Synthetic patient.” The final correction is not shown here.

### Case composition

Use `/cases/[id]`, preserving reloadable, shareable case identity and current APIs. The case is the main experience. A persistent stage stays alongside a sequence of readable chapters. Completed chapters remain revisitable. A small top rail says “Bill / Evidence / Review / Outcome”; unlocked steps are keyboard-accessible anchors.

At any moment there is one main action. “Details” and “View activity” open secondary surfaces. Do not force people to traverse the entire scroll distance to operate the demo; a successful action can move to the next chapter with a gentle transition and a visible next-step control.

**The essential rule: scroll changes the viewpoint; explicit actions and server responses change the case.**

### Beat A — “Let's see what you paid for.”

State: DETECTED.

Display the paid statement as the main object, the hospital/date/amount, and a brief explanation of collection. Primary action: **“Authorize bill review.”** Its nearby text specifies permission to retrieve the synthetic statement and records. Send the existing `/run` request with `authorized: true`.

During the request, show genuine receipt/record availability. Do not fabricate sequential tool successes from timers. The initial bill-request voice script becomes optional supporting material; requiring two long voice calls obscures the central negotiation.

When the statement arrives, it unfolds once and its six charges become separately selectable. This transition should take about 700ms. The statement remains visibly one document; it does not explode into unrelated cards.

### Beat B — “One charge needs an explanation.”

State: REVIEW_REQUIRED after analysis.

The camera shifts from angled paper to an almost orthographic evidence view. The six charges form a vertical ledger at left of the stage; corresponding medical record excerpts sit to their right. The selected charge stays in a fixed reading lane.

Five thin paths connect supported charges to actual records. Source labels are meaningful: “CT diagnostic report,” “Radiology report,” “Laceration repair,” etc. The specialist consultation has an open connector ending at **“No match in available records.”** Never draw a red X or label it fraudulent.

Initial focus: the $700 specialist charge. Main reading column:

> **$700 needs a closer look.**
> We couldn't find a matching specialist encounter. Billing may have documentation we don't have.
> **Question to ask:** “Was this consultation a separate service, or included in the emergency room charge?”

Selecting any charge performs three connected changes: focus that row, emphasize its source path, and show its evidence in a readable HTML panel. The selected bill item, record, and explanation all come from the same case data. Camera movement is secondary and restrained.

A clearly named **“What did Guardian check?”** drawer exposes input identifiers, medical evidence, clinical verdict, price-review status, and recorded tool activity. It is an inspectable explanation, never generated “thoughts.”

Primary action: **“Approve billing call.”** Show scope before the button: verify the specialist charge and request a written correction if appropriate. The user can leave without approving.

### Beat C — “Here is how we ask.”

After approval, the page becomes a conversation workspace without losing the selected charge. Keep “Simulated call” visible. Browser speech remains an acceptable first implementation; it is not advertised as a live call.

The stage has two speaker positions, Guardian and Billing, with the selected charge between them. Do not create avatars. The active speaker gets a restrained audio indicator. Only use a waveform if driven by actual audio data; otherwise use a labeled speaking indicator.

Show the current transcript turn prominently, the previous turn above it, and the complete transcript on demand. Playback controls: Play/Pause or Resume, Read instead, and Cancel. Read mode lets a judge step through the same script without audio.

Motion follows transcript events:

| Script event | Spatial response | Meaning |
| --- | --- | --- |
| Guardian names the consultation | $700 row lifts slightly into the shared reading lane | This is the exact charge under discussion |
| Guardian explains missing documentation | Supporting records align; specialist connector remains open | Evidence boundary is explicit |
| Billing says it was included in emergency services | A proposed link appears from consultation to ER charge | This is the provider's explanation |
| Written correction is requested | A receipt preview is placed beside the statement | Confirmation is being obtained |

The provider line may appear in the script before saving succeeds. Label this as the scripted response; keep the original amount and pending receipt until `/request-review` returns a persisted resolution. No visual completion may imply an API result that has not arrived.

At the end of playback/read mode, use the user's existing authorization to save the simulated outcome once. Remove the redundant “wrap up” then “save” choreography from the primary demo path. On failure, show **“Save confirmation”** retry while retaining the transcript. Canceling playback never grants authorization or posts a result.

### Beat D — “$700 corrected. Refund pending.”

State: persisted resolution and REFUND_PENDING.

The provider-confirmed duplicate folds into a separate correction receipt. The original bill remains accessible. Display an explicit adjustment row of −$700 and a corrected total of $4,120. Do not erase the original history.

The amount transition completes in 900–1200ms, once per new confirmed result. It must end on the exact API amounts. All three amounts remain readable as static text. Reloading a completed case displays the settled state immediately.

**Headline:** “$700 corrected. Refund pending.”

**Plain-language receipt:**
- Original payment: $4,820.
- Corrected charges: $4,120.
- Refund owed: $700.
- Reason: billing confirmed the consultation duplicated emergency services.
- Written demo confirmation ID.

The final scene becomes calmer: paper returns to the surface, connectors disappear, reading order becomes straightforward. Relief comes from less visual complexity. No generic shield reveal or confetti.

Primary ordinary action: **“View correction.”** Secondary clearly labeled demo control: **“Simulate refund credit.”** Only its successful existing API response changes the headline to “$700 demo refund received.” An insured case instead shows the required reprocessing and unknown refund, as the backend dictates.

Ending sentence: “A clear answer. A record of what changed.” Do not invent what the patient buys with the money.

## 5. Choreography that earns its place

| Interaction | Mechanic | Constraint |
| --- | --- | --- |
| Enter a new chapter | Camera reframes the same statement | 500–800ms; no full spins |
| Scroll within evidence | Separate paper layers enough to expose relationships | Reversible; no new findings created |
| Select a charge | Its HTML row, 3D strip, path, and source highlight together | Feedback within 100ms; keyboard equivalent |
| Open a source | Expand the source excerpt in HTML | No PDF-sized text baked into texture |
| Approve review | Selected evidence moves into conversation position | No call without click |
| Speaker changes | Current line and relevant object gain emphasis | Speech event or manual step drives it |
| Confirmation saved | Duplicate becomes adjustment receipt | Server result is the gate |
| Refund credit matched | Pending marker changes to received receipt | Separate explicit demo action |

No scrolljacking. Native wheel, touch, keyboard, and scrollbar work. Maximum one viewport of travel between meaningful ideas; never add 300vh to make an animation feel expensive. Every state has useful visible content before WebGL initializes.

Use Anime.js timelines to interpolate scene poses, not to orchestrate business logic. Fast scrolling seeks to the correct pose; it does not queue transitions. Transitions should interrupt cleanly and pick up from the current pose. Preserve the selected bill item through camera changes.

## 6. Implementation architecture

### Existing source of truth

- `src/services/demo.ts`: actual bill, records, transaction. The fixture has five medical records and six charges.
- `src/types/domain.ts`: statuses, findings, insurance review, resolution, recovery.
- `src/services/agent/orchestrator.ts`: business transitions and audit log.
- Existing `/run`, `/analyze`, `/request-review`, `/notify`, and `/demo-refund` routes: retain semantics and authorization.
- `src/components/CaseView.tsx`: existing case operations; reuse/refactor rather than duplicating them into a second API controller.
- `VoiceCall.tsx`: existing speech fallback and watchdog; evolve carefully.

Current `/run` commonly returns WAITING_FOR_BILL, not every intermediate state. `/request-review` can return USER_NOTIFIED because it also creates the summary. Derive display from returned data; do not wait for intermediate states the API never exposes.

### Proposed files and responsibilities

| File | Responsibility |
| --- | --- |
| `src/components/experience/GuardianLanding.tsx` | Compact opening, actual seeded preview, resume entry |
| `src/components/experience/CaseExperience.tsx` | Composition of case chapters, decisions, stage and details |
| `src/components/experience/useCaseSession.ts` | Extract current fetch/actions/polling into one owner; cancellation, errors, authoritative case |
| `src/components/experience/view-model.ts` | Pure mapping of MedicalBillCase to readable presentation and available actions |
| `src/components/experience/CaseStage.tsx` | Lazy Three.js canvas, lighting, meshes, camera and resource disposal |
| `src/components/experience/stage-poses.ts` | Named poses and Anime.js transitions; no fetches or mutations |
| `src/components/experience/EvidenceLedger.tsx` | Accessible source-linked selection and readable evidence |
| `src/components/experience/ReviewConversation.tsx` | Speech/read mode and turn events; adapted from VoiceCall |
| `src/components/experience/CorrectionReceipt.tsx` | Persistent, printable result and separate refund state |
| `src/components/experience/CaseDetails.tsx` | Audit, sources, financial/price review details |
| `src/components/experience/experience.css` | Scoped visual system; replace previous marketing overrides |

These are implementation boundaries, not a requirement to create abstractions before they are needed. Keep meshes and helpers in a small number of files.

**State separation:**
1. Persisted case: API-owned and authoritative.
2. Interaction state: selected bill item, open drawer, playback turn, local approval intent.
3. Presentation state: camera pose and scroll interpolation. Keep frame updates outside React state.

Proposed stage contract: `CaseStage({ view, selectedBillItemId, presentationBeat, onSelectBillItem })`. The `view` comes from the case view-model; the stage never decides that something is an error or refund.

Use `billItemId` for correspondence. For source connections, retain real medical-record IDs in the reconciliation output if needed via a small additive `evidenceRecordIds` field. Do not infer provenance by matching display strings. Legacy cases without IDs get readable evidence text with “source link unavailable,” not invented links.

**3D construction:** procedural slightly curved paper, six thin item strips, source cards, a correction receipt, and restrained connector geometry. A few custom reusable shapes are enough. Use HTML for all actionable text and amounts. A generated image or video cannot provide the interactive evidence relationship and is not a prerequisite.

Load Three.js only for the experience stage on the client. Use environment lighting or a procedural studio environment before tuning metallic materials. Cap pixel ratio around 1.5 on desktop and 1 on constrained devices. Suspend frame rendering when the scene is still, offscreen, or the tab is hidden. Dispose textures, geometries, materials, observers, listeners, and timelines on unmount.

### API/event mapping

| User event | Request | Allowed presentation after success |
| --- | --- | --- |
| Open seeded demo | Scan when absent; otherwise GET existing case | Actual stored stage; never auto-reset |
| Authorize bill review | POST `/api/cases/:id/run`, `{authorized:true}` | Collection/waiting |
| Bill arrives | Poll POST `/api/cases/:id/analyze` while WAITING_FOR_BILL | Actual findings |
| Approve simulated call | Local explicit authorization; begin scripted playback/read mode | Conversation only |
| Approved conversation ends | POST `/api/cases/:id/request-review`, `{authorized:true}` once | Returned resolution/recovery |
| Retry summary after partial success | POST `/notify` only when persisted status is RESOLVED | USER_NOTIFIED after success; no second provider review |
| Match demo refund | POST `/demo-refund` | REFUND_RECEIVED only after success |
| Restart demo | Explicit restart control using `/api/demo/reset` | Fresh seeded case |

Guard double clicks. A failed request retains the last confirmed view. Refetch after ambiguous network outcomes before retrying a mutation. Do not assume route retries are idempotent merely because buttons are disabled.

## 7. Mobile, accessibility, and honest fallback

- Below 900px, use a compact stage above the active chapter. Below 600px, evidence becomes a vertically connected HTML ledger. No tiny desktop constellation squeezed into a phone.
- On short screens, content remains in normal flow; a sticky canvas cannot cover the decision button.
- Reduced motion: static diagrams for the same states, instant pose changes, no smooth camera travel. All features remain usable.
- WebGL unavailable/lost: HTML ledger and receipt retain the entire workflow. Hide the failed canvas; offer a lightweight view toggle regardless of capability.
- Focus follows the selected evidence or opened drawer, never a decorative object. Drawer closes with Escape and returns focus. Restore focus sensibly after state transitions.
- Transcript remains readable and usable without speech. An audio failure never blocks the case.
- Use live regions for important state changes, not every animation frame or spoken word.
- Price reference and insurance review are preserved in details and remain accurately labeled; do not reduce them to aesthetic green checks.

## 8. Build order for a cheaper implementation model

Implement in bounded passes. Do not ask another model to “make it cinematic” and expect it to invent this plan again.

### Pass 1 — Functional composition and static visual proof

Read the current repository instructions and recheck concurrent changes. Build the view-model, extract the case session, and render every beat with static HTML. Keep APIs and fixtures intact. Add the exact story, one primary action per state, details drawer, and receipt. Remove the old decorative three-chapter hero from the active route.

**Exit gate:** a viewer can complete the entire case without canvas or speech; every number comes from the case; reload resumes correctly. Capture opening, evidence, conversation, and outcome at desktop and mobile before proceeding.

### Pass 2 — One excellent still scene

Build the procedural statement, six strips, source cards, lighting, shadows and camera. Wire real case labels. First achieve a well-composed still at 1440×900 and 390×844. Do not compensate for a weak still with motion.

**Exit gate:** the document reads as paper, source relationships are legible, the object is large enough, HTML and scene align, fallback still works. Inspect rendered output.

### Pass 3 — Evidence interaction

Connect HTML selection to scene selection and actual provenance. Add the five supported paths and the open specialist path. Wire inspect-source and evidence details. Introduce limited camera transitions only after the interaction works.

**Exit gate:** selecting all six charges gives correct, distinct results with mouse and keyboard. No false provenance or “verified price” claims.

### Pass 4 — Choreograph conversation and outcome

Map playback turn events to scene emphasis. Implement read mode and one-time save at completion with an explicit failure/retry state. Fold the confirmed duplicate into the receipt only after a persisted response. Add separate refund receipt transition.

**Exit gate:** speech failure, cancel, fast interaction, refresh, and network failure cannot fabricate a resolution or double-call the provider.

### Pass 5 — Polish and rehearsal

Tighten type, spacing, surfaces and transitions. Remove unused previous CSS instead of appending a third competing theme. Reduce canvas bundle/loading cost, test short screens and reduced motion. Rehearse from fresh and completed cases.

**Exit gate:** all acceptance criteria below pass. If visual tooling is still blocked, report that gap and do not describe the result as visually verified or finished to this design standard.

## 9. Acceptance criteria

### Product and integrity
- Every displayed charge matches `demo.ts`; $1,100 + $1,800 + $450 + $600 + $170 + $700 = $4,820.
- Five supported clinical matches, one question, zero promised savings before provider confirmation.
- Explicit collection and review authorization; scroll cannot trigger either.
- $4,820 − $700 = $4,120 after confirmation; pending refund remains distinct from received credit.
- Insured/reprocessing states do not inherit the self-pay refund ending.
- A canceled call, failed request, or rapid double click cannot produce false success.
- “Simulated” is visible during call and outcome; integrations are described according to actual provider selection, not API-key presence.

### Design and motion
- The same statement and selected charge remain identifiable across all beats.
- Each animation answers a concrete question: what was selected, what supports it, who is speaking, or what changed.
- No decorative shield, autoplay particles, scroll-gated invisible paragraphs, or identical feature-card rows.
- Primary action and key finding are readable on a 1440×900 projector view without leaning forward.
- Fast forward/reverse scrolling and navigation during a transition leave the correct scene pose.
- No clipped content, horizontal overflow, overlapping canvas, or inaccessible actions at 390×844 and 768×1024.
- No continuous expensive render loop while settled. Aim for smooth 60fps desktop interaction and usable 30fps mobile; measure on actual hardware and reduce quality when necessary rather than claiming those numbers from build success.

### Verification
- Run repository-required tests, TypeScript, and production build after functional changes.
- Add focused tests for view-model state gates and event-to-save behavior, not pixel snapshots of implementation details.
- Rehearse actual UI: fresh case → collection → evidence selection → approval → read/voice call → confirmation → refund pending → synthetic credit.
- Rehearse resume, cancel, failed save, reduced motion, no WebGL, narrow viewport, and slow network.
- Inspect desktop/mobile screenshots and a recording of forward/reverse choreography. Build success is not visual acceptance.

## 10. The 150-second presentation

Timing is a rehearsal target, not an enforced autoplay sequence.

| Time | Presenter action | Audience learns |
| --- | --- | --- |
| 0–15s | Show paid bill and opening question | The patient has already spent $4,820 and deserves clarity |
| 15–35s | Authorize collection; open bill | Guardian connects a payment to supporting documents |
| 35–65s | Select a supported charge, then specialist | Analysis has inspectable evidence and acknowledges uncertainty |
| 65–110s | Approve and play/read a shortened faithful conversation | Guardian asks a precise question with authorization |
| 110–135s | Show confirmed correction and pending refund | The result is verified; money received is a separate fact |
| 135–150s | Open activity briefly; optionally match synthetic credit | The full chain is traceable and reproducible |

Shorten the spoken script for rehearsal only while preserving the identity disclosure, question, provider explanation, confirmed amounts, and refund-pending distinction. No distracting scroll choreography during the presenter’s key explanation.

## 11. Scope and credit discipline

The core is code, typography, real case data, procedural geometry, and purposeful motion. Use existing Anime.js and Three.js. Do not migrate frameworks, add another animation library, rewrite working provider adapters, or move the app to the unfinished Higgsfield scaffold.

Higgsfield's connected account has reported Free with 10 credits, and rejected explicit credit-funded image generation for requiring Basic. No new generation attempts are needed to implement this plan. Total authorized Higgsfield spend remains capped at 10 credits if access later changes. Preflight any optional job before submission.

An optional generated paper-material reference or launch image can come after the experience passes its gates. A video hero is not a substitute for the interactive scene. Keep the site off the Higgsfield community feed as requested.

### Deferred

Live hospital calling, patient onboarding, real patient records, insurer negotiation, broad market-price comparisons, a new brand name, multiple showcase cases, and marketing conversion forms. These do not strengthen the current proof enough to justify delaying it.

## 12. Copy-paste implementation handoff

> Implement `docs/DEMO_EXPERIENCE_PLAN.md` in the existing Medical Bill Guardian Next.js app. Treat its storyboard, actual fixture amounts, explicit authorization gates, and state-driven motion as the design contract. Start with Pass 1 and verify its exit gate before adding 3D. Preserve other ongoing repository changes. Use the existing APIs and case model; inspect current files before editing. Do not invent integration success, patient facts, prices, savings, or provenance. Create a polished static composition, then the real source-linked scene, then conversation choreography and the receipt. Scroll controls presentation only. No Higgsfield generation or framework migration is required. Keep demo disclosure, speech/HTML fallbacks, reduced motion, and mobile usability. Run required checks and inspect the actual UI; explicitly report if browser access prevents visual verification. Do not stop after adding a canvas or a scroll effect. The deliverable is the complete, inspectable case experience and a rehearsed demo.
