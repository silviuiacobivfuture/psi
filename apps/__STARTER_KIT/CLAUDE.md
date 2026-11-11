# Psizone platform: instructions for Claude Code

This repository will become the Payload CMS platform for three brands: **Psizone** (psizone.ro), **EQ-SYNC** (eq-sync.ro) and **Hemi-Sync România** (hemi-sync.ro), plus a shared blog. Read `context/CONTEXT.md` first: it holds every decision made so far.

## Current phase: content audit

Before any code for the new platform, every page of the three current sites must be exported and audited, so no content is lost and every page has a decided fate.

1. **Export and crawl** (`START-HERE.md` has the commands). Do not modify the live sites; these scripts only read public pages.
2. **Build the URL list:** `npm run audit:urls` → `audit/urls.csv`.
3. **Audit every URL** by the rules in `audit/AUDIT.md`, writing `audit/audit.csv` and `audit/facts.jsonl`. Work in batches of 15, run `npm run audit:check` after each batch, and fix every error before continuing.
4. **Write `audit/REPORT.md`** from `audit/report-template.md`, with every number from the data. Then `npm run audit:redirects`.

## Rules that matter

- **Read the full text of every page.** Never judge a page by its title, URL or headings. The previous pass did that; this one exists to replace it.
- **Never invent.** Facts come from the page, with the page's own words in `quote`. Unsure → `REVIEW` with the question in `notes`.
- **Do not skip or sample.** `npm run audit:check` must end with `OK: audit complete`.
- **Health claims are flagged, not judged.** A psychologist reviews every flagged page.
- **Personal data:** do not export anything behind a login (form submissions, orders, users). If a page shows a client's health details, flag `TESTIMONIAL_SENSITIVE` and do not copy the details into facts beyond first name/initials and age.
- **Romanian:** keep diacritics exactly (ă â î ș ț). Quote Romanian as written.
- Commit after every batch (`git add audit && git commit -m "audit: batch N"`), so work is never lost.

## Where things are

| Path | What |
| --- | --- |
| `context/` | `CONTEXT.md` (decisions), `HISTORY.md` (decision log, what was rejected), `RESOURCES.md` (all links and sources), `research/` (site research, positioning, early platform sketch), `content-strategy.md`, `brand-books/` (shared foundations + Psizone, EQ-SYNC, Hemi-Sync, Blog), the preliminary inventory, the brand themes overview |
| `design/` | `README.md` (how to use), `tokens.json` (8 themes), `PALETTE.md` (every colour and contrast ratio), component CSS, React component bundle, types, per-component guides |
| `scripts/export-wordpress.mjs` | Lossless export of a WordPress site via its public API (psizone.ro) |
| `scripts/crawl-site.mjs` | Crawl of any site: sitemap + links → Markdown, raw HTML, menus/footers, links, assets, errors |
| `scripts/build-url-list.mjs` · `validate-audit.mjs` · `make-redirects.mjs` | Audit tooling |
| `audit/` | Rulebook, templates, and the audit outputs |
| `data/` | Exports and crawls (generated; commit it, it is the only full copy once the old sites go) |

## Next phases (after the audit; plans to follow)

Platform architecture (Payload multi-tenant, SSO, back office, scheduling app, automations), content migration into Payload, and the three brand sites plus blog built from `design/`.
