# Voice rehearsal (ElevenLabs agent + Twilio number)

The demo places one outbound call to the approved synthetic hospital phone. A teammate answers and plays the billing desk. No real hospital or patient data is used.

## Configuration

Add these to `.env.local` (never commit them):

- `ELEVENLABS_API_KEY`: the ElevenLabs API key.
- `ELEVENLABS_AGENT_ID`: the conversational agent that speaks the script.
- `ELEVENLABS_AGENT_PHONE_NUMBER_ID`: the phone number ID from the ElevenLabs phone-number settings, backed by a Twilio number.
- `DEMO_HOSPITAL_PHONE`: the approved E.164 number of the teammate's phone.

The voice adapter fails closed if any key is missing.

## Guardrails

- Only `University Hospital` is a valid target (`src/services/voice/approved-target.ts`).
- `placeOutboundCall` refuses to dial unless the caller passes `dialAuthorized: true`. No code path sets it by default.
- A call that connects is not a result. `classifyCallOutcome` (`src/services/voice/outcome.ts`) marks a call confirmed only when a billing-side turn says the seven hundred dollar charge will be removed.
- Browser speech (`VoiceCall.tsx`) remains the fallback when the call fails.

## Rehearsal checklist

1. Confirm the ElevenLabs agent prompt matches the script in `src/services/communications/demo-call.ts`.
2. Confirm `DEMO_HOSPITAL_PHONE` is the teammate's phone and that they know to answer as the billing desk.
3. Get explicit authorization from the project owner for each dial.
4. Run the call. Note the time to the first agent word, whether both sides heard audio, and whether it ended within 90 seconds.
5. Confirm the recorded outcome matches the transcript.
6. Repeat five times. Each run must be authorized separately.

## Open items

- The outbound-call request shape comes from ElevenLabs' API reference. Verify it against the live response on the first authorized rehearsal, since the auth header (`xi-api-key`) was not explicitly listed on the page we read.
- The webhook that receives the call transcript is not built yet. Until it is, outcomes must be recorded manually after review.
- The 90-second limit must be set on the agent or enforced by the app. Confirm which before the first rehearsal.
