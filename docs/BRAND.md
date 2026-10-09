# Caime brand system

**The boards are inspiration; this document is the decision.** Every choice below is made for one
test: does it help Caime beat the alternatives (docs/COMPETITIVE.md) for people of every age,
gender and use case, and does it feel modern in 2026? Where a board helps, it is adopted; where it
works against the product, it is overruled and the reason is written down.

The owner supplied three brand boards on 2026-09-26:

| Board | Content | In repo |
| --- | --- | --- |
| v1 | Brand overview: wordmark, mark, palette, type, essence, five characters, voice, lines | no (its link expired before it could be fetched) |
| v2 | Brand overview, revised: logo variations, palette with lavender and lilac, seven characters, icons, sticker style | `docs/brand/brand-board-v2.png` |
| v3 | Caishy character sheet: expressions, turnaround, poses, character palette, brand icons | no (shared inline, no file) |

The boards describe Caime as a character world with stories, collectibles and a shop. This product
is a relationship-aware communication platform used with family and with managers, customers and
lawyers, by people of every age and gender. The decisions below keep everything from the boards
that makes that product better, reconcile where the boards disagree, and keep out what works
against the product.

All assets in the app are vector recreations generated from code in `packages/brand` (tokens,
marks, characters, stickers), so they scale, stay consistent and regenerate. `tokens.test.ts`
fails if any text colour drops below WCAG AA.

## Palette reconciliation

The boards disagree on exact values. The canonical value is the one the majority of boards agree
on, or the nearest to it; roles derived from the palette are listed further down.

| Colour | v1 | v2 | v3 | **Canonical** | Why |
| --- | --- | --- | --- | --- | --- |
| Caime Pink | `#FF8FB1` | `#FF7EB9` | `#FF8EA8` | **`#FF8FB1`** | v1 and v3 agree within 4% |
| Dark Purple | `#3B2E5B` | `#4B2E83` | `#3B2E5B` | **`#3B2E5B`** | v1 and v3 agree; matches the wordmark on all boards |
| Sunshine Yellow | `#FFD166` | `#FFD166` | `#FFE08A` | **`#FFD166`** | v1 and v2 agree |
| Cream | `#FFF7E9` | `#FFF7E9` | `#FFF9F5` | **`#FFF7E9`** | v1 and v2 agree |
| Light Pink | — | (light logo tile) | `#FFD6E7` | **`#FFD6E7`** | only defined value |
| Lavender | — | `#E9D5FF` | — | **`#E9D5FF`** | only defined value |
| Lilac | — | `#D8B4FE` | `#C8B4FF` ("Lavender") | **`#C8B4FF`** | the character palette's value |
| Sky Blue | `#7DD3FC` | `#7DD3FC` | — | **`#7DD3FC`** | agree |
| Mint Green | `#A7F3D0` | `#A7F3D0` | — | **`#A7F3D0`** | agree |
| Gray | `#6B7280` | — | — | **`#6B7280`** | only defined value |

## What the boards establish

| Element | Definition |
| --- | --- |
| Wordmark | "Caime" in heavy rounded lettering, Dark Purple; a Caime Pink heart floats over the dotless *i* (™ on marketing surfaces) |
| Logo variations | Dark (white wordmark on Dark Purple) · Light (pink wordmark on Light Pink) · Icon mark (a pink heart with a face) · App icon (Caishy's face on a pink tile) · "C" monogram tile |
| Typography | Inter for the interface, set tight at size · Nunito (rounded) for brand moments and the wordmark (R69) · Arabic in the faces paired with them, Noto Sans Arabic and Baloo Bhaijaan 2, under the same names (R73) |
| Characters | Caishy *The Dreamer* · Momo *The Cheerful* · Panda *The Loyal* · Lumi *The Creative* · Pico *The Curious* · Niko *The Brave* · Zuzu *The Wise* |
| Caishy (v3) | White face and body, big dark-brown eyes with two highlights, pink blush, a tiny "ω" mouth, a Caime Pink hood with cat ears (Light Pink inside) and a small face emblem on the forehead, a pink heart on the chest, pink paw pads, a small lavender backpack |
| Expressions (v3) | happy, wink, excited, curious, sad, surprised, sleepy, angry (cute), shy |
| Poses (v3) | sitting, standing (waving), walking, jumping, holding a heart |
| Brand icons (v3) | Caime head icon (flat), heart, Dark Purple paw print, yellow sparkles |
| Iconography (v2) | glossy, filled, rounded, colourful icons; small filled icons in pills |
| Stickers (v2) | die-cut with a white outline and short hand-lettered words ("Be Kind", "Dream Big") |
| Essence (v1) | Joy · Imagination · Belonging · Growth |
| Voice (v1) | Friendly · Positive · Playful · Authentic |
| Lines | "Together is a happier place." · "A little cuteness goes a long way." · "Small friends. Big adventures." · "Small character. Big adventures." · "Cute, made into a world." · "Explore. Collect. Belong." |

## Decisions

- **B1 — Adopt the identity whole.** Wordmark, marks, palette, type, rounded geometry, essence and
  voice are Caime everywhere: app icon, splash, web, notifications, store listings.
- **B2 — Two intensities.** *Expressive* in brand moments (welcome, onboarding, empty states,
  celebrations, stickers, the marketing site). *Quiet* on working surfaces (inbox, conversation,
  business inbox, settings): type, colour, rounded shapes and the heart carry the brand there, not
  characters. No mascot sits next to a customer's invoice.
- **B3 — Characters are friends, not features.** They become the **Caishy Friends** stickers and
  the guides of empty states — the LINE and KakaoTalk precedent: characters give a messenger
  warmth, memorability and a revenue line (premium sticker packs in Pro) without a feed or a shop.
  Each character has one job that fits its personality (matrix below).
- **B4 — Not adopted here:** the shop, collectibles, the story feed, merchandise, a "Community"
  feed tab. PRD §85 rules out a social network and an app marketplace. Communities are Spaces
  (PRD §40).
- **B5 — Lines.** The product promise is **"Messaging that understands your relationships."** The
  brand sign-off is **"Together is a happier place."** "A little cuteness goes a long way." is
  used for the sticker packs. The character-world lines ("Cute, made into a world.", "Explore.
  Collect. Belong.") are not used for the messenger.
- **B6 — Colour carries meaning.** Dark Purple is the ink and the primary action. Caime Pink is
  the heart: the logo's heart, highlights, delight. The pastels become the relationship-sphere
  palette, so any other colour tells you what kind of relationship you're looking at (R22).
- **B7 — For everyone** (R26–R31). Defaults are neutral and expression is a choice:
  - your messages default to **Plum**, a mid-tone of Dark Purple; Caime Pink, Lavender, Sky,
    Mint and Sunshine are in Appearance, and the choice only changes your own view;
  - the character layer is **Playful** (default) or **Minimal** (simple icons instead);
    organization and business surfaces are always Minimal;
  - characters have no gender, and copy never gives them one.

## Logo

- **Wordmark:** "Caime" from Nunito Black outlines with slightly tightened spacing; the *i* is
  dotless and a Caime Pink heart floats above it. Variants: Dark Purple on light, white on Dark
  Purple, Caime Pink Strong on Light Pink.
- **App icon:** the flat Caime head (v3 brand icon) on a Caime Pink tile; generated squares use
  a 22.5% corner radius and platforms apply their own masks.
- **Icon mark:** the heart with a face — favicons, notification icons, the Android monochrome
  icon, loading states, the desktop sidebar and anything under 32 px. The app draws it with
  `IconMark` from the same geometry as `favicon.svg` (`ICON_MARK`), never a bare heart.
- **Monogram:** a rounded "C" on Dark Purple, for surfaces that need a letter rather than a face
  (organization and developer contexts, per B2).
- **Clear space:** the height of the heart on every side. **Minimum size:** wordmark 72 px wide,
  icon mark 16 px.
- **Don't:** recolour the heart, stretch, outline, add effects, put the Dark Purple wordmark on a
  background with less than 4.5:1 contrast, or use a character in place of the wordmark.

## Colour roles

Values live in `packages/brand/src/tokens.ts`; the test suite asserts every pair below.

### Light

| Role | Value | Use | Contrast |
| --- | --- | --- | --- |
| `canvas` | `#FAF8FC` | app background, list panes | — |
| `surface` | `#FFFFFF` | conversation, cards, sheets | — |
| `surfaceMuted` | `#F3F0F8` | inputs, their messages, hover | — |
| `border` | `#E7E2EF` | hairlines | — |
| `text` | `#2B2340` | primary text | 14.8 surface · 14.0 canvas · 13.2 muted |
| `textSecondary` | `#5E5673` | secondary text | 6.9 surface · 6.1 muted |
| `textTertiary` | `#6F6885` | timestamps, hints | 5.3 surface · 5.0 canvas · 4.7 muted |
| `ink` / `primary` | `#3B2E5B` | wordmark, primary buttons (white label) | 12.2 |
| `accent` | `#FF8FB1` | the heart, highlights, selection (ink label) | 6.9 |
| `accentSoft` | `#FFD6E7` | pink tints (ink text only; pink text on it is 4.1) | 11.3 |
| `accentStrong` | `#C8285F` | pink text, badges with white label | 5.4 |
| `link` | `#5B40A0` | links, focus ring | 7.8 |
| `bubbleOwn` | `#5B40A0` | your messages (Plum), white label | 7.8 |
| `bubbleOther` | `#F3F0F8` | their messages, `text` label | 13.2 |

### Dark

| Role | Value | Contrast |
| --- | --- | --- |
| `canvas` | `#120F1A` | — |
| `surface` | `#1A1625` | — |
| `surfaceMuted` | `#2A2438` | text on it 13.5 |
| `border` | `#342D46` | — |
| `text` | `#F5F2FA` | 16.0 |
| `textSecondary` | `#B7AFC9` | 8.4 |
| `textTertiary` | `#9C94B0` | 6.1 surface · 5.2 muted |
| `primary` | `#FF8FB1` with `#2B2340` label | 6.9 |
| `bubbleOwn` (Plum) | `#6A57A8` with white label | 5.9 |
| `link` | `#C9B8F5` | 9.8 |

### Bubble colours (Appearance)

| Option | Bubble / label | Label contrast |
| --- | --- | --- |
| **Plum** (default) | light `#5B40A0` / white · dark `#6A57A8` / white | 7.8 / 5.9 |
| Caime Pink | `#FF8FB1` / `#2B2340` | 6.9 |
| Lavender | `#E9D5FF` / `#2B2340` | 10.9 |
| Sky | `#7DD3FC` / `#0B2A3F` | 8.9 |
| Mint | `#A7F3D0` / `#0B3B2A` | 9.8 |
| Sunshine | `#FFD166` / `#3A2A00` | 9.6 |

### Relationship spheres

Each sphere has a `fill` (chip background), a `strong` colour (text and icon, AA on white and on
its fill), a dark pair and a `solid` pastel for dots and illustration.

| Sphere | Fill | Strong | Solid | Icon |
| --- | --- | --- | --- | --- |
| Family | `#FFE3EC` | `#C2255C` | Caime Pink | heart |
| Friend | `#FFF3D1` | `#8A5A00` | Sunshine Yellow | smile |
| Acquaintance | `#FBF1DE` | `#76613D` | cream-sand | hand |
| Work | `#E0F4FE` | `#0B6BA8` | Sky Blue | briefcase |
| Customer | `#DDFBEF` | `#047857` | Mint Green | handshake |
| Vendor | `#FFEAD9` | `#B4480D` | peach | truck |
| Service provider | `#DAF7F3` | `#0F766E` | teal | wrench |
| Professional | `#F1E8FF` | `#6D3FC9` | Lilac | badge |
| Community | `#FBE6FA` | `#A1289E` | orchid | users |
| Organization | `#E6E8FE` | `#4338CA` | periwinkle | building |
| Public | `#EEF0F3` | `#4B5563` | gray | globe |
| Other | `#EFEDF3` | `#5B5470` | neutral | dot |

## Typography

| Style | Family | Size / line | Weight |
| --- | --- | --- | --- |
| Display | Nunito | 34 / 40 | 800 (brand moments: welcome, empty states) |
| Title | Inter | 26 / 32 | 700, tracking −0.6 |
| Headline | Inter | 18 / 24 | 600, tracking −0.3 |
| Label | Inter | 15 / 20 | 600 |
| Body | Inter | 15 / 22 | 400 |
| Message | Inter | 16 / 23 | 400 |
| Caption | Inter | 13 / 18 | 500 |
| Section label | Inter | 13 / 18 | 600, sentence case, never uppercase, never monospace |
| Overline | the system monospace | 12 / 16 | 500, sentence case, never uppercase: a section's label ("Needs you", "Coming up", a settings group), the same style as Mono |
| Mono | the system monospace | 12 / 16 | 500, sentence case: labels on spec-sheet surfaces (the public pages; in the app, `Spec` rows on a person's and an organization's page, Welcome's lines, the auth screens' kicker), never running text |

Arabic (R73) is drawn in the faces paired with these, declared under the same two names so
nothing chooses by language: **Noto Sans Arabic** for every Inter style (neutral, open, the
same weights 400–700) and **Baloo Bhaijaan 2** for Display (rounded, as Nunito is; its 800 stands
for Nunito's 900). Its letters join, so no style's tracking applies to it, and its ascenders,
marks and descenders reach further, so every line is 1.18× taller (body 15/22 reads 15/26, title
26/32 reads 26/38). A layout in Arabic runs right to left as a whole: rows, margins, corners,
chevrons and back arrows mirror, the interface's words sit at the start (the right) whatever
letters they're in, and what someone wrote keeps its own direction inside its bubble.

## Shape, space, motion

- **Radii:** 8 (inputs), 12 (cards), 18 (bubbles, 6 px on the tail corner), 22.5% (app mark),
  pill (buttons, chips).
- **Spacing:** 4 px grid; touch targets ≥ 44 px.
- **Elevation:** soft purple-tinted shadows (`rgba(59, 46, 91, 0.10)`) on overlays; resting UI
  separates with colour and hairlines.
- **Motion:** 150–250 ms ease-out or gentle springs; celebrations may bounce once; reduced motion
  is respected everywhere.

## Phone layout

What the phone shows around the conversations, decided from how people already hold and read
the messengers they use, and only where it serves Caime's promise (relationships first):

- **Four places and Search.** Chats, People, Spaces and Actions sit in a floating pill at the
  bottom, the one you're in lit behind its name (Caime Pink tint; the surface tone in dark).
  Search is a circle of its own beside it, in a thumb's reach from each of the four. The bar
  floats over the page's own colour with the overlay shadow, and never covers what's on the page.
- **You is your picture.** It's at the top left of each place, with the dot the people you know
  see (none when your privacy shows your online status to nobody). It opens a sheet with what
  you change most (your status and presence) and the way to everything else, which opens over
  the place you were in. You isn't a tab: it's not somewhere you go to read.
- **Round header buttons.** A page's secondary actions are tonal circles (`surfaceMuted`); its one
  main action (a new conversation, connecting with someone, a space, an action) is a filled
  circle in the primary colour. A conversation's calls are tonal circles too.
- **Chats by relationship.** Under the header, chips: Attention (what needs you, with its count),
  All, and one for each kind of relationship your conversations have (Family, Work, …), in the
  sphere's own icon. It's the inbox's filter, one choice (a radio group), and the relationship
  labels stay only yours. The row scrolls sideways on a phone and wraps on a desktop.
- **Not adopted:** a stories or status feed, a separate Communities or Updates tab (Spaces and an
  organization's updates live where they belong), and ads or promoted rows.

## Iconography

- **Working surfaces:** Lucide line icons, 2 px stroke, round caps and joins. The active tab's
  icon is drawn heavier, on its Caime Pink tint (in the phone's bar in dark, the surface tone),
  echoing the boards' filled icons.
- **Expressive surfaces:** filled, colourful rounded icons on tinted tiles (heart, star, sprout,
  chat bubble, paw print, sparkles), for onboarding highlights and empty states.

## Characters

| Character | Personality | Colours | Job in the product |
| --- | --- | --- | --- |
| **Caishy** | The Dreamer — always finds kindness | white, Caime Pink hood | Welcome, app icon, brand moments, the default stickers |
| **Momo** | The Cheerful — spreads joy everywhere | Sunshine Yellow | "You're all caught up", success, celebrations |
| **Panda** | The Loyal — always by your side | white and ink | Waiting and follow-ups; offline and pending states |
| **Lumi** | The Creative — turns ideas into magic | Lavender, Lilac | Creating: groups, topics, spaces, the first message |
| **Pico** | The Curious — asks the best questions | Mint Green | Search, discovery, finding people |
| **Niko** | The Brave — faces new adventures | Sky Blue | First steps: onboarding progress, invites, saying hi first |
| **Zuzu** | The Wise — sees the good in everything | Cream | Memory: decisions, conversation history, tips |

Rules: characters appear only in expressive moments (B2), never on organization, business,
security or money surfaces, and never speak for a person. They are characters, not people:
model output is labelled "Suggested by Cai" with the sparkle icon (R16, R17, R66), and a
friend's own messages count as AI. Each also has an account anyone can write to (@caishy,
@momo, …, R67): it answers by its rules (a greeting, its tips in turn, its sticker now and then)
and, for an adult with AI assist on, with a model's help in its own character (R71), never first
and never with a notification. Cai, Caime's assistant (@cai), wears the icon mark, not a
character.

**Caishy Friends stickers** (free pack, "A little cuteness goes a long way."): built on the v3
expressions and poses — hi (waving), thanks (holding a heart), love (shy), yay (excited), ok
(wink), sorry (sad), wow (surprised), hmm (curious), good night (sleepy), grr (angry, cute), on
my way (walking), congrats (jumping), be kind, dream big. Die-cut with a white outline and made
from the same vector parts, so they stay consistent and weigh nothing on the wire: a sticker
message carries a pack id and a sticker id, not an image.

## Voice and copy

Friendly, positive and authentic always; playful only in expressive moments; calm and exact on
working surfaces.

| Do | Don't |
| --- | --- |
| "3 need you" | "You have 47 unread messages!" |
| "Waiting for Sarah · Contract · since Tuesday" | "Follow-up item #12 overdue" |
| "Only you see this." | "Relationship metadata visibility: private" |
| "Saved. It'll send when you're back online." | "Error: network request failed" |
| "Caime suggests Sarah may be your colleague at DATA C." | "Sarah is your colleague." |
| "Sarah's role?" | "What's her role?" |
| "Remind me" · "Add task" · "Mark as decision" | "Create reminder entity" |
| "You're all caught up." | "Nothing to see here!!!" |

Rules: second person; verbs first on buttons; sentence case; no exclamation marks on working
surfaces; never cute in errors, security or money; never guilt about unread counts; say what an
inference is based on; use names, not pronouns.
