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
  also people's name (a Welsh given name, a common Chinese surname). *Amended by R66:* "Cai" is used as
  Caime's short name (not a persona's) where the intelligence is asked for.
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
  cards; nothing else is. A visitor who isn't signed in stays on the page they were sent (the
  app mounts only for someone signed in, since mounting would hide the page and send them to
  Welcome; measured on 2026-09-30, the page was gone within half a second before this): the
  server sends a visitor the page without the app's scripts, and a shell that reaches the app
  anyway (a kept copy) mounts nothing on it (`caime-page` in the head says which page it is);
  the
  next step of R44 is the page drawn by the app itself for a visitor, with a way to write.

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

- **R46 — Caime never reads other apps' messages, and never speaks for you.** A brainstorm on
  2026-09-30 proposed a "unified inbox and edge-automation engine": an Android service reading
  WhatsApp, Telegram, Signal, LINE, WeChat and Messenger notifications, mirroring them into
  Caime, auto-replying to every sender with "join me at cai.me/…", and relaying it all to iOS
  and the web through an Android "hub". Reviewed and declined, whole. Why: (1) it breaks the
  other platforms' terms (Meta bans automated and bulk messaging and unofficial clients; the
  person's own WhatsApp account would be the one banned), and Google Play allows the
  notification-listener permission for narrow purposes, never for copying another messenger's
  messages into a competitor; (2) the people whose messages would be copied never agreed to it,
  which is the opposite of how Caime treats what someone else wrote (R2, ADR-10); (3) a reply
  sent in someone's name to everyone who texts them is spam under their name, and the brand
  would be the spam; (4) an Android-only hub with a relay for other apps' plaintext is a second
  product and exactly the surface Caime refuses to hold (R18, SECURITY); (5) iOS can't do it at
  all. What of it makes sense, Caime already does or does on purpose: the empty first days are
  answered by bringing a chat over with the person's own export (R45), the "I'm on Caime as
  @handle" line is a share the person sends themselves (connect, onboarding), and finding people
  is by handle and link (R35). Two compliant paths stay open for later, each the owner's call:
  organizations taking WhatsApp Business messages into the Business inbox through Meta's
  official Cloud API (a real B2B feature: verification, per-message fees), and finding contacts
  who are already here by hashed phone numbers, with consent on both sides (PRD §46 rules).
  The rule this leaves: nothing Caime ships reads another app's messages or sends as a person
  without their tap.

- **R47 — Pro sells the depth of the wedge, never the wedge.** The review found paid tiers
  selling capacity (AI assists, gigabytes) and nothing of what Caime is for. Decided on
  2026-09-30 (the owner handed the decision over): the wedge stays free (R23), and Pro adds what
  goes deeper into it. **Relationship insights** (`GET /v1/me/insights`, Settings › Relationship
  insights): from your own one-to-ones only, for you only, how many connections you have and
  how you labelled them, who you wrote with in the last 30, 90 or 365 days against the time
  before, who you write with most and your share of it, who's gone quiet (written with before,
  not since), how fast you answer and are answered (a wait runs from the asker's last message),
  who writes first after a quiet day, and when in your day you write. Never a word of anything
  said, never a business conversation or a group, never anyone else's labels, and shown to
  nobody else. On Personal the screen says what it would show and where Pro is (a `403
  plan_limit` with `nextPlan`). **Automations** are counted by plan (Personal keeps 5, Pro 50,
  `AUTOMATIONS_MAX` the most any plan allows); a lower plan removes none. AI assists and files
  stay as they were. What Pro doesn't sell, and why: several identities (not built; the wedge's
  privacy model already gives each relationship its own face, R2), history beyond a year (taking
  history away is taking the wedge away), search (free, R23).

- **R48 — Email, at last.** R25 listed transactional email as built to the integration point;
  it wasn't built. Now it is, for the two things an account can't do without: confirming the
  address (six digits at sign-up, kept hashed, a day, ten tries, a new one on request; Settings ›
  Security takes them) and a forgotten password (a link to the address, hashed, an hour, once;
  "Forgot your password?" leads there, the answer is the same for any address so nobody learns
  which are here, and opening the link signs the person in on that device and out of every
  other, tokens and app grants included, as a recovery code does; it also confirms the address,
  since the mailbox was proved). Plain text, from `EMAIL_FROM`, through `SMTP_URL`, sent after
  the response and never through the job queue (a link is a secret; the queue keeps payloads).
  Without an SMTP server nothing is sent, and the routes say so (`503 email_unavailable`), so
  recovery codes stay the way back until the operator sets one (R25). Nothing else is mailed:
  no digests, no notifications, no marketing.

- **R49 — Reports are reviewed.** Reports were stored and read by nobody. Now the operator has
  a page of their own, `/admin/reports` (plain HTML, a script of its own under the web's CSP,
  the token kept in the tab), over `GET /v1/admin/reports`: each report with who reported, whom
  or which organization, the reason and details, and what's left of the thing now (a message's
  words unless sealed or already removed, an update's unless taken back). The operator moves a
  report along (reviewing, dismissed, actioned) or acts: the message removed for everyone,
  through exactly the code its sender's own delete runs (`lib/moderation.ts`), or the update
  taken back as its organization would. Every action is in the audit log with no actor (the
  operator isn't a user), and a reported person can be suspended: every session, token and app
  grant ends, sign-in answers `403 suspended` with the reason to write in, nobody new finds them
  by handle or on a public page, and those already in touch keep what they have; nothing of
  theirs is removed, and the operator lifts it (`PUT /v1/admin/people/:handle/suspension`).
  What it doesn't do yet: delete an account for someone, or write to the reporter; a sealed
  message is never readable, so a report of one is judged by its reporter's words alone.
- **R50 — One identity, one place to start.** The goal of 2026-09-30 found two kinds of
  fragmentation: an organization's things reached only through that organization (a space
  started only from Spaces, an inbox only from the rail's first team), and a look that was
  anyone's (cards of captions, uppercase overlines, a generic landing page). Now, starting
  anything begins in one place: `/new-space` asks whose space it is ("Mine", or each
  organization you run; hidden with nothing to choose, required otherwise, chosen already from
  an organization's page), and the Chats "+" sheet offers a conversation, a group and a space
  alike. Someone on several teams is a step from each: a team row in the Business inbox, the
  rail's Business returning to the inbox opened last, Spaces filtered by owner (All · Mine ·
  each organization), settings naming the teams. And the look is Caime's own, on the web and in
  the app alike: facts are stated as a spec sheet (`Spec`: a mono label, the value, hairlines;
  a person's "and you", an organization's handle/kind/verified/since, a space's kind/people/
  organization, About), every section label is the same mono in sentence case (nothing in the
  app is uppercase), every auth screen carries a mono kicker under the brand panel's mono
  tagline, and the public site is a spec sheet with a layer explorer (radio inputs and CSS, no
  script) rather than cards; the invite, the 404 and the policy pages take the same masthead.
  The site about Caime is five such pages beside the landing page (for organizations, pricing,
  security, developers, about), read by everyone without the app, every number on them read
  from the code. Rules from it: a new fact list uses `Spec`; a new way to start something joins the sheet and
  the owner picker, never a screen of its own; a new kind of owner joins the Spaces row and the
  Business row; mono is for labels, never running text, and nothing is uppercase.
- **R51 — Caime's own calendar, and bookings on it.** Calendar sync waited on Google's and
  Microsoft's OAuth credentials (⛔), and with it the thing a clinic would pay for: bookings. The
  calendar is Caime's own first, and sync to a provider an add-on later: what the feed already
  gathers (meetings and appointments agreed in conversations, actions with a due date) is a
  Calendar in the Actions tab, by day, each line saying whom it's with and what they are to you,
  from the relationship you gave them; and an organization's inbox has Bookings: the
  appointments asked for or confirmed in its customer conversations, with the customer, for the
  team. Caime stays the record: nothing on the calendar changes a date; a card is confirmed,
  moved or cancelled in the conversation. Visibility follows the relationship as everything does:
  a customer's own calendar shows the organization, never which person on its team; the team
  sees customers; nobody sees anyone's calendar but their own. Bookings sit on it: an
  organization sets bookable hours (a zone, a slot length, a range per weekday, how soon and
  how far ahead), the open slots are those hours less the appointment cards already in its
  conversations (worked out on request, never kept), a customer or the team books one from a
  picker on the appointment card, and its AI agent offers the next few and books the one the
  customer picks as a requested card the customer confirms, never a time it wasn't given and
  never a booking it made alone. The calendar also quiets the phone: with "Work waits until it
  ends" on (Settings · Notifications, off until asked), a message from work, a customer, a
  vendor or a professional that arrives during an agreed meeting or appointment is held until it
  ends, as quiet hours hold it; family, friends, reminders, calls and anything urgent the
  recipient allows come through, and nothing is held once the meeting is over. And it says, by
  relationship, what someone is in: two privacy fields, "In a meeting" (busy, and until when;
  connections by default) and "What the meeting is" (its title; family by default, and whoever
  is in the conversation it was made in, who know anyway), both hidden by a limited
  relationship, shown as a "now" line on their profile and nowhere else: never in a list, never
  anyone's calendar. Provider sync (two-way, with Google and Microsoft) stays an add-on behind
  their credentials.
- **R52 — Recording calls and meetings: consent first, paid, never private, not before a
  provider is tested.** Recording a call into a transcript, a summary and actions is the
  commitment engine's natural extension (PRD §42 "Act"), and it waits on the speech-to-text
  provider the roadmap still lacks (⛔). When it comes, these are its rules, decided now so the
  design starts from them: every participant consents each time, with an indicator everyone
  sees for the whole recording, and anyone's no means it never starts (recording without consent
  is a crime in places Caime serves, the UAE among them); never in a private conversation (the
  server can't record what it can't read, and it never will); everyone on the call gets the
  recording and the transcript, so Caime never holds a recording one side has and another
  doesn't; stored encrypted at rest, kept for a period the organization's owner sets and deleted
  on anyone's request (health conversations are special-category data under GDPR); summaries and
  actions run on the smallest model that does the job, only when someone asks; a Pro and Business
  feature with monthly minute allowances, since transcription costs money per minute and the free
  wedge can't carry it (the allowance fields join `plans.ts` with the feature, with numbers set
  from the provider's price). Before building: test candidate providers on real Egyptian and Gulf
  clinic calls, since most engines handle Modern Standard Arabic far better than the dialects
  spoken in them, and choose one with a data processing agreement that doesn't train on customer
  audio. Nothing of this is in the code yet, on purpose: the consent flow is the first thing
  built, and it's built against a provider that passed the test.
- **R53 — Organizations first; their customers get the wedge.** The review of 2026-10-01
  (docs/REVIEW-2026-10.md) found two products sharing one model: a messenger that needs both
  sides to join, and a business messaging tool (a verified page, one inbox, an AI agent that
  books, apps, updates, insights) with a clear buyer who brings the other side along. Caime
  goes to market through organizations, one place and one kind at a time (clinics first, where
  the pain of boss, customer and mother in one list is sharpest and bookings are the daily
  job), and the consumer product is what their customers receive. What that changes in the
  product: an organization's page is its door (a visitor who writes lands in the conversation
  as an invitee does, with a QR code and a short link the app makes for the door, the receipt
  and the bio), its onboarding is written in the order a clinic sets things up (hours,
  bookings, the agent's text, the team), and "Verified" is explained to the customer in one
  line. Nothing of the wedge moves behind the organization: a person without one still gets all
  of it, free (R23). WhatsApp Business through Meta's Cloud API stays the owner's call (R46), and
  local prices and payment methods theirs too; the product side of each is built to the
  integration point (R25).
- **R54 — Caime speaks its customers' language, and gives an organization what its lawyer
  needs.** Two consequences of R53, decided together. First, the interface in Arabic: R21 and
  R31 made layouts, directions and locales ready and left every string in English; the strings
  move to one table per package with English as the source, the language follows the device
  (chosen in Language and region, `safeLocale` deciding), Arabic is the first translation
  (reviewed by a native speaker so it reads as Caime: names not pronouns, sentence case, no
  guilt), the web page carries `lang` and `dir`, and the public site is in both. The E2E suite
  runs in Arabic with screenshots. Second, an organization is a controller of its customers'
  conversations and Caime its processor: an organization exports its own conversations, erases
  a customer's on that customer's request, sets how long business conversations are kept, and
  sees who processes its data (the host, Anthropic for its agent, Stripe, Cloudflare for calls,
  Expo for push), which the privacy page and a data processing agreement read from one list in
  the code. The agreement's words and a lawyer's review are the owner's (⛔); the product ships
  first so there is something to review.
- **R55 — The third language is French, and a language is one list.** Arabic (R54) and
  English cover the Gulf, Egypt and the Levant; the part of the first market
  (docs/COMPETITIVE.md: the Middle East and North Africa, through organizations) they leave out
  is the Maghreb and Lebanon, where a clinic's or a shop's business runs in French. French is
  also left to right with plain plurals, so it costs the least to add well, and it reaches the
  francophone buyers of Europe without a second decision. Spanish would open a new continent,
  which R53's "one place and one kind at a time" rules out for now. A language joins
  `INTERFACE_LANGUAGES` and the preference's enum, gets a catalog in core
  (`locales/<lang>.ts`) and one on the server for what only it says (`<lang>-server.ts`), and the catalog
  tests run over every language, so nothing else in the code names a language: the setting, the
  site's switch (every other language by its own name), the `hreflang` alternates and the Open
  Graph locale all read the list. French is written for a reader of either gender ("vous", no
  participle about the reader where a noun phrase works), in sentence case, with French
  punctuation; a native speaker's review is owed, as Arabic's was.
- **R56 — The first five minutes earn the rest.** Sign-up asked for six things and then stopped
  for recovery codes before anyone had seen a message; a person who came through a friend's
  link, an organization's door or an app's consent read a page on how Caime works first
  (docs/REVIEW-2026-10-05.md, UX H). Now: the country is suggested from the device's time zone
  (chosen, never typed); onboarding is two steps, how Caime works and your people, and someone
  who came for a person, an organization or an app goes straight to it; the recovery codes wait
  at the top of Chats, on the device that made them, until the person says they're saved, which
  the account remembers (`recoveryCodesSeen`) so no device asks again, and gone before they were
  saved (a reload on the web) the card makes new ones with the password. They are still the only
  way back without mail (R25, R48), so the card never goes away by itself; it only stops
  standing in the way.
- **R57 — Setting up is not the day's work.** An organization's page carried everything at once:
  the door, the domain record, retention, hours, the AI agent, apps and the plan, above the team
  and between the inbox and the spaces, so a receptionist opening it to reach the inbox scrolled
  past a clinic's settings every time (docs/REVIEW-2026-10-05.md, UX M). Now the page is the
  daily work (the inbox, updates, spaces, the team, insights) and setting up is its own screen,
  `/o/<handle>/setup`, for the owner and admins, in the order a clinic does it (R53): the door,
  proving who you are, your customers' data, hours, who answers first, apps and the plan. The
  page offers it in one row that says what's next (verify the domain, then set hours), and the
  team's other members never see it. One screen to set up, one to work from.
- **R58 — Bookings are a catalog, for people as well as organizations.** R51 made bookable
  hours and open slots; what it booked was one thing, "an appointment", written in a text field,
  for an organization alone. The owner's brainstorm (2026-10-05) asked for the rest, and each
  piece was checked against the product before it was kept. *Who takes bookings:* a host is a
  person or an organization. A tutor, a consultant or a therapist is a person on Caime, in the
  spheres the appointment kit already serves, so a person sets hours and a catalog in
  Settings · Bookings as an organization does in its setup; the shape is one (`BookingHours`,
  `BookingItem`), the slots are one function, and a person's own agreed meetings and
  appointments (any conversation) make them busy, so a consultant is never booked over a meeting
  they already have. *What is booked:* a catalog item ("Haircut", "Consultation", "Duplex
  room"): a name, a price or none (a free item has no price, so there is no Paid switch to
  disagree with its price), a unit (minutes or days) and a length (45 minutes; a day), how many
  may be taken at once (its capacity), how many one booking may take (a quantity, default 1: for
  minutes, places, "for 2"; for days, days, "3 nights"), who may book it (its audience), who on
  the team does it (its providers), and whether the booker writes what it's for (a "topic" item,
  for the consultant who takes any question). The card's "For" is then a choice from the host's
  catalog, and the text field stays only where there is no catalog, so nothing a clinic set up
  on R51 changes under it. *Concurrency:* the brainstorm wanted overlapping bookings off for
  people, on for organizations with a default limit of 100. The second half was refused:
  capacity belongs to the item (five chairs, one consultant, twelve rooms), the examples in the
  brainstorm say so themselves, and a default of 100 would mean nothing is ever full, so a
  clinic would never see a taken slot until a customer stood in it. Every item starts at a
  capacity of 1, which means "full once one is booked", and a host raises it per item, up to
  100 (the ceiling, not the default). A hotel's rooms are an item with unit days and the rooms
  as capacity: a booking of three nights takes one unit each night, and the "room calendar" is
  the same open-slot calculation, never a second kind of thing. *Price:* a record, never a
  payment (R38, GOAL): the card says "200 EGP, paid to Swibba, not through Caime"; the local
  currency's payment stays the owner's item (⛔). A paid item is adults-only, as every card
  about money is (R29). *Assignment:* an item names the team members who do it, or anyone
  (Auto). The customer's conversation never names a team member (R15), so who does an
  appointment is kept on the card for the team alone (`booking.providerId`, masked for the
  customer as every team id is) and shown on the Bookings view, where it's changed in one tap.
  "Auto" is settled when the team confirms the booking (the one human act that is always before
  the time): the free member with the fewest bookings that day; an item with named providers
  is open only when one of them is free, so capacity and a person's one-at-a-time hold at once.
  *Who may book, and from where:* an item's audience is public (anyone, even a visitor who
  signs up for it), connections (anyone connected, or a customer who has written), or spheres
  (family and friends for a person; a tutor's "friends" rate), read by the same relationship
  the privacy evaluator reads. A person's or an organization's public page lists the public
  items as spec rows with price and length and offers "Book", beside "Message", only when at
  least one is public; signed in, the profile offers Book where an item's audience lets the
  viewer, and a `?book` link opens the card's form, as a door opens the conversation (R53). A
  stranger's booking of a person is a message request carrying the card (one message until
  answered, as any stranger's). Call stays where calls are, in the conversation one tap away: a
  call needs the conversation's context and the device that answers it. *Before it happens:*
  the brainstorm asked for the background work ahead of a dated thing ("analyse the week's
  chats, mail, meetings and documents and draft the report for the weekly meeting"). Caime has
  no mail and holds no documents but what's shared in conversations, and anything drafted is a
  suggestion (R12), so the shape is a brief: for an agreed meeting or appointment in a work,
  customer, vendor, professional or service relationship (never family or friends, who are not
  a report), each participant gets, an hour before, what Caime already remembers of the two of
  you since the last such card: decisions, promises open either way, questions unanswered,
  files shared, actions due, and, with AI assist on and an allowance left, a bounded summary
  of the conversation since then through `runAi`. Rules first, model only with a key (ADR-12),
  nothing written anywhere but the reader's own view, never from a private conversation, and
  the brief opens from the card ("Before"), where it's read on demand too. A recurring card
  ("weekly") is a later layer; each occurrence is a card, and each gets its brief.
- **R59 — The fourth language is Turkish.** By R55's rule (one region, through organizations):
  Arabic, English and French cover the Middle East and North Africa; the market next to it that
  already serves it is Türkiye, whose clinics treat Arabic-speaking patients by the hundred
  thousand a year and run their business in Turkish, so a Turkish clinic with Arab customers is
  R58's booking catalog exactly. Turkish is left to right, has no grammatical gender (R27 costs
  nothing), and a counted noun takes no plural after a number, so `trn` is one form; it costs
  the least to add well, as French did. Urdu is the next candidate (the Gulf's workforce, and
  right to left, which Arabic already paid for), then Spanish when a new continent is the
  decision. Turkish joins `INTERFACE_LANGUAGES` as `tr` with its catalog in core
  (`locales/tr.ts`) and the server's (`tr-server.ts`); nothing else names it. Written for a
  reader of either gender in "siz", sentence case, with Turkish punctuation; a native speaker's
  review is owed, as for the others.
- **R60 — Orders are the catalog too.** The owner's next idea (2026-10-05): ordering beside
  bookings, in settings and on a card. Checked against what exists: Caime already had an "Order"
  card (`order_status`), a record of an order placed elsewhere with its number, what was ordered
  and the total. A second card also called "Order" would split one idea in two, so the card
  stays one and grows the way the appointment card did in R58: when the host takes orders, its
  form is a picker over the host's catalog, and when it doesn't, it's written by hand as before.
  The catalog stays one too: an item is booked by the minute, by the day, or ordered by the
  piece (`unit: 'each'`: a dish, a cake, a bag of coffee), with the same price, audience and
  per-booking limit ("in one order, up to"); something ordered has no time to hold and names
  nobody to do it. A host turns orders on with ordering settings beside its hours (how they're
  had, pickup or delivery or both, and a line customers read first). The customer picks
  quantities, the server checks every line against the catalog and the audience, and fixes the
  card: the lines with each price then, the total where one currency allows it, the way it's
  had, and a six-character order number a person can read out; the card reads as any order
  does (number, what was ordered, total) and moves placed → confirmed → ready to collect or
  shipped → collected or delivered. A price stays a record, never a payment (R38); the card is
  adults-only as every card about money is (R29). Public items sold by the piece are listed on
  the public pages with "Order from", the profile and the organization's page offer Order, and
  an `?order` link lands on the card's form. Later layers: stock that runs out, an Orders view
  for the team beside Bookings, the AI agent taking an order, options on an item (sizes, extras).
- **R61 — Collections, and a page for each thing offered.** The owner's next idea
  (2026-10-05): an organization keeps several collections (bookings, products, services), and a
  public item or collection has its own address (`/o/<handle>/<item>`) so search and answer
  engines find it. Refined: a collection is a shelf over the one catalog, never a second
  catalog, so a clinic's "Treatments" and "Products" are still booked and ordered through the
  same cards; it's a person's too (`/@<handle>/<item>`), as bookings are. A collection has a
  name, a line, an address and an audience, the same audiences as an item (everyone,
  connections or customers, a person's spheres), and an item in it is seen only by whom both
  allow. One address space per host: an item's and a collection's never collide, made from the
  name in any script (Arabic stays Arabic, as people search in it), and never one of the
  host's own words (`setup`, `inbox`, `book`). A public one is a page of its own, readable
  without the app: its words, price and length, a Book or an Order that lands on the card's
  form with the item already chosen, `Product` or `Service` with its `Offer` in JSON-LD (a
  collection is an `OfferCatalog`), breadcrumbs back to the host, and a line in the sitemap for
  a verified organization (people are never listed, as before). Signed in, the same address is
  the host's page with the item's sheet over it. What isn't public is no page: under an
  organization it is the app's, never a crawler's.
- **R62 — Pay, in and out, and cards that answer each other.** The owner's next idea
  (2026-10-05): payments in or out, person to person, organization to organization, person to
  organization and back, with payment options in settings, on cards and on public pages, and
  cards (Pay, Book, Order) that respond with flows. Checked against R38: Caime holds no balance
  and moves no money (that would make it a payment institution in every market it serves), so a
  payment stays a record both sides agree on. Refined: a host keeps **ways to be paid** beside
  its hours, catalog and orders, in the same place (Settings · What you offer; an organization's
  setup): a bank account, a payment link of its own (Stripe, PayPal, InstaPay, anything https),
  a wallet number, cash, each with the same audiences as everything else (everyone, connections
  or customers, a person's spheres). The existing payment request becomes the **Pay** card with
  two directions: *ask to be paid* (in) and *I'm paying* (out). Its sides are its payer and its
  payee, whichever sent it: the payer says it's sent (or declines), the payee says it arrived,
  or that it hasn't yet, which hands it back. When it's sent, the server writes on it the
  payee's ways that this payer may see, so the payer copies an account or opens a link from the
  card; a group only asks, and shows only the ways for everyone. Cards answer each other: a
  priced order or booking offers **Pay** to whoever pays, which opens the Pay card filled with
  its total and replying to it. Profiles, the organization's page and the public pages offer
  Pay where a way is open to that reader (a public page names only the kinds, never an account).
  Person to person, person to organization and back are all here, and organization to
  organization since R64. Later layers: a payment
  provider's checkout for an organization that wants one (R65), receipts from a paid card, a
  split's shares paid with the Pay card.
- **R63 — A photo for each thing offered.** An item keeps one photo its host uploaded, shown
  wherever the item is: its page (and every link preview and answer engine's picture of it), its
  sheet, a collection's list and the order picker. It's seen by whoever may see the item, and no
  one else; a public item's photo is public like its page.
- **R64 — Organizations pay each other.** Whoever runs an organization (its owner or admins)
  may write to another one as it: the organization's page asks "Writing as" (you, or each
  organization you run), and each choice is a conversation of its own beside the personal one.
  The other team sees the organization first and the person writing for it second ("Acme
  Supply · Karim Saleh"), in its inbox and the conversation; the writer sees "As Acme Supply".
  Money follows the organization: a Pay card the team sends pays the writing organization
  through its ways for those it knows, under its name, never the person's own; an ask pays the
  team's organization as for any customer. Nothing else changes: it's a business conversation,
  masked as one (R15), with the same blocks, rules for under-18s and retention.
- **R65 — An organization's own checkout.** An organization's owner connects its own Stripe
  account (Stripe's own consent page; a Standard account, the organization's, never Caime's).
  From then on a Pay card that pays the organization offers its payer **Pay by card**: Stripe's
  page, made on the organization's account, for the card's amount and note; the money goes to the
  organization and Caime takes nothing and never sees a card. Back in the conversation the card
  says it's paid, and the team sees it paid without saying so: the server asks Stripe, when the
  payer comes back and when Stripe's webhook names the card, and believes only Stripe's answer.
  The ways it lists stay beside it (cash, a transfer). Only the owner connects or disconnects;
  admins see whether it's connected and taking cards; an adult only. Off until the operator sets
  Connect up on Caime's Stripe account (docs/DEPLOY.md), so nothing changes before then. Later:
  refunds from the card, a receipt from a paid card, other providers behind the same card.
- **R66 — Attention is the home; intelligence stays quiet (design brainstorm of 2026-10-05).**
  The owner's two generated boards and the written direction that came with them were checked
  against the product as it is and the decisions already taken. Adopted:
  - **An Attention home.** Today the first screen is Chats with an Attention filter. It becomes
    a screen of its own: a greeting, "{n} things need you" (whom, what, why, when: four lines,
    nothing more), "Waiting on others", "Coming up", and "Nothing needs you right now" as a
    state worth reaching. It reads what exists: the inbox's sections, the waiting tasks, the
    calendar. Related items group under their space or person ("Venue · 4 things, 2 need you").
  - **The conversation's open strip.** "1 open · Friday" above the composer: what the two of
    you owe each other in this conversation, from the tasks already kept. The side panel keeps
    its order: relationship, right now, open, commitments, coming up, shared.
  - **Actions say what they are.** "Yours", "Asked of you", "Waiting for", "Coming up", "Done",
    in place of "To do", "Asked me", "Waiting", "Calendar": the same filters, coordination's words
    rather than a task manager's ("Yours" rather than "You promised", since it holds what you set
    yourself as well as what you promised).
  - **The relationship says what it changes.** Under "How you know Alex", the lines it actually
    drives: priority in Attention, the hours and rules that apply, the commitments surfaced,
    "Only you see this". Read from the policy the label resolves to, never invented.
  - **Uncertainty is said.** "I couldn't find a reply" is never turned into "it didn't happen":
    waiting items that have aged say so and offer "Still waiting · Resolved · Not relevant".
  - **"Cai", the short name for Caime.** The owner's clarification: Cai isn't a persona's name
    but Caime shortened, as the address is `cai.me`. This amends R34, whose objection was to a
    human name on the AI; a short form of the product's own name, shown with the product's own
    mark, doesn't put a person's name on it. It's used only where the intelligence is asked for
    or speaks up ("Ask Cai", "Catch me up", a question it asks), in the plum and pink of the
    brand, never a colour or mark of its own. Where it speaks it says "I" ("I haven't seen
    anything from Sarah since Monday. Still waiting?"): warmer, and always on a surface marked
    Cai, so it reads as Caime speaking, not a person. Where an organization's customers meet AI, its agent keeps
    an explicit identity, the agent's name with "AI agent" (PRD §75), so nobody takes it for a
    person. `@cai` stays reserved (R34). Most of the intelligence carries no label at all: the
    ordering of Attention, the open strip, the relationship's effects.
  Not adopted, with the reason:
  - **The boards' visual system.** They were generated: a blue-violet accent, an asterisk mark
    and a "Cai" colour are not Caime's. The brand stays as BRAND.md has it (the plum ink, the
    pink heart, the characters on two intensities, B2). The boards' calm spacing, fewer
    borders and fewer badges are taken; their colours, mark and copy are not.
  - **"What to build first".** The core loop it names (person, conversation, ask, commitment,
    attention, action) has been built and verified since M3; this changes the screens that
    show it, not the engine.
  Open: the brainstorm says another app is named Caime on Google Play. A search on 2026-10-05
  found none under that name, but a search isn't clearance: a trademark and store-name check is
  the owner's before the store builds.
- **R67 — Caime's own accounts: @cai, @caime and the Caime Friends (owner's idea, 2026-10-05),
  with the harmony review of R63–R66.** Checked against PRD §75 (an AI never passes for a
  person), BRAND.md (characters are not AI; never on money, security or business surfaces),
  R29 (under 18), convention 14 (every AI token is paid for), and what the market does: Meta AI
  sits in WhatsApp as a chat, Snapchat has My AI, LINE and KakaoTalk have official accounts and
  character friends, Telegram has bots. Caime's edge is not having an assistant chat (everyone
  will) but what it knows: your relationships, your promises, who waits on whom, answered by
  rules first, instantly and for free, and never from a private conversation.
  - **@cai is a chat like any other.** One system account (kind `assistant`, the heart mark,
    "AI" on everything it writes) that anyone can open from the "+" sheet, the Attention home or
    `@cai`. Rules answer first, in the reader's language and at no cost: what's waiting on
    others, what's asked of you, what you said you'd do, what's coming up. Anything else goes
    to the model, only for an adult with AI assist on and an allowance left, with a bounded
    transcript of the Cai chat and a short list of the reader's own open items (titles and
    names they already see; nothing from a private conversation, ever). Without assist it says
    what it can do and how to turn the rest on. It never starts a conversation, never joins a
    group (mentioning Cai in a group waits for a consent model of its own), never counts as a
    person (people lists, insights, calls, labels, duplicates), and its chat never "needs you".
    Its messages are the reader's own data: exported, erased, disappearing as they choose.
  - **@caime is the organization Caime runs on Caime.** No new code makes it: the owner creates
    the organization, the operator gives it the reserved handle (`/v1/admin/orgs/:handle/handle`),
    it proves its domain like any other, its AI agent is the Caime Support Agent and its updates
    are what's new. Once it exists, About offers "Message Caime" (a row to add then). It's the
    business product used on itself. ⛔ Creating it in production is the owner's.
  - **The Caime Friends are accounts, and they are not AI.** The seven characters (kind
    `character`) each keep their BRAND.md job and talk about it: Niko first steps, Pico search,
    Lumi creating, Zuzu memory, Panda follow-ups, Momo celebrations, Caishy welcome and
    stickers. Each answers from a short script in every interface language, a tip at a time,
    with a sticker now and then; no model, so nothing to pay for, nothing to moderate, nothing a
    child shouldn't read. They never write first, never count as people, and never appear on
    business or money surfaces. Not adopted: free-form AI companions in their voices. BRAND.md
    says they aren't AI, companion chatbots for minors are regulated and risky, and every token
    spent on chit-chat is paid for with nothing gained.
  - **Harmony of R63–R66, fixed with it.** (1) The intelligence's visible name is Cai
    everywhere: "Suggested by Cai" replaces "Suggested by Caime". (2) The Attention home carries
    an organization's waiting customers (the Business inbox's rows), so a clinic's day starts
    in one place. (3) "Ask Cai" is on the home. (4) Chats keeps its Attention view, where
    message requests and quiet conversations live. (5) Calls, private conversations and
    relationship labels are offered only between people.
  - **As built (2026-10-05).** Fixed ids (core `system-ids.ts`, seeded by migration 0059); one
    conversation each, opened through the ordinary direct route and greeted once in the reader's
    language; words and stickers only (no cards, files, voice, topics, tasks, requests or calls);
    an answer a moment after the person's latest message (`system.reply`, a burst answered once),
    told to nobody by notification. Cai's rules read four questions in English, Arabic, French
    and Turkish (`caiIntent`, held to whole questions so "what to do in Paris today" goes to the
    model) from three queries; its model call is `runAi('cai')` under the person's daily
    allowance, the light model at low effort, at most 1,024 tokens out.
  - Later: Cai's digests arrive in its chat; "Catch me up" from a conversation opens Cai's
    chat on it; public pages for `@cai` and each friend for answer engines, with sticker sets.
- **R68 — Cai keeps going: OpenAI's dots, evaluated for Caime (2026-10-06).** Dots (DevDay,
  2026-09-29) are always-on agents, one per person on ChatGPT's Pro and Business Premium plans: a
  cloud computer and browser each, 4,000 app plugins, reachable in ChatGPT, Slack and Teams,
  learning preferences, proactive read-only research, approvals for consequential actions. Their
  open criticisms: memory nobody can see, correct or delete (only the whole dot), disconnecting
  an app doesn't forget what was learned, unclear long-run cost, and a launch history of an
  agent acting beyond its brief. What carries over to a relationship-first messenger, and what
  doesn't:
  - **Adopted, in Caime's shape.** *Persistence*: a wait handed to Cai ("Still waiting" on
    Attention) comes back at its time as a follow-up ready to send, in Cai's chat, and Cai keeps
    watching until it's answered or stopped. *Proactive updates*: an opt-in morning brief in
    Cai's chat (today, what's asked of you, what you wait on, what you promised), by the rules,
    free. *Approvals*: nothing Cai prepares goes anywhere until its person taps Send, and
    "Change it first" opens the conversation with the words in the composer.
  - **Done better than dots.** *Memory you can see and forget*: Settings · Cai lists every
    follow-up it keeps (each with Stop) and what it learned from your choices, a kind at a time,
    with the counts and what they do ("Offered first", "Set apart"), each forgettable, or all of
    it; forgetting is real (`users.learning_reset`: those decisions teach nothing again). *Cost*:
    the follow-up, the brief and the four questions Cai answers are rules, at no cost; the model
    is only for the rest, inside the person's allowance. *Scope*: Cai works where Caime's value
    is (who waits on whom, what was promised), not across 4,000 apps; it never writes first unless
    asked (the brief), never in anyone's name, and never reads a private conversation.
  - **Not adopted.** A cloud computer and browser per person (cost and risk with nothing a
    relationship needs), third-party plugins acting as the person (apps already act only through
    scoped tokens and OAuth, R39), Cai sending on its own after an approval rule (every send is a
    tap), voice calls with Cai, and Cai in Slack or Teams (Caime is the place the conversation
    is). Revisit "Cai in a conversation" ("Catch me up" opening Cai on it) and a weekly
    relationship digest as the next layer.
