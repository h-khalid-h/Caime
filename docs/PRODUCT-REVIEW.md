# Product review and refinements

A review of the PRD from product, UX, engineering, trust and business angles. The PRD's thesis
holds: **Connection, not Chat, is the primary object**, and the wedge (relationship-aware 1:1
communication) is narrow enough to adopt and broad enough to grow from. What follows are the
places where the PRD is under-specified, where a literal reading would hurt the product, and the
decisions taken. Each refinement has an id (`R#`) that code and docs cite. Where a refinement
and the PRD disagree, the refinement wins.

## 1. Adoption: the cold-start problem

A messaging product is only as useful as the other side's presence. The wedge needs both people
on Caime, and the PRD does not say how the second person arrives.

- **R1 — Invites carry context and land in the conversation.** An invite link says who is
  inviting and, optionally, the context ("Hassan · Work · DATA C"). It opens in a browser, sign-up
  takes under 30 seconds, and the invitee lands in the conversation already connected. The web
  app is a first-class client, so nobody has to install anything to reply.
- **R2 — Single-player value exists on day one.** Waiting items, reminders and decisions work
  inside one person's view (for example "Waiting for Sarah — contract") even when the other side
  is quiet. This is framed as follow-up, never as contact management (PRD W6).
- **R3 — The first minute is designed.** Sign up → find or invite one person → "How do you know
  them?" (1–3 taps) → first message. **Activation** = a classified connection plus a first
  message within 24 hours (PRD §82).

## 2. Classification without friction or social risk

- **R4 — Classification never blocks messaging.** Every relationship step has "Not now". An
  unclassified connection is gently prompted at natural moments (the header chip reads "Add
  relationship"), never nagged.
- **R5 — "Only you see this" is said at the moment of labelling.** People hesitate to label
  someone "Acquaintance" if they fear it is visible. The privacy guarantee (PRD §62) is
  stated where the anxiety arises, not buried in settings.
- **R6 — Sharing is opt-in per relationship and is what enables mutual confirmation** (PRD §53).
  Complementary roles (Manager ↔ Direct Report, Customer ↔ Vendor) are detected only between two
  shared classifications. Neither side's private label is ever revealed or inferred.

## 3. An attention inbox people trust

An inbox that decides what matters fails the first time it hides something important.

- **R7 — Every placement is explainable and correctable.** Each conversation carries its reasons
  ("Asked you a question", "Manager · work hours", "Due tomorrow"). Moving it to Important or
  Quiet takes one gesture and offers to become a rule ("Always treat Vendors as Quiet?").
  Nothing is hidden: Quiet shows its count and an unsectioned "All chats" view is one tap away.
- **R8 — Needs You is precise before it is complete.** It fires only on explicit signals: an
  unanswered question or request addressed to me, a mention, an open request assigned to me, a
  pending connection request, an overdue item. Content heuristics can mark a message as a
  question; the user can dismiss that in one tap ("Doesn't need me").

## 4. Notifications

- **R9 — Relationship defaults are accepted in one tap during onboarding.** Family: always ·
  Work: 08:00–20:00 on weekdays · Customers: work hours · Vendors: quiet unless important · Other:
  normal. The same screen is where they are edited later.
- **R10 — Urgency is granted by the recipient, not claimed by the sender.** A sender can flag a
  message urgent, but it breaks through quiet hours only if the recipient's policy for that
  relationship allows it (on by default for Family and Manager). This prevents urgency from
  becoming spam.

## 5. One policy model instead of four settings screens

The PRD describes relationship-aware notifications (§32), smart inbox rules (§68), templates
(§70) and privacy by sphere (§34) as separate features. For a user they are one question: **"How
should Caime treat my Customers?"**

- **R11 — Relationship policies.** A policy matches a sphere, optionally a role and organization,
  or a single connection, and sets notifications (always, schedule, important only, mute), inbox
  priority (priority, normal, quiet), privacy audience, AI tone and follow-up time. Precedence
  runs from most specific to least: connection → role + org → role → sphere → default. Templates
  (§70) are named policies. The engine is in `@caime/core` so every client computes the same
  answer as the server.

## 6. One suggestion model

Relationship suggestions (§12), message intelligence (§23), waiting (§29), deduplication (§51)
and topic detection (§58) all produce the same kind of thing: an inference the user can accept,
change or dismiss.

- **R12 — Suggestions are first-class records.** Each has a kind, the target it would change, a
  plain-language rationale ("Based on your shared organization, DATA C") and a status. Nothing
  becomes a fact until accepted (PRD §43). Dismissals are remembered so the same suggestion does
  not return.

## 7. One action model

- **R13 — Tasks, waiting and requests are one record with an owner and an assignee.**
  - owner = assignee = me → my task;
  - owner = me, assignee = Sarah, private → *Waiting for Sarah* (she does not see it);
  - owner = me, assignee = Sarah, shared → a request (in her Needs You, she can accept, decline or
    complete it);
  - owner = Sarah, assignee = me, shared → *Sarah asked me*.

  "Things Sarah asked me to do" (PRD §25) and "What am I waiting for?" (P3) are then single
  queries, and completing a request resolves the requester's waiting item automatically. Every
  action keeps its source conversation, message and a snapshot of the relationship at creation
  (PRD §28).

## 8. Trust and safety

- **R14 — Message requests.** Someone who is not a connection can send one message request,
  which lands in Requests, not the Attention inbox. Links in it are not clickable until the
  request is accepted.
- **R15 — Business is visibly business.** Conversations with an organization show its verified
  identity and a "Business" label so a phishing account cannot pass as a person or a brand (PRD
  §55, §59). Staff reply as the organization; who answered stays visible inside the team.
- **R16 — Agents and bots always say so.** Non-human participants carry a permanent label next to
  their name, in every surface including notifications (PRD §75).

## 9. AI and encryption

- **R17 — Heuristics by default, models when enabled.** Message intelligence, search parsing and
  summaries have deterministic implementations that run on every client and the server, so the
  product works with no AI provider at all. When an account enables AI, a model improves quality
  (rewrite, translate, summarize, natural-language search). All model output is labelled
  "Suggested by Caime" and is never applied without a tap.
- **R18 — Two conversation privacy classes, said plainly.** *Standard* conversations are
  encrypted in transit and at rest by the platform and get server features (search, AI, push
  previews). *Private* conversations are end-to-end encrypted and say what that costs: no server
  search, no server AI, no message previews in push. The UI never weakens a private conversation
  silently (PRD §61). Private conversations are a later milestone; the data model carries the
  flag from day one.

## 10. Scope discipline

- **R19 — Every capability attaches to a relationship or a context.** No global feature menus.
  The composer's "+" shows what fits this relationship (a vendor gets Order, Delivery, Invoice; a
  manager gets Approval, Meeting; family gets Location, Album). This is the PRD's most important
  UX principle (§88) turned into an engineering rule: Connect Kits declare which spheres and
  contexts they apply to, and the UI can only reach them through that filter.

## 11. Accessibility, language and craft

- **R20 — Accessible by construction.** WCAG 2.2 AA contrast in both themes, screen-reader labels
  on every control, dynamic type, reduced-motion support, full keyboard navigation on web (⌘K
  search, J/K to move through conversations, Esc to close panels).
- **R21 — Right-to-left safe.** Message text renders with automatic direction so Arabic and
  English mix correctly; layouts use start/end rather than left/right.
- **R22 — Colour means relationship.** The interface is a calm neutral canvas with one accent for
  actions. The only other colour system is the sphere palette, so colour always carries meaning:
  Family is always rose, Work always blue, Customer always green, and so on.

## 12. Business model

- **R23 — The wedge is free forever.** Relationships, attention, waiting, basic search and sync
  are never paywalled; charging for them would stop adoption at the wedge. Pro sells AI,
  automation, advanced rules, multiple identities and storage. Business sells the inbox, routing,
  organization identities, analytics and integrations. Plans are entitlements in the data model
  from day one; billing is an integration (see R25).

## 13. Additions the PRD implies but does not state

- **R24 — Presence and status.** Available, Busy, Away plus a custom status line (the "●
  Available" of PRD §65), filtered by the viewer's relationship through privacy rules.
  Sessions and devices are listed and revocable; account recovery works without email through
  one-time recovery codes.

## 14. Honesty about external dependencies

- **R25 — Built to the integration point, enabled by configuration.** These need accounts or
  credentials that only the owner can create, so they are implemented behind configuration and
  listed as blocked until configured: production mobile push (APNs/FCM via Expo), App Store and
  Play distribution (EAS), transactional email (SMTP), OAuth integrations (Google, Microsoft,
  Dropbox), payments (Stripe), TURN relays for calls, speech-to-text for voice transcripts, and
  the EasyPanel API for deployment. Web push uses self-generated VAPID keys and works without any
  third party.

## 15. For everyone: any gender, any age, any use case

Caime is for a grandparent, a teenager, a founder, a nurse and a support team. The same app has
to feel right to each of them.

- **R26 — Neutral defaults, personal expression.** The default look is neutral: Plum bubbles for
  your own messages, ink for actions. Expression is a personal choice: bubble colour from the
  brand palette, and a Playful or Minimal character layer (see `BRAND.md` B7). Business and
  organization surfaces are always Minimal.
- **R27 — Never assume gender.** Caime never infers gender from a name or a photo (PRD §44), and
  its copy never needs to: *"Sarah's role?"*, not *"What's her role?"* (the PRD's §11 example is
  corrected). Pronouns are an optional field the person sets for themselves, shown under their
  own privacy rules. Where the product refers to someone, it uses their name.
- **R28 — A taxonomy for every family and every job.** Neutral family roles come first (Parent,
  Child, Sibling, Partner, Spouse, Grandparent, Grandchild, Relative, Guardian); gendered ones are
  available (Mother, Father, Sister, Brother, Daughter, Son, Wife, Husband, Aunt, Uncle, Niece,
  Nephew, Cousin); Step-family, In-law and Chosen family are first-class; every sphere accepts
  custom roles. A name is one free-text field, in any script, of any length, and can be a single
  word.
- **R29 — Age-aware safety.** The minimum age is 13 (16 where local law requires), asked once as a
  date of birth and never shown to anyone: an age is exact, from the day someone turns it where
  they live (29 February counts as 1 March in other years), and can't be changed in the app. Accounts under 18 get protective defaults: discoverable
  by handle only (never by email), message requests only from people who share a connection, no
  location sharing. Adults can never find an under-18 account through people search.
- **R30 — Comfortable for older adults and for anyone on a hard day.** Text follows the system
  size up to 200% without clipping; touch targets are at least 44 pt; every swipe and long press
  has a visible alternative; tab bars always show labels; voice notes and calls are one tap from
  every conversation; copy is plain language.
- **R31 — Culture and locale are data, not assumptions.** Work-hour defaults follow the workweek of
  the country someone lives in (Sunday–Thursday in Egypt and Saudi Arabia, Monday–Friday in most of
  Europe and the Americas; asked at sign-up, suggested from the device's time zone) and are
  editable; an amount on a card starts in the currency of where the organization is based in a
  business conversation, else of where the person lives, and is rounded as that currency is
  (three decimals for the Kuwaiti dinar, none for the yen); dates, 12/24-hour time, numbers and
  name order follow the language someone chooses to have things written in (Language and region;
  the device's until they choose), the pickers' too; layouts are right-to-left safe (R21); icons and colours avoid culture-specific meanings; slow
  networks and low-end phones are first-class (offline-first, no media auto-download on cellular
  by default).
- **R32 — One product, every use case, through the model, not modes.** Families, friends,
  freelancers, clinics, schools, shops and support teams use the same primitives: relationships
  and policies decide attention and privacy, identities separate personal from professional,
  Spaces hold communities, and the Business inbox serves teams. No persona needs a different app.

## 16. Brand

- **R33 — The brand board is adopted, calibrated for communication.** Identity (wordmark with the
  heart-dotted *i*, the character mark, palette, Nunito + Inter, voice) is Caime everywhere; the
  characters become the Caishy Friends stickers and the guides of empty states; the board's shop,
  collectibles and story feed are out of scope (PRD §85). Details and rules: `BRAND.md`.

## 17. The name, and a super-app brainstorm (2026-09-28)

The owner renamed the product **Caime**, for the domain **cai.me**, keeping the brand and its
characters, and shared a brainstorm by another AI agent that describes Caime as a super-app: a
ledger of its own with pay-in and pay-out rails, a mini-app runtime, an autonomous agent,
passkeys, Signal-protocol encryption for every chat, stories and feeds. Each idea was weighed
against the PRD's centre of gravity (§85: people, relationships, communication, context) and
against what it would take to do properly. What fits is adopted below; what doesn't is recorded
with its reason, so it isn't proposed again without new facts.

- **R34 — The product is Caime.** One name everywhere: the apps, the pages, the wordmark (the
  same heavy rounded lettering, with the pink heart over the dotless *i*), links, and the
  assistance layer ("Suggested by Caime"; an organization's agent is "Caime Support Agent").
  Formerly Caishy, and before that CONNIQT. The rest of the brand stands (R33): palette, type,
  voice, and the characters with their names, including Caishy *The Dreamer*, who keeps leading
  the Caishy Friends stickers, a mascot with a name of its own as Duolingo's is Duo. The assistant
  gets no human name ("Cai"): a person's name on an AI blurs the line §75 keeps sharp, and Cai is
  also people's name (a Welsh given name, a common Chinese surname).
- **R35 — A link people can say: `cai.me/@handle`.** Every person and organization has one, for a
  card, an email signature or a QR code. It opens their public profile on the web, or the app
  where it's installed (universal links on iOS, app links on Android), and survives sign-up as
  `@handle` links do now. It is a way in, not around: messages still go only as the person's
  privacy and message requests allow (R14). The brainstorm's `/pay`, `/request`, `/claim` and
  `/app` routes are not adopted (R38, R39).
- **R36 — Passkeys, once the domain is final.** Signing in with a passkey (Face ID, a
  fingerprint, a security key) on web, iOS and Android becomes the first way in; a password is
  optional once a passkey exists, and recovery codes stay (R24). It waits for `cai.me` because a
  passkey belongs to the domain it was made on: one made on today's address would stop working
  after the move. Profiles, contacts and history are not encrypted with a key from a seed phrase
  ("self-sovereign identity"): a lost phrase would lose the whole account, and search, requests,
  safety and relationships need the server to read what they work on. End-to-end encryption
  stays R18's choice, made per conversation, with its cost said plainly; making it the only kind
  would take search, AI, previews and relationship intelligence from every conversation.
- **R37 — Several steps, one approval.** When the assistant finds more than one thing to do in a
  conversation (a task, a reminder, a reply), it can offer them as one card listing each step,
  done only when the person approves it, each step undoable as today (§42–43, R12). A suggestion
  never books, buys, pays or shares on its own, and nothing reaches a service outside Caime from
  one without the person's explicit tap.
- **R38 — Money stays with those licensed to hold it.** Caime never holds, moves or converts
  money: no wallet or balance, no transfers between people, no cash-out, payout claim links,
  currency exchange, stablecoins or ledger of its own. Each would make its operator a regulated
  payment or e-money institution in every country it serves (licences, safeguarding customers'
  funds, anti-money-laundering and know-your-customer programmes, fraud and chargeback liability)
  and the system of record §72 says Caime should not become. What the PRD does ask for (§41, §86's
  "Payments" kit, §87's "Act: Payment"): an organization's card (an invoice, an order, an
  appointment) can carry **Pay**, which opens the organization's own checkout (through Stripe
  Connect, the organization being the merchant, or a payment link it gives), and the card says
  it's paid when the provider tells Caime so; and a **Split** card records who owes whom, and when
  it's settled, moving nothing. Both are later work; Pay needs the owner to decide on Stripe
  Connect for the live account, and whether Caime takes a fee on it (R23 stands until then).
- **R39 — Extensions stay declarative.** Others extend Caime through the API with scoped
  permissions: cards (custom Connect Kits), bots, agents and webhooks (§74). There is no runtime
  for other people's code inside the app and no mini-app marketplace: running third parties'
  code beside people's conversations is a large attack surface, the app stores restrict it, and
  a marketplace exposed everywhere is what §41 and §85 rule out. What fits is a typed SDK for the
  API and webhook signatures (`@caime/sdk`), later.
- **R40 — No stories, feeds or engagement targets.** The brainstorm wants people to open the app
  "dozens of times daily"; the PRD measures the opposite, how much useful communication someone
  manages without feeling overwhelmed (§82). Stories and ranked feeds are the social network §85
  rules out. Broadcasts (§59) stay chronological and apart from personal connections; paid
  subscriptions and tips on them are payments (R38). Watches show Caime's notifications from the
  phone, and the web app is the desktop app, so neither needs an app of its own.

- **R41 — Private history survives a lost phone, never through Caime.** A private conversation
  (R18) must not be lost with the device it was read on: Caime is for relationships that run for
  years, and people expect their history to follow them. So a person may make a **recovery key**
  (160 random bits, shown once, kept nowhere by Caime), which stands for a device of their own
  that every private message is sealed for too; typed on a new device, it reads what was sealed
  since the key was made and makes the device theirs, with their security code unchanged. And a
  phone keeps its keys when its account signs out, since it's personal and behind its lock, so
  signing in again picks up where it left off; a browser still lets them go. Without a key,
  losing every device loses the history, and the app says so where the key is made. Never a
  server-side escrow, never a password-derived key, never a device's private keys leaving it:
  the recovery device is one more device, vouched for by the person's own chain.

- **R42 — An organization closes; a verified one can come back, only through its domain.** An
  organization's handle is on its shopfront, menus and receipts, so a closed organization's
  handle can't simply pass to whoever asks next; and yet the organization itself must be able to
  return (a deleted account, a team that dissolved), or its handle is dead for good. So: an
  organization closes when its owner closes it or its last person leaves; its page goes, its
  team's seats end, its apps and agent stop, and its customers keep what it sent them, to read,
  never to answer. Closed **unverified**, its handle is held a year like a person's, then free.
  Closed **verified**, its handle waits for the organization: whoever asks for it is told whose it
  was and that proving its domain again takes it back, and doing so continues it under the same
  handle, name and page, with them as its owner, as a new organization: the old team, apps and
  followers don't come back (they'd be someone else's to vouch for), customers' blocks of it do,
  and their old conversation stays as it was beside a new one. Never a handle handed over by
  hand (Caime can't tell who the organization is; its domain can), never a closed organization
  reopened in place (its old team would find themselves on someone else's), and only the
  operator deletes a closed one for good, on a lawful request.

- **R43 — An organization owns spaces; its people are still people.** PRD §40 puts spaces
  "around an organization" and §39 wants relationships at the organization's level, so an
  organization's owner or admins can start a **space that is the organization's** (a branch, a
  project, the whole team): its team can be in it without being connections (colleagues share a
  space by working together, R19 stands for everyone else), it says whose it is, leaving the team
  leaves it, and when the organization closes the space stays with its people as an ordinary one
  (R42: nothing anyone was in is taken away). The organization's page lists its spaces you're
  in; its owner and admins see them all and can join any, as its admin (they run the place).
  A person's profile shows the organizations they're with, as their professional details are
  shown (§35, privacy's "identityDetails"): the same rule as "Verified at", now with a way to
  the organization's page.
  What it doesn't do: an organization never *owns a person's record*. A relationship is the
  definer's (§10), a person's professional identity is theirs to show or hide (§35, R27), and the
  organization's side of a person is its Business inbox thread and its team seat, nothing more;
  someone on three teams is three seats, not three people. An **action of the organization's**
  (a task in a customer's conversation the team must do, held by whoever holds the thread) is
  the next step of this, designed but not built: the thread's assignee is its assignee, the
  whole team sees it in the inbox, and reassigning the thread reassigns it. Reviewed against the
  super-app brainstorm again on 2026-09-29: nothing new to adopt; its risk-scoring engine, ledger,
  seed-phrase identity, biometric guardrails and fee table all belong to what R36, R38 and R39
  leave out.

- **R44 — The web reads without signing in.** A link people say (`cai.me/@handle`, R35) has to
  unfurl where it's pasted, and what Caime is has to be readable by a search engine or an answer
  engine, or the wedge stays a secret. So the shell the web app boots from is a page first: the
  landing page for a visitor who isn't signed in (what Caime is and for whom, sign in, start), a
  person's or an organization's public face at `/@handle` and `/o/handle` (title, description,
  Open Graph and Twitter cards, canonical, JSON-LD, a plain body), a real 404 for a handle nobody
  has, `robots.txt` and `sitemap.xml` of Caime's own, and `Permissions-Policy`. The app takes
  over the moment it renders, so nothing changes for anyone signed in. What's rendered is only
  what's already shown to everyone (ADR-10, with nobody as the viewer): a person's page exists
  only while they can be found by handle (the same switch, which now says so), never under 18,
  and shows only fields whose audience is everyone; an organization's page is its profile, which
  was public already. People are never listed in the sitemap: a page is found by its handle,
  not in a directory. Its logo and a photo shown to everyone are served without sign-in for the
  cards; nothing else is.

- **R45 — A chat from before Caime comes along.** The first days with someone on Caime are empty
  where WhatsApp had years, and that emptiness is what sends people back. So a one-to-one with
  someone you're connected with offers to bring over your WhatsApp chat with them: the person
  exports it on their phone (without media), picks the file, and it's read on the device
  (`@caime/core/whatsapp`: Android's and iOS's lines, 12- and 24-hour clocks, day- or month-first
  dates decided from the file or asked, continuations, WhatsApp's own lines and media notes
  counted and left out). It says which name is theirs (guessed from their display name), and the
  lines land as a topic of the one-to-one (PRD §16), dated as they were written, each marked
  **Imported** with who brought it, and a line at the end saying so; both have read them, since
  both wrote them. Nothing is notified, suggested, inferred or moved from the past (R12): it
  goes beside what's said here, never into it, and search finds it as it finds anything said.
  Only into a connection, past blocks, five imports an hour, up to 20,000 messages. A group
  export is refused: it has more than two names. What it doesn't do: Telegram, iMessage and
  media (each is another reader and an upload; the words are what the wedge needs first).
