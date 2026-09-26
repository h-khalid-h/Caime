# How Caishy wins

"Outperform every alternative" has to be realistic to be useful. No new messenger beats WhatsApp's
network or Slack's install base head-on in its first year. Caishy wins by doing **one job no
alternative does — knowing who each person is to you, and acting on it — so well that people
bring the other side over**, and by being measurably better on the fundamentals everyone
compares (speed, reliability, clarity, trust). Every target below is checked by a test, a
benchmark or a metric; none is an adjective.

## The alternatives and their structural limits

| Category | Products | What they do well | What they structurally cannot do |
| --- | --- | --- | --- |
| Personal messengers | WhatsApp, iMessage, Telegram, Signal, Messenger | Reach, speed, reliability, familiarity | A contact is a phone number. Mom and a customer look identical; the inbox is chronological; notifications are per chat; nothing tracks what was promised |
| Character-rich messengers | LINE, KakaoTalk | Warmth, stickers, regional super-app reach | Same flat contact model; built around feeds, payments and shopping rather than relationship context |
| Work chat | Slack, Microsoft Teams, Google Chat | Channels, integrations, enterprise admin | Bound to one workspace; customers, vendors and family are outside it; attention is per channel, not per relationship |
| Business messaging | WhatsApp Business, Intercom, Front, Zendesk | Reaching customers where they are | The relationship lives in a CRM tab beside the conversation, not in it; the customer's side is a generic chat |
| Personal CRMs | Clay, Dex, Folk | Remembering people | Need data entry nobody keeps up; no conversation lives there |
| Unified inboxes | Beeper and similar | One list for many networks | Aggregate chats without adding relationship, attention or action; depend on fragile bridges |

## Where Caishy wins, and for whom first

**Who first:** people whose communication mixes personal and professional in one place:
founders, freelancers, small-business owners, account and sales managers, consultants, agents,
clinicians and lawyers with clients, and families coordinating. Especially where WhatsApp is
already used for business (Middle East and North Africa, Latin America, South and Southeast Asia,
Africa), because there the pain of *boss, customer and mother in one chronological list* is
sharpest.

**Not first:** replacing WhatsApp for everyone, or Slack inside a large enterprise. Caishy
coexists with both and takes the conversations where context matters.

## Dimension by dimension

### 1. The job (UX)

Answer, at a glance, *who is this to me, what needs me, what am I waiting for*.

| Target | Verified by |
| --- | --- |
| Classifying a new connection takes ≤ 3 taps and ≤ 3 s | E2E test counts taps; product metric: median time |
| Needs You precision ≥ 90% (fewer than 1 in 10 items dismissed as "doesn't need me") | product metric |
| Every inbox placement shows its reason; every placement is changeable in one gesture | E2E test |
| "What am I waiting for?" and "What did Sarah ask me to do?" are one tap from any conversation | E2E test |
| A file from a year ago is found in ≤ 10 s via the asset index or search | usability test script |

### 2. Interface (UI)

Calm, warm, legible, recognisably Caishy. The three-column desktop layout with a live context
panel is something WhatsApp Web, Telegram Desktop and Slack do not have.

| Target | Verified by |
| --- | --- |
| WCAG 2.2 AA contrast in both themes | token contrast test in CI |
| No layout breaks at 200% text size or 320 px width | Playwright visual checks |
| Every primary flow screenshotted in light and dark on phone and desktop sizes each release | Playwright screenshot suite |

### 3. Copy

Human, specific, never guilt-inducing; explains AI and privacy at the moment they matter
(`BRAND.md` voice rules).

| Target | Verified by |
| --- | --- |
| No "error", "failed", "invalid" without a next step | copy lint over string tables |
| Every inference says what it is based on | suggestion schema requires `rationale` |

### 4. Performance

Speed is the first thing people compare and the last thing they forgive.

| Budget | Target | Verified by |
| --- | --- | --- |
| Sent message appears locally | < 50 ms (optimistic render) | E2E timing |
| Open a cached conversation | < 100 ms | E2E timing |
| Cached inbox render | < 150 ms | E2E timing |
| Send → delivered to the other device (same region) | p95 < 250 ms | realtime benchmark |
| API inbox with 500 conversations | p95 < 150 ms | server benchmark |
| Web initial JavaScript | ≤ 450 KB gzip | bundle-size check in CI |
| Web LCP on mid-range phone, 4G | < 2.0 s | Lighthouse run |
| Offline | read cached chats, compose, create tasks; outbox shows Pending | E2E offline test |

### 5. Adoption

The other person must be able to join in under a minute without installing anything.

- **Contextual invites:** "Hassan invited you · Work · DATA C" by link, QR code or share sheet
  (R1). The link opens the web app; sign-up takes under 30 s; the invitee lands in the
  conversation already connected. *Target:* invite → first reply ≤ 60 s in the E2E test.
- **Handles as links:** `caishy.com/@hassan` works on any device.
- **Free core forever** (R23): nobody hits a paywall before value.
- **Single-player value** (R2): waiting items, reminders and decisions help from day one.
- **Continuity (later):** import of exported WhatsApp chats; in the EU, the Digital Markets Act
  interoperability route to WhatsApp as a long-term lever.
- *Metrics:* activation (classified connection + first message within 24 h), invite acceptance
  rate, K-factor, week-4 retention.

### 6. Trust and safety

| Commitment | Mechanism |
| --- | --- |
| Your labels are yours | Relationships are private unless shared (PRD §62), enforced in the API and tested |
| No ads, no content-based analytics | analytics events carry no message content (PRD §81) |
| Strangers can't flood you | message requests, rate limits, link safety (R14) |
| Businesses and bots can't pose as people | verified organization identity, permanent non-human labels (R15, R16) |
| AI never acts silently | suggestions need a tap; labelled inference (R12, R17) |
| Leave anytime | full export and account deletion (PRD §60) |

### 7. Reliability

"A message should never appear to send successfully and then silently disappear" (PRD §80).
Idempotent sends, per-conversation ordering, durable outbox, resync on reconnect, each covered by
integration tests including duplicate submission, reconnect and restart.

### 8. Reach

Any gender, age and use case (R26–R32): neutral defaults, age-aware safety, large text,
right-to-left, local workweeks, low-end devices and slow networks.

## What would make this wrong

Honest failure modes to watch, each with the metric that would reveal it:

- People won't classify → relationship completion rate stays low → make suggestions carry more
  of the load (R12).
- The attention inbox feels like it hides things → "All chats" usage dominates and Needs You
  dismissals exceed 10% → tighten Needs You to explicit signals only (R8).
- The other side doesn't join → invite acceptance under 30% → shorten join further and add
  continuity import.
