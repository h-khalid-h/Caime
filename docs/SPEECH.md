# Speech to text: the decision and what's built

Decided on 2026-10-04 in the expert's chair, for PRD §46 (voice notes transcribed and searchable)
and, later, R52 (recording calls and meetings). The product's rules come first; the provider is a
configuration behind one interface, chosen by a bake-off the owner runs on real clips, because
no benchmark anyone publishes measures what Caime's first users speak: Egyptian and Gulf Arabic,
mixed with English mid-sentence, on a phone's microphone.

## What Caime needs from a provider

1. **Arabic as spoken, not as written.** Dialects (Egyptian, Gulf, Levantine) and code-switching
   with English inside one sentence ("هبعتلك الـ invoice بكرة"). Most engines were trained on
   Modern Standard Arabic and news; the gap to a clinic's receptionist is the whole question.
2. **A sentence of audio, batch.** A voice note is ten seconds to a few minutes; a call
   recording (R52) is longer and wants speaker turns. Live transcription isn't needed.
3. **Terms a clinic's lawyer accepts.** No training on the audio, a data processing agreement,
   deletion after the answer (zero retention) and, where offered, processing in the EU; the
   provider is a sub-processor named on the privacy page and in the DPA (`processors.ts`).
4. **One HTTP call over fetch**, as Stripe and S3 are done here: no SDK, one deadline, failures
   as the AI runner already knows them (busy, declined, unavailable).
5. **Price that an allowance can carry.** A voice note counts as one AI assist against the
   person's day (Personal 10, Pro 200): at $0.006 a minute a thousand half-minute notes a day
   cost about $3, so the allowance, not the price, is the budget (docs/RESOURCES.md).

## The candidates

| Provider | Arabic | Turns | Terms | Call | Price (per audio minute) |
| --- | --- | --- | --- | --- | --- |
| **OpenAI** `gpt-4o-transcribe` (`gpt-4o-mini-transcribe` cheaper) | Strong multilingual single model, code-switching handled inside the model, dialects fair | A separate diarizing model | API audio isn't used for training; zero data retention and EU residency on request | `POST /v1/audio/transcriptions`, multipart, `text` back | ~$0.006 ($0.003 mini) |
| **ElevenLabs** Scribe (`scribe_v1`) | Published as leading on FLEURS and Common Voice Arabic; code-switching good | Built in (up to 32 speakers), word timestamps | A DPA on request; retention terms to confirm for the plan bought | `POST /v1/speech-to-text`, multipart, `text` and `language_code` back | ~$0.0067 |
| Microsoft Azure AI Speech | Explicit dialect locales (`ar-EG`, `ar-SA`, `ar-AE`, `ar-LB`, …), the broadest; weaker across a language switch mid-sentence | Built in | Microsoft's DPA, EU regions | Fast transcription REST, multipart | ~$0.017 |
| Google Chirp (Speech-to-Text v2) | Arabic with dialect locales, good | Built in | Google Cloud's DPA, EU regions | Client-library shaped; REST possible | ~$0.016 |
| Deepgram Nova-3 | No Arabic in the multilingual model | — | — | — | — |
| Whisper large-v3 hosted (Groq) | Fair on MSA, weaker on dialect, hallucinates in silence | None | Groq's terms | Multipart | ~$0.002 |

## The decision

- **The interface first** (`apps/server/src/lib/speech.ts`): `SpeechToText.transcribe(audio) →
  { text, language }`, a provider chosen by `SPEECH_PROVIDER`, a key in `SPEECH_API_KEY`, the
  model in `SPEECH_MODEL` (each provider's default otherwise), another endpoint in
  `SPEECH_BASE_URL` for a gateway or a stand-in. Switching providers is a configuration change,
  not a code change, so the bake-off's answer costs nothing to apply.
- **The first provider is OpenAI's `gpt-4o-transcribe`**: the clearest terms for a processor in
  the EU handling a clinic's audio (no training by default, zero retention and EU residency
  available), one multipart call, strong Arabic, a vendor Caime's lawyer already has on the
  list's shape (Anthropic is there for the same reasons). **The challenger is ElevenLabs Scribe**,
  with the stronger published Arabic numbers and speaker turns built in, which R52 will want.
  Azure is the third candidate, for a customer that insists on Microsoft's paper or on a dialect
  locale, and it is not written until one does. Deepgram is out (no Arabic); hosted Whisper is
  out for voice notes (silence becomes words).
- **The owner's bake-off decides between the two** (R52 says so, and it's right):
  `node scripts/speech-bakeoff.mjs <folder>` runs every clip in a folder through every provider
  that has a key in the environment and prints the word error rate against each clip's reference
  transcript (`<clip>.txt`), with Arabic normalized the way a reader hears it (tashkeel removed,
  alef and ya and ta marbuta unified). Fifty clips of the kind a clinic gets, recorded on phones
  by people from Cairo, Riyadh and Beirut, half with English inside, is enough to choose. Until
  it has run, the roadmap keeps the item ⛔ and production has no key.
- **Voice notes before recordings.** A voice note is the sender's own words, already stored by
  Caime (not private), sent for transcription only when the sender has AI assist on (an adult,
  within the day's allowance, one assist per note), never longer than ten minutes, never from a
  private conversation. The transcript is the message's `body`: searched, previewed, exported
  and erased exactly as written words are, and shown under the note to everyone in the
  conversation, labelled as Caime's. Recording a call (R52) waits for the consent flow and
  monthly minute allowances, and it will use this same interface.

## What's built

- Server: `lib/speech.ts` (the interface, OpenAI and ElevenLabs adapters), `lib/transcribe.ts`
  (the `speech.transcribe` job: queued by `afterMessage` for a voice note, checks the sender and
  the note, reads the audio from wherever files live, runs through `runAi` with the provider
  recorded on the `ai_runs` row, writes the body and `payload.transcript = { language, by, at }`,
  tells the conversation with `message.updated`), the processors list entry
  (`processors.ts`, named by the provider when configured), the privacy page's sentence, the
  DPA draft's row. `test/speech.test.ts` runs a stand-in: the audio alone goes, the words come
  back as the body and are searchable, AI assist off means nothing is sent, silence is nothing
  kept, a long note isn't sent, busy is retried.
- App: a voice note is recorded in the composer (expo-audio on every platform), uploaded with its
  length, sent as `kind: voice`; the bubble plays it and shows the transcript under it labelled
  "Transcript · Suggested by Cai" when it has come.
- Not yet: the key on production (the bake-off first), speaker turns, R52.
