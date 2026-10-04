# Receipt Trace demo frontend design

## Goal

Redesign Medical Bill Guardian as a memorable, judge-ready demonstration of an explainable medical-bill investigation. The interface must make the real workflow legible: a hospital payment opens a case, medical evidence and an itemized statement are gathered, charges are reconciled deterministically, the patient authorizes provider contact, and only a provider-confirmed correction is reported as savings.

The redesign changes presentation and interaction hierarchy, not the case model, orchestration rules, provider boundaries, or API behavior.

## Audience and primary job

The primary audience is a hackathon judge seeing the product for the first time. The interface's single most important job is to communicate the complete value proposition within a short live demonstration while remaining credible as a patient-facing product.

The demo should answer three questions without narration:

1. What triggered this investigation?
2. How did the system connect each charge to evidence?
3. What action was taken, with whose authorization, and what was confirmed?

## Design thesis

The itemized statement is the visual and navigational spine of the product. It appears as a physical receipt that unfurls as the workflow advances. Evidence cards connect directly to bill lines so the relationship between money, medical records, uncertainty, and action is always visible.

This avoids a conventional card-and-metrics healthcare dashboard. The distinctive moment is a single orchestrated receipt-printing animation on entry, followed by restrained evidence-thread and state-transition motion. With reduced motion enabled, the final layout appears immediately.

## Visual system

### Color tokens

- Archive blue: `#CADCFF` — primary canvas and calm clinical context.
- Carbon ink: `#10204B` — text, primary controls, and high-contrast panels.
- Signal coral: `#FF563F` — unresolved evidence and consequential actions only.
- Receipt stock: `#FFFDF1` — itemized statement surface.
- Confirmation green: `#188158` — supported evidence and confirmed outcomes.
- Interface white: `#F6F8FC` — workspace surfaces and readable content areas.

Coral must not become a decorative accent. Its consistent meaning is “attention or authorization required.”

### Typography

- Display: Petrona, variable optical size, used for hero statements and decisive case headings.
- Interface: Albert Sans, used for navigation, explanatory copy, buttons, and controls.
- Evidence/data: DM Mono, used for bill lines, IDs, states, timestamps, sources, and audit entries.

Fonts will be loaded through Next.js font handling rather than a CSS network import. Fallbacks must preserve legibility if font loading fails.

### Shape and detail

The visual language uses crisp ruled edges, dashed receipt separators, connected evidence threads, and offset print-style shadows. Rounded corners are limited to major shells and compact status markers. Icon tiles, decorative gradients, and interchangeable dashboard cards are removed.

## Information architecture

### Landing page

The landing page leads with one active investigation rather than abstract aggregate metrics.

- Header: product identity, current case context, and an explicit “Synthetic demo” indicator.
- Hero: value proposition and one primary action, “Trace this payment.”
- Receipt Trace: the University Hospital statement occupies the center of the composition. Supported charges and the unresolved specialist line are visually distinct.
- Evidence connections: a small set of evidence cards attaches to relevant bill lines.
- Workflow ribbon: Detect, retrieve, reconcile, and decide stages summarize the system beneath the hero.
- Existing cases: retained below the hero as a compact archive so multi-case behavior remains discoverable without distracting from the demonstration.

The initial empty state still provides a clear transaction-scan action. Existing automatic demo scanning remains unchanged.

### Case workspace

The case page uses a two-part workspace:

- A sticky receipt rail shows all charges and remains the source-of-truth navigation. Selecting a charge chooses the corresponding finding.
- A focused evidence workspace shows the selected charge, supporting or missing evidence, cautious interpretation, and the action available in the current state.

On smaller screens, the receipt rail becomes a horizontal or stacked charge picker above the evidence content. No interaction may depend on hover.

### Story/System view

A compact view control supports two presentations of the same case:

- Story view is the default patient-facing explanation.
- System view reveals provider boundaries, state transitions, audit tools, timestamps, and stored communication results.

System view is derived entirely from the existing case, audit-log, timeline, and communication data. It does not fabricate live integration activity.

## Integration presentation

The frontend will distinguish current demo behavior from adapter readiness.

- The active run is labeled as synthetic and uses the mock bank, medical-record, and communication providers.
- Nessie and FinchNode may be named as available provider adapters in System view, but not shown as active in the synthetic run.
- Relay and Photon are presented only as the communication-provider boundary or future adapter targets. The UI must not claim that Relay or Photon contacted a hospital because no live communication adapter exists.
- OpenAI may be identified as optional summary phrasing when the audit data indicates the generated summary was AI-assisted. It must not be presented as the reconciliation decision-maker.

The durable architecture sentence is: “Bank signal → consented medical records → deterministic reconciliation → authorized provider outreach.”

## State behavior

The visual progression maps directly to existing `CaseStatus` values.

- `DETECTED`: payment visible; receipt is not yet populated; primary action starts investigation.
- `FETCHING_RECORDS`, `REQUESTING_BILL`, `WAITING_FOR_BILL`, `ANALYZING`: progress ribbon and current source update; waiting copy states that the synthetic statement is pending.
- `REVIEW_REQUIRED`: the questioned receipt line receives the coral marker; evidence interpretation and authorization action become primary.
- `CONTACTING_PROVIDER`, `WAITING_FOR_PROVIDER`: authorization is recorded and provider response is pending.
- `RESOLVED`, `USER_NOTIFIED`: the receipt shows the removed line and corrected total; the provider-confirmed result is the dominant conclusion.
- `FAILED`: a specific inline error explains which action failed and leaves retry/navigation controls available.

The interface must continue distinguishing missing evidence from a confirmed billing error. Savings appear only when `resolution.adjustment` exists after provider confirmation.

## Components

The existing client components remain the integration points, but their presentation is decomposed into focused units:

- `AppHeader`: identity, demo status, and case context.
- `ReceiptTrace`: transaction or bill summary, line selection, current finding states, and final corrected total.
- `WorkflowRibbon`: maps the case status to the four-act demo story.
- `EvidenceWorkspace`: selected finding, clinical evidence, interpretation, and financial-review limitations.
- `DecisionPanel`: explicit provider-contact authorization with clear scope.
- `OutcomePanel`: confirmed correction and plain-language summary.
- `SystemView`: audit entries, timeline, communication transcripts, and provider-boundary labels.
- `CaseArchive`: secondary list of existing investigations.

Components receive structured case data and callbacks. They do not duplicate orchestration or infer new financial conclusions.

## Data flow

The existing APIs remain authoritative. The dashboard fetches cases and starts the idempotent transaction scan. The case workspace loads a case, starts investigation through `/run`, polls `/analyze` only while waiting for the bill, requests review with explicit `{ authorized: true }`, and renders the returned case state.

Selection, Story/System view, and disclosure state remain local UI state. No new persisted fields are required.

## Motion and accessibility

- Use one page-entry receipt animation and purposeful state transitions only.
- Respect `prefers-reduced-motion` and render the final state without animation.
- Maintain visible keyboard focus and semantic buttons for charge selection.
- Preserve readable contrast, especially on archive blue and coral surfaces.
- Status is communicated with text and shape in addition to color.
- Responsive behavior is verified at phone, tablet, and desktop widths.

## Error and empty states

Errors remain local to the action that failed and use direct recovery language such as “The itemized statement could not be loaded. Try again.” The interface never replaces error details with vague apologies.

The no-case state explains that a synthetic bank scan will create the University Hospital demonstration case and provides one action. The waiting state explains that the mock statement will arrive automatically.

## Verification

- Preserve all current unit and orchestration tests.
- Run `npm test`, `npm run typecheck`, and `npm run build`.
- Exercise the full UI flow: reset, detect, investigate, wait for statement, inspect the questioned charge, authorize review, and verify the corrected total.
- Confirm the System view matches actual audit entries and communications.
- Check keyboard navigation, focus visibility, reduced motion, and responsive layouts.
- Capture desktop and mobile screenshots for a final visual critique before opening the pull request.

## Delivery

Work will be completed on `codex/receipt-trace-demo` and submitted as a pull request. The PR description will clearly state that the live experience remains a synthetic demonstration and will summarize validation performed.
