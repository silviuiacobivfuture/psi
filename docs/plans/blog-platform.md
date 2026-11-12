# Plan: the blog platform — authoring, moderation, the shared CMS, first-party analytics

Status: built and verified locally, 2026-11-12; nothing deployed. Builds on
`docs/plans/blog-and-content.md` (content model, review rule) and replaces the stopped CMS
slice's `docs/cms.md` (its useful parts are ported, below). Not reopened: the sites stay Hono +
Datastar (no React); Payload's admin (Next/React) is the accepted exception, confined to `apps/cms`.

## What exists now

```
editors, clinicians, publishers ─ cms.psizone.ro/admin (Payload 3.93, one admin for 4 brands)
     │ Authentik (auth.psizone.ro; locally the shared mock on :4351)
     │ authorization: AUTHZ_ADAPTER=interim (manifest roles from CMS_ROLE_ASSIGNMENTS) | openfga
     ▼
 Articles ── draft → in review → approved → published   (versions + drafts, autosave, live preview)
 KnowledgeEntries ── same gate → @psi/knowledge ingest on publish
 ReviewEvents (append-only editorial log) · People · Media · AnalyticsDaily · global ai-settings
     │ REST (anonymous: published only; staging: read-only API key)       ▲ /api/analytics/ingest
     ▼                                                                    │ (daily counters)
 blog-web ── @psi/cms-client (zod) ── snapshot (CMS over repo) ── pages, RSS, sitemap
     ▲ POST /__cms/revalidate (HMAC)   GET /_preview/<signed token>   POST /_a (beacon)
```

| Package / app | Responsibility |
|---|---|
| `@psi/content` | the article schema (now: standfirst ≤ 60 words enforced, optional `cover`, provenance required only when `aiDrafted`) |
| `@psi/cms-client` (new) | the sites' contract with the CMS: articles over REST → `Article` (zod), per-brand `ai-settings` client (60 s cache, last known, then defaults), signed preview tokens, signed revalidation webhook, analytics counter schema |
| `apps/cms` | Payload: collections, the review gate, review endpoints and panel, review queue, analytics ingest and dashboard, ai-settings, webhooks |
| `apps/blog-web` | reads through `@psi/cms-client`; `/_preview/:token`, `/__cms/revalidate`, `/_a`; collector |

## Upstream's CMS, checked before porting (probes on a fresh database)

| Hole (stopped slice's list) | Upstream | Now |
|---|---|---|
| Sibling-origin write with the session cookie | **not vulnerable**: Payload adds `serverURL` to `csrf` → 403 | `csrf: [SERVER_URL]` stated explicitly |
| `?locale=all` gate bypass | **vulnerable**: published with a blank standfirst | gate refuses any write that is not exactly `ro` or `en` (400) |
| Draft versions readable by any signed-in user | n/a (no versions) | versions added → `readVersions` by brand, never anonymous |
| Internal fields to anonymous readers | none existed | review notes, hashes, reviewer/author accounts, workflow, provenance hidden (verified) |
| **New:** anyone signed in creates users | **vulnerable** (201, password user) | users: own row; create/update/delete need `admin` |
| **New:** anyone signed in publishes a health article naming any reviewer | **vulnerable** (201) | `reviewer`/`reviewedAt` are set only by the clinician's approval |

## Decisions

**D1 Content source.** `CMS_URL` unset → the repository catalogue, as before. Set → the CMS's
articles merged over the repository's (a CMS article wins on its slug). Pages read an in-memory
snapshot; it is replaced only by a successful read (a CMS outage keeps the last good one), refreshed
every `CMS_REFRESH_SECONDS` (300) and at once on the webhook. Production reads anonymously
(`_status=published`); a host with drafts (`SITE_ENV=staging`) reads latest drafts with its key.
Every document passes `@psi/content`'s `Article`; a document that does not is dropped with its
field paths logged (never its text). The CMS's workflow stages are editorial; on the blog every
unpublished text is a `draft` (body) or an `in-review` stub (title only).

**D2 Workflow and gate** (ported: per-locale review, sha256 of the approved content, reviewer ≠
author, append-only log, fail-closed locale; new: stages, submit, both locales, signing).
`draft → in_review` (submit, `write`) `→ approved` (every locale approved by a person who is
neither author nor submitter: `clinical_review` for `kind: health`, `publish` otherwise) `→
published` (Payload's Publish, `publish`). A clinical approval signs the article with the
reviewer's People profile (linked to their account): the blog's "Revizuit de …" is never typed.
An edit after approval sends that locale to `pending` and the text back to `in_review`; drafts keep
the published version live meanwhile. Each refusal is named ("en: the text changed after it was
approved"). The admin has a review panel (actions this person may take, notes, log), a review queue
(`/admin/review`) and the editorial log.

**D3 Authorization.** Roles live in `apps/cms/authz.manifest.json` (`cms:admin`, `cms:editor`,
`cms:publisher`, `cms:clinical_reviewer`, `cms:reader`, `cms:ai_admin` on `cms_brand:<brand>`); the
CMS stores none. `AUTHZ_ADAPTER=openfga` asks OpenFGA `list-objects` for `user:<Authentik sub>`
through SEB's read-only filter (fails closed). Until psi's OpenFGA answers the CMS — today it is
in-cluster only, its filter image is `REPLACE_ME`, and there is no store or model for `cms` —
`AUTHZ_ADAPTER=interim` (isolated in `src/authz/interim.ts`, to delete) evaluates the SAME manifest
roles from `CMS_ROLE_ASSIGNMENTS`: `group:<Authentik group>` or an e-mail, bound to `role[@brand]`.
Directory groups are mirrored on each sign-in. Verified: an EQ-SYNC editor gets 404 on a Psizone draft.

**D4 One admin for the four sites.** Authz brands are `psizone | eqsync | hemisync | blog`;
articles keep the three publishing brands (`@psi/content`); a brand filter in the admin narrows
lists (a convenience; access is the rule). `/` answers 308 → `/admin`.

**D5 Live preview.** The CMS signs `{id, locale, exp}` (HMAC, `PREVIEW_SECRET`, 8 h); blog-web's
`/_preview/<token>` reads the latest draft with its key and renders it with its own templates
(no-store, noindex, `frame-ancestors` the CMS), reloading on Payload's save event (Datastar,
origin-checked). An incomplete draft shows what is still missing, by field.

**D6 Revalidation.** On publish, change to a published text, withdrawal or delete — and on any
brand's AI-settings change — the CMS POSTs `/__cms/revalidate` to every site in `SITE_WEBHOOK_URLS`,
`x-psi-signature: sha256=<HMAC(CMS_REVALIDATE_SECRET)>`, events older than 5 min refused. Never
blocks the save. Autosaves do not notify.

**D7 Per-brand `ai-settings` (global).** `embeddings` (openrouter|lexical), `embedModel`
(allow-list), `deepSearch`, `guideEnabled`, `exchangeLimit` (1–200, 20), `exchangeWindowHours`
(1–168, 24), `screeningLevel` (standard|strict), `updatedBy`/`updatedAt` (stamped). Read per brand
(`read`), edited per brand (`ai_admin`). No secret in Payload. Sites read
`GET /api/globals/ai-settings` with their own read-only key; the engine enforces the values.

**D9 Prices (`offerings`, owner: "of course we do. via the cms").** Brand-scoped services,
programmes and protocols: `title`/`summary` (both locales), `price` = fixed {amount, RON} | range
{from, to} | from {from} | on request, `priceNote`, `validFrom`, `sortOrder`, `demo`. Same gate:
an editor writes, a publisher (never the author) approves both locales, a publisher publishes.
Sites read published offerings anonymously through `@psi/cms-client`
(`createOfferingsClient().offeringsFor(brand, locale)`, 60 s cache, background refresh, refreshed
by the `offerings` webhook event) and render them with `@psi/ui`'s `OfferingPrices` beside the
placeholder they replace: Psizone first visit, FAQ "Cât costă?", Race Me Up; EQ-SYNC protocol cards
and the 1:1 session; Hemi-Sync programme pages, the sessions list and the club fee. No CMS or no
published price → the placeholder stays as it was. Psizone's method pages ask for no price today,
so they are unchanged. **Scheduling never reads the CMS** (`@psi/scheduling` has no reference to it).
Local seed: six entries marked DEMO, "on request" only, shown only where drafts may be (never
production); no real price was entered.

**D10 Break-glass.** The seeded local break-glass account (BREAKGLASS_EMAIL, no directory subject)
is an implicit admin in both adapters, so an empty binding list or an unreachable OpenFGA never
locks the operator out. If that e-mail signs in through Authentik the row gains a subject and the
directory's roles apply instead.

## Analytics (D8) — recommendation

Estate check: `../seb` (pieces, gitops, packages) and psi's `gitops/`, `estate/` have **no**
PostHog, Umami, Plausible or Matomo service (only n8n's disabled PostHog diagnostics);
`PLATFORM_APPS` has none. So: the adapter ships with a local store, and the backend is your call.

| Option | For | Against |
|---|---|---|
| **A. First-party counters in the CMS's Postgres (recommended, built)** | no new service; nothing personal is ever stored (daily counters, no visitor rows, no hash persisted); the editors' dashboard is in the CMS; CNPG backups already exist | we build each view; no referrers/devices (by design); analytics shares the CMS's availability (the collector buffers and retries) |
| B. Umami on CNPG | ready UI, referrers, devices, events API | a new service to run and patch; stores per-session rows (hashed) and device/country data — more than a clinic needs |
| C. Plausible CE | polished, privacy-first | ClickHouse to run; heavy for this traffic |
| D. Matomo | full-featured | PHP/MySQL; cookie-based unless reconfigured; heaviest |
| E. PostHog | product analytics, replays | far beyond the need; personal-data surface a clinic should avoid |

Built: `apps/blog-web/src/analytics/` — the article page's Datastar beacon (a view on load; 25/50/75/100 %
of the ARTICLE scrolled), `POST /_a` (always 204), counted only for a real browser without
`DNT: 1`/`Sec-GPC: 1` (the beacon is not even rendered for them); a reader counts once per article
per UTC day via an in-memory sha256(daily random salt + address + browser), the salt never stored
and dropped at midnight; counters flush every 30 s to `cms` (`/api/analytics/ingest`, bearer key,
atomic upsert-increment) or `file` (`.data/analytics.json`, dev). The guide's questions are counted
(asked / unanswered = `no_content`), never their text. Dashboard: `/admin/analytics` — views per
article and brand, top topics, views per day, read depth and read-through, the guide's questions.

## Secrets and values (OpenBao KV `secret/…`; nothing here is set yet)

| Key | Path | Readers | Notes |
|---|---|---|---|
| `PREVIEW_SECRET` | `apps/cms/shared` | cms, blog-web | ≥ 32 chars, generated |
| `CMS_REVALIDATE_SECRET` | `apps/cms/shared` | cms, blog-web, psizone-web, eqsync-web, hemisync-web | ≥ 32, generated |
| `ANALYTICS_INGEST_TOKEN` | `apps/cms/shared` | cms, blog-web | ≥ 32, generated |
| `CMS_ROLE_ASSIGNMENTS` | `apps/cms/env` | cms | interim bindings (literal) |
| `OPENFGA_API_TOKEN` | `apps/cms/env` | cms | a preshared key of psi's OpenFGA (`openfga-secrets`) |
| `CMS_API_KEY` | `apps/<site>/env` per site | that site | the site's service user's Payload API key (made in the admin); prices need none |
| `S3_*`, `PAYLOAD_SECRET`, `OIDC_*`, `BREAKGLASS_*` | unchanged | cms | S3 is now all-or-none (none = local disk, dev only) |

Plain configuration (Deployment env, not secrets): cms `AUTHZ_ADAPTER`, `OPENFGA_API_URL`
(`http://openfga.openfga.svc:8081`), `OPENFGA_STORE_ID`, `OPENFGA_MODEL_ID`, `BLOG_PREVIEW_URL`,
`SITE_WEBHOOK_URLS`; sites `CMS_URL` (in-cluster `http://cms.cms.svc`), `CMS_REFRESH_SECONDS`,
`ANALYTICS_SINK`.

## Live change on the next CMS deploy (stated, not pushed)

Migrations `20261111_232254_blog_platform`, `_232600_ai_exchange_limits`, `_233616_ai_screening_level`
run on boot: upstream's `status` becomes Payload's `_status` (a published article stays published;
round-tripped down/up locally), the three topics join the enum, versions/knowledge/log/counters/
ai-settings tables appear; `_235929_offerings` adds prices. `importMap.js` must stay generated WITH S3
configured. **Before that deploy**, seed `CMS_ROLE_ASSIGNMENTS` (else only break-glass can enter)
and add the new keys to the ExternalSecret, `seb.app.yaml` and the Deployment (not done here).

## Not verified here (stated, not hidden)

- `next build` / the Docker image with the three new workspace dependencies (not run against the live
  dev server's `.next`); `seb.app.yaml`, Dockerfile and gitops are untouched for the new env.
- Knowledge ingest: unit-tested only (`PSI_KNOWLEDGE_DB_URL` unset, the sink never ran).
- The OpenFGA adapter: unit-tested against a fake; not run against psi's OpenFGA (not reachable).
- `apps/cms` tsc now reports `SharpConstructor` vs `SharpDependency`: `packages/pwa` and
  `tools/images` (other work) added `sharp ~0.34.5`, which Payload's types now resolve; pin one sharp.
- Salvage `docs/cms.md` is not copied as a file: its content model, gate and hardening live here and
  in the code; its own auth (custom session, mock issuer) is superseded by upstream's payload-oauth2.

## Owner decisions

Decided 2026-11-12: analytics in the CMS's Postgres, as built; unanswered guide questions as
counts only, never their text. The publisher approves non-health texts (no editor-in-chief). Prices
in RON only; `validFrom` stays in the admin and is never shown on a site. The repository's articles
(the editorial policy, the 7 AI drafts and the 10 backlog titles, the last as title-only drafts
with provenance "backlog, content-strategy.md", never public until written, reviewed and
published) are imported into the CMS as drafts (`pnpm --filter @psi/cms import:articles`,
idempotent by slug; done locally: 18 created, a re-run created none); the in-code copies and the merge retire once the CMS serves them
(`CMS_REPO_FALLBACK=false`, verified locally on a spare port; stays `true` until the live import
and the editorial policy's publication; P5). The brand sites' "From the blog" cards read the same
way (`@psi/cms-client` `createArticleIndex`: the CMS's published articles over the repository's,
the same switch, refreshed by the `articles` webhook), so the switch flips estate-wide.

Still open:

1. **Interim role bindings for dev**: who is admin, editor (per brand), clinical reviewer,
   publisher, AI admin; and the Authentik groups for them (`app-cms-*`; only `app-cms-editor` exists).
2. **Clinical reviewers**: each needs an Authentik account and a People profile linked to it.
3. **OpenFGA**: build the filter image and create the `cms` store/model (from the manifest), then
   `AUTHZ_ADAPTER=openfga`; confirm `user:<Authentik sub>` is SEB's person id (else map it).
4. **The blog service user** reads all four brands (articles span three); other sites read their own.
5. **Prices**: enter the real ones (each is approved and published).

## Task list

| ID | Task | Acceptance |
|---|---|---|
| P1 | Seed `apps/cms/shared` + per-site `CMS_API_KEY`; add the keys to the ExternalSecrets and `seb.app.yaml`s | pods Ready, sites read the CMS |
| P2 | Deploy CMS (migrations) — after a DB backup | `_status` kept; `/` → 308 `/admin` |
| P3 | OpenFGA filter image, `cms` store + model, `AUTHZ_ADAPTER=openfga`, delete `interim.ts` | role tests green against OpenFGA |
| P4 | Authentik groups `app-cms-{admin,publisher,reviewer,ai-admin}` + blueprints | owner signs in, sees what the role allows |
| P5 | Run `import:articles` on the live CMS; review and publish the editorial policy there; set `CMS_URL` (staging, then production); then `CMS_REPO_FALLBACK=false` on the blog and the three sites, and delete the in-code articles | blog unchanged to a reader |
| P6 | Brand sites read `ai-settings` for their guides (engine work) | done for articles and prices |
| P7 | Engine reads `ai-settings` (another agent) | limits and screening enforced |
| P8 | Re-review reminder (`approvedAt` + 12 months), Novu notice to reviewers on submit | |
| P9 | Shared knowledge store (pgvector or sqld) so CMS-published knowledge reaches the guides | |
| P10 | Analytics: retention (counters 25 months), CSV export, per-brand dashboard filter | |
| P11 | Real prices entered and published; remove the local DEMO seed | sites show them |

## Verification (2026-11-12, local)

tsc clean for content, cms-client, cms, blog-web (blog-web's only errors are another agent's
in-progress `covers.ts`/`packages/ui`); vitest content 23, cms-client 50, cms 96, blog-web 13 (new);
biome 0 errors on these files. End to end on a local CMS + blog (scratchpad `e2e.sh`): editor
publish 403; publisher before review 400 (named refusals); `?locale=all` 400; forged review
ignored; EQ-SYNC editor 404; author self-approval 403; publisher approving health 403; reject
without notes 400; ro approved → publish 400 `en: not approved`; en approved → stage `approved` →
publish 200 → anonymous REST shows it signed "Dr. Ion Popescu" with no internal fields → blog
`/articole/<slug>` and `/en/articles/<slug>` 200. Webhook: signed 204, forged 401. Analytics:
10 hits → 4 views (reload deduped; DNT, GPC, crawler not counted), cumulative depth; dashboard
renders them; in Chrome the beacon fires on load and on scroll, no cookie. Preview: signed 200 (no-store, framed by the CMS only), incomplete draft names what is missing, forged 404. SSO through the shared local issuer lands in `/admin` with the groups mirrored.
