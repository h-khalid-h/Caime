---
name: council
description: The council pass — an adversarial, evidence-bound deliberation before a decision that is costly to undo (a new R entry, what an AI may do or know, money, minors, privacy, a public surface, a contraction). Not for bug fixes or slices under a decided entry.
---

# The council pass

Reinvented from the owner's two "deliberation room" prompts (2026-10-25): the room of four with a
silent conductor, and the board of three. What they get right is kept: no first draft survives
unattacked, a real user's worst reading is heard, a specialist reasons from first principles and
second-order effects, the plan must change under fire, and the last word is a plan, not a summary.
What they get wrong is dropped: objections manufactured to fill a quota ("must reject the first
draft"), a user called stupid (the user isn't; the interface is), authority by invented
credentials, a transcript long enough to hide the decision, and no way to say "don't build it".

## When it runs, and when it doesn't

Run it before building anything that is costly to reverse or wide in reach:

- a new R entry in `docs/PRODUCT-REVIEW.md`, or an owner's request that names a direction rather
  than a fix;
- what an AI may know, keep, say or do (R12, R110), or who it speaks to;
- money, people under 18, privacy and retention, what leaves Caime for a provider;
- a new public surface, a price, a plan's limits, a migration that contracts.

Don't run it for a bug with a clear fix, a slice under an R entry already decided, wording, or a
refactor behind tests: there the gate (check, build, budget, E2E) is the critic. One council per
decision, in the session's own reasoning: never a fan-out of agents to play the seats.

## The seats

1. **The Architect** puts the plan on the table: what is built, where in the code, what it costs
   (convention 14) and the number that will show it worked.
2. **The Adversary** hunts the flaw that would sink it: a wrong assumption, a case that breaks it,
   a cheaper way, a reason not to build at all. Every objection rests on something checkable (a
   file and line, a measurement, a rule in CLAUDE.md, a regulation, a competitor's documented
   behaviour), or is labelled an assumption with the way to test it.
3. **The Newcomer** is the least patient real person who meets this surface, named by the problem
   (a clinic's receptionist between patients, someone writing for the first time, a guest without
   an account, someone reading in Arabic on a small phone). Reads it the worst plausible way, counts
   every step and every word they don't know.
4. **The Specialist** is called for the problem at hand, named as a role and a track record,
   never a real person: the domain the decision actually turns on. Takes the idea to its first
   principles and states its second-order effects: at a hundred times the scale, after six and
   twelve months, under abuse, in another language and culture, for someone under 18, when a
   provider fails.
5. **The Conductor** says nothing until the arguments are spent, then decides.

## The rules

- **Evidence over rhetoric.** A claim without a source or a stated test carries no weight.
- **No courtesy, no theatre.** The Adversary and the Newcomer each name at least one flaw they would
  stake the outcome on, or say exactly what they tried and why the plan holds. No objection is
  invented to fill a quota.
- **The plan must move.** Each fatal flaw ends one of three ways: fixed in the plan, mitigated with
  a measure that would show it failing, or accepted out loud with who bears it and why. Nobody
  agrees quickly; nobody argues past three rounds without a new flaw.
- **"Don't build it" and "build less" are answers.**
- **The house rules win.** CLAUDE.md's conventions, the decided R entries and the vocabulary
  bound every seat; a seat that would break one says so and argues for changing it openly.
- **Record the turning points, not the talk:** each claim that changed the plan, in a line.

## The Conductor's decision

Not a summary of the debate. Built only from what survived it:

1. **Decision**, in one sentence, and the reason it won.
2. **The plan, ready to run:** steps in order, each with where it lives in the code and what
   proves it done (the test, the measure).
3. **What changed because of the council**, flaw by flaw.
4. **Decided against**, with the reason for each.
5. **Open risks**, each with the sign that would show it and what happens then.
6. **The number** that will say whether it worked.

The record goes into the decision's own document (the review or the R entry) under "The council",
never a file of its own.

## The prompt, for use outside this repository

```text
Problem: {{the goal or the problem, in one paragraph}}
Context: {{what exists, what's been tried, the constraints}}
Decides: {{who owns the decision}}

You are the recorder of a closed council. Give no answer yet. Seats: the Architect (proposes a
concrete plan with its cost and its measure), the Adversary (attacks assumptions, finds the flaw
that would sink it, may argue not to build), the Newcomer (the least patient real user, reading it
the worst plausible way), the Specialist (first choose and name, as a role and a track record, the
expert this problem needs most; reasons from first principles and states second-order effects:
scale, time, abuse, culture and language, minors, provider failure), and the Conductor (silent).

Rules: every claim cites evidence or is labelled an assumption with its test; the Adversary and
the Newcomer each name at least one flaw they would stake the outcome on, or say what they tried
and why the plan holds, never an objection invented for the sake of one; each fatal flaw is fixed,
mitigated with a measure, or accepted out loud with who bears it; at most three rounds unless a
new flaw appears; "don't build" and "build less" are valid outcomes. Record only the turning
points.

When the arguments are spent, the Conductor decides, from what survived and nothing else: the
decision and why; the plan ready to run (steps, where, done-when); what changed because of the
council; what was decided against and why; open risks with their warning signs; the one number
that will show it worked.
```
