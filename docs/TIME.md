# Time in Caime

Every date and time Caime keeps, says or reads has a name that says what happened, to what, and
what kind of time it holds; the kind fixes its type, its precision and its clock. Adopted from the
owner's Date and Time Convention (dated 2026-10-23, handed over on 2026-10-25 as "TimeStandard"),
through the council (`docs/REVIEW-2026-10-25-CAI.md` §8, R119). Level 1 (names, types, ranges,
zones, clocks, the registry) holds for everything; level 2 (a date's history) for the dates that
move and that people or Cai are told about; level 3 (finance, entities, contracts) isn't Caime's:
it never holds or moves money (R62).

## Names

`object.event[.qualifier].time`, read aloud as a sentence: `meeting.started.planned.local` is "when
the meeting is planned to start, on a named clock". On an object's own table the object is dropped
(`messages.sent_at`, `tasks.done_at`); wherever fields of several objects meet (a view, an export,
a webhook, the feed) the full name is used. Whole English words; a party leads its event
(`card.customer_answered.at`). The event is a past-tense verb (`sent`, `agreed`), or for a range
the state that holds (`active`, `muted`).

| Suffix | Holds | Stored as | Written as | Example |
| --- | --- | --- | --- | --- |
| `on` | a calendar day | `date` | `2026-10-30` | `invoice.settled.due.on` |
| `at` | an exact moment | `timestamptz` (UTC) | RFC 3339 in UTC | `message.sent.at` |
| `local` | a wall-clock time in a named place | a date-time without offset and its IANA zone | `2026-11-02T10:00` with `Africa/Cairo` | `meeting.started.planned.local` |
| `in` | a period | a period key | `CY2026-M10` | `insights.counted.in` |
| `from` | a range's first day or moment, included | as `on`, `at` or `local` | | `mute.active.from` |
| `until` | a range's end, excluded | the same type as its `from` | | `muted.until` |
| `known_at` | when Caime recorded it | `timestamptz`, set by the server | | `card.started.planned.known_at` |

Prefer `at`: when the moment is known it's stored and the day derived. `on` only when a whole day
is meant (a due day, a birthday, a closed day); a day is never padded to a midnight, in UTC or any
zone. One calendar in storage (ISO 8601 Gregorian); others are the screen's (R54). An offset never
stands in for a zone; zones are IANA names.

## Qualifiers

None: it happened. `requested`: asked for, not agreed (a meeting proposed, an appointment
requested, a page booking waiting). `planned`: agreed and may move (a meeting accepted, a booking
confirmed, a reminder). `due`: a deadline with consequences (a Pay card's or an invoice's due day,
an action's due, a promise's day). The plan and what happened share a verb, so the gap needs no
lookup (`meeting.started.planned.local` against the call's `started_at`); a field never turns from
plan into fact.

## Ranges

`from` included, `until` excluded, so adjacent ranges never overlap; a person reads the last day
("until 31 December"), the store keeps the first day after. An open range leaves `until` empty,
never a far date. A series that ends on a day keeps its last day as an event (`series.ended.on`),
never as an `until`.

## Zones and clocks

Past moments in UTC; days counted in a declared reference zone; future wall-clock times keep their
zone. The reference for a day:

| Reference | Used for |
| --- | --- |
| Person | their own actions and reminders, quiet hours, their brief |
| Organization | its hours, its bookings' days, its invoices' due days, its insights' periods |
| Record | a meeting or an appointment carries its own zone (the proposer's, else the host's) |
| Floating | the same day everywhere: a birthday, a holiday, a Pay card's due day as written |

A meeting at 10:00 in Cairo next month is kept as `10:00` and `Africa/Cairo`, its UTC derived;
zone rules change, sometimes with days of notice (Egypt brought summer time back in 2023, Lebanon
changed it within two days), and a UTC fixed in advance is then an hour off. Once it has happened,
it's an ordinary `at`. In Caime a card's `fields.start` carries `zone` and `local` beside `at`
(core `card-clock.ts`, written by the server alone), and `rezoneCards` moves the cards ahead back
to their clock when the server's tz database changes (M17 I19c).

A device's clock is untrusted: what a phone or a browser says is kept as it said, with its source,
and Caime's own receipt is the row's `created_at`; neither replaces the other. Order is decided by
`seq` (ADR-9), never by timestamps. Only `created_at`, `updated_at` and `known_at` take the
database's clock; a business date is entered, never stamped. `created_at` is written once: no
import or update changes it. Store the precision measured: a day is a day, a second isn't padded.

## Rules

1. Every date or time field ends in one of the seven suffixes, of the type the suffix says; `date`,
   `time`, `timestamp`, `from` and `to` alone are not names (`time-names.test.ts` holds the schema
   to it, with the four columns named before this, each listed with its meaning: a list that only
   shrinks).
2. One meaning per field: a plan that becomes a fact, or a field that means different events on
   different rows, is split.
3. A date lives where its event happens once: a time a card moved to is the card's, each
   occurrence of a series its own card.
4. Store facts, derive the rest: ages, days overdue, a day's copy of a moment. A latest-only column
   (`last_seen_at`) is a cache of events kept elsewhere.
5. What has taken effect isn't edited: a sent message is edited as a new version, a paid card is
   moved on, never rewritten.

## A date's history (level 2)

A date that moves (a meeting's or an appointment's time, an action's due, a promise's day, a
booking's slot) keeps its history in the same transaction as the change: `about` (the record and
the field), `value`, `previous`, `known_at`, `reason` (`initial`, `replan`: the plan truly moved;
`correction`: a wrong value fixed), `source` and `by`. Never updated or deleted, except with what it
is about (an erasure takes its history with it). What slipped is counted from `replan` alone, which
is what Cai reads to say "this has moved twice".

## Registry

| Object | Events (states) | Reference | Precision |
| --- | --- | --- | --- |
| message | sent, edited, deleted; delivered, read (per reader) | none; `at` only | millisecond |
| meeting, appointment | started, ended (scheduled); requested, planned | record | minute |
| booking | started, ended (held) | organization or person host | minute |
| payment, invoice | settled (due on a day) | floating | day |
| action (`tasks`) | done; due; reminded | person (the owner's) | minute, or day |
| promise (`commitment`) | kept; due | person | day |
| call | rung, started, ended, answered | none; `at` only | second |
| person | born (floating), joined, claimed, last seen | floating for born | day, second |
| organization | verified, suspended, closed, archived | organization | second |
| session, token, invite, link | created, used, revoked; valid (until) | none; `at` only | second |
| job, periodic task | run (planned), locked, done, dead | none; `at` only | second |
| file, recording | uploaded, kept, deleted; kept (until) | none; `at` only | second |
| mute, quiet hours, rest | active (from, until) | person | minute |
| insight, metric | counted in a period | organization or person | the period |

## Named before this

Most of Caime already spoke the convention when it was adopted: 279 date and time columns in 105
tables, every `_at` a `timestamptz` in UTC, `seq` for order. Four break the suffix rule, listed in
`time-names.test.ts` with what each means (`billing_subscriptions.current_period_end`,
`call_note_answers.at`, `relationship_events.at`, `users.birth_date`). These keep a plan in an
`_at` whose event their name leaves out, and are read as the registry says: `tasks.due_at` (done,
due), `tasks.remind_at` and `jobs.run_at` (planned), `suggestions.due_at` and `contexts.deadline_at`
(due), `messages.card_start_at` (started, planned), `messages.effects_at` (the effects, planned),
`mail_messages.delivery_at` (the delivery's last word), and `calendar_pushes` and `external_busy`'s
`start_at` and `end_at` (a range, `from` and `until`). A slice that touches one renames it, in two
releases as convention 7 has it.

Until then a due day is read as a day: a Pay card's or an invoice's `fields.due` is the day as
written, and `messages.card_start_at` keeps it as its midnight UTC for order alone, never for a
reader's day; an action due on a day (`due_has_time` false) is due on its owner's day, its `due_at`
the first moment of it on their clock. Every reader of either says the day (`CalendarItemView.on`),
and a list files it by that day on its reader's clock. An action due on a day keeps that day in
`tasks.due_on` (I19b), written beside `due_at` on its owner's clock, so neither a reader's zone nor a
move of the owner's moves it.

## What the intelligence reads (R118)

Every model that reads a conversation reads each line's time on its reader's clock and the time
now; every rule that answers about time (free time, due, waiting, coming up) reads the person's
clock or the record's own zone; a day is shown on its day for everyone, never moved by a viewer's
zone.
