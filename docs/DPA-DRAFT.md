# Data processing agreement — draft for the lawyer

**Status: decided in counsel's chair (2026-10-14, docs/LEGAL-REVIEW-2026-10.md, "Counsel's
decisions"), not yet signed by anyone, not published.** Every point once marked for the lawyer is
decided below; what's still open is a fact the owner sets or an engineering step, marked ⛔. Every fact in it about what Caime does is read
from the code and checked by `apps/server/test/dpa-draft.test.ts`: the sub-processors are the
ones in `packages/core/src/processors.ts` (the same list the privacy page renders), the
retention spans are `KEPT_DAYS` and the API's limits, and the organization's controls are the
routes in `apps/server/src/modules/orgs.ts`. The legal language is the lawyer's to write; the
facts are ours to keep true.

Parties, below, are **the Organization** (a clinic, a shop, a school, any organization with a
verified page on Caime: the controller of its customers' conversations) and **the Operator**
(the company running this Caime, named by `LEGAL_NAME`, `LEGAL_REGISTRATION` and `LEGAL_ADDRESS`:
the processor). Where
an organization's own people use Caime for themselves, their accounts are theirs and the Operator
is their controller under the privacy policy; this agreement covers only the Organization's
business conversations.

Reviewed on 2026-10-04 (docs/LEGAL-REVIEW-2026-10.md, by this session in the lawyer's chair, not
by a lawyer): the clauses the GDPR's Article 28(3) requires are each present below or marked for
the lawyer, and the ones a clinic's lawyer will ask about first (health data, sub-processor
changes, breach deadlines, deletion at the end) are written out rather than left open. Where the
Organization is in Egypt, Saudi Arabia or the UAE, its own data protection law applies to it as
the controller (Egypt's Law No. 151 of 2020, which treats health data as sensitive and requires a
permit to process it; Saudi Arabia's PDPL; the UAE's Federal Decree-Law No. 45 of 2021), and the
Operator, in the EU, is under the GDPR: section 14 says how the two meet.

The agreement maps onto the shape the EU's standard clauses use: sections 1–3 are Annex I (the
processing), section 6 is Annex II (the technical and organizational measures), section 7 is
Annex III (the sub-processors).

## 1. Subject matter and duration

1. The Operator processes personal data on the Organization's behalf to provide the
   Organization's inbox on Caime: the conversations its customers start with it (or that its team
   starts, as message requests), the cards in them (appointments, bookings, forms), the files
   sent, its AI agent's answers from the text the Organization gave it, its apps' webhooks, and
   its insights.
2. It lasts as long as the Organization has an open page on Caime. When the Organization closes
   (its owner closes it, or its last person leaves), its seats, tokens, apps, agent and billing
   end at once; its customers' conversations stay readable to the customers, and nothing more is
   written in them by anyone. The customers' copies prevail: from closing, a customer's
   conversation is theirs, held by the Operator as their controller under the privacy policy, as
   any conversation they are a party to; what was the Organization's alone is deleted as section
   12 says.

## 2. Nature and purpose of the processing

Storing, transmitting and displaying messages between the Organization's team and its customers;
notifying each side; sorting the inbox by who has waited longest; drafting suggestions (a task, a
reminder, a waiting item) from what was written, which become anything only when a person accepts
them; answering as the Organization's AI agent, marked as such, only from the Organization's own
text, and handing over to a person when unsure; booking appointments from the Organization's open
hours, confirmed by its team; sending the Organization's apps the events they subscribed to;
counting how fast the team answers.

## 3. Categories of data subjects and of personal data

- **Data subjects:** the Organization's customers (people on Caime who write to it or accept its
  first message), and the Organization's team.
- **Personal data:** names and handles; the content of the conversations (text, cards, files,
  voice notes), which may include **special categories** of data where the Organization is a
  clinic or similar (health details a customer writes); appointment times; the customer's time
  zone and language as shown to the team; read positions; the team members' names, roles and
  activity. Payment details reach the payment processor alone, never Caime.
- **Not processed for the Organization:** a customer's relationships and labels (how they
  describe anyone), their other conversations, their location, their profile beyond what they
  show the Organization (name, handle, avatar), their private (end-to-end encrypted)
  conversations, which the Organization cannot have.

## 4. Instructions

The Operator processes the Organization's data only to provide the service as documented
(docs/PRD.md, docs/PRODUCT-REVIEW.md), as configured by the Organization in the product (its
retention, its AI agent on or off and its text, its hours, its apps), and as required by law.
Caime never reads, scores or sells the Organization's conversations, trains no model on them,
and sends an AI only what the Organization turned on (the agent) with the customer's name masked.
The Operator processes the personal data only on documented instructions from the Organization,
which are the product's settings and this agreement, including with regard to transfers to a
third country (section 13), unless required to do so by Union or Member State law to which the
Operator is subject; in that case it informs the Organization of that legal requirement before
processing, unless that law prohibits such information on important grounds of public interest
(the GDPR's Article 28(3)(a)). It tells the Organization at once if, in its opinion, an instruction
infringes data protection law (Article 28(3), last paragraph).

## 5. Confidentiality

The Operator ensures that everyone it authorises to process the personal data has committed to
confidentiality or is under an appropriate statutory obligation of confidentiality, before they
reach any of it (the GDPR's Article 28(3)(b)). The Operator's own staff reach
conversations only through the operator routes, each use in the audit log; the Operator has no
routine access to message content and the product has no "support view" of a conversation.

## 6. Security measures (Article 32)

What the product does today, from docs/SECURITY.md, which is checked against the code:

- Transport encryption on every connection (HTTPS, WSS); passwords hashed (scrypt); sessions as
  HttpOnly cookies on one origin; a content security policy on every page; no third-party scripts.
- Access control in code: a customer's conversation is read by that customer and the
  Organization's team alone; the team's names are masked from the customer; every write checks
  blocks; app tokens reach a fixed set of routes with explicit permissions; personal tokens never
  reach an account itself, and a token acting for someone on the Organization's team who doesn't
  run it (their own script, a bridge, an app they let in) reaches none of the Organization's
  conversations unless the Organization turns that on, and until then their own calendars show
  the Organization's bookings by its name and time alone.
- An audit log of operator and organization actions (export, erasure, retention changes, team
  changes, closing), kept as a hash chain the database seals at each commit and verifies daily,
  so a record changed or removed after the fact shows.
- Daily database backups, each checked by reading it back, kept 30 days, copied off the host when
  a bucket is configured, and encrypted (AES-256-GCM) before they're kept or copied once the
  Operator sets a backup key (`BACKUP_KEY`), kept apart from the backups. ⛔ The owner configures
  the bucket and the key (DEPLOY.md, the environment in full); until then backups stay on the host,
  unencrypted.
- The credentials people connect (a Google or Microsoft account's refresh token) sealed with
  AES-256-GCM under a key held in the environment, never in the database (`VAULT_KEY`), so a copy
  of the database opens none of them. ⛔ The owner sets the key; until then the database holds it.
- Rate limits on sign-up, sign-in, exports and domain checks; abuse reports read by a person.
- End-to-end encryption is offered to people for private conversations; business conversations
  are not end-to-end encrypted, so that the team, the agent and the apps can read them. Say so.
- A penetration test by a third party has **not** been done. ⛔ The owner's, before the first
  Organization handling health data signs.
- **Health data.** Business conversations with a clinic, a pharmacy or a practitioner carry
  special categories of data (health). The Organization warrants it has a lawful basis for
  processing them (for a provider of care, the GDPR's Article 9(2)(h) with its duty of secrecy;
  in Egypt, the permit Law No. 151 of 2020 requires for sensitive data; elsewhere, its own law's
  equivalent) and that it does not use Caime as its medical record: Caime stores and delivers
  what was written and keeps no record of care. The Operator applies the same measures to these
  conversations as to all others and never reads, infers from or trains on them.

## 7. Sub-processors

The Organization gives a general authorization for the sub-processors below. The list is one
constant in the code (`packages/core/src/processors.ts`); the privacy page shows which of them
this Caime uses, from its configuration, and this agreement names them all with what each
receives. A new one, or a change of one, is added to the code and to this list in the same change,
and the Organization is told at least 30 days before it processes anything of the
Organization's, by email to its owner and on the privacy page; within those 30 days it may object
in writing, and if the Operator cannot offer a way round the objection, the Organization may end
this agreement and close its page, exporting first (section 12), with any time paid for and not
used returned. The Operator binds each sub-processor in writing to data protection obligations no
weaker than this agreement's, and remains fully liable to the Organization for what a
sub-processor does (the GDPR's Article 28(2) and (4)).

| Sub-processor | What it does | What it receives | When |
| --- | --- | --- | --- |
| The hosting provider (named by the Operator, `HOSTING_PROVIDER`: Google Cloud, Doha, Qatar on 2026-10-14) | Runs Caime’s servers, database and file storage. | Everything Caime keeps, encrypted on disk and in transit; nothing is read by it. | Always |
| The network in front of the servers (named by the Operator, `EDGE_PROVIDER`: Cloudflare, Inc. on 2026-10-14) | Carries every request between a device and Caime’s servers. | Network addresses and what passes, decrypted at its edge and encrypted again to the servers (a private conversation’s messages stay sealed); it keeps only what it needs to protect the service. | When the domain is proxied |
| Stripe Payments Europe, Ltd. | Processes payments for paid plans. | The Organization’s name and its owner’s email, its plan and what it paid; card details reach Stripe alone. | When the Organization pays |
| Anthropic, PBC | Provides the AI behind AI assist and organizations’ AI agents (Claude). | What the Organization told its agent and the latest messages of a customer’s conversation with it, without the customer’s name. Nothing from a private conversation, ever. | When the Organization turns its agent on |
| Google, Mozilla, Apple or Microsoft (your browser’s push service) | Delivers notifications to a browser when Caime isn’t open. | A notification encrypted for that browser alone. | When a person allows notifications |
| Expo (650 Industries, Inc.) | Delivers notifications to the phone apps through Apple’s and Google’s push services. | What a notification says (a name, a preview) and the device’s push address. | Phone apps |
| The speech-to-text provider the operator sets (`SPEECH_PROVIDER`: OpenAI, LLC or ElevenLabs, Inc.; docs/SPEECH.md) | Turns voice notes, and what’s said in a call while Cai takes notes, into words. | The audio of a voice note whose sender has AI assist on, or of one thing said in a call whose people all said yes to Cai’s notes, and nothing else about anyone. Nothing from a private conversation, ever. | When configured, and only for a sender with AI assist on, or a call whose asker has it on |
| The text-to-speech provider the operator sets (`TTS_PROVIDER`: ElevenLabs, Inc.) | Gives Cai its voice: in a call whose people all asked Cai to join in, and in Cai’s chat to answer someone who spoke to it with AI assist on. | The words Cai says aloud, and nothing else: never anyone’s voice, name or words, and nothing from a private conversation. | When configured: in a call whose people all asked Cai to join in, or to answer aloud someone who spoke to Cai with AI assist on |
| The mail provider the operator sets (`MAIL_PROVIDER`: ActiveCampaign, LLC (Postmark); PRODUCT-REVIEW R75) | Receives mail sent to Caime addresses, and sends as mail the replies written on Caime. | Those messages as mail carries them: the addresses, the subject, the words and any attachment. Nothing from a conversation not reached by mail, and nothing from a private one, ever. | When configured |
| Cloudflare, Inc. | Relays calls that can’t connect directly between two devices. | Both devices’ network addresses, and the call’s media still encrypted end to end. | When configured, during a call |
| The email provider the operator sets (SMTP), on cai.me ActiveCampaign, LLC (Postmark) | Sends Caime’s mail: a confirmation code, a password reset link. | An email address and the message, which carries no conversation. | When configured |
| Meta Platforms (WhatsApp Business Platform) | Sends the one-time code that proves a phone number is a person’s own, over WhatsApp (PRODUCT-REVIEW R91). | The phone number added and the code; no message is read, from WhatsApp or anywhere. | When configured |
| The age-check provider the operator sets (`AGE_PROVIDER`: Bynn Intelligence (Agemin); M16 B7) | Checks a person’s age when Caime asks for one, on its own page: an estimate from a selfie, or a document. | Only when a person checks their age: the picture they take on its page and a reference that names nothing of them. It tells Caime whether they’re 18 or over, how it checked and how sure it was; the picture never reaches Caime, which keeps the outcome, the method, the provider and the date. | When configured, and only for a person who checks |

## 8. Assisting with data subjects' rights

The Organization answers its customers' requests itself, from its inbox, with these controls:

- **Access and portability:** the Organization exports its own conversations
  (`GET /orgs/:id/export`, its owner or admins, three times an hour, each in the audit log): the
  team by name, each customer named once, every message with who it was from, its words, its card
  and its files' names; nothing of its people's own accounts. A customer also exports everything
  of their own from Settings, the Organization's messages to them included.
- **Erasure:** the Organization erases a customer's conversation at that customer's request
  (`DELETE /orgs/:id/conversations/:id`): every message in it is emptied (words, cards, links,
  files with their stored bytes where nothing else uses them, album photos, what anyone saved of
  it, the suggestions drafted from it, its mail copy's envelope and the notifications that showed
  them), what the Organization's apps were sent of it leaves their delivery log (only that it was
  erased stays, so each app drops its own copy), the customer reads a line from the Organization
  saying so, and the audit log keeps when and by whom. It cannot be undone.
- **Retention:** the Organization's owner sets how long its conversations are kept, from 1 to
  3,650 days, or as long as the account exists; the time applies to what is there and to what is
  sent from then on, and to the copies its apps were sent (kept 30 days at most), and the
  customer is told where they write.
- **Objection and restriction:** a customer blocks the Organization, which stops every write both
  ways; a customer under 18 cannot be written to first.
- **Rectification:** a customer corrects their own name and profile; what was written in a
  conversation is not rewritten by anyone, as a record of what was said, and the Organization
  answers a request to correct it by writing the correction in the conversation.

The Operator also helps the Organization, taking account of the nature of the processing and the
information available to it, with its own duties under the GDPR's Articles 32 to 36: the
security measures above, telling it of a breach (section 10), and, for a data protection impact
assessment or a prior consultation with an authority, the facts about the processing in this
agreement and in docs/SECURITY.md, and answers to the Organization's questions through
`CONTACT_EMAIL` within 10 working days. This assistance is free of charge.

## 9. The Operator's own retention

Beyond the Organization's setting: ended sign-ins are kept 30 days, security records a year, a
handle someone let go of a year (held from everyone, with nothing of whose it was), backups 30
days. What a report holds (the reported message and up to four before it, as the person who
reported it saw them) is the Operator's own record for keeping Caime safe: it is kept until the
report is closed and 180 days after, a year for a report about a child's safety, whatever the
Organization's setting, and read by the Operator's safety team alone. Deleting an account removes its data at once except what the law requires to keep: billing
and accounting records for seven years (Estonia's Accounting Act, § 12), and security records for
their span.

## 10. Personal data breaches

The Operator tells the Organization without undue delay, and in any case within 48 hours of
becoming aware of it, of a breach affecting its data, with what is known then: what happened,
which data, which customers, what was done and what is advised; and completes it as more is
learned. It writes to the Organization's owner's email address, and the Organization keeps that
address current. The Organization answers for telling its authority (the GDPR gives it 72 hours)
and its customers; the Operator helps with the facts. The 48 hours leave the Organization room
inside its own 72 (the GDPR's Article 33).

## 11. Audits

The Operator keeps an audit log of every operator action and every organization action named
above, and gives the Organization the entries about its own data on request within 10 working
days. It makes available all information necessary to demonstrate compliance with Article 28 and
allows for and contributes to audits (Article 28(3)(h)): once a year, on 30 days' written notice,
by the Organization or an auditor it mandates who is bound to confidentiality, at the
Organization's cost, first by documents (this agreement, docs/SECURITY.md, a third party's test
report once there is one) and on site only where the documents don't answer, without access to
other organizations' data. An authority's audit is not limited by this.

## 12. End of processing

On closing, the Organization exports what it needs first (section 8); after closing, nothing more
is written in its conversations and its customers keep what they were sent (their own copy of a
conversation they are a party to, as the privacy policy says). The Organization's export stays
available to its last owner for 30 days after closing (`GET /orgs/:id/export`, and Settings ·
Security in the app; to anyone else the closed Organization is not there), with its team as it
stood at closing, its page and settings, its catalog, its AI agent and the knowledge text it was
given, its apps (never their tokens or secrets), its updates and its conversations. After those
30 days the Operator deletes what was the Organization's alone: its team's seats and roles, its
page and settings, its catalog and the photos only it used, its AI agent and that knowledge text,
its apps with their tokens, webhooks and deliveries, its updates and what its followers were
told of them, its checkout account, and its team's own notes on each conversation (who had it,
escalations, who resolved or erased it), which is also everything its insights are drawn from.
It keeps the conversations only as its customers' copies (section 1), with the Organization's
name, handle, kind and country as those copies show it, and a verified domain for whoever proves
it again (R42), unless Union or Member State law requires storage (Article 28(3)(g)). The
deletion is a daily task of the Operator's, recorded in the audit log.

## 13. International transfers

The hosting provider's region is the Operator's choice (`HOSTING_PROVIDER`): today
Google Cloud's `me-central1` region in Doha, Qatar (checked 2026-10-13 against Google's published
address ranges), a country without an adequacy decision, so the transfer rests on the standard
contractual clauses (Module 3, processor to processor) in Google's Cloud Data Processing
Addendum, with the Operator's transfer impact assessment; the Operator has decided to move
hosting to an EU region before launch, which ends this transfer. The other sub-processors outside
the EEA: Cloudflare, Inc. (United States) under the EU-U.S. Data Privacy Framework, with the
standard contractual clauses in its DPA as fallback; Anthropic, PBC (United States) under the
standard contractual clauses incorporated in its Data Processing Addendum; Stripe Payments Europe
(Ireland) within the EEA, its group's onward transfers under its own; Expo (650 Industries, Inc.,
United States), ActiveCampaign, LLC (Postmark, United States) and Meta Platforms, Inc. (WhatsApp,
United States) under the Data Privacy Framework
where certified, else the standard contractual clauses in their terms (⛔ the owner confirms each
on the Framework's list before the provider is turned on). The age-check provider is turned on
only once its terms say where it processes, that it deletes each picture after the check and
keeps no template, and its own data processing agreement is signed (⛔ the owner's, before
`AGE_PROVIDER` is set). A copy of each safeguard is available
from `CONTACT_EMAIL`. An Organization outside the EEA (in Egypt, Saudi Arabia or the UAE) receives
its customers' data from the Operator under the European Commission's standard contractual
clauses, Module 4 (processor to controller), incorporated in this agreement by reference; its own
law's rules on receiving and transferring the data are its own as controller.

## 14. Liability, term and law

- Each party is liable to the other for the damage its own breach of this agreement causes; the
  Operator's liability to the Organization is capped as the terms cap it (what the Organization
  paid for Caime in the 12 months before the claim), except for what the law does not allow to be
  capped; the cap is the greater of those fees and EUR 5,000, and never applies to intent or gross
  negligence (Estonia's Law of Obligations Act, § 106). Each party bears its own administrative
  fines. Liability to data subjects under the GDPR's Article 82 is borne by each party by its
  share of responsibility, with recourse between them (Article 82(5)).
- This agreement starts when the Organization verifies its page and ends with section 12. It
  prevails over the terms where the two conflict about personal data.
- It is under the law of Estonia, and Harju County Court (Harju Maakohus) settles a dispute about
  it (`GOVERNING_LAW=Estonia`; ⛔ the owner sets it on the service); the Organization's own data
  protection law applies to it as the controller regardless.

---

What this is: the agreement as decided, its facts kept true by a test. What it is not yet: signed,
or published; it's offered to an Organization as it is, section 12's clock included.
