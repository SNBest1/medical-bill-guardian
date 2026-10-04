# Conversational iMessage branch

Branch: `codex/conversational-imessage`. This checkout is isolated from the running main demo. Do not merge or deploy until the conversation checks below are accepted.

Enable with `PHOTON_CONVERSATIONAL=true` in the server's environment. Existing `OPENAI_API_KEY` and `OPENAI_MODEL` power general conversation through the Responses API. The model has no action tools. Without a key, balance/history questions and deterministic bill commands work; open-ended conversation explains that setup is missing. Messages use `store:false`; the local SQLite database retains only the latest twenty conversation turns. This demo database is unencrypted: use synthetic conversations, not real patient data. Recent turns and a limited synthetic case-fact snapshot go to OpenAI for general chat.

Nessie questions use `NESSIE_SANDBOX_DISCOVERY=true` and the existing sandbox account setup. They read the same history calculation as the website. They explicitly distinguish the calculated demo balance from Nessie's reported balance, exclude pending refunds, and never silently substitute a fixture balance on a failed Nessie read. Without Nessie configured, replies label fixture balances as fictional and disconnected.

## Acceptance checks

- “Hi, can we talk about dinner?” → conversational response; no case created.
- “What is my Nessie balance?” → selected account, or asks which patient.
- Respond “Morgan” to the account question → balance, not an investigation.
- “Show my transactions” → same account, read-only recent history.
- “What about Harriet's balance?” → Harriet's account, without switching the active bill.
- “Why does Nessie report $15,000?” → distinguish raw reported versus calculated balance.
- “Investigate Morgan's bill” → existing explicit investigation flow and consent gate.
- “What am I approving?” → explain pending action.
- After unrelated chat, “yes” → restate proposal first, no immediate call.
- Approve the restated proposal → one existing controlled action; redelivery does not repeat it.
- Provider offline → clear failure, no invented balance or duplicate credit.

Start testing using the documented demo runtime only after deciding to switch the local backend to this branch. Use a separate database and separate approved test recipient for a fully isolated live test; do not run two receivers against the same iMessage account. Existing main backend was not changed by this branch. No live messages or bank writes are used in automated tests.

Known limits: no live web browsing; commands and external-action approvals remain explicitly controlled, not free-form model actions. Unfamiliar action wording may need clarification. Feature off preserves the original command handler.
