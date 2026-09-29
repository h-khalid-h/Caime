# Caime — Full Product Requirements Document

> **Caime** (formerly **Caime**, and before that **CONNIQT**). Every mention of Caime or CONNIQT
> in earlier drafts refers to Caime. The name, and what of a later super-app brainstorm the
> product takes and leaves, are refinements R34–R40 in `PRODUCT-REVIEW.md`.
>
> This document is the product source of truth. Section numbers 1–90 are stable and are cited
> across the codebase and docs as `PRD §n`. The Problem and the Wedge were added after the
> original draft and live between §3 and §4 as **§3.A** and **§3.B** so that the original
> numbering does not shift. Refinements made after review are recorded in
> [`PRODUCT-REVIEW.md`](./PRODUCT-REVIEW.md); where they differ from this text, the review wins
> and says why.

| | |
| --- | --- |
| Product | Caime |
| Domain | cai.me (links: `cai.me/@handle`, R35) |
| Category | Relationship-aware communication platform |
| Platforms | iOS, Android, Web |
| Product stage | Full product specification — not MVP |
| Core idea | Communication organized around the relationship between people, not merely around chat threads. |

---

## 1. Executive Summary

Caime is a communication platform designed around a simple observation:

> The meaning of a conversation depends on the relationship between the people communicating.

Traditional messaging systems primarily organize communication around contacts, conversations,
groups, channels and notifications. Caime adds a fundamental layer underneath all of these:
**Relationship**.

A person is not simply "John." John may be:

- Family → Father
- Work → Manager
- Customer → USPA
- Vendor → DHL
- Friend → University Friend
- Professional → Lawyer
- Service Provider → Doctor

Caime captures this relationship context and uses it to organize communication, permissions,
notifications, tools, AI assistance, search, identity, and shared information.

The product therefore consists of four fundamental layers:

```
IDENTITY
   ↓
RELATIONSHIP
   ↓
COMMUNICATION
   ↓
CONTEXT + ACTION
```

Caime should remain a communication product first. Tasks, payments, documents, scheduling, AI,
business workflows, and mini-apps should extend communication rather than turn Caime into an
overloaded general-purpose productivity platform.

## 2. Product Vision

**Vision:** Make every digital connection understandable, manageable, and useful.

Caime should make it immediately clear:

- Who is this person?
- What is my relationship with them?
- Why are we communicating?
- What matters?
- What requires my attention?
- What information do we share?
- What actions can I take?

## 3. Product Mission

Caime helps people communicate with less noise and more context. It should:

1. reduce communication overload;
2. preserve relationship context;
3. separate personal and professional boundaries;
4. make important information recoverable;
5. turn conversations into useful actions;
6. give users control over attention and privacy;
7. provide intelligent assistance without taking control away from users.

---

## 3.A The Problem

Modern communication has a context problem.

People communicate with dozens, hundreds, or thousands of people across different parts of their
lives: family, friends, managers, colleagues, customers, vendors, suppliers, service providers,
professionals, communities. But most messaging systems treat these relationships almost
identically. A person is essentially:

```
Name + photo + conversation history
```

That model works when communication is simple. It becomes increasingly inadequate as the number
and diversity of relationships grow.

### P1. The relationship context is missing

The same message has very different meaning depending on who sent it. Consider:

> "Can you send me the document tomorrow?"

From your father, your manager, a customer, a vendor, or your lawyer — the words may be
identical; the context is not. The relationship determines:

- how important the message may be;
- how quickly it should be answered;
- what information is relevant;
- what tools may be useful;
- what tone is appropriate;
- whether it creates a responsibility;
- what previous context matters.

Yet messaging applications generally make the user reconstruct this context manually.

### P2. Communication context is scattered

Today, understanding a person often requires mentally combining:

```
Contacts + Chat history + Email + Calendar + Files + Notes + CRM + Memory
```

The communication itself contains important information, but that information is rarely
structured. For example: "I'll send the contract tomorrow." The system stores a message. The user
remembers: *Sarah owes me a contract tomorrow.* That difference is the problem.

### P3. Important information gets buried

Messaging systems are excellent at storing communication. They are much less effective at
helping users answer:

- What did this person promise?
- What am I waiting for?
- What did we decide?
- Where is the document?
- What did we agree about the project?
- Which customer asked for this?
- Which vendor is responsible?
- When did this become important?
- Why am I talking to this person?

The information exists. The problem is recovering meaning from it.

### P4. Notification overload is a context problem

Most notification systems primarily know: *A message arrived.* They have less understanding of:
*who sent it, what relationship they have with me, why we communicate, and whether it requires my
attention.* As a result, users are forced to process large volumes of communication themselves.

The problem is not simply too many messages. It is: **too little context per message.**

### P5. Contacts are also too generic

A conventional contact list might contain:

```
Sarah Smith
+20...
sarah@example.com
```

But the information a person actually needs is often:

```
Sarah Smith
Manager
DATA C
Project Alpha
3 open items
1 waiting item
14 shared files
```

The second representation is more useful because it reflects the user's actual relationship with
the person.

### P6. Existing communication products optimize the wrong primitive

Most communication products are fundamentally organized around: Chat, Channel, Inbox, Contact.
Caime proposes a different foundation:

```
Connection
   ↓
Relationship
   ↓
Communication
   ↓
Context
   ↓
Action
```

The difference is subtle but fundamental. **A chat is an interaction. A connection is an ongoing
relationship.**

---

## 3.B The Wedge

Caime should not attempt to replace every communication product on day one. The initial
strategic wedge is:

> **Relationship-aware 1:1 communication**

The first experience should solve one simple problem exceptionally well:

> "Help me communicate with this person while understanding who they are to me."

### W1. The first wedge

When a user connects with someone, Caime asks: **Who is this person to you?**

The user selects: Family · Friend · Work · Customer · Vendor · Professional · Other.

If needed — *What's their role?* Manager · Colleague · Client · Supplier · Account Manager · Other.

Optional — *Where?* DATA C · USPA · DHL · Firm X.

The entire process should take approximately **2–3 seconds**. This tiny interaction creates a
structured relationship that traditional messaging systems generally don't require.

### W2. Why this is the wedge

The relationship classification is small enough to be adopted naturally. The user does not need
to build a CRM, configure a workspace, create a project, learn a new productivity system, or
maintain complex contact records. They simply answer: *Who is this person to you?* That single
piece of information unlocks the rest of the product.

### W3. The wedge creates immediate product value

Once Caime knows `Sarah → Manager → DATA C`, the system can immediately make communication more
contextual:

| Capability | Example |
| --- | --- |
| Identity | Sarah Smith · Manager · DATA C |
| Notifications | Manager → Important during work hours |
| Search | Show messages from my managers |
| Attention | Sarah needs your response |
| Follow-up | Waiting for Sarah |
| Conversation context | Project Alpha · 3 open actions · 2 decisions |
| AI assistance | Summarize my open items with Sarah |

The relationship therefore becomes the foundation for multiple useful capabilities.

### W4. The expansion wedge

```
RELATIONSHIP → BETTER COMMUNICATION → BETTER ATTENTION → BETTER MEMORY → BETTER ACTION → BETTER WORKFLOWS
```

- **Layer 1 — Relationship:** Who is this person?
- **Layer 2 — Communication:** What are we talking about?
- **Layer 3 — Attention:** What requires my attention?
- **Layer 4 — Memory:** What happened before?
- **Layer 5 — Action:** What needs to happen next?
- **Layer 6 — Contextual workflows:** What tools are useful for this relationship?

This gives Caime a natural path from messaging into a broader communication operating system
without requiring the user to adopt everything at once.

### W5. The initial user promise

The product should be explainable in one sentence:

> Caime helps you communicate with people based on who they are to you.

Or, more product-oriented:

> **Messaging that understands your relationships.**

The second statement is especially useful as an early positioning concept because it immediately
differentiates Caime from generic messaging.

### W6. The wedge is not "relationship management"

Caime should avoid positioning itself as a relationship-management tool. That sounds like CRM,
contact management, sales software, or personal relationship tracking. That is not the desired
experience. The user should feel: *"I'm just messaging someone."* The system should quietly
understand: *"This is your customer,"* or *"This is your manager,"* or *"This is your father."*
The complexity belongs underneath the interface.

### W7. The wedge must be visible but lightweight

Relationship context should appear where it helps (`Sarah Smith · Manager · DATA C`) but it should
not dominate every screen. The product should never become a wall of "relationship configuration,
relationship metadata, relationship settings, relationship analytics." Instead:

```
Sarah Smith
Manager · DATA C
"Hey, can you review this?"
[Message]
```

**The relationship is context, not bureaucracy.**

### W8. The competitive entry point

Caime does not need to convince users that they need a new category of productivity software.
The entry behavior is familiar — *Find person → Connect → Message*. Caime simply adds:
*Connect → Who is this person to you? → Message*. That small difference becomes the foundation for
everything else.

### W9. The long-term wedge expansion

Once a user has a meaningful relationship graph, Caime can become increasingly useful without
changing the basic communication behavior:

```
100 connections → 100 relationship contexts → hundreds of conversations
  → shared files + decisions + tasks → personal communication graph
```

Not a social graph based primarily on "Who follows whom?" but a practical graph based on
**"Who is this person to me, and what do we do together?"**

### W10. Strategic product boundary

The wedge should remain focused on `Person → Relationship → Conversation`. Everything else should
be earned by that relationship. Tasks, AI, payments, files, calendars, business workflows,
integrations, and agents are expansion layers. They should not become the reason a user has to
learn Caime.

### W11. The core insight

> Messaging apps know who you are talking to. **Caime understands who that person is to you.**

That distinction creates the wedge. From there, `Who → Relationship → Why → Conversation →
Context → Action` becomes the product architecture.

### W12. Problem → Wedge → Platform

| Stage | Statement |
| --- | --- |
| Problem | Communication has become abundant but context-poor. |
| Wedge | Relationship-aware 1:1 communication. |
| Product expansion | Attention + memory + context + action. |
| Platform | A relationship-aware communication layer for personal and professional life. |

---

## 4. Product Thesis

The fundamental Caime object is not the message. It is the **Connection**. A connection can
contain:

```
Person → Relationship → Conversation → Context → Actions → History
```

This distinction drives the entire architecture. A conversation can disappear. A connection
persists. A relationship can evolve. A conversation can have many purposes. Therefore, Caime
must model these separately.

## 5. Core Product Model

Caime consists of seven primary objects.

- **5.1 Person** — a human identity (Hassan, Sarah, Ahmed).
- **5.2 Connection** — the relationship between two identities (Hassan ↕ Sarah).
- **5.3 Relationship** — how one person understands the other (Sphere: Work · Role: Manager ·
  Organization: DATA C). **Relationship is directional.** Hassan → Sarah may be *Customer /
  Account Owner* while Sarah → Hassan is *Service Provider / Account Manager*. The two parties do
  not have to describe the relationship identically.
- **5.4 Conversation** — a communication container associated with one or more connections. A
  connection can have one general conversation, multiple conversations, temporary conversations,
  topic conversations, and group conversations.
- **5.5 Context** — information that gives communication meaning: project, order, trip,
  appointment, school, event, contract, issue, family matter.
- **5.6 Action** — something that can result from communication: task, reminder, appointment,
  payment, approval, request, decision, delivery, reservation.
- **5.7 Evidence** — useful information generated or shared through communication: document,
  image, receipt, voice note, location, link, agreement, decision.

## 6. The Caime Relationship Model

The relationship system is the product's primary differentiator. However, it should not become a
complicated taxonomy users have to maintain manually. The design principle is:

> **Simple for the user, structured underneath.**

## 7. Relationship Structure

Caime uses a flexible relationship model: `Sphere → Role → Context`.

```
Family        └── Father
Work          └── Manager       └── DATA C
Customer      └── Account       └── USPA
Vendor        └── Supplier      └── DHL
Professional  └── Lawyer        └── Firm X
```

The third level should not be mandatory. It is contextual rather than another required
classification level.

## 8. Relationship Spheres

Initial system spheres:

- **Personal:** Family, Friend, Acquaintance
- **Professional:** Work, Customer, Vendor, Service Provider, Professional
- **Social / Collective:** Community, Organization, Public
- **Fallback:** Other

These are system-level categories, not rigid universal definitions. Caime should eventually
support custom relationship types.

## 9. Relationship Roles

Roles are configurable. Examples:

- **Family:** Parent, Father, Mother, Spouse, Partner, Child, Sibling, Grandparent, Relative
- **Work:** Manager, Direct Report, Colleague, Founder, Executive, HR, Recruiter, Partner
- **Customer:** Customer, Account Owner, Buyer, Decision Maker, User, Procurement
- **Vendor:** Supplier, Account Manager, Sales Representative, Contractor, Delivery Provider
- **Professional:** Doctor, Lawyer, Accountant, Consultant, Broker, Advisor

## 10. Relationship Ownership

A relationship belongs to the person defining it. Caime must never assume: *"This is objectively
what you are to each other."* Instead: *"This is how I classify this connection."* This prevents
social ambiguity and allows asymmetric relationships.

## 11. First-Connection Experience

When a user connects with someone for the first time:

```
New connection
Sarah
@sarah

How do you know Sarah?
[ Family ] [ Friend ] [ Work ] [ Customer ] [ Vendor ] [ Professional ] [ Other ]
```

After selecting Work — *Sarah's role?* `[ Manager ] [ Colleague ] [ HR ] [ Partner ] [ Other ]`.
(The original draft asked "What's her role?"; Caime never assumes gender — PRODUCT-REVIEW R27.)
Then — *Where?* `[ DATA C ] [ Add organization ]`. Then — **Done**.

The system should aim for **one to three interactions**. The user must never be forced through a
long profile form.

## 12. Relationship Intelligence

Caime can suggest relationships based on available signals: verified organization, email domain,
invitation source, mutual organization, user-entered information, existing connection context,
conversation context. However: **suggestions are never silently converted into facts.**

```
Caime thinks Sarah may be your colleague at DATA C.
[Accept] [Change]
```

## 13. Relationship Evolution

Relationships change (Friend → Colleague → Customer; Colleague / Manager → Former Manager). Caime
should maintain relationship history rather than overwrite it destructively. The user can change,
add, end, archive, restore, and merge relationships.

## 14. Relationship vs Group

A group is not a relationship. A family group may contain Father, Mother, Brother, Sister, Cousin.
Each participant retains their individual relationship with the user. The group itself has a
separate identity (`Group: "The Khalid Family"`). This distinction is essential.

## 15. Conversation Model

Caime supports:

- **Direct conversations** — one person ↔ one person.
- **Group conversations** — multiple people.
- **Organization conversations** — people associated with an organization.
- **Community conversations** — large-scale membership.
- **Broadcast conversations** — one-to-many communication.
- **Temporary conversations** — created around a specific event or purpose.

## 16. Multiple Conversations per Connection

Caime should not force every interaction with a person into one endless thread. Sarah is a
manager; conversations could include:

```
Sarah
 ├── General
 ├── Project Alpha
 ├── Hiring
 └── Performance Review
```

However, the UX should avoid forcing users to manually create conversations constantly. Caime
can automatically recommend a new context when appropriate.

## 17. Conversation Context

Every conversation may optionally have: title; purpose; project; organization; event; order;
task; deadline; participants; files; decisions.

```
Sarah
Project Alpha
Context
────────────────
Project: Alpha
Purpose: Delivery
Deadline: Oct 15
3 open actions
7 files
2 decisions
```

## 18. Communication Modes

Caime should distinguish communication from action. Core modes:

| Mode | Meaning |
| --- | --- |
| Talk | Normal conversation. |
| Ask | Question/request. |
| Plan | Coordinate something. |
| Decide | Record a decision. |
| Share | Exchange information or assets. |
| Request | Ask someone to perform an action. |
| Confirm | Confirm an agreement or state. |
| Pay | Payment-related interaction. |
| Track | Follow a process or transaction. |

These modes can be detected automatically but must remain user-controlled.

## 19. The Inbox

Caime should not simply display a chronological list. The primary inbox is **Attention**. It
answers: *What deserves my attention now?* Possible sections:

- **Needs You** — messages requiring action.
- **Important** — high-value communication.
- **Recent** — normal activity.
- **Waiting** — things where the user is waiting for another person.
- **Quiet** — muted or low-priority communication.
- **Archived** — historical conversations.

This is preferable to endlessly adding folders.

## 20. Attention Engine

The Attention Engine combines unread state, relationship, user-defined priority, conversation
context, explicit mentions, deadlines, pending actions, and notification settings. It should not
automatically decide importance solely from message content. **The user remains the authority.**

## 21. Message Model

Messages support: text; emoji; image; video; audio; file; location; contact; link; poll;
structured request; structured response; system event.

## 22. Message Actions

Long press / contextual menu: Reply · React · Forward · Copy · Save · Pin · Add task · Remind me ·
Translate · Summarize · Extract information · Share · Delete · Report. The menu should adapt to
context.

## 23. Message Intelligence

Caime can recognize commitments, dates, amounts, locations, people, organizations, documents,
questions, decisions, and tasks. Example — "I'll send the proposal tomorrow." Caime may display:

```
Possible action
Send proposal
Tomorrow
[Create reminder]
```

**No automatic task creation without user approval.**

## 24. Conversation Memory

Each conversation has a structured memory layer: People, Decisions, Tasks, Dates, Documents,
Links, Places, Amounts, Topics. The system can produce: conversation summary, current state, open
items, important history. This is substantially more useful than simply searching old messages.

## 25. Search

Search should operate across:

| Target | Example |
| --- | --- |
| People | "Sarah" |
| Relationships | "Managers" |
| Organizations | "DATA C" |
| Messages | "proposal" |
| Meaning | "what did Sarah say about the migration?" |
| Assets | "PDFs from Sarah" |
| Actions | "things Sarah asked me to do" |
| Context | "Project Alpha conversations" |

Search therefore becomes a communication knowledge layer.

## 26. Files

Every conversation automatically maintains an asset index: Photos, Videos, Documents, Audio,
Links, Locations, Shared contacts. Users should never have to scroll through years of chat to
recover a file.

## 27. Shared Context

A conversation can expose: `Context · Project Alpha · 7 files · 3 tasks · 2 decisions · 1
deadline`. This should be generated automatically where possible.

## 28. Tasks

Tasks originate from communication. Sources: manually created; extracted from messages; created
from structured requests; imported from external systems. Every task can retain: source
conversation, source message, relationship, owner, assignee, due date, status. This preserves the
reason the task exists.

## 29. Waiting

One of the most important concepts in Caime is **Waiting**. Example — "I'll send you the
contract tomorrow." Caime can offer: *Waiting for Sarah — Contract.* This creates a lightweight
follow-up state without becoming a full project-management application.

## 30. Decisions

Users can mark a message or exchange as a decision (e.g., *Approved the final design*), with
metadata: Decision · Project Alpha · Made by Hassan · Sep 26. Decisions become searchable
independently of messages.

## 31. Notifications

Caime separates **Activity** (something happened), **Attention** (something may require you) and
**Urgency** (something needs immediate attention). These are not equivalent.

## 32. Relationship-Aware Notifications

Users can establish defaults by relationship:

| Relationship | Default |
| --- | --- |
| Family | Always notify |
| Manager | Notify 08:00–20:00 |
| Customer | Notify during work hours |
| Vendor | Quiet unless marked important |

Users can override everything.

## 33. Notification Intelligence

Caime can consolidate bursts. Instead of four separate notifications ("Hi", "Are you there?",
"I need something", "Can you call me?"), show:

```
Sarah sent 4 messages
"Needs a quick call."
```

The user can open the underlying messages.

## 34. Privacy Model

Privacy must be relationship-aware but user-controlled. Users can define: profile visibility;
online status; last seen; read receipts; profile photo; status; location; shared identity;
contact discovery. Rules can apply by relationship sphere.

## 35. Identity

Caime separates **account identity** (the person's Caime account), **profile identity** (how
they appear), **professional identity** (their professional representation) and **organization
identity** (their relationship with an organization). Example: *Hassan Khalid* (personal) ·
*Hassan* (profile) · *Hassan Khalid — DATA C CEO* (professional/organization).

## 36. Organization Layer

Organizations can have verified profiles. A business can create: organization profile;
employees; departments; customer relationships; vendor relationships; communication channels;
automated services. An organization's profile carries its logo, its kind, where it's based and
the year it began; its spaces are its own (§40, PRODUCT-REVIEW R43), and it never owns a
person's record: a person's relationships and identities stay theirs (§10, §35).

## 37. Caime Business

Caime Business extends the same relationship model. Instead of *Unknown customer #5821*, the
organization can understand `Customer └── USPA └── Account └── Active conversation`. Business
users can manage customer conversations, support, sales, vendors, partners, internal
communication.

## 38. Business Inbox

Business users get: **New** (new conversations), **Assigned** (assigned to a team member),
**Waiting** (waiting for customer), **Customer waiting** (customer waiting for business),
**Resolved** (completed conversations), **Escalated** (requires attention).

## 39. Relationship Ownership in Business

A business can have organizational relationships:
`DATA C → Customer → USPA → Account → Deanea → Relationship: Customer Contact`. This allows
relationship intelligence to operate at both the personal level and the organizational level.

## 40. Spaces

Spaces are optional environments around an organization or community (DATA C, Family,
University, Project Alpha, Customer community). Spaces contain people, conversations, files,
events, workflows, policies. A space can belong to an organization (PRODUCT-REVIEW R43): its
owner or admins start it, its team can be in it without being connections, and it stays with
its people if the organization closes.

## 41. Connect Kits

Caime should support small contextual capabilities. A Connect Kit is an action module that can
appear within an appropriate context:

- **Family:** shared calendar, shared album, location
- **Customer:** support ticket, order status, appointment
- **Vendor:** delivery tracking, purchase order, invoice
- **Work:** approval, meeting, task, document review

Connect Kits should be contextual, not a giant app marketplace exposed everywhere.

## 42. AI Architecture

AI is an assistance layer, not the product itself. Core capabilities: **Understand** (extract
entities, intent, context), **Organize** (summarize and categorize), **Assist** (draft,
translate, rewrite), **Remember** (retrieve relevant conversational context), **Act** (create
user-approved tasks, reminders, events), **Predict** (suggest relationship or attention
classifications).

## 43. AI Principles

Caime AI must follow: (1) user control; (2) transparency; (3) reversibility; (4) privacy; (5) no
silent destructive actions; (6) clear distinction between fact and inference.

Bad: *Sarah is your manager.* Better: *Caime suggests Sarah may be your manager based on your
organization information.*

## 44. AI Relationship Inference

Signals may include organization membership, verified professional identity, user-provided data,
conversation context, and explicit invitation context. **The system must not infer sensitive
personal characteristics.**

## 45. AI Communication Assistance

- **Rewrite:** clearer, shorter, more formal, more friendly.
- **Understand:** explain, summarize, translate.
- **Act:** create task, set reminder, create event, extract information.

## 46. Voice

Voice messaging should support recording, playback, transcription, searchable transcript,
summarization, and reply from transcript. Voice remains a communication primitive rather than
becoming a separate social network.

## 47. Calls

Caime supports voice, video, group calls, screen sharing, and call history. Calls are associated
with person, relationship, conversation, and context. After a call, users may optionally receive a
call summary with decisions, actions, and follow-ups.

## 48. Multi-Device

All communication should synchronize across iPhone, Android, web, and desktop where supported.
Important states: messages; read position; drafts; notifications; relationship data; tasks;
conversation context.

## 49. Offline-First

Users should be able to read recent conversations, search cached information, compose messages,
create local tasks, and view relationships. Outgoing actions queue automatically. The user sees
**Pending** rather than a generic failure.

## 50. Contacts

Caime should not simply replicate the phone address book. It should maintain **People** (known
identities), **Connections** (user-defined relationships), **Organizations** (associated
entities) and **Relationship history** (how the connection has evolved).

## 51. Contact Deduplication

The system should detect `Sarah / Sarah Smith / +20... / sarah@...` and offer
*Possible duplicate — [Merge] [Keep separate]*. Never merge automatically when confidence is
insufficient.

## 52. Connection Requests

A connection request should communicate context. Instead of *Hassan wants to connect*, use
*Hassan wants to connect with you* with optional context *Work · DATA C*. The recipient can accept
without being forced to classify the relationship immediately.

## 53. Mutual Relationship Confirmation

The two users may independently define their relationship (Hassan: Sarah → Manager; Sarah: Hassan
→ Direct Report). Caime can recognize these as complementary relationships.

## 54. Trust

Caime should distinguish **Known** (identity is known to the user), **Verified** (identity has
been verified by Caime or an authoritative organization), **Organization verified** (the person
has a verified association) and **Unknown** (identity is not sufficiently established). Trust
should never be represented merely by a decorative badge.

## 55. Anti-Abuse

Core controls: block; report; spam detection; connection requests; rate limiting; message
restrictions; business verification; suspicious-link detection; account recovery controls.

## 56. Groups

Groups should support roles, membership, permissions, topics, pinned context, shared files,
tasks, decisions, moderation. The group should remain simple for ordinary users.

## 57. Group Context

Instead of only *842 messages*, Caime can show: `Family Trip · People: 6 · Decisions: 3 ·
Tasks: 4 · Files: 8 · Upcoming: Friday`.

## 58. Topic Handling

Caime should not force users to manually create threads. The system can detect emerging topics
and offer: *This conversation is becoming a separate topic. [Create topic] [Keep here]*.

## 59. Public Communication

Public profiles and broadcast communication can support organizations, creators, communities,
businesses, and public services. Public communication should be clearly separated from personal
connections.

## 60. Data Ownership

Users should be able to export their data, download conversations, export relationship
information, delete content, delete their account, and control retention. Business customers need
organizational retention policies.

## 61. Encryption

Private communication should use strong transport and storage security. Caime should support
end-to-end encrypted conversations where technically appropriate. Important product trade-off:
server-side AI/search capabilities may be limited in E2EE contexts. **The UX must explain this
rather than silently weakening encryption.**

## 62. Relationship-Based Data Boundaries

Relationship information should not automatically become visible to the other party. If Hassan
defines *Sarah → Manager*, Sarah should not automatically see that classification unless Hassan
explicitly chooses to share it.

## 63. Main Mobile Navigation

```
┌─────────────────────────┐
│ Search                  │
├─────────────────────────┤
│ Attention               │
│   Needs You             │
│   Recent                │
│   Waiting               │
│   Quiet                 │
├─────────────────────────┤
│ Chats │ People │ Spaces │
│       │ Actions│ Profile│
└─────────────────────────┘
```

However, the primary experience should remain centered on Attention + Chats, not feature
discovery.

## 64. Web UX

Desktop web should take advantage of screen space with a three-column architecture:

```
┌──────────┬──────────────────┬─────────────────────┐
│ Inbox    │ Conversation     │ Context             │
│ People   │ Messages         │ Relationship        │
│          │                  │ Tasks               │
│ Spaces   │ Composer         │ Files               │
│          │                  │ Decisions           │
└──────────┴──────────────────┴─────────────────────┘
```

The context panel is collapsible.

## 65. Conversation Header

Minimal: `Sarah Smith · Manager · DATA C · ● Available · [Call] [Search] [More]`. Selecting the
relationship chip opens the relationship profile.

## 66. Composer

The composer should remain extremely simple: `[ + ]  Message Sarah...  [ 🎙 ] [Send]`.
Additional functionality appears contextually. Do not turn the composer into a toolbar containing
15 icons.

## 67. Relationship Profile

The relationship profile should answer: *Who is this person to me?*

```
Sarah Smith
WORK · Manager · DATA C
Conversation ──── 2,381 messages
Context ───────── Project Alpha
Shared ────────── 14 files · 3 links
Actions ───────── 2 open · 1 waiting
Privacy ───────── Personal settings
```

## 68. Smart Inbox Rules

Users can customize: Family → Priority; Manager → Priority during work hours; Customers →
Important; Vendors → Normal; Unknown → Requests. Rules can be changed globally or per
relationship.

## 69. User-Controlled Automation

Examples: *Whenever a customer sends a message containing an invoice, save it to Customer Files.*
*Remind me if a vendor hasn't responded within 2 days.* *Don't notify me about work messages after
20:00.* Automation requires explicit setup or confirmation.

## 70. Relationship Templates

Users can create custom defaults:

- **My Customers** — Notifications: work hours · Privacy: limited · Priority: high · AI tone:
  professional.
- **My Vendors** — Notifications: normal · Privacy: limited · Follow-up: 48 hours.

## 71. Relationship Analytics

For individuals: communication frequency, unanswered requests, waiting items, shared assets. For
businesses: response time, conversation volume, unresolved requests, customer activity.
Analytics must avoid turning personal relationships into surveillance metrics.

## 72. Integrations

Caime should provide an integration layer rather than hard-code every external service.
Categories: Calendar (Google Calendar, Microsoft Outlook), Storage (Google Drive, OneDrive,
Dropbox), Business (CRM, helpdesk, ERP), Finance (payments and accounting), Productivity
(task/project systems). External systems remain authoritative for their respective records where
appropriate. Caime should not attempt to become every underlying system of record.

## 73. API

Caime should expose APIs for identity, connections, relationships, conversations, messages,
files, events, tasks, organizations, integrations, and webhooks.

## 74. Developer Platform

Third-party developers can build **Connect Kits** (contextual experiences), **Integrations**
(external service connectors), **Bots** (automated participants) and **Agents** (permissioned AI
actors). All applications operate through scoped permissions.

## 75. Agent Model

Future Caime agents may act as a customer support agent, scheduling agent, purchasing assistant,
family assistant, or vendor assistant. Agents must have an explicit identity (e.g., *Caime
Support Agent*). **Never make an AI agent indistinguishable from a human.**

## 76. Permissions

Permission hierarchy: `Account → Identity → Connection → Conversation → Context → Action`. Each
layer may impose restrictions.

## 77. Data Architecture

Core entities: User, Identity, Person, Organization, Connection, Relationship, RelationshipRole,
Conversation, Participant, Message, Attachment, Context, Topic, Decision, Task, Reminder, Event,
Notification, Rule, Preference, Space, Membership, Integration, ConnectKit, AIInference,
AISuggestion, Audit.

## 78. Event Architecture

Important events: `user.created`, `connection.created`, `relationship.assigned`,
`relationship.changed`, `conversation.created`, `message.sent`, `message.delivered`,
`message.read`, `context.created`, `task.created`, `task.completed`, `decision.recorded`,
`notification.created`, `notification.dismissed`, `integration.connected`. This enables future
automation without coupling every subsystem together.

## 79. Performance Requirements

Caime should optimize for perceived responsiveness: immediate local message rendering;
near-instant conversation navigation; fast cached inbox rendering; incremental synchronization;
lazy loading of historical content; resumable media transfers. Exact SLOs should be finalized
during engineering architecture.

## 80. Reliability

The messaging system must prioritize (1) durability, (2) ordering, (3) idempotency, (4)
synchronization, (5) recovery. **A message should never appear to send successfully and then
silently disappear.**

## 81. Observability

Monitor message latency, delivery failures, connection failures, sync failures, notification
delivery, attachment failures, API errors, AI failures, search latency. Product analytics must be
separated from private message content wherever possible.

## 82. Product Analytics

Useful aggregate metrics:

- **Activation:** account creation; first connection; first message; relationship assignment.
- **Engagement:** active connections; conversations; meaningful actions; retained users.
- **Value:** messages recovered through search; tasks created from communication; follow-ups
  completed; notification reductions; time-to-find information.

The strongest product metric should ultimately reflect: *How much useful communication the user
can manage without feeling overwhelmed.*

## 83. Core Product Metrics

- **Connection Completion Rate** — percentage of new connections successfully established.
- **Relationship Completion Rate** — percentage of connections with a defined relationship.
- **Attention Resolution** — percentage of actionable communication resolved.
- **Waiting Resolution** — percentage of waiting items resolved.
- **Information Retrieval** — time required to find previous information.
- **Notification Efficiency** — important events surfaced versus total notifications.
- **Retention** — whether relationship-aware communication creates sustained value.

## 84. Business Model

- **Personal (free):** messaging; basic relationships; basic search; basic synchronization.
- **Pro (paid):** advanced intelligence; expanded storage; advanced relationship rules; advanced
  search; AI capabilities; automation; multi-identity functionality.
- **Business (paid per organization/user):** business inbox; customer relationships; team
  routing; organization identities; analytics; integrations; automation.
- **Enterprise (custom):** security; compliance; identity integration; retention; administration;
  private deployment options where justified.

## 85. What Caime Should NOT Become

Another Slack; another WhatsApp clone; another CRM; another project-management system; another
social network; another email replacement; another app marketplace; an AI chatbot with messaging
attached. Its center of gravity must remain:

> **People + Relationships + Communication + Context.** Everything else supports that.

## 86. Full Feature Map

```
Caime
├── Identity: Personal Identity · Professional Identity · Organization Identity · Verification
├── Connections: People · Organizations · Connection Requests · Relationship · Relationship History
├── Communication: Messages · Voice · Video · Groups · Broadcast · Calls
├── Context: Topics · Projects · Events · Orders · Shared Context
├── Intelligence: Search · Summaries · Relationship Suggestions · Attention · Memory · AI Assistance
├── Actions: Tasks · Reminders · Decisions · Requests · Follow-ups
├── Assets: Files · Photos · Links · Voice · Shared Data
├── Spaces: Work · Business · Community · Family
├── Connect Kits: Calendar · Orders · Support · Payments · Custom
└── Platform: API · Integrations · Developers · Agents · Administration
```

## 87. Complete User Journey

1. **Join** — Install → Create identity → Discover people.
2. **Connect** — Find person → Connect → Define relationship.
3. **Communicate** — Message → Conversation → Context.
4. **Understand** — Summaries · Search · Memory · Assets.
5. **Act** — Task · Reminder · Decision · Request · Payment · Event.
6. **Maintain** — Follow-up · Waiting · History · Relationship evolution.

This creates the fundamental Caime loop:

> **Connect → Communicate → Understand → Act → Follow up**

## 88. The Most Important UX Principle

Caime should never make users think *"Where is the feature?"* Instead, it should recognize
*"What am I trying to accomplish with this person?"* — then expose the appropriate capability.

A user opens a vendor conversation. Instead of displaying 20 generic tools (Message, Files, Call,
Poll, Calendar, Task, Payment, …), Caime might surface: `Vendor · Order #4821 · Delivery ·
Invoice · Files · Message...`. The interface becomes contextual rather than feature-heavy.

## 89. Product North Star

The ultimate Caime experience should feel like: *a communication system that understands the
difference between people without making the user manage the complexity.* The user supplies the
fundamental relationship. Caime handles the organization around it.

## 90. Final Product Definition

> **Caime** — a relationship-aware communication platform that connects people, preserves
> context, and turns conversations into useful action.

Its fundamental innovation is not another messaging interface. It is the introduction of a
structured layer between identity and communication:

```
WHO → RELATIONSHIP → WHY → CONVERSATION → CONTEXT → ACTION
```

That becomes the foundation on which messaging, search, AI, privacy, notifications, business
communication, and future capabilities are built. The product is therefore engineered around
**Connection** as the primary domain object, rather than around **Chat** as the primary domain
object. That architectural decision is what makes the rest of Caime coherent.
