# Caime's intelligence, deeper and wider — 2026-10-21

The owner, 2026-10-21: "Remember to ensure that entire Caime intelligence is properly optimal and
outperform its alternatives. Go deeper and wider", after "ensure no fragmentation, duplication or
confusion across the entire Caime intelligence" (R112). Five slices read the code end to end at
`6682714`, each against what the best alternatives do in October 2026: what Caime reads in
people's words; Cai and the friends; finding and condensing (search, Ask Cai, catch-up, the brief,
call notes, transcripts); the organization's agent; and the one intelligence under them all
(architecture, cost, evaluation). Every finding below names its file and line; the ones marked
**verified** were read again by hand before they were written here. Competitors' features are as
their own pages and the press said them, linked at the end; what wasn't re-checked says so.
Caime hasn't launched: nobody has met any of what follows, so every finding is what people would
meet at launch, and every fix lands before anyone does.

## 0. The verdict

**Where Caime is ahead, and why it holds.** Its intelligence starts from the relationship, not
the message: a promise is *yours* or *theirs*, a card is filed for the person it's for, an
organization's team is masked, nothing is filed for a stranger, and when to chase someone comes
from what they are to you (R66, the policy engine). It reads people's words by rules first, in
four languages and four Arabic varieties, measured per language and per variety in CI, on the
writer's own clock, week and currency; Gmail's AI Inbox and WhatsApp's summaries launched in US
English first. Nothing it infers is a fact until accepted (R12), every suggestion says how sure
it is in words with a quote and an Undo, private conversations are never read by the server, and
every model call is priced and held to a person's day in euros (R107). No alternative combines
those, and none of them is a feature a rival adds in a quarter: they are how Caime was built.

**Where Caime is behind.** The alternatives converged in 2025–26 on four things people now expect,
and Caime has the parts but not the whole of each:

1. *"What did I miss"*: WhatsApp summarises unread chats, Slack recaps channels, Copilot and Meet
   recap meetings. Caime catches up one conversation at a time, on ask, from its newest 200
   messages, and says nothing of what it left out.
2. *One cited answer*: Slack and Gemini answer a question across everything with sources. Caime
   has that in Search (Ask Cai, cited), but Cai's own chat refuses "what did Sarah say about the
   contract", the conversation's "Ask" doesn't cite, and Arabic search misses "أحمد" for "احمد"
   because nothing is folded.
3. *Loops that close*: Superhuman reminds when a reply is owed; Gmail lists to-dos across mail.
   Caime finds promises better than either, then reminds at the deadline or, for an undated
   "remind me", never; it never notices a promise kept.
4. *An agent a business can measure*: Fin publishes resolution rates and lets a team simulate
   before going live; Meta's agent books inside WhatsApp worldwide since June 2026. Caime's agent
   is careful, but as built it would tell a customer something the card beside it contradicts,
   and its owner would see no resolution rate.

**And two bugs to fix before launch** (both verified): the organization's agent records its model
calls without their cost, so its plan's € backstop would never trip (a Business organization would
be held only by its 2,000 answers a day, a bound of about €14,000 a month; RESOURCES' own pre-G9
figure, never spent, since no organization uses it yet); and five AI paths answer in the account's
sign-up locale instead of the language the person chose, so someone who switched Caime to Arabic
would get English catch-ups and briefs.

**The three things that would make people switch for it.** (1) *Nothing slips*: what anyone
promised or asked, in any of the four languages, found, reminded before it's due, noticed when
it's done, and recapped across chats and calls, per relationship. (2) *Ask anything, in your
language, with sources*: one answer engine over messages, calls and files, Arabic as people
write it. (3) *An agent a clinic can sign for*: one that never says what isn't so, is never
silent, and shows its owner what it resolved. The plan in §7 builds those, after the two bugs.

## 1. What Caime reads in people's words

**Inventory.** `analyzeMessage` (core `intelligence.ts:794-979`) reads each sentence: French or
Turkish where `latin-language.ts` says so, Arabic by script with lists for Standard, Cairo, the
Gulf, the Levant and the Maghreb. A promise of mine is a reminder, theirs a wait (0.9 dated,
0.75 not); a request of theirs a task, mine a wait (0.7); a decision 0.8; a question marks Needs
you. Dates come from `when.ts` on the writer's clock and week. Amounts, links, emails and refs go
into `entities` only. Read on send, edit, a voice note's words, inbound mail and a customer's
messages; never in a private conversation, a stranger's request, a notice, a forward or a quote.
The model reads words only on ask ("Find follow-ups", call notes) at a flat 0.8.

**Measured.** The golden set is 465 lines (en 112, ar 107, fr 125, tr 121), at least a third
negatives, floors of 1.0 per label and language; the rules were fixed against those lines, so it
holds regressions, not generalisation. The held-out Arabic set (156 lines, 39 a variety) is the
honest number: Levantine decisions 0.66 recall is the weakest; promise precision 0.87 in Cairo,
the Gulf and the Levant; due days 1.0 everywhere. With six positives a label, one line moves a
floor about 0.17. Sureness ("Quite sure" right nine in ten, "Fairly sure" three in four) holds on
the recipient's kinds (124/124, 181/185); reminders, one's own requests (0.7) and the model's 0.8
are unmeasured. No held-out set for English, French or Turkish; card titles unmeasured;
production keeps one pooled acceptance rate.

**Gaps.**
- *Indirect asks*: "Any chance you could…", "Do you have the report?", "Any update?".
- *Time*: "every Monday" is one date (`when.ts:505`); "before the meeting" has none, though Caime
  holds the meeting's card; Eid, Ramadan and Bayram aren't read.
- *One of each*: one promise, one request and one decision a message; "…and book the venue" is
  cut off (`intelligence.ts:590-591, 838-889`).
- *Groups*: a promise or an ask that names nobody files nothing for anyone; my own ask in a group
  gets no wait (`message-effects.ts:1047-1095`).
- *Mail*: only ">" quotes are masked, so an Outlook-quoted old promise reads as the sender's;
  "Please let me know if you have any questions" becomes a task and marks Needs you; the golden
  set has no mail lines.
- *Convention 17*: topics are an English-only pattern (`intelligence.ts:811-817`); Arabic
  reported speech ("قالي هبعتلك الفلوس ومبعتش") has no guard, where Turkish has one; Arabizi isn't
  read at all.
- *Timing* (**verified**): accepting an undated "I'll send it" as a reminder sets no reminder time,
  so it never reminds, and a dated one reminds at the due moment, never before
  (`modules/suggestions.ts:396`). Waits never nudge at their promised date; Attention's "still
  waiting?" counts from when the task was made, not when it was due (`modules/actions.ts:230-236`).
  An edit keeps the pending card's old date and title (same fingerprint, `suggest.ts:131`); pending
  cards never expire; nothing notices a promise kept.
- *Shown five times*: one ask can make the wait card, the "No reply from X yet" push
  (`workers.ts:99-109`), the inbox's follow-up state, Attention's ask and Cai's follow-up offer
  (`cai.ts:206-257`); none looks at the others, or at whether the thing arrived.

## 2. Cai and the friends

**Inventory.** Rules answer small talk, your own open things and the four questions about one
person (G11) with no model; the model takes the rest for an adult with assist on (`caiChat`:
`{reply, keep, act}`, 1,024 tokens; `friendChat`, 512). Cai keeps what it's asked to (G13) and
prepares what reaches others for a tap (G14, R110). Unasked: the morning brief and the weekly
digest (rules, opt-in), the R68 follow-up offers, all held by `caiInitiative`.

**What its model sees**: the last 12 messages of its own chat, no times; at most five lines of
each kind of open thing; five items coming up in a week, presented as all of them
(`system-accounts.ts:1239`). Not other conversations, decisions, payments, calendars or memory.

**Many intelligences, not one.**
- *Language* (**verified**): Settings saves `preferences.language`; the catch-up, ask, translate's
  default, the call notes' catch-up and the brief read `users.locale` (`modules/ai.ts:237,260,289`,
  `call-notes-ai.ts:96`, `briefs.ts:474`), while Cai's chat reads `readerOf`, chosen language
  first (`i18n.ts:214`). One person, two languages from one Cai.
- *Labels* (**verified**): the brief's summary is headed "AI summary" (`briefs.ts:48`), drawn as
  it is (`BriefSheet.tsx:72`, no `tr`, in no catalog), where every other model answer says
  "Suggested by Cai"; meanwhile every line in Cai's chat, rule answers and the digest included,
  reads "AI agent ·".
- *Gender* (R81): the model is told it; Cai's rule lines aren't (`inLanguage` without it, no
  `toWoman` forms in the server's catalogs).
- *"Ask Cai"* is two things: on Attention it opens the chat; from a place it opens Search's cited
  answer. In the chat "find" is a button to Search, not an answer.
- *Four transcript windows* (12 messages, 200, 40, 24,000 characters), three builders of "what's
  open with X" (`aboutAnswer`, `briefFor`, memory), two no-reply paths (the policy's
  `follow_up_check` and R68).

**Gaps against 2026 assistants**: "when am I free Thursday" (no rule; `busyElsewhere` unused; a
meeting Cai prepares never checks a clash); "move my 3pm to tomorrow" (no such act); "what did
Sarah say about the contract" (refused in chat); "remind me if Omar doesn't reply by Friday"
(the "if" drops it, `chat-save.ts:78`); "what did I miss today"; a reply drafted inside a
conversation; voice to Cai (refused, the mic hidden); what Cai should remember about you;
scheduled asks. Misreads traced by hand: "find a good restaurant near me" and "where are you?"
become a conversation search (`chat-act.ts:66`); "help me write a reply" gets the canned help.

**Quality.** R110 holds: what reaches someone else goes through `postAs` as the person, once, on
their tap. Cai is told never to claim it did something; nothing checks it. A crash in the reply
job is silence (`maxAttempts: 1`); there's no typing indicator; latency isn't measured.

## 3. Finding and condensing

**Inventory.** Search by rules in four languages (prefix-AND over `search_all`, newest first, 50
a kind); the model reads a query only when the rules read nothing and the typing has settled;
Ask Cai answers from `runSearch`'s own rows with up to six checked citations, no rows no model
(€0.0032); catch-up and ask read the newest 200 messages (€0.0072); translate one message; the
brief before a meeting (rules plus a 40-message summary); F7d and F7e on a call's notes; voice
notes heard into the body, so search reads them. The digest, the morning brief and Cai's "what
did X and I agree" are rules alone.

**Duplicated**: five prompts where two would do (one catch-up prompt for three features, ASK and
FOUND near-identical, ACTIONS twice, and F7e's notes); five ways of picking a transcript, each with
its limits, one with its own clock; "today" written three ways, the brief's in UTC
(`briefs.ts:475`). One question, two answers: "what did Ana and I agree" gets the recorded
decisions in Cai's chat and, in Ask Cai, only Ana's messages (the person filter drops mine,
`modules/search.ts:285-289`). A call's notes and write-up reach neither search nor Ask Cai.

**Gaps.**
- *Recall*: a time phrase switches the model off and the model's reading drops it
  (`search.ts:854, 913`), so "where did we land on pricing last week" finds nothing; results go by
  date, never relevance.
- *Arabic, French, Turkish spelling* (**verified**): neither the index nor the query folds
  (`'simple'`, migration 0065), so "احمد" misses "أحمد" and "cafe" misses "Café"; people match by
  `ilike` though `people-named.ts` folds; the device's own search folds and the server's doesn't.
- *Files*: contents aren't indexed (Office files are read only to show them); no PDF text or OCR;
  mail over 10,000 characters is kept as an unindexed text file.
- *Recaps*: nothing across chats or spaces; a catch-up drops older unread messages without saying
  so, and its count counts only what it kept (`modules/ai.ts:190`).
- *Grounding*: only Ask Cai and follow-ups cite, and an Ask Cai answer that cites nothing is still
  shown; no evaluation of catch-up, ask, answers or notes.
- *Minors*: an adult's catch-up in a group hands a minor's typed words to the model, while that
  minor's voice notes are never transcribed and notes never run with them present: the rules
  disagree.
- *Cost*: RESOURCES says a conversation asked about twice is cached; only the agent sets
  `cache_control` (`ai.ts:870`). The old `messages.search` column and its GIN index are unread
  since 0065 and still cost every write.

**F7e, reviewed before it ships** (the five points found, each fixed or decided in its commit):
its suggestions skipped Cai's initiative (`asked: true`; now Cai's own initiative, R66) and went
to people with AI assist off (now only to whoever has it on, as F7d's); every deleted line asked
the model again (now the latest ask writes them, `requested_at`); the hour's rate limit or a busy
model ended the notes for good (now they wait); the write-up stays out of a person's export,
which never carries anyone else's words (decided, not a gap). One language per call stays (R112).

## 4. The organization's agent

**Inventory.** A customer's message queues `agent.reply` three seconds out; it answers when no
person holds the thread, always or only while closed, never to someone under 18, within the plan's
answers and its € backstop, and hands over after ten answers or twenty calls in a conversation a
day. It reads 20 messages, its knowledge as numbered sentences (8,000 characters), the catalog
without descriptions, eight slots for the *first* bookable item only, the menu with stock, the date
but never the time, and earlier cards as "Label: Title" with no state. It answers (citations for
the team), hands over (`unknown` kept as a question), resolves, books an offered slot, takes an
order. Review mode drafts; the R87 introduction is written by rules.

**Measured.** A nightly set of 24 cases (13 English, five Egyptian Arabic, three French, three
Turkish) for one clinic, scored by rules; catalog and menu are always null, so booking an item and
ordering are never tested; no floor, alert or CI gate on quality, only a €5-a-night cost ceiling;
no real-model results kept. Not measured: resolution rate (written, `resolved_by`, never read),
time to first answer (only people's), dialect mirroring, cost per conversation.

**What a clinic would find at launch** (**verified**):
- *Words before deeds.* The agent's answer is posted (`agent.ts:644-657`) before the booking or the
  order it describes is made (`carryOut`); when the slot is taken meanwhile it hands over without a
  word to the customer (`agent.ts:774, 796`), so "I've asked the team to confirm it" stands beside
  no card.
- *Who confirms.* The prompt tells the customer the team will confirm (`ai.ts:416`) and setup tells
  the owner "Your team confirms each booking" (`OrgAgent.tsx:347`), but the card the agent posts is
  the organization's, so the customer is the one who taps Confirm. Still open from review
  2026-10-17 §2.
- *Silence.* A failed or declined model call ends with nothing (`agent.ts:215-229`); while the
  agent stays out (a minor, a limit, the budget, a hand-over) the greeting and the away message are
  still held back (`org-replies.ts:203-206`).
- *The bill* (**verified**): `recordRun` writes no `cost_usd` (`agent.ts:149-190`), so `agentSpent`
  (`plans.ts:513`) sums nothing; a manager's "try it" never counts against their own day.

**Against 2026**: Fin's Procedures call a business's own systems and its Simulations test a change
before it goes live; Meta's agent books inside WhatsApp; Lyro imports a website and promises a
refund under 50% resolution; every one of them reports a resolution rate. Caime's agent has the
cleaner rules (it never passes as a person, never confirms, cites what it was told, masks the
team) and none of the proof.

## 5. One intelligence: architecture, cost, evaluation

- *Every model call* goes through `runAi` except the agent's (`askAgent`/`recordRun`), which is how
  its cost went missing. The gate (`aiGate`) is written six more times by hand, two without the rate
  limit and one (`agents.ts:269-272`) checking neither assist nor age.
- *Seven conversation builders*, five on `lib/transcript.ts` and two beside it; prompts restate the
  same rules (what Caime is ×9, content-not-instructions ×9 in three wordings and none in search's,
  "don't guess gender" ×5 and missing from two, the language rule seven ways).
- *Caching*: only the agent caches, and its cached prefix carries the date in the customer's zone
  and the offer's flags (`ai.ts:856-866`), so at a clinic's pace most of its calls write a cache
  nobody reads. *Thinking and fallbacks* (checked against the platform's reference, 2026-10-21):
  the light model has no server-side fallback, so `fallbacks: 'default'` on its calls does nothing
  (a declined request stays declined; the reference says not to send it), and its thinking is on by
  default and counts toward `max_tokens`, so the friend's and search's 512-token caps and Cai's
  1,024 can be spent thinking before any text, which Caime reports as "unavailable".
- *Evaluation*: seven golden sets, all of rules; one model evaluation (the agent's, outside CI);
  `prompt_hash` covers part of each prompt (one rewrite variant, the agent's schema only); no
  acceptance rate for AI suggestions; `claimsDone` exists and runs only at night. Anthropic, Intercom,
  Notion and Slack all describe the same practice: code-graded and model-graded evaluations per
  feature, real transcripts, a change measured before it ships. Caime has the first rung for one
  feature.
- *Cost holds where it's priced*: a person on Free under €20 a month at the edge (€16.60), a free
  organization under €15 (€8.84), Cai €0.0016 a reply, a friend €0.0013, Ask Cai €0.0032. The
  Business agent on the top model is the largest line, and the only one unbounded until the bug is
  fixed. Sonnet 5.5 has never been measured as a middle tier.

## 6. The competitive matrix

✓ has it · ◐ in part · ✗ not found · ? not assessed · — not what it's for. Caime's column is the
code at `6682714` (with F7e and G14); the others are from the sources at the end.

| | Caime | WhatsApp + Meta AI | Gmail / Meet + Gemini | Slack AI | Teams / Outlook + Copilot | Apple Intelligence | Fin / Meta Business Agent |
|---|---|---|---|---|---|---|---|
| Promises and asks found in your words | ✓ four languages, Arabic by variety, mine vs theirs | ✗ | ◐ AI Inbox to-dos (US, paid first) | ◐ in recaps | ◐ in recaps | ◐ reminders from shared Mail text | — |
| Reminded before it's due; loop closed when done | ◐ at the deadline; undated never (I2) | ✗ | ◐ nudges | ? | ? | ◐ | — |
| Follow-up timing by relationship | ✓ policy + learning (R66) | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| "What did I miss" across chats | ✗ one conversation on ask (I3) | ✓ unread summaries (opt-in, US English, 2025) | ✓ | ✓ channel recaps | ✓ | ✓ notification summaries | — |
| Cited answers across everything | ◐ Search only (I4) | ✗ | ✓ | ✓ | ✓ | ✗ | — |
| Arabic as written (folding, dialects) | ◐ rules by variety yes, search no (I5) | ? | ? | ? | ? | ? | ? |
| Meeting notes with next steps by person | ✓ F7e, steps as each one's suggestion | ✗ | ✓ Take notes for me | ✓ huddle notes | ✓ recap | ◐ call summaries | — |
| Assistant that acts, with a tap for anything outward | ✓ R110 (G13, G14) | ? | ◐ scheduled actions | ? | ? | ? | — |
| Calendar-aware assistant | ◐ reads cards, not free time (I7) | ? | ✓ | ? | ✓ | ? | — |
| Business agent that books and orders | ✓ slots and menu, team-masked | — | — | — | — | — | ✓ Meta books in WhatsApp (global, June 2026) |
| Agent tested before going live | ◐ one question (I8) | — | — | — | — | — | ✓ Fin Simulations (April 2026) |
| Resolution rate shown to the owner | ✗ (I8) | — | — | — | — | — | ✓ |
| Inference as suggestion, never a silent fact | ✓ R12, sureness in words, Undo | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Private conversations never read by the server | ✓ R18 | ✓ Private Processing | ✗ | ✗ | ✗ | ✓ on device | — |
| Cost bounded per person, in euros | ✓ R107 (agent: I1) | — | — | — | — | — | per resolution |

Read across: Caime leads every row that is about *people* (whose promise, how sure, when to chase,
what stays private) and trails the rows that are about *volume* (recaps, answers across
everything, proof for a business). The plan closes the second set without giving up the first.

## 7. The plan: M17 in the roadmap

Ranked by what it would cost the first people at launch, then by how far it moves the three
switching reasons; each
names the advantage it sharpens (review 2026-10-17 §14) and the number that shows it.

1. **I1. The two bugs and the agent's honesty (S each, first).** (a) The agent's runs priced as every
   run is, so its backstop trips and a manager's try counts (number: `agentSpent` equals the sum of
   its runs' prices; a test spends a day and is held). (b) Every model path in the reader's chosen
   language, through `readerOf`, with one "today" in the reader's zone; the brief labelled as every
   model answer is, through `tr` (number: a test per entry point that a person who chose Arabic gets
   Arabic). (c) The agent books or orders first and speaks after; a refusal is said in a fixed line;
   who confirms is the same everywhere: the team confirms what the agent books for a customer, as
   it confirms what a visitor books from a page (number: refused-then-silent at zero; wrong
   confirmations at zero on the nightly set). (d) Never silent: the away message or the greeting
   when the agent stays out; a failed call tried once more. (e) The light model's calls leave room
   for thinking within their caps and send no `fallbacks` it doesn't have. Advantage 3 (a clinic
   signs for it).
2. **I2. Nothing slips (M).** A reminder before the deadline (the morning of a dated one, a default
   time for an undated "remind me"); a wait nudged on its promised day and asked about by Attention
   after it, not after its creation; a pending card updated by an edit and let go when stale;
   "Done?" offered when whoever promised sends what was promised ("sent", "تم", "c'est fait",
   "gönderdim", a file, a link), never closed by itself (R12); the five no-reply paths made one.
   Number: the share of waits closed within seven days of their due date; "promise kept" golden lines
   per language. Advantage 1.
3. **I3. What did I miss (M; L with the summary).** The Needs-you conversations since each was last
   read, by the rules (who asked, what was promised, what was decided, what's coming), ranked as
   Attention ranks them, with a cited summary for whoever has assist on, cached by read position; in
   Cai's chat and on Attention; a catch-up past 200 messages says how much it read. Number: recaps
   opened per active person; a cost bound in `ai-costs.test.ts`. Advantages 1 and 2.
4. **I4. One cited answer engine (M).** A question in Cai's chat about people and what they said is
   answered by Search's cited engine, sources shown; "Ask about this conversation" is that engine
   scoped to it; ASK and FOUND one prompt; the model keeps the rules' time phrase; the catch-up and
   the brief cite their lines. Number: the share of answers with a source; "no rows" rate. Advantage 2.
5. **I5. Arabic-first retrieval (M).** A folded expression index built concurrently (hamza and alef
   forms, ة/ه, ى/ي, accents, dotted İ), queries and people folded the same way, relevance blended
   with recency, the dead index dropped in a later release. Number: a retrieval golden set per
   language with its variants, floors that only rise. Advantage 2 and convention 17.
6. **I6. Evaluations for every model path (M–L).** `lib/evals/`, grown from the agent's: follow-ups by
   line, faithfulness of summaries and write-ups (names, dates and numbers must occur in what was
   said), Cai's keep and act, search readings, translations, the agent with a catalog, a menu, moves
   and every Arabic variety; scored by rules first; run nightly through batches and in CI when a
   prompt's hash moves; floors that only rise. Number: each feature's pass rate, as a gauge. All four
   advantages: nothing changes unmeasured.
7. **I7. A calendar-aware Cai (M).** "When am I free Thursday" from the calendar and connected busy
   times; a meeting Cai prepares warns of a clash and offers the next free time; "move my 3pm" as
   F5's suggestion of another time; the coming-up list says its true count. Number: offers sent ÷
   offered; clash warnings on golden lines.
8. **I8. An agent that learns and proves (M).** Catalog descriptions, places and hours as passages;
   slots for the item and day asked; the current time; a customer's own cards with their state;
   "add to what it knows" from a team member's answer to a question it couldn't answer, as a
   suggestion the owner accepts (R12); the owner's numbers (resolved by the agent, hand-overs by
   reason, drafts sent or let go, time to first answer, cost per conversation); a test before saving
   that replays the last ten questions it couldn't answer. Number: `unknown` hand-overs per hundred
   conversations; the owner's resolution rate. Advantage 3.
9. **I9. Words become cards (L).** A plan offers a prefilled Meeting card, money a Pay card, "every
   Monday" a repeat, "before the meeting" that meeting's time; dates, numbers and addresses tappable.
   Number: golden plan and pay lines right per language. Advantage 1.
10. **I10. Groups (M).** Whom a promise or an ask is for, by the names in it (`peopleMeant`), and
    "everyone". Number: who-it's-for accuracy on group golden lines.
11. **I11. Cai by voice, and a reply drafted in a conversation (M each).** Number: voice asks kept
    end to end; drafts sent, edited or discarded.
12. **I12. Calls and files in answers, then meaning (L).** A call's lines and write-up as passages for
    whoever may read them; Office and PDF text indexed at upload; search by meaning only after I5
    shows the gap, with its sub-processor in the DPA and erasure removing vectors.

Order: I1 first, before launch; I2 and I3 next (they are what a person would feel in their first
week); I4 and I5 together (one
engine, one index); I6 alongside from the start, since every later item adds its cases to it; I7
and I8 as the business work allows; I9–I12 after. H8a (a customer calls an organization) and F5c
stay where they are: the first is R111's ground, the second is a page booker's answer by mail.

## 8. What we decline, and why

- **Sending anything to anyone without the person's tap** (an auto-reply drafted by Cai, a follow-up
  sent on a timer): R110. Prepared, yes; sent, never by Cai.
- **A model reading every message by default**: the rules already find what people promise, in four
  languages, for nothing; a model over every message costs every person every day (R107) and reads
  what nobody asked it to. A bounded second reader for what the rules are unsure of, opted into
  through Cai's "More", stays an idea until I6 can measure what it adds.
- **Search by meaning now**: a new processor of everyone's words for a gap not yet measured; I5's
  folded index first.
- **Summaries of private conversations on the server**: never (R18). On the device, later.
- **A write-up per reader's language**: one set of notes in the language of the call, as a
  note-taker writes them; each reader translates on a tap.
- **Ratings of the agent by customers before resolution is measured**: a number nobody can act on;
  the owner's numbers in I8 come first.

Sources: [Gmail AI Inbox](https://www.tomsguide.com/ai/gmails-biggest-update-in-20-years-5-ai-features-that-could-change-email-forever),
[Superhuman reminders](https://help.superhuman.com/hc/en-us/articles/40144492186515),
[Apple reminders from Mail](https://support.apple.com/124025),
[WhatsApp summaries](https://thehackernews.com/2025/06/whatsapp-adds-ai-powered-message.html),
[WhatsApp quick recap](https://www.cxodigitalpulse.com/meta-to-introduce-ai-powered-quick-recap-feature-on-whatsapp-for-summarizing-unread-messages/),
[Slack recaps and answers](https://slack.com/intl/en-gb/help/articles/25076892548883),
[Meet next steps](https://workspaceupdates.googleblog.com/2025/02/google-meet-take-notes-for-me-next-steps.html),
[Teams recap](https://support.microsoft.com/en-US/teams/meetings-events/recap-a-teams-meeting),
[Fin Simulations](https://fin.ai/updates/simulations-for-procedures),
[Meta's business agent](https://www.techcrunch.com/2026/06/03/metas-ai-agent-for-whatsapp-business-is-now-available-globally/),
[Gemini scheduled actions](https://9to5google.com/2025/06/27/gemini-scheduled-actions-rollout/),
[ChatGPT scheduled tasks](https://futurefive.co.nz/story/openai-expands-chatgpt-scheduled-tasks-with-new-hub),
[Intercom on evaluation](https://openai.com/index/intercom),
[Notion on evaluation](https://braintrust.dev/customers/notion),
[Slack on evaluation](https://www.zenml.io/llmops-database/automated-evaluation-framework-for-llm-powered-features).
Copilot's and Slack's recap details are from the vendors' own help pages above, not re-checked
against a live account.
