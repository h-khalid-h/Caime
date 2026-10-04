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
(the company running this Caime, named by `LEGAL_NAME`: the processor). Where an organization's
own people use Caime for themselves, their accounts are theirs and the Operator is their
controller under the privacy policy; this agreement covers only the Organization's business
conversations.

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
**[lawyer]** the standard clause on documented instructions and on informing the controller if an
instruction infringes the law.

## 5. Confidentiality

Everyone who operates this Caime is bound to confidentiality. **[lawyer]** the wording. The
Operator's own staff reach conversations only through the operator routes, each use in the audit
log; the Operator has no routine access to message content and the product has no "support view"
of a conversation.

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

## 7. Sub-processors

The Organization authorizes the sub-processors below. The list is one constant in the code
(`packages/core/src/processors.ts`); the privacy page shows which of them this Caime uses, from
its configuration, and this agreement names them all with what each receives. A new one is added
to the code and to this list in the same change, and the Organization is told **[lawyer]** how
and how long before.

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

## 9. The Operator's own retention

Beyond the Organization's setting: ended sign-ins are kept 30 days, security records a year, a
handle someone let go of a year (held from everyone, with nothing of whose it was), backups 30
days. Deleting an account removes its data at once except what the law requires to keep
**[lawyer]**.

## 10. Personal data breaches

The Operator tells the Organization without undue delay of a breach affecting its data, with what
is known: what happened, which data, which customers, what was done. **[lawyer]** the deadline
(the GDPR gives the controller 72 hours to the authority), the channel (the owner's contact
address: today `CONTACT_EMAIL` on the service), and what the Organization must do in turn.

## 11. Audits

The Operator keeps an audit log of every operator action and every organization action named
above, and makes it available to the Organization for its own actions **[lawyer]** on request or
through the product. The code is open to inspection in the repository. **[lawyer]** the audit
clause and its limits.

## 12. End of processing

On closing, the Organization exports what it needs first (section 8); after closing, nothing more
is written in its conversations, its customers keep what they were sent, and the Operator deletes
the rest of the Organization's data **[lawyer]** when and how (today: a closed organization nobody
continued is deleted only by the operator, with everything its customers were sent by it).

## 13. International transfers

The hosting provider's region is the Operator's choice (`HOSTING_PROVIDER`) **[owner]**: name the
region. Anthropic and Stripe process in the United States and Europe under their own transfer
mechanisms **[lawyer]** cite them.

---

What this draft is not: legal advice, or an agreement anyone has signed. What it is: the facts a
lawyer needs, kept true by a test.
