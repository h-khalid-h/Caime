# Handles: the generation specification (R94)

The owner's proposal of 2026-10-15 ("canonical identity, primary handle, optional aliases"),
checked against what Caime already is and turned into the standard the code follows. Where
Caime differs from the proposal, the difference is stated with its reason. Policy version **1**.

## 1. Three layers

| Layer | In Caime | Where |
| --- | --- | --- |
| Canonical identity | A UUID per person and per organization, never derived from a name, date, country or handle; every reference between records is by it. | `users.id`, `organizations.id` |
| Primary handle | One per person or organization, unique in one public namespace (`cai.me/@handle`), people and organizations together. | `users.handle`, `organizations.handle` |
| Aliases | Not kept as redirects (see §7): a handle let go of is *held* from everyone for a year, then free. | `released_handles` |

A handle is never proof of identity, of a registration or of a trademark: verification is
separate (an organization proves its domain, R42).

## 2. Grammar (policy 1)

- Lowercase ASCII letters and digits, 3 to 30 characters, starting and ending with one of them.
- One separator between words: a dot or an underscore (not two together, not at either end).
  *Differs from the proposal* (dot and hyphen): dots and underscores are what Caime has used
  since R35; every handle, link and test already follows it, and both read well in a URL.
- No spaces, no other punctuation, no Unicode: a name in another script is never transliterated
  by guesswork (§4).
- `core/rules.ts`: `HANDLE_PATTERN`, `handleError`, the `Handle` schema.

## 3. What nobody may take

- **Reserved** (`RESERVED_HANDLES`, `isReservedHandle`): the product's names (alone or run into
  other words), its characters, staff words, its pages and routes. Only the operator gives one out,
  but for @caime, which the organization that proves the product's own domain (cai.me) takes from
  its setup screen (2026-10-25).
- **Generic words alone** (`GENERIC_WORDS`, `isGenericHandle`; owner's rule 2026-10-15): a handle
  made only of words that say what someone is to someone, praise or filler ("customers",
  "best.team", "the_family", "employees", "top1") names nobody in particular and would let one
  account stand for everyone's customer or family. Kept for Caime. A real name beside one
  ("macrocare.medical", "nour.family") is fine.
- **Lookalikes** (`handleSkeleton`): two handles that read the same once separators are dropped
  and look-alike characters are read as the letter they pass for (0→o, 1 and i→l, 5→s, rn→m,
  vv→w) are one name to a reader. A new handle whose skeleton is another person's or open
  organization's is refused (`handleLookalike`, `unavailableAmong`). The database keeps the
  skeleton as a generated column (migration 0088), held equal to core's by a test.
- **Held**: a handle someone let go of, for a year (§7).

Every refusal reads the same ("That handle isn't available."), so the answer never says which.

## 4. Normalization

Three representations: the **name** as written (shown, never changed), its **handle words**, and
the **handle**. `handleWords` takes accents off Latin letters (José → jose, Straße → strasse,
Øre → ore) and splits on anything else. A name with no Latin letters gives no words: the form
asks for "Your name in Latin letters", the spelling the person uses, rather than a machine's
transliteration that would misspell them (`needsLatinName`). Two different names whose handle
words match stay two people: identity is the UUID.

## 5. Candidates (deterministic, ranked)

The engine proposes; it never claims. Same input and policy version, same list, in the same
order. Hard constraints first (grammar, reserved, generic, taken, held, lookalike), then the
order below; numbers only after every meaningful candidate.

**A person** (`personCandidates`): the given name is the first word, the family name the last
with any particles before it (al, el, abu, bin, van, de…), the rest middle names.

1. given.family (`hussein.khalid`)
2. givenfamily (`husseinkhalid`)
3. g.family (`h.khalid`)
4. given_family
5. given.m.family (middle initials), given.middle.family (the whole name)
6. given alone

A person with one name gets that name; no family name is invented. Never a birth date, a year
or a gender: none of them is read.

**An organization** (`orgCandidates`): the name it's known by first, legal forms (LLC, Ltd,
S.A.E., GmbH…), years and registration numbers left out (a brand's own short number stays:
`forever21`), then what its registered name adds.

1. brand run together (`macrocare`)
2. brand dotted, then brand with the registered name's first extra word (`macrocare.medical`)
3. brand with every extra word (`macrocaremedicaltourism`), dotted
4. brand_underscored, initials of the brand, initials of the registered name

**Then a short number**: the best candidate with 2, 3, … 9, in order, never at random.

The server answers `GET /v1/handles/candidates?for=person|org&name=…[&latinName=…][&legalName=…]`
with up to four that are free now and `policyVersion`; sign-up and a new organization offer them
as chips and put the first in the field until the person types their own.

## 6. Claiming

A claim is the insert or update of the row, under the unique constraint on `handle`, in the same
transaction as everything else the claim does; `assertHandleAvailable` runs first for the
answer people read, and the constraint decides a race: two at once, one succeeds and the other
is told the handle isn't available (`claimLost` in `lib/handles.ts`, in sign-up, a new
organization and a handle change; never a 500). Sign-up is idempotent per address (`email_taken`).

## 7. Lifecycle

| Situation | Rule |
| --- | --- |
| A name changes | The handle stays; a person may change theirs in Settings, an organization asks the operator. |
| A handle is changed or an account deleted | The old one is held from everyone, its owner included, for a year (`releaseHandle`), then free. Only the handle and the days are kept, never whose it was. |
| An organization closes | Unverified: its handle is held a year. Verified: kept for whoever proves its domain again (R42). |
| Suspension | The handle stays with the account; nobody new finds it. |
| Impersonation | The operator moves or reclaims a handle (`/v1/admin/{people,orgs}/:handle/handle`), audited; @caime goes only to the organization that proves cai.me (`moveHandle`, the same move). |
| Policy upgrade | Never renames anyone: the engine proposes new handles only. |

*Differs from the proposal* (aliases that redirect): a redirect would have to remember whose a
handle was, which the privacy page promises Caime doesn't (R35); and a printed link that
silently lands on someone new is worse than one that finds nobody for a year. Aliases come back
only if a real need (an organization's rebrand) outweighs that, as an explicit, owner-held,
time-limited record.

## 8. Provisional people

Someone reached only by email (R93) has `mail:<id>`, outside the grammar on purpose: it is never
a public handle and nobody can find them by it. When they sign up with that address they choose
a handle like anyone, through the same candidates (§5).

## 9. Asked before a handle

- A person: their name (required); their Latin spelling only when the name has no Latin letters;
  gender is asked at sign-up and never required ("Prefer not to say" is the default, owner's
  answer 2026-10-15) and never read by the engine.
- An organization: its name and its kind (both required), its registered name optional.

## 10. Operations

| Operation | In Caime |
| --- | --- |
| generateCandidates | `personCandidates`, `orgCandidates` (core); `GET /v1/handles/candidates` |
| validateHandle | `handleError`, `isReservedHandle`, `isGenericHandle` |
| checkAvailability | `GET /v1/me/handle-available` (advisory) |
| reserveHandle | sign-up, organization creation, `PATCH /me` (the unique constraint decides) |
| setPrimaryHandle | `PATCH /me` (a person's own); an organization's is set when it's made and moved only by the operator (`PUT /v1/admin/orgs/:handle/handle`) |
| resolveHandle | `GET /v1/handles/:handle` (privacy and blocks apply) |
| retireHandle | `releaseHandle` |
| getPolicy | `HANDLE_POLICY_VERSION` on every candidates answer |

Refusals use Caime's error codes (`handle_taken`, `handle_closed_org`, `invalid_request`), one
answer for taken, held, reserved, generic and lookalike.

## 11. Acceptance tests

Core `handle-engine.test.ts` and `rules.test.ts`; server `handle-engine.test.ts`:

- Hussein Khalid gets `hussein.khalid` first; case and spacing don't change the list.
- One name invents no family name; a compound family name stays whole in a candidate.
- Accents come off; no candidate holds a date, a year or a gender.
- A name in another script asks for its Latin spelling and guesses nothing.
- Macrocare is preferred to its registered name; legal forms and numbers are dropped.
- Leading, trailing and double separators are refused.
- Generic words alone are refused; a real name beside one is not.
- Lookalikes share a skeleton, and the database computes the same one.
- A taken handle and its lookalike are never offered; the next meaningful one is.
- A lookalike of an organization's handle is refused at sign-up.
- Gender is kept only when someone says it.
- Two sign-ups claiming one handle at once: one is made, the other is told it's taken.

Not yet tested here, from the proposal's list: an idempotency key on handle changes, and
a representative set of international names beyond Arabic, Latin with accents and particles
(Chinese and Cyrillic names take the Latin-spelling path, by design).
