# Cai leads, in every mode and every scope — 2026-10-25

The owner, 2026-10-25: "Caime's AI now is capable of chatting, talking, listening, watching,
acting, interacting… Deep dive into the entire Caime's intelligence and ensure it's optimal and
outperforms its alternatives, fully integrated, consistent, aligned, organized and effective for
its users. Also Caime itself shall be running by its intelligence led by Cai. Same for each
person or organization using Caime, intelligence led by Cai for their own scope, like Caime do.
Caime never went into real production, so a great chance to build properly once."

This reads the intelligence as it stands at `118686a` (M17 I1–I5, I7 and I13 done) against that
ask, decides what it means, and puts the plan into the roadmap as M17 I14 and I15. It builds on
REVIEW-2026-10-21-INTELLIGENCE (the engine) and R110 (what Cai may do); it changes neither.

## 1. What "led by Cai" means, decided

**One intelligence, scoped.** Cai is not a feature on some screens: it is the one engine every
intelligent thing in Caime goes through (the rules first, `runAi` for the rest, cited passages,
suggestions that become facts only on a tap, R12), and it works *for* someone, inside what that
someone may see. A scope is three things: whose facts it reads, who reads what it says, and what
it may do on their tap.

| Scope | Whose facts | Who hears Cai | What Cai does on a tap |
| --- | --- | --- | --- |
| A person | their own: their conversations as they read them, actions, cards, calendars | them alone, in their Cai chat, in a call, on Attention | keeps their things (said with Undo); prepares what reaches anyone else (R110) |
| An organization | its business inbox as its managers see it, its catalog, cards, agent, numbers; never a team member's own conversations | its owner and admins (R87), each in their own Cai chat and brief; its customers meet its agent | the team's things on a manager's tap; the agent answers customers inside its rules (G6, I1) |
| Caime itself | the platform's own state: providers, jobs, backups, the audit chain, moderation queues, sign-ups, activation, AI spend, its own support inbox; never anyone's content | the product organization's owner and admins (its domain is `PUBLIC_URL`'s, #244), exactly as any organization's managers hear about theirs | read and tell now; acting as the operator stays behind the operator's token until a re-authenticated way exists (§4) |

"Like Caime does" is then literal: Caime is one organization among them (@caime, verified by
cai.me), run by the same organization brief and the same organization answers, plus the platform
lines only the product organization has. Nothing is built twice for it.

**The capacities are the same in every scope:** know (read the scope's facts, by the rules),
watch (notice what changed and what's owed), tell (a brief, an answer, a nudge, in the reader's
language and Arabic), answer (rules first, the model with cited passages), act (only on a tap,
R110), learn (only from what someone accepted, R12, M11), and prove (counts on `/metrics`, golden
sets, `ai_runs` priced).

## 2. The modes, as they stand

| Mode | Where it works today | Where it doesn't | Alternatives (Oct 2026) |
| --- | --- | --- | --- |
| Chatting | Cai's chat: rules for greetings, help, one's own open things, one person, free time, keep, act, move, missed; the model with search's passages and `keep`/`act` | none of note | ChatGPT, Gemini, Meta AI in WhatsApp |
| Listening | a voice note's words in any chat (G8); a call's notes (F7, I13a); Interact in a call (I13g) | **Cai's own chat refuses a voice note** (`messages.ts`: "Cai reads words and stickers") and the composer hides the microphone there | Meta AI and ChatGPT in WhatsApp take a voice note and answer it |
| Talking | Interact in a call (TTS, I13g) | **never outside a call**: an answer in Cai's chat is words only | ChatGPT's and Gemini's voice answers; Meta AI replies by voice to a voice note |
| Watching | a shared screen's frames in a recorded call (I13h); Interact looks when asked | **Cai's chat refuses a photo**; a receipt, a flyer, a prescription or a screenshot can't be asked about or kept | every assistant above reads a photo |
| Acting | keep (G13), message, call, meeting, find (G14), move (I7b), follow-ups (R68), the agent's cards (I1c) | nothing for an organization's managers through Cai | Gemini and Copilot act inside their own suites only |
| Interacting | a call (I13g) | the chat, by voice (this plan) | ChatGPT voice mode |
| Running a scope | a person's brief (R68), digest (R68), Attention (R66); a manager's lines in the weekly digest (R87) | **no daily word for an organization**, no answer to "how is the clinic doing", nothing at all for Caime's own operations | none combine a person's, a team's and the platform's in one assistant |

The verdict: the engine is ahead (rules in four languages and four Arabic varieties, R12, priced,
cited); the gaps are the front doors. A person on a phone speaks or shows a photo to an assistant
before they type to it, and Cai's chat turns both away. An organization's owner gets numbers on a
setup screen and nothing that tells them what needs them today. Caime's operators read
`/metrics` with a token.

## 3. What gets built (M17 I14, I15)

**I14 — Cai hears, sees and answers aloud in its chat (absorbs I11's first half).**

- **I14a. A voice note to Cai is heard and answered** (S–M). Cai's chat takes voice notes (the
  composer's microphone shows there); the note is heard by the one transcription path (G8:
  `queueTranscription`, the sender's AI assist, an adult, their allowance, ten minutes at most),
  and `afterTranscript` answers it in Cai's chat (or a friend's) exactly as typed words are
  (`queueSystemReply`, the reply job reading the note's words). A note that can't be heard (no
  speech provider, assist off, under 18, too long) is answered with why, by the rules, never
  silently. When the person spoke, Cai's answer comes back spoken too: its words through the one
  voice path (`ctx.tts`, `runAi('speak')` on their allowance, `forgetLater`), kept as Cai's own
  voice note in the chat (a file of Cai's, counted on nobody's storage) under the same words, so
  it reads and plays. Only answers short enough to say (`SPOKEN_REPLY_MAX` characters; a list is
  read, not recited), never a minor's, never without a voice configured. "Read it to me" asks for
  the last answer aloud.
- **I14b. A photo to Cai is seen** (M). Cai's chat takes a photo (one, with words or without);
  the light model reads its preview (the 1280-px rendition, never the original) with the words
  and what's open, through `caiChat`'s answer shape (`reply`, `keep`, `act`), so "remind me to
  pay this" on a bill keeps an action with the bill's amount and due day, a flyer's date becomes
  a meeting offered, a screenshot of an address is a place. For whoever may use the model (an
  adult, assist on, the allowance); otherwise said why. Nothing from a private conversation ever
  reaches it (the chat is Cai's). Priced per image on `ai_runs`.
- **I14c** (later). A file (PDF, Office) read the same way, after I12 indexes their text.

**I15 — Cai runs each scope, as it runs Caime.**

- **I15a. An organization's day, told and answered** (M). For each organization someone runs
  (`MANAGING_ROLES`, `ORGS_SHOWN`), the morning brief carries its day by the rules, counts and
  times only (R87): today's bookings (how many, the first's time), customers waiting on the team
  (how many, the longest wait), what the agent left for the team (drafts to review, questions it
  couldn't answer this week), orders open, stock run out, and Pay cards and invoices past due.
  Cai answers "how is <org> doing", "what's waiting at <org>", "<org> today/this week" (core
  `chatOrg`, every interface language, golden lines with near misses) from the same reader
  (`orgDay`, `lib/org-day.ts`), naming which organization when there are several and asking
  which when the words don't say. One reader for the brief, the answer and the digest's lines
  (`teamWeeks` reads it).
- **I15b. Caime's own day, for its operators** (M). The product organization (the one whose
  verified domain is `PUBLIC_URL`'s name, `productDomain`) has, beside its organization lines,
  the platform's: providers down (by name), dead jobs, what waits on moderation, the last
  backup's age and whether it was copied off the host, the audit chain's last check, sign-ups and
  first conversations since yesterday, AI spend today against the day's budgets, the version
  answering. Read from what the gauges already keep (`syncGauges`, `server_settings`) and one
  round of counts; never a person's content, name or address. Its owner and admins hear it in
  their brief and ask "how is Caime doing" as they ask about any organization. Acting stays with
  the operator's token (§4).
- **I15c** = I8 (the organization's agent learns and proves), whose numbers the organization's
  answers then read: resolved by the agent, hand-overs by reason, cost per conversation.

## 4. What is decided against, and why

- **Operator actions from a session, now.** Letting the product organization's admins retry a
  job, suspend someone or decide a report from Cai's chat would make a session an operator. The
  domain proof that gives them @caime is strong, but the operator's routes act on everyone's
  accounts; that needs a re-authentication at the moment of acting (a passkey assertion) and an
  audit row naming the person, which is its own slice (I15d, not started). Until then Cai tells,
  and the operator acts with the token, as today.
- **A spoken answer for everything.** Speaking every answer would spend the voice provider on
  words nobody listens to (convention 14). Cai speaks when it was spoken to, or asked to read.
- **The original photo to the model.** The preview rendition is what a person sees; it bounds
  the tokens (a 1280-px picture is about 1,600 input tokens on the 5.x models) and keeps the
  metadata stripped twice over.
- **A second assistant for organizations.** An organization's managers talk to the same Cai in
  the same chat; the organization is a scope Cai reads for them, never another account to open.

## 5. Order and measure

I14a, then I15a, then I15b, then I14b, then I8 (I15c), each its own gate and push. Each says its
number: I14a the share of Cai's answers given to a voice note (`caime_cai_answers_total{via}`);
I15 the briefs carrying an organization's or the platform's lines
(`caime_cai_briefs_total{scope}`); I14b the photos read (`caime_ai_runs_total{feature="cai_photo"}`)
and their price in RESOURCES.

## 6. The council on I15 (the first council pass, `.claude/skills/council/`)

**Seats.** The Architect proposed §3's I15. The Specialist called: an operator of an assistant for
small-business owners who also ran the pager behind its platform. The Newcomer: a clinic owner
between patients, on a phone, who has never typed a question to Cai.

**Turning points.**

1. *Adversary, fatal: the main door is closed.* The morning brief is off by default (`caiBrief`
   is null unless set in Settings · Cai, `schemas.ts:930`); an organization "run by Cai" through
   a message nobody turned on is run by no one. *Moved:* the day is answered on ask from the first
   day ("how is the clinic doing", core `chatOrg`, golden lines in four languages), the first
   answer offers the brief once while it's off, and what can't wait is told unasked (point 4).
2. *Adversary, fatal: numbers that disagree with the inbox.* An agent's message never moves a
   thread (`business.ts:352`), so a thread the AI agent answered stays in "Needs a reply"; the
   digest's "customers waiting on the team" counted those as waiting. An owner told "7 waiting"
   who finds the agent answered 6 stops trusting Cai, or the agent. *Moved:* Cai's lines are the
   Business inbox's own views by their own labels (core `customerWaiting`), say how many of them
   the AI agent answered last (`agent_seq`), and end with the link to that view, so the number Cai
   says is the number the tap shows.
3. *Newcomer: "a draft from the agent to review" means nothing to me.* *Moved:* every line is
   what to do, in the owner's words ("answers the AI agent wrote, waiting for you to send";
   "questions the AI agent couldn't answer this week: teach it in its setup"), and an
   organization's block ends where it's done.
4. *Specialist, first principles: Cai adds nothing by counting what the inbox already counts; it
   adds by noticing what slips and by joining what's apart* (bookings today, the agent's gaps,
   orders, across every organization someone runs). *Second-order:* a tell for every message is
   noise within a week, so the one unasked tell is the one nobody acted on (a customer in "Needs a
   reply" past the organization's reply target during its open hours, nobody assigned), once a
   thread, under Cai's initiative setting (R66: "Less" turns it off), counted. Built after the
   answer, as I15a2.
5. *Adversary: "Caime run by Cai" is a status report.* *Specialist:* before launch the owner is the
   operator and has no pager; the gauges' alerts reach nobody. A tell to the product organization's
   owner and admins when a platform condition crosses (a provider down on two probes in a row, the
   last backup older than a day or not copied off the host, the audit chain failing, new dead jobs,
   a child-safety report waiting) and again when it clears is the cheapest real pager Caime can
   have. *Second-order:* once per condition until it clears, never on a blip; counts only, never a
   person (the chat is read back by Cai's model later); a gauge that can't be read is said as
   unread, never left out, since silence reads as healthy; "retry that job" is answered with where
   it's done (the operator's token), never pretended.
6. *Adversary: least privilege for the platform's lines.* *Accepted out loud:* they go to the
   product organization's owner and admins, as R87 already gives them its organization; they are
   counts, and acting stays with the operator's token (§4).

**The Conductor's decision.** Build the organization's day as an answer first and a tell second,
every number the inbox's own; then Caime's own day as a pager that clears, for the organization
that is Caime.

1. *I15a, now:* `lib/org-day.ts` reads, for the organizations someone runs (`ORGS_TOLD`, and "and N
   more"), today's bookings on the organization's clock, "Needs a reply" by core `customerWaiting`
   with how many the agent answered last and the longest wait, the agent's unsent answers and
   unanswered questions, orders open, in one round of queries; core `chatOrg` sends "how is
   <org> doing" to it (golden set); the brief carries the same lines when it's on; the answer
   ends with the inbox's link and offers the brief once while it's off. Done when
   `cai-org.test.ts` holds the numbers equal to the inbox's views and the golden set passes.
2. *I15a2, next:* the slipping tell (point 4), with `caime_cai_tells_total{scope,kind}`.
3. *I15b:* Caime's day on ask and in the brief for the product organization, and the crossing tells
   (point 5) from the periodic tasks that already watch each condition, with their clearing.
4. *Decided against:* an "At <org> today" block on Attention now (the first download is 449.7 of
   450 KB; it comes when the block can load apart), operator actions from a session (§4), and a
   tell for every customer message (the team is already told; noise).
5. *Open risks:* an owner who never asks and keeps the brief off sees only the tells (watched by
   how many organizations' owners ask in their first week); a reply target an organization never
   set (the tell uses the plan's default and says so).
6. *The number:* the share of organizations whose owner or an admin hears from Cai about it in
   their first week (an answer or a tell), on `caime_cai_tells_total` and the chat's answers.
