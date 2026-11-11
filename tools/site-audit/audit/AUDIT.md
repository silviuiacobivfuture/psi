# Content audit rulebook

Audit **every URL** of psizone.ro, eq-sync.ro and hemi-sync.ro with the same rules, so that no page is judged by its title and no fact is lost in the rebuild. Follow this file exactly; when it does not cover a case, set `verdict` to `REVIEW` and explain in `notes`, never guess.

## Inputs

- `audit/urls.csv`: the master list, built by `pnpm run audit:urls` from the exports and crawls. One row per URL. This is the scope: every row must end up in `audit/audit.csv`.
- For each URL, read the **full text**: the WordPress Markdown (`data/wordpress/psizone/pages|posts|products|courses/*.md`) when it exists, else the crawl (`data/crawl/<site>/pages/*.md`). Use the crawl's `pages.jsonl` for outline, links and images, and `layout/` for menus and footers.
- Context for decisions: `docs/brands/CONTEXT.md`, `docs/brands/content-strategy.md`, `packages/design/brand-books/` (paths from the repository root).

## Outputs

1. `audit/audit.csv`: one row per URL, columns exactly as in `audit/audit-template.csv` (definitions below).
2. `audit/facts.jsonl`: every fact found, one JSON object per line.
3. `audit/REPORT.md`: the summary, written last from `audit/report-template.md`.

## How to work

1. Work in batches of 15 URLs, in the order of `audit/urls.csv`. For each URL: open and read the full text, fill the row, append its facts.
2. After each batch run `pnpm run audit:check`. Fix every error it prints before the next batch.
3. Never invent. Every fact must be on the page; put the page's own words in `quote` (up to 25 words). If a value is unclear, leave it out and say so in `notes`.
4. Write `summary` and `verdict_reason` in English; keep quotes, titles and Romanian terms as they are.
5. When two pages look alike, compare their text before calling one a duplicate (see Duplicates).
6. The run is resumable: rows already in `audit/audit.csv` are done; continue from the first URL without a row.

## Columns of audit.csv

| Column | What to put | Allowed values |
| --- | --- | --- |
| `site` | Which site the URL is on | `psizone` · `eqsync` · `hemisync` |
| `url` | The URL exactly as in `urls.csv` | |
| `page_type` | What the page is | `home` · `service` · `condition` · `method` · `programme` · `team` · `testimonials` · `about` · `contact` · `pricing` · `faq` · `blog_post` · `blog_index` · `event` · `workshop` · `product` · `product_category` · `course` · `audio` · `legal` · `system` · `landing` · `other` |
| `title` | Page title as shown | |
| `words` | Main-content word count | integer |
| `last_modified` | From the export or crawl, `YYYY-MM-DD` | |
| `audience` | Who it speaks to; several joined by `;` | `parents` · `children` · `teens` · `adults` · `families` · `patients` · `athletes` · `professionals` · `explorers` · `general` |
| `primary_topic` | One short phrase: the condition, method, programme or subject | |
| `summary` | What the page says, at most 30 words | |
| `facts_count` | How many facts you appended to `facts.jsonl` for this URL | integer |
| `claim_flags` | Codes from Claims, joined by `;`, or empty | |
| `testimonials_count` | Number of testimonials on the page | integer |
| `issue_flags` | Codes from Issues, joined by `;`, or empty | |
| `duplicate_of` | URL of the page it duplicates, if any | URL or empty |
| `contradicts` | URL(s) with conflicting facts (address, phone, prices, team), `;`-joined | |
| `quality` | Score from the Quality rubric | `1`–`5` |
| `verdict` | From Verdict rules | `KEEP` · `REWRITE` · `MERGE` · `MOVE` · `REDIRECT` · `ARCHIVE` · `DROP` · `REVIEW` |
| `verdict_reason` | One sentence; required for every verdict except `KEEP` | |
| `target_brand` | Where its content lives after the rebuild | `psizone` · `eqsync` · `hemisync` · `blog` · `none` |
| `target_url` | New URL (Target structure); required for `KEEP`, `REWRITE`, `MERGE`, `MOVE`, `REDIRECT` | path like `/copii/autism` |
| `becomes` | What the content turns into | `hub` · `method` · `programme` · `article` · `faq` · `kb_entry` · `product` · `event` · `team_profile` · `testimonial` · `legal` · `landing` · `audio_track` · `none` |
| `priority` | `P1` = high traffic or clinical risk, `P2` = normal, `P3` = low | `P1` · `P2` · `P3` |
| `notes` | Anything a human must decide or know | |

Products (`page_type=product`) and audio holders (`page_type=audio`) may leave `summary`, `audience`, `primary_topic` empty; everything else is required.

## facts.jsonl

One object per fact: `{"url": "...", "kind": "...", "value": "...", "quote": "...", "confidence": "high|medium|low"}`.

`kind` is one of: `service`, `method`, `condition`, `programme`, `price`, `duration`, `session_count`, `person`, `credential`, `role`, `address`, `phone`, `email`, `hours`, `room_or_equipment`, `partner`, `trademark`, `statistic`, `claim`, `testimonial`, `event_date`, `age_range`, `legal_entity`, `other`.

Rules: one fact per object; normalise values (`price`: "250 lei / ședință"; `phone`: "0752 466 792"); a testimonial's `value` is the first name or initials and age as given, its `quote` the testimonial's first 25 words.

## Claims (`claim_flags`)

Flag; do not judge legality. A human (a psychologist) reviews every flagged page.

- `CLAIM_EFFICACY`: says a method treats, cures or is effective for a condition, without a cited source.
- `CLAIM_SUPERLATIVE`: "cele mai avansate", "revoluționar", "unic", "garantat" and similar.
- `CLAIM_NUMBER`: a percentage, success rate or count of results without a source.
- `CLAIM_SAFETY`: absolute safety ("fără riscuri", "100% sigur", "nedureros" stated as universal).
- `CLAIM_MEDICAL`: medical indications (TMS for autism or ADHD, medication, diagnosis) that need clinical sign-off.
- `CLAIM_PARANORMAL`: out-of-body, telepathy, "accessing guides" and similar, presented as fact rather than experience.
- `TESTIMONIAL_OUTCOME`: a testimonial promising or quantifying a result ("after 10 sessions I spoke fluently").
- `TESTIMONIAL_SENSITIVE`: a testimonial revealing health details of an identifiable person or a minor.

## Issues (`issue_flags`)

`THIN` (under 150 words of real content) · `DUPLICATE` · `NEAR_DUPLICATE` · `PLACEHOLDER` (Lorem ipsum, "Elementor #", test text) · `TYPO` (more than two) · `OUTDATED` (past event, expired offer, old year) · `CONTRADICTION` (conflicts with another page) · `WRONG_BRAND` (Hemi-Sync or wellness content on the clinical site, or the reverse) · `BROKEN_LINK` (from the crawl's errors) · `ORPHAN` (in sitemap, no internal links to it) · `MISSING_META` (no meta description) · `NO_H1` · `BAD_SLUG` (slug is a pasted URL, duplicated, or meaningless) · `MACHINE_TRANSLATED` · `NO_NEXT_STEP` (no contact, booking or link onwards) · `EMPTY` (0 words; media holder or blank).

## Duplicates

Two pages are `DUPLICATE` when 80% or more of their sentences match, and `NEAR_DUPLICATE` when they share whole paragraphs or the same structure with light edits. Keep the better page as the target (higher quality, then newer, then more inbound links in `links.csv`); the other gets `duplicate_of` and verdict `MERGE` (it has something the target lacks) or `REDIRECT` (it adds nothing). Known suspects: three psizone posts of exactly 1,581 words; `/add-adhd/` and `/evaluare-si-interventie-in-adhd/`; `/neurofeedback/` and `/terapia-neurofeedback/`; several "Optimise Your Life" event pages; `/workshop-excursie/` (titled Explorarea Conștiinței, body is Optimise Your Life).

## Quality rubric

Score 1–5 on five questions; `quality` = rounded average.

1. **Accurate:** no wrong or contradictory facts, claims supportable.
2. **Clear:** a parent or adult understands it on first read.
3. **Unique:** says something no other page says.
4. **Useful:** answers a real question or moves someone to the next step.
5. **On-brand:** fits the voice in the target brand book (calm, plain, no hype).

5 = publish with light edits · 4 = good, small fixes · 3 = useful but needs rewriting · 2 = weak, salvage facts · 1 = nothing worth keeping beyond extracted facts.

## Verdict rules (apply in order, first match wins)

1. `page_type=system` (cart, checkout, account, LearnPress, test pages, Elementor drafts) → `DROP`, `becomes=none`. Note in `notes` if the function must exist in the new platform.
2. `EMPTY` audio holder → `MOVE`, `target_brand=hemisync` (or the brand named on it), `becomes=audio_track`. Note licensing for Monroe titles.
3. Past event or expired offer → `ARCHIVE` if it has a reusable description of a recurring workshop or programme, else `DROP`. Extract its facts either way.
4. Duplicate → `MERGE` or `REDIRECT` as in Duplicates.
5. `WRONG_BRAND` → `MOVE` to the right brand, then judge quality there.
6. Any `CLAIM_*` or `TESTIMONIAL_*` flag → at least `REWRITE` (never `KEEP`), priority `P1` if it is a service, condition or method page.
7. By quality: 5–4 → `KEEP`; 3–2 → `REWRITE`; 1 with unique facts → `MERGE` into the page where those facts belong; 1 without → `DROP`.
8. Can't decide → `REVIEW` with the question in `notes`.

Every `MERGE`, `REDIRECT`, `MOVE`, `KEEP` and `REWRITE` has a `target_url`. Every `DROP` and `ARCHIVE` keeps its facts in `facts.jsonl`, so nothing is lost.

## Target structure

**Psizone** (from `docs/brands/content-strategy.md`):

| Path | becomes |
| --- | --- |
| `/` | landing |
| `/copii/autism` · `/copii/adhd` · `/copii/integrare-senzoriala` · `/copii/logopedie` | hub |
| `/adolescenti` | hub |
| `/adulti/anxietate-depresie` · `/adulti/cuplu-familie` · `/adulti/post-avc` · `/adulti/psiho-oncologie` | hub |
| `/programe/sport` · `/programe/brainboost` | programme |
| `/metode/evaluare-qeeg` · `/metode/neurofeedback` · `/metode/tms` · `/metode/eq-sync` · `/metode/aba` · `/metode/logopedie` · `/metode/psihoterapie` · `/metode/hipnoza` | method |
| `/echipa` and `/echipa/<name>` | team_profile |
| `/preturi` · `/contact` · `/despre` · `/despre/spatiul` | landing |
| `/blog/<slug>` | article |
| `/ghid/<slug>` | kb_entry (AI guide knowledge base) |
| `/legal/termeni` · `/legal/confidentialitate` · `/legal/cookies` | legal |

**EQ-SYNC and Hemi-Sync** are recent builds: their `target_url` is the current path unless the page is a duplicate, thin, or has a bad slug, in which case propose a path in the site's own style and explain in `notes`. Psizone content that belongs to Hemi-Sync goes under `https://www.hemi-sync.ro/` paths (workshops `/programe/<slug>`, audio `/exercitii/<slug>`, articles `/articole/<slug>`); EQ-SYNC under its own `/blog/<slug>` or `/protocoale/<slug>`.

If the content of a page does not fit any target, propose a new path, use verdict `REVIEW`, and say why.

## Done means

- `pnpm run audit:check` prints `OK` with zero errors.
- Every URL in `urls.csv` has exactly one row.
- `REPORT.md` is filled in from the data, with every number taken from `audit.csv` and `facts.jsonl`.
