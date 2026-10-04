# Data processing agreement — draft for the lawyer

**Status: a draft, not reviewed by a lawyer, not published.** It is written so the owner's lawyer
has something to mark up rather than a blank page. Every fact in it about what Caime does is read
from the code and checked by `apps/server/test/dpa-draft.test.ts`: the sub-processors are the
ones in `packages/core/src/processors.ts` (the same list the privacy page renders), the
retention spans are `KEPT_DAYS` and the API's limits, and the organization's controls are the
routes in `apps/server/src/modules/orgs.ts`. The legal language is the lawyer's to write; the
facts are ours to keep true. Clauses marked **[lawyer]** need a decision or wording from them.

Parties, below, are **the Organization** (a clinic, a shop, a school, any organization with a
verified page on Caime: the controller of its customers' conversations) and **the Operator**
(the company running this Caime, named by `LEGAL_NAME` and `LEGAL_ADDRESS`: the processor). Where
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
   written in them by anyone. **[lawyer]** whether closing should also start a deletion clock for
   the Organization's side, or the customers' right to keep what they were sent prevails (today it
   does).

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
The Operator processes only on the Organization's documented instructions, which are the product's
settings and this agreement, and tells the Organization at once if, in its view, an instruction
infringes data protection law, unless the law forbids it to. Where the law requires the Operator
to process otherwise, it tells the Organization first, unless the law forbids that too.
**[lawyer]** the wording against the GDPR's Article 28(3)(a).

## 5. Confidentiality

Everyone who operates this Caime is bound to confidentiality, by contract or by a statutory
duty, before they touch any of it. **[lawyer]** the wording. The Operator's own staff reach
conversations only through the operator routes, each use in the audit log; the Operator has no
routine access to message content and the product has no "support view" of a conversation.

## 6. Security measures (Article 32)

What the product does today, from docs/SECURITY.md, which is checked against the code:

- Transport encryption on every connection (HTTPS, WSS); passwords hashed (scrypt); sessions as
  HttpOnly cookies on one origin; a content security policy on every page; no third-party scripts.
- Access control in code: a customer's conversation is read by that customer and the
  Organization's team alone; the team's names are masked from the customer; every write checks
  blocks; app tokens reach a fixed set of routes with explicit permissions; personal tokens never
  reach an account itself.
- An audit log of operator and organization actions (export, erasure, retention changes, team
  changes, closing).
- Daily database backups, each checked by reading it back, kept 30 days, copied off the host when
  a bucket is configured. **[owner]** the bucket is not yet configured on production.
- Rate limits on sign-up, sign-in, exports and domain checks; abuse reports read by a person.
- End-to-end encryption is offered to people for private conversations; business conversations
  are not end-to-end encrypted, so that the team, the agent and the apps can read them. Say so.
- A penetration test by a third party has **not** been done. **[owner]**
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
sub-processor does. **[lawyer]** the wording.

| Sub-processor | What it does | What it receives | When |
| --- | --- | --- | --- |
| The hosting provider (named by the Operator, `HOSTING_PROVIDER`) | Runs Caime’s servers, database and file storage. | Everything Caime keeps, encrypted on disk and in transit; nothing is read by it. | Always |
| Stripe Payments Europe, Ltd. | Processes payments for paid plans. | The Organization’s name and its owner’s email, its plan and what it paid; card details reach Stripe alone. | When the Organization pays |
| Anthropic, PBC | Provides the AI behind AI assist and organizations’ AI agents (Claude). | What the Organization told its agent and the latest messages of a customer’s conversation with it, without the customer’s name. Nothing from a private conversation, ever. | When the Organization turns its agent on |
| Google, Mozilla, Apple or Microsoft (your browser’s push service) | Delivers notifications to a browser when Caime isn’t open. | A notification encrypted for that browser alone. | When a person allows notifications |
| Expo (650 Industries, Inc.) | Delivers notifications to the phone apps through Apple’s and Google’s push services. | What a notification says (a name, a preview) and the device’s push address. | Phone apps |
| Cloudflare, Inc. | Relays calls that can’t connect directly between two devices. | Both devices’ network addresses, and the call’s media still encrypted end to end. | When configured, during a call |
| The email provider the operator sets (SMTP) | Sends Caime’s mail: a confirmation code, a password reset link. | An email address and the message, which carries no conversation. | When configured |

## 8. Assisting with data subjects' rights

The Organization answers its customers' requests itself, from its inbox, with these controls:

- **Access and portability:** the Organization exports its own conversations
  (`GET /orgs/:id/export`, its owner or admins, three times an hour, each in the audit log): the
  team by name, each customer named once, every message with who it was from, its words, its card
  and its files' names; nothing of its people's own accounts. A customer also exports everything
  of their own from Settings, the Organization's messages to them included.
- **Erasure:** the Organization erases a customer's conversation at that customer's request
  (`DELETE /orgs/:id/conversations/:id`): every message in it is emptied (words, cards, links,
  files, album photos, what anyone saved of it, the suggestions drafted from it and the
  notifications that showed them), the customer reads a line from the Organization saying so, and
  the audit log keeps when and by whom. It cannot be undone.
- **Retention:** the Organization's owner sets how long its conversations are kept, from 1 to
  3,650 days, or as long as the account exists; the time applies to what is there and to what is
  sent from then on, and the customer is told where they write.
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
`CONTACT_EMAIL` within 10 working days. **[lawyer]** whether that assistance is charged for.

## 9. The Operator's own retention

Beyond the Organization's setting: ended sign-ins are kept 30 days, security records a year, a
handle someone let go of a year (held from everyone, with nothing of whose it was), backups 30
days. Deleting an account removes its data at once except what the law requires to keep
**[lawyer]**.

## 10. Personal data breaches

The Operator tells the Organization without undue delay, and in any case within 48 hours of
becoming aware of it, of a breach affecting its data, with what is known then: what happened,
which data, which customers, what was done and what is advised; and completes it as more is
learned. It writes to the Organization's owner's email address, and the Organization keeps that
address current. The Organization answers for telling its authority (the GDPR gives it 72 hours)
and its customers; the Operator helps with the facts. **[lawyer]** the wording; 48 hours is the
Operator's proposal, inside the Organization's 72.

## 11. Audits

The Operator keeps an audit log of every operator action and every organization action named
above, and makes it available to the Organization for its own actions **[lawyer]** on request or
through the product. The code is open to inspection in the repository. **[lawyer]** the audit
clause and its limits.

## 12. End of processing

On closing, the Organization exports what it needs first (section 8); after closing, nothing more
is written in its conversations and its customers keep what they were sent (their own copy of a
conversation they are a party to, as the privacy policy says). The Operator's proposal: the
Organization's export stays available to its last owner for 30 days after closing, and after
those 30 days the Operator deletes what was the Organization's alone (its team's roles, its
settings, its knowledge text, its tokens and webhooks, its insights) and keeps the conversations
only as its customers' copies, unless the law requires otherwise. **[lawyer]** whether the
customers' copies prevail (today they do, and the product has no deletion clock after closing:
a closed organization nobody continued is deleted only by the operator), and the wording.

## 13. International transfers

The hosting provider's region is the Operator's choice (`HOSTING_PROVIDER`) **[owner]**: name the
region. Anthropic and Stripe process in the United States and Europe under their own transfer
mechanisms **[lawyer]** cite them (Stripe Payments Europe is in Ireland; Anthropic, PBC and Expo
are in the United States, Cloudflare, Inc. too; for the United States, the European Commission's
standard contractual clauses, or the Data Privacy Framework where the company is certified). An
Organization outside the EU (in Egypt, Saudi Arabia or the UAE) receives its customers' data from
the Operator in the EU under its own law's rules on transfer **[lawyer]**.

## 14. Liability, term and law

- Each party is liable to the other for the damage its own breach of this agreement causes; the
  Operator's liability to the Organization is capped as the terms cap it (what the Organization
  paid for Caime in the 12 months before the claim), except for what the law does not allow to be
  capped. **[lawyer]** whether a processor's liability for fines and data subjects' claims under
  the GDPR's Article 82 should be allocated differently.
- This agreement starts when the Organization verifies its page and ends with section 12. It
  prevails over the terms where the two conflict about personal data.
- It is under the same law and courts as the terms (`GOVERNING_LAW`, the Operator's; the terms
  carry the clause) **[owner]** set it; the Organization's own data protection law applies to it
  as the controller regardless.

---

What this draft is not: legal advice, or an agreement anyone has signed. What it is: the facts a
lawyer needs, kept true by a test.
