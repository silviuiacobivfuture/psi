# site-audit: instructions for Claude Code

The content audit of the three current sites, **Psizone** (psizone.ro), **EQ-SYNC** (eq-sync.ro)
and **Hemi-Sync România** (hemi-sync.ro), done before any of them is rebuilt on psi. Every
decision so far is in `docs/brands/CONTEXT.md` (paths in this file are from the repository root
unless they start inside this tool); read it first. The repository's own `CLAUDE.md` binds here
too.

## The job

Before any content moves to the new platform, every page of the three current sites must be
exported and audited, so no content is lost and every page has a decided fate. Commands run from
`tools/site-audit/`.

1. **Export and crawl** (`README.md` has the commands). Do not modify the live sites; these
   scripts only read public pages.
2. **Build the URL list:** `pnpm run audit:urls` → `audit/urls.csv`.
3. **Audit every URL** by the rules in `audit/AUDIT.md`, writing `audit/audit.csv` and
   `audit/facts.jsonl`. Work in batches of 15, run `pnpm run audit:check` after each batch, and
   fix every error before continuing.
4. **Write `audit/REPORT.md`** from `audit/report-template.md`, with every number from the data.
   Then `pnpm run audit:redirects`.

## Rules that matter

- **Read the full text of every page.** Never judge a page by its title, URL or headings. The
  previous pass did that; this one exists to replace it.
- **Never invent.** Facts come from the page, with the page's own words in `quote`. Unsure →
  `REVIEW` with the question in `notes`.
- **Do not skip or sample.** `pnpm run audit:check` must end with `OK: audit complete`.
- **Health claims are flagged, not judged.** A psychologist reviews every flagged page.
- **Personal data:** do not export anything behind a login (form submissions, orders, users). If a
  page shows a client's health details, flag `TESTIMONIAL_SENSITIVE` and do not copy the details
  into facts beyond first name/initials and age.
- **Romanian:** keep diacritics exactly (ă â î ș ț). Quote Romanian as written.
- Commit after every batch (`docs(audit): batch N`, files staged by name), so work is never lost.

## Where things are

| Path | What |
| --- | --- |
| `docs/brands/` | `CONTEXT.md` (decisions), `HISTORY.md` (decision log, what was rejected), `RESOURCES.md` (all links and sources), `research/` (site research, positioning, early platform sketch), `content-strategy.md`, the preliminary inventory, the brand themes overview |
| `packages/design/` | the psi design language: `tokens.json` (8 themes), `PALETTE.md`, component CSS, the original React bundle and its types, `brand-books/`, `component-guides/` |
| `scripts/export-wordpress.mjs` | Lossless export of a WordPress site via its public API (psizone.ro) |
| `scripts/crawl-site.mjs` | Crawl of any site: sitemap + links → Markdown, raw HTML, menus/footers, links, assets, errors |
| `scripts/build-url-list.mjs` · `validate-audit.mjs` · `make-redirects.mjs` | Audit tooling |
| `audit/` | Rulebook, templates, and the audit outputs |
| `data/` | Exports and crawls (generated). The kit said to commit it, as the only full copy once the old sites go; where it lives (git or the estate's object storage) is still open, because the media alone is 559 files |

## After the audit

Platform architecture, content migration, and the three brand sites plus the blog, built on the
psi design language in `packages/design/`.
