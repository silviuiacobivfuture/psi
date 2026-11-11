# site-audit

Copies the three current sites and audits every page before the rebuild. Rules for Claude Code:
`CLAUDE.md`; the rulebook: `audit/AUDIT.md`.

From the repository root: `pnpm install`. Then, inside `tools/site-audit/`:

```bash
pnpm exec playwright install chromium   # only if a site turns out to be built with JavaScript (see below)
```

## 1. Copy the three sites (a few minutes)

```bash
pnpm run export:psizone      # WordPress API: every page, post, product, course, all 559 media files
pnpm run crawl:psizone       # psizone.ro as visitors see it (menus, footers, page HTML)
pnpm run crawl:eqsync        # eq-sync.ro
pnpm run crawl:hemisync      # hemi-sync.ro
```

Each prints a summary. If a crawl reports many "thin pages", the site renders its text with
JavaScript: rerun that crawl with `--browser` added, for example
`pnpm run crawl:eqsync -- --browser --fresh`.

## 2. Hand it to Claude Code

Open Claude Code in this folder and paste:

> Read CLAUDE.md and audit/AUDIT.md. Run `pnpm run audit:urls`, copy `audit/audit-template.csv` to `audit/audit.csv`, then audit every URL in `audit/urls.csv` in batches of 15, exactly by the rulebook: read each page's full text, fill its row, append its facts, run `pnpm run audit:check` after each batch and fix all errors before continuing, and commit after each batch. Don't stop until the check says the audit is complete; then write `audit/REPORT.md` from the template and run `pnpm run audit:redirects`.

It may take a few sessions; it resumes where it stopped. Progress at any time:
`pnpm run audit:check`.

## 3. What you get

- `audit/audit.csv`: every page of all three sites, with what it says, its problems, its score, its fate and its new address.
- `audit/facts.jsonl`: every service, price, person, phone number, claim and testimonial, with the exact quote.
- `audit/REPORT.md`: findings, the claims review queue for a psychologist, contradictions, duplicates, gaps and open questions.
- `audit/redirects.csv`: old address → new address, ready for launch.
