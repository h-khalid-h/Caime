# Legal review, October 2026

The privacy policy (`/privacy`), the terms (`/terms`) and the draft data processing agreement
(`docs/DPA-DRAFT.md`), read in the lawyer's chair on 2026-10-04 against the GDPR (the operator,
`DATA C OÜ`, is in Estonia, so the GDPR applies to it directly), Estonian and EU consumer law, and
the data protection laws of the first customers' countries (Egypt's Law No. 151 of 2020, Saudi
Arabia's PDPL, the UAE's Federal Decree-Law No. 45 of 2021). The product's facts were checked
against the code, as the pages read them from it.

**What this is not.** Legal advice, or a lawyer's sign-off. A licensed lawyer in Estonia (and
one in Egypt for the first clinics) still reads all three before a first customer relies on them.
What it is: every finding a careful lawyer would raise on a first read, with the ones that are
product-side already fixed, and the rest as decisions for the owner or wording for the lawyer, so
that reading is short.

## In one paragraph

The three documents are unusually honest and specific for a product at this stage: they say what
is kept, for how long and why, in plain words, from the code itself. What they lacked was the
legal frame around those facts: the controller's address, the law and courts the terms are under,
the named grounds for processing, health data in a clinic's conversations, breach notice to
people, the processor clauses the GDPR's Article 28(3) lists (sub-processor changes and objection,
flow-down, assistance with impact assessments, deletion at the end), liability between the
parties and the laws of the customers' countries. All of that is now written in (the address and
the law as configuration the owner sets, since they are the owner's facts), or marked for the
lawyer with a proposal to accept or strike.

## Findings

Severity: **must** (a legal requirement, or a gap a first customer's lawyer stops on), **should**
(expected in a professional document), **note** (a judgement for the lawyer).

### Privacy policy

| # | Severity | Finding | Done |
| --- | --- | --- | --- |
| P1 | must | The controller is named but has no address (GDPR Art. 13(1)(a) asks for identity and contact details). | Fixed: `LEGAL_ADDRESS` renders in the opening line and under Contact. ⛔ The owner sets it (EasyPanel). |
| P2 | must | Health data: a clinic's customers write about their health; the policy said organizations are controllers but not that this is sensitive data, nor what Caime does and doesn't do with it. | Fixed: a paragraph under "Organizations you write to" (sensitive, the organization's to look after, Caime stores and delivers only, never reads or trains). |
| P3 | should | Legal bases were given in plain words without saying they are the law's grounds; withdrawing consent wasn't said to be free of effect on the past. | Fixed: the "Why" section names Article 6 and the withdrawal line. |
| P4 | should | No statement on automated decision-making (Art. 13(2)(f), Art. 22): the inbox sorts and suggests by machine. | Fixed: one paragraph saying no decision with legal or similar effect is made by machine alone, and everything is a suggestion with its reason. |
| P5 | should | Breach notice to the people affected (Art. 34) wasn't promised. | Fixed: under Security. |
| P6 | note | Minimum age 13 by default (`MINIMUM_AGE`). Under the GDPR's Art. 8, consent-based services offered to children need parental consent below 16 (13 to 16 by member state; Estonia: 13). Caime's core runs on contract, not consent, and consent-based features (AI assist, apps, tokens, plans) are 18+, which is why 13 holds. Egypt's law requires a guardian's consent for a child's data generally. | ⛔ The lawyer decides whether 13 stands for each country, and whether a guardian-consent step is needed where Egyptian children sign up; `MINIMUM_AGE` is per deployment today, not per country. |
| P7 | note | A data protection officer (Art. 37): as a processor for clinics, Caime may come to process health data at scale. | ⛔ The lawyer assesses when the first clinics are on; nothing in the product depends on it. |
| P8 | note | International transfers name "the United States" and the standard contractual clauses in general. | Kept; the DPA's section 13 now names each company's country and the two mechanisms. |

### Terms

| # | Severity | Finding | Done |
| --- | --- | --- | --- |
| T1 | must | No governing law or courts, and no mention of EU consumers' right to their own courts or the ODR platform. | Fixed: section 11 "The law" renders when `GOVERNING_LAW` is set, with the EU consumer carve-out and the ODR address. ⛔ The owner sets it ("Estonia", presumably). |
| T2 | must | Organizations: the terms didn't say an organization is the controller of its customers' conversations with Caime as its processor, nor that a data processing agreement exists, nor that Caime isn't a medical record. | Fixed: a clause in section 4, the agreement "available from" the contact address until it's published. |
| T3 | should | EU withdrawal (14 days, Directive 2011/83) for a paid plan was covered only by "your consumer rights still apply"; a plan that starts at once needs the consumer's request to start within the period, or the right stays whole. | Fixed: a sentence in section 6. ⛔ The lawyer confirms the wording and that Stripe Checkout carries the acknowledgement. |
| T4 | should | No notice period if the operator closes Caime or someone's access for a reason other than breach, and no refund of time paid. | Fixed: 30 days' notice, data to download, unused time returned (section 8). |
| T5 | should | Caime's own rights (name, characters, software) weren't reserved. | Fixed: one sentence in section 7. |
| T6 | note | The liability cap (12 months' payments) is zero for free accounts; usual, and the consumer carve-out stands. | Kept; the lawyer may add a floor. |
| T7 | note | Age: "tell Caime the truth about your date of birth" relies on self-declaration. | Kept; see P6. |

### Data processing agreement (draft)

| # | Severity | Finding | Done |
| --- | --- | --- | --- |
| D1 | must | Sub-processors: a general authorization needs notice of changes, a right to object and the consequence, and flow-down of the obligations with the processor liable for the sub-processor (Art. 28(2), 28(4)). | Fixed: 30 days' notice, objection, exit with a refund, flow-down, full liability (section 7). |
| D2 | must | Health data: a clinic's conversations are special-category data; the agreement listed them but set no warranty or basis. | Fixed: the Organization warrants its basis (Art. 9(2)(h); Egypt's permit; its own law's equivalent) and that Caime isn't its medical record (section 6). |
| D3 | must | Documented instructions and the duty to flag an unlawful instruction (Art. 28(3)(a), (h)) were left wholly to the lawyer. | Fixed: written in, the wording marked for the lawyer (section 4). |
| D4 | must | Assistance with Articles 32–36 (impact assessments, prior consultation) was missing; rectification among the rights was missing. | Fixed: section 8. |
| D5 | must | Breach notice had no deadline. | Fixed: without undue delay and within 48 hours, to the owner's email, the controller's 72 hours kept (section 10). |
| D6 | must | End of processing left deletion open. | Fixed: a 30-day export window after closing, then deletion of what was the Organization's alone, customers' copies kept, the open question kept for the lawyer (section 12). |
| D7 | should | No liability allocation, term, precedence or law. | Fixed: section 14. |
| D8 | should | Transfers didn't name each company's country or the mechanisms, nor the Organization's own transfer rules for a controller outside the EU. | Fixed: section 13. |
| D9 | note | The Organization's own law (Egypt, Saudi Arabia, UAE) applies to it as controller regardless of the agreement's law. | Said in the preamble and section 14; ⛔ an Egyptian lawyer reads it for the first clinics. |
| D10 | note | The agreement isn't shaped as the EU's standard clauses (Annexes I–III). | A mapping paragraph in the preamble; the lawyer may restructure. |

## What the owner does now

1. Set `LEGAL_ADDRESS` and `GOVERNING_LAW` on the service (minutes; `docs/DEPLOY.md`). Until
   then the pages leave the address out and the terms carry no law clause, rather than an
   invented one.
2. Give all three documents to a lawyer in Estonia, and the agreement and the privacy page to one
   in Egypt before the first clinic signs, with this review as the reading list: every
   **[lawyer]** mark in the draft is a decision or a wording, and every ⛔ above is theirs.
3. Decide P6 (the minimum age per country) and P7 (a data protection officer) with them.

## What the code keeps true

`apps/server/test/about.test.ts` renders the pages with and without the address and the law and
checks each line; `apps/server/test/dpa-draft.test.ts` holds the agreement's facts (sub-processors,
retention spans, limits, hashing) to the code. A change to what Caime keeps or who processes it
fails one of them until the documents say so.
