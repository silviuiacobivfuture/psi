# Plan: psizone-web (the Psizone landing site)

Status: plan, not built. App `apps/psizone-web` (`@psi/psizone-web`). Stack (decided): Node 24 + Hono rendering
typed TSX (`hono/jsx`) on the server, Datastar v1.0.5 (self-hosted bundle; `@starfederation/datastar-sdk` for SSE),
Tailwind 4, Paraglide JS 3 (`ro` reference, `en` second), components only from `@psi/ui` on `@psi/design`
(`psizone-dark` primary, `psizone-light`). No React. CMS source planned in `docs/plans/blog-and-content.md`.

Sources: `docs/brands/*`, `packages/design/brand-books/{0-shared-foundations,1-psizone}.md`, `component-guides/`,
`tools/site-audit/audit/AUDIT.md` (target URLs), live psizone.ro/contact (read 2026-11-11).

## 0. Facts that shape this plan

1. **`@psi/ui` does not exist yet** (`packages/` holds only `design`). `packages/design/index.d.ts` is a *React*
   contract (`onSubmit`, `onClick`, `React.ReactElement`), and the design README's "React 18 / Next.js" wording is
   stale under the no-React rule. We take the props and the guides as the contract; callbacks become Datastar
   attributes. Every `@psi/ui` component accepts `attrs?: Record<\`data-${string}\`, string>` for Datastar.
2. **The 18 components do not cover a site.** Required `@psi/ui` additions (owned by the `@psi/ui` plan, never
   written in this app): `SiteFooter`, `MobileMenu` (NavBar's collapsed state), `ThemeToggle`, `LanguageSwitch`,
   `Breadcrumbs`, `FaqList` (`<details>`), `Section` (container + spacing), `ReviewNote` (author, reviewer,
   date), `Notice` (info/success/danger/crisis), `RadioGroup`, `Checkbox` (consent), `Select`. Not used on this
   site: `AudioPlayer`, `ProgramTracker`, `ProductCard`, `StatusBadge`. `ArticleCard` waits for the blog.
3. **The audit has not run**: no `audit.csv`, `facts.jsonl` or `redirects.csv`. Content sources today are
   `docs/brands/*` and `preliminary-inventory-psizone.csv`. Old WordPress text exists but needs a rewrite and
   clinical review; **no reviewed clinical copy exists**. The launch is content-bound, not code-bound.
4. **URL sources disagree.** `AUDIT.md` (adopted as canonical) adds `/programe/brainboost`, `/metode/hipnoza`,
   `/preturi`, `/despre/spatiul`, `/legal/termeni` to `content-strategy.md`. Editorial policy has no path: proposed
   `/despre/politica-editoriala`. GDPR lives in `/legal/confidentialitate`. No trailing slashes (WordPress had
   them; normalised with a 301).
5. **NAP today** (live /contact): Str. General Alexandru Cernat nr. 126, Galați; 0748 017 752, 0752 466 792;
   CUI 39469941; Reg. Com. J/17/821/2018. Missing: the legal entity's name (needed as data controller), hours,
   a non-Gmail address. The 2024 press address (Al. I. Cuza 72) conflicts.
6. **Design CSS `@import`s Google Fonts**: an extra third-party origin that costs LCP and is a GDPR liability.
   Fonts must be self-hosted (a `@psi/design` task).

## 1. Sitemap

English mirrors use a `/en` prefix and English slugs (`/en/children/autism`, `/en/methods/neurofeedback`, …),
held in one typed route registry (`src/routes/registry.ts`). An English page exists only when its English
entry exists and is reviewed; hreflang is emitted only for real pairs. **MVP English = home, contact, team,
legal**; English hubs and methods ship when translated and reviewed (until then English cards link to the
Romanian page, marked `hreflang="ro"` "în română").
**Launch gate (production)**: approved home, `/contact`, `/legal/confidentialitate` (hard prerequisite: the
intake form is disabled while it is missing), `/legal/cookies`, `/echipa`, and at least the hubs whose cards
show; unapproved hubs are hidden from cards and nav, not linked to a 404.

| Path (ro) | Template | MVP | Content source today | Missing (owner/clinician) |
|---|---|---|---|---|
| `/` | Landing | yes | brand book real lines; homepage H1 + 6 cards (inventory) | 2–4 AskBar questions; hub one-liners |
| `/copii/autism` | Hub | yes | WP Autism (617 w, strongest), Stimulare polisenzorială | rewrite, FAQ 5–8, reviewer |
| `/copii/adhd` | Hub | yes | WP ADD-ADHD + Evaluare ADHD (duplicates) | rewrite, FAQ, reviewer |
| `/copii/integrare-senzoriala` | Hub | yes | WP Integrare neurosenzorială (intro off-topic) | rewrite, FAQ, reviewer |
| `/copii/logopedie` | Hub | yes | homepage card only | **all copy new** |
| `/adolescenti` | Hub | yes | WP Intervenția la adolescenți, Adicția de ecrane | rewrite, FAQ, reviewer |
| `/adulti/anxietate-depresie` | Hub | yes | WP Terapie individuală, Anxietate și atac de panică | rewrite, FAQ, reviewer |
| `/adulti/cuplu-familie` | Hub | yes | WP Terapia de familie și cuplu | rewrite, FAQ, reviewer |
| `/adulti/post-avc` | Hub | yes | WP Intervenția post-AVC (outcome testimonials: drop) | rewrite, FAQ, reviewer |
| `/adulti/psiho-oncologie` | Hub | yes | WP Intervenția psiho-oncologică + support group post | rewrite, support-group status |
| `/programe/sport` | Hub | yes | WP Psihologia sportivă (motorsport angle) | rewrite, reviewer |
| `/copii` `/adulti` `/metode` `/programe` | Index (HubCard list, no clinical copy) | yes | hub/method titles + one-liners | — (nav and middle breadcrumb targets) |
| `/metode/evaluare-qeeg` `/metode/neurofeedback` `/metode/tms` `/metode/aba` `/metode/logopedie` `/metode/psihoterapie` `/metode/hipnoza` | Method | yes | WP method pages (inventory rows "Method") | rewrite; "not suitable for" per method; TMS claims need medical sign-off |
| `/metode/eq-sync` | Method | yes | WP Conceptul EQ-SYNC (soften claims) | owner: page or link out to eq-sync.ro |
| `/echipa` | Team | yes | WP Echipa (6 names) | roles/credentials as to publish, photos, consent |
| `/contact` | Contact + intake | yes | live /contact NAP | legal entity, hours, inbox, primary phone |
| `/despre` | Prose | yes | WP Concept Psizone, positioning statement | approved "about" copy; current room list |
| `/despre/politica-editoriala` | Prose | yes | content-strategy "Editorial workflow" | clinical lead sign-off |
| `/legal/confidentialitate` `/legal/cookies` `/legal/termeni` | Prose | yes | none (WP had empty LearnPress terms) | **lawyer-reviewed text**, controller, DPO |
| 404, 500 | Error | yes | messages | — |
| `/echipa/<slug>` | Practitioner | later | WP team text | bios, photos |
| `/programe/brainboost` | Hub | later | WP Brain fitness + 2 posts (drop Hemi-Sync parts) | rewrite, owner: keep programme? |
| `/preturi` | Prose/table | later | none | owner: prices or ranges |
| `/despre/spatiul` | Gallery | later | Concept page rooms | real photos |
| `/blog/*`, `/ghid/*` | — | later | `blog-and-content.md` | — |

## 2. Templates (sections in order, components, content)

All pages: `Layout` = skip link, `NavBar` (Logo; links Copii · Adolescenți · Adulți · Metode · Echipa;
actions: `LanguageSwitch` as ghost + primary `Button` "Programează evaluarea"; `MobileMenu` under 768px holding the
links, `ThemeToggle` and language), `<main>`, `SiteFooter` (NAP, phones as `tel:`, legal links, editorial
policy, `ThemeToggle`, one discreet hemi-sync.ro link as content-strategy says; no other Hemi-Sync content,
imagery or products anywhere). Non-home pages add `Breadcrumbs`. One primary `Button` per view.

**Landing (`/`)**, max ~60 words visible above the fold:
1. Hero in `AmbientField` (medium): `display-xl` "Vezi schimbarea." · one sentence "Evaluăm, intervenim și îți
   arătăm progresul." · primary `Button` → `/contact` · `AskBar` (placeholder "Întreabă-ne orice despre copilul
   tău…", 2–4 suggestion `Chip`s, tone `ai`).
2. "Pentru cine": 10 `HubCard`s in groups Copii (4), Adolescenți (1), Adulți (4), Programe (1); hue 1/2/3
   rotated; eyebrow = audience; ≤3 method tags. Content: hub `title`, `oneLiner`, `methods` from hub entries.
3. "Cum lucrăm": three steps (evaluăm, intervenim, îți arătăm progresul) in `GlassCard solid` + `ProgressSignal`
   with caption "Ilustrativ, nu date reale". Source: WP "Plan personalizat de intervenție"; copy to write.
4. Methods: `Chip`s (tone accent) linking to the 8 method pages.
5. Team teaser: 3 `PractitionerCard`s (initials until photos) + ghost link to `/echipa`.
6. Closing band: "Prima discuție e despre voi, nu despre diagnostic." + primary `Button`.

**Hub** (10 pages): 1. hero (`h1` with "Galați", e.g. "Autism la copii, în Galați"; one sentence; primary
`Button`) · 2. "Când să ceri ajutor": 3–5 signs (`Prose`, short list) · 3. "Cum lucrăm": evaluation → plan →
measurement · 4. Methods used: small `HubCard`s → method pages · 5. Who works on it: `PractitionerCard`s
filtered by hub · 6. FAQ: `FaqList` 5–8 (FAQPage) · 7. compact `AskBar` ("Întreabă despre ADHD…") · 8. related
articles (`ArticleCard`, hidden until the blog exists) · 9. `ReviewNote` ("Revizuit clinic de … · data") · 10. CTA band.

**Method** (8): hero · what it is (`Prose`, ≤150 words) · how a session goes · how we measure · who it is for
and **who it is not suitable for** (editorial rule) · hubs where used (`HubCard`) · practitioners · FAQ ·
`ReviewNote` · CTA. EQ-SYNC page in Psizone theme, links out to eq-sync.ro; no binaural efficacy claims.

**Team**: hero (one line) · `PractitionerCard` grid (name, role "Psiholog clinician, psihoterapeut", ≤4
specialties, no action until profiles exist) · CTA.

**Contact** (`psizone-light` look is acceptable via user toggle only; no forced theme): hero "Programează
evaluarea" + reassurance line · `IntakeForm` on `GlassCard solid` · "Ce urmează" (3 steps: te sunăm, prima
discuție, evaluarea) · NAP card: address, `tel:` links, hours, map as a plain link (no embed, no third party),
company data (legal name, CUI, Reg. Com.).

**Prose** (despre, editorial policy, legal): hero (title only) · `Prose` · `ReviewNote` (legal: "Actualizat la").

## 3. Content source and the CMS seam

- **UI chrome strings** (nav, buttons, form labels, errors, SEO suffixes): Paraglide messages
  `apps/psizone-web/messages/{ro,en}.json` (`project.inlang/settings.json`), compiled to `src/paraglide/`.
  Locale passed per request (URL first segment). No bare strings in TSX.
- **Page content is data, not messages**: zod schemas in `src/content/schema/` (`hub.ts`, `method.ts`,
  `practitioner.ts`, `faq.ts`, `site-settings.ts` (NAP, hours, company data, guide suggestions),
  `prose-page.ts`, `review.ts`). Every clinical entry carries
  `review: { status: 'draft' | 'approved', author, reviewedBy: practitionerSlug, lastReviewed: ISO date }`
  (refinement: `approved` requires both). Field names follow `content-strategy.md`'s Payload collections
  (Hubs, Methods, FAQs, Practitioners) so the CMS maps 1:1.
- **One port**: `src/content/source/types.ts` defines `ContentSource` (`getHub(slug, locale)`, `listHubs`,
  `getMethod`, `listMethods`, `listPractitioners`, `getProsePage`, `getSiteSettings`). Today:
  `src/content/source/static.ts` reads typed modules `src/content/data/<locale>/<collection>/<slug>.ts`, each
  parsed through its schema at boot (bad content fails the build, not the visitor). Later: `source/cms.ts`
  implements the same port; templates never import data modules directly.
- **Review gate in code**: `SITE_ENV=production` excludes every `draft` entry from routes, nav, sitemap and
  cards (404). `SITE_ENV=staging` renders drafts with a `Notice` "Ciornă — nerevizuită clinic" and noindex.
  Builders write draft copy from the brand book voice and the old WP text; only a named psychologist flips
  `status` (commit by owner/clinician, later the CMS workflow).

## 4. Interactivity (Datastar)

Rule: everything works without JS; Datastar enhances. Attribute and SSE event names are written against the
v1.0.5 reference (data-star.dev) and verified in a browser test, not from memory.

- **Theme**: a ≤400-byte inline head script (CSP-hashed) sets `<html data-theme>` from `localStorage['pz-theme']`,
  default `psizone-dark` (brand: dark primary, not OS-driven). `ThemeToggle` is a `<button>` whose Datastar
  click expression swaps `psizone-dark`/`psizone-light`, writes localStorage and updates `aria-pressed`. Chosen
  over a cookie so HTML stays identical per URL and cacheable (no `Vary: Cookie`). Without JS: dark.
- **Language**: plain `<a href hreflang lang>` to the paired URL from the registry; hidden when no pair
  exists. No JS, no auto-redirect by `Accept-Language`.
- **Mobile menu**: `<details>`/`<summary>` baseline; Datastar adds close on Escape, on link click and on outside
  click, plus focus return. `aria-expanded` mirrors the signal.
- **AskBar (stub + seam)**: a `<form method="post" action="/ghid">` (no-JS: a results page; never GET, so the
  question never appears in a URL, access log, history or Referer) enhanced with `@post('/api/ghid')`. `src/guide/adapter.ts` defines `GuideAdapter.answer(question, locale)` →
  SSE patches of `GuideMessage` elements; `src/guide/stub.ts` answers with a fixed, reviewed message
  ("Ghidul Psizone vine curând"), up to 3 hubs matched by a keyword map, and the booking `Button`.
  `src/guide/crisis.ts`: fixed keyword list → fixed `Notice` with 112 and the clinic phone (reviewed copy, never
  generated). The question text is **never logged or stored** (route excluded from request-body logging).
  Flag `GUIDE_MODE=stub|off`. The real guide later replaces only the adapter.
- **Intake / booking request** (`/contact`, `POST /api/programare`):
  - Fields (logistics only, **no health data, no free text**): nume, telefon, email (one of phone/email required),
    pentru cine (`RadioGroup`: eu / copilul meu / alt membru al familiei), când te putem suna (dimineața /
    după-amiaza / seara), canal (telefon / email), consent `Checkbox` linking `/legal/confidentialitate`,
    honeypot field + min-time check. Hint under the form: "Nu scrie detalii medicale; discutăm la telefon."
  - One zod schema (`src/intake/schema.ts`) with Romanian error messages from Paraglide. With the
    `Datastar-Request` header: SSE stream patching `#intake-form` (field errors via `TextField error`, or a
    success `Notice` replacing the form) and a signal reset. Without it: full-page POST/redirect/GET to
    `/contact?trimis=1` or re-render with errors.
  - Delivery (`src/intake/deliver.ts`): the app calls **Plunk** directly (two transactional mails: clinic
    notification to the owner's chosen inbox, confirmation to the visitor). Nothing stored in the app, no
    database. n8n/Novu are not needed for MVP (n8n later for CRM/booking hand-off). In-memory rate limit per
    IP (5/hour). Failure → visible error with the phone numbers; never silent.
  - Secrets: Plunk key via a new sender `gitops/services/plunk/senders/psizone-web.json` (same shape as
    `n8n.json`, `consumer.openbao: secret/apps/psizone-web/plunk`), declared in `seb.app.yaml`'s `email` block
    (`sender, subdomain, address, name, openbao, wired, receive: false`) + `INTAKE_TO` address.

## 5. SEO

- **Metadata** (`src/seo/meta.ts`): `<title>` "{Pagină} în Galați | Psizone" for hubs, "{Pagină} | Psizone"
  otherwise; meta description from the entry (required by schema, ≤155 chars); canonical (no trailing slash);
  OG/Twitter with one static OG image per template; `lang` on `<html>`; one `h1`.
- **JSON-LD** (`src/seo/jsonld.ts`, typed builders): `MedicalClinic` (+`PostalAddress`, telephone,
  `openingHoursSpecification` when hours exist, `availableService`) on `/` and `/contact`; `MedicalWebPage`
  with `about` (`MedicalCondition` / `MedicalTherapy`), `reviewedBy` (`Person`), `lastReviewed`, `audience` on
  hubs and methods; `FAQPage` from `FaqList`; `BreadcrumbList` on every non-home page; `Person` per
  practitioner on `/echipa`. Validated in tests against required properties.
- **hreflang**: `ro`, `en`, `x-default` → ro, only for existing pairs; also in the sitemap as `xhtml:link`.
- **`/sitemap.xml`** generated from the registry (published entries only, `lastmod` = `lastReviewed`).
- **`/robots.txt`**: staging `Disallow: /` + `X-Robots-Tag: noindex` header on every response; production
  allows all and names the sitemap.
- **301s**: `src/middleware/redirects.ts` loads `src/content/redirects.csv` (copied from the audit's
  `pnpm run audit:redirects` output) into a Map at boot; runs before routing; also strips trailing slashes and
  lowercases. Hemi-Sync URLs go absolute to hemi-sync.ro. Test: every row → 301 → a 200 (no chains, no loops),
  and Search Console's top pages are covered (owner exports them). Until the audit lands, the table holds the
  preliminary inventory's obvious rows.

## 6. Performance, caching, images

- **Budget** (Lighthouse mobile, slow 4G, CI-asserted): LCP < 2.5 s, CLS < 0.1, INP < 200 ms; JS ≤ 15 KB gz
  (Datastar bundle + inline theme script, nothing else; no analytics, no pixels); CSS ≤ 25 KB gz (Tailwind 4
  build, `@source` scanning app + `@psi/ui`); HTML home ≤ 40 KB gz; ≤ 2 preloaded fonts.
- **LCP element is the headline text**: no hero photo at MVP; `AmbientField` is CSS-only (gradients + transform
  animation, `prefers-reduced-motion` stops it), never canvas.
- **Fonts**: self-hosted WOFF2 subsets (latin + latin-ext for ă â î ș ț): Fraunces variable (opsz, SOFT,
  300–420), Manrope variable, IBM Plex Mono 400/500; `font-display: swap`; preload Fraunces + Manrope.
- **Rendering**: per-request render with a boot-time warm cache: at startup the server renders every published
  (path, locale) into an in-memory Map; readiness passes only after warm-up. Content is immutable per image
  today; the CMS later invalidates entries via a publish webhook. Headers: HTML
  `public, max-age=300, stale-while-revalidate=86400` + ETag; `/assets/*` content-hashed,
  `max-age=31536000, immutable`; `/api/*` `no-store`. Brotli/gzip via middleware. (Static export at build was
  rejected: the server is needed anyway for forms and SSE, and one code path is simpler.)
- **Images** (when real photos arrive): build-time `sharp` to AVIF + WebP at 480/960/1440, `width`/`height` set,
  `loading="lazy"` except above the fold; warm grade per brand book. Initials fallback on `PractitionerCard`.
- **Security headers**: CSP `default-src 'self'`, script hash for the theme script; Datastar evaluates
  expressions (check whether v1.0.5 needs `'unsafe-eval'`; accept it only if so: there are no third-party
  scripts); HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal.

## 7. Deployment

- **`apps/psizone-web/Dockerfile`**: build context = repo root; `node:24-slim`; pnpm from the root
  `packageManager` via corepack (never latest); `pnpm install --frozen-lockfile`; build `@psi/design`,
  `@psi/ui`, then the app (`tsc` + Tailwind CLI + Paraglide compile); `pnpm deploy --prod` into the runner;
  non-root uid 1001; `PORT=3000`; `GET /healthz` (liveness) and `/readyz` (after warm cache).
- **`apps/psizone-web/seb.app.yaml`** (validate against `../seb/schema/app.schema.json`, shape as
  `../_RMX_READONLY/apps/wise-proconsult/seb.app.yaml`): `key: psizone-web`, namespace `psizone-web`, one
  component (`path: apps/psizone-web`, `gitops: gitops/services/psizone-web`, image `psi/psizone-web`,
  `build.workflow: psizone-web.yml`, port 3000, service port 80, host prefix per below with
  `exposure: public`, workload probes, requests 25m/128Mi, limits 500m/384Mi); `externalSecrets`: harbor-pull +
  `psizone-web-env`; `secrets`: `apps/psizone-web/plunk` (Plunk key, written by the sender wiring) and
  `apps/psizone-web/env` (`INTAKE_TO`), the only `assert-secrets` keys. `SITE_ENV`, `GUIDE_MODE` are plain env.
  **Two Deployments from one image**: `psizone-web` (`SITE_ENV=production`, public, gate off) and
  `psizone-web-preview` (`SITE_ENV=staging`, drafts, noindex, `gate: enforce`) so clinicians keep a gated draft
  preview after cutover.
- **`apps/psizone-web/authz.manifest.json`**: declares no protected resources (public site); shape per
  `../_RMX_READONLY/apps/vega-svc/authz.manifest.json`.
- **`gitops/services/psizone-web/`**: copy **psi's own** `gitops/services/changelog` conventions (image
  `WLREGISTRY/WLAPPS/psizone-web`, whitelabel component + generated `whitelabel-replacements.yaml`), not rmx's
  literal values. `base/`: `kustomization`, `deployment` (Kyverno: non-root, owner alert annotation, no
  `:latest`; `assert-secrets` initContainer for the required keys), `service`, `ingress` (traefik,
  cert-manager `letsencrypt-prod`, DNS-01), `resourcequota`, `harbor-pull-externalsecret`, `externalsecret`
  (per-key `data[]` for required keys + `dataFrom.extract`); `overlays/dev/`: image tag (CI-bumped),
  host patch, whitelabel replacements. Row added to `estate/APP-SECRETS.md` (the estate addendum).
- **Argo**: `gitops/apps/overlays/dev/psizone-web.yaml` (Application, label the overlay patch selects — today
  `platform.recomex.eu/source: git`, an rmx leftover to fix separately, not here) + resource line in
  `gitops/apps/overlays/dev/kustomization.yaml`.
- **CI**: psi has no `.github/` yet; `.github/workflows/psizone-web.yml` (build, push to Harbor
  `registry.psizone.ro/psi`, bump the overlay tag) follows SEB's app workflow template.
- **Hosts**: before cutover the production Deployment answers at **`nou`** (shape to verify: `PLATFORM.md`
  says dev hosts are `<svc>.dev.<apex>`, i.e. `nou.dev.psizone.ro`) behind the gate + noindex; the preview at
  **`ciorna`**, always gated. `ENVIRONMENTS: dev` only: there is no prod cluster.
- **Cutover (owner + SEB decision, not a flag flip)**: `DNS_APEX: foreign` means the estate never writes the
  apex. `DNS_APEX: estate` would put the estate's front door at the apex, so it is not the cutover. Recommended:
  keep `foreign`; the owner repoints `psizone.ro` and `www` in Cloudflare to the cluster ingress; the ingress
  adds those hosts (`www` → apex 301); MX and other owner records untouched; WordPress archived at
  `vechi.psizone.ro` (read-only, noindex) until the audit is closed. Checklist: TTL lowered 24 h before,
  redirects test green on staging, Search Console + Google Business Profile updated, la-psiholog.ro/romedic.ro NAP.

## 8. Build tasks (parallelisable)

Prereqs outside this app: **U** = `@psi/ui` (hono/jsx port of the 18 + additions in §0.2); **D1** = `@psi/design`
exports generated `tokens.css`; **D2** = `@psi/design` self-hosted fonts + `components.css` without the Google
`@import`. Every task: `pnpm affected` green, no `any`/casts, files ≤ 500 lines, strings via Paraglide.

| # | Task | Files | Depends on | Acceptance |
|---|---|---|---|---|
| T1 | Scaffold app | `apps/psizone-web/{package.json,project.json,tsconfig.json}`, `src/server.ts`, `src/env.ts` | — | `nx build/test/type-check/lint` targets exist; Hono serves `/healthz`; env parsed with zod, fails loud |
| T2 | i18n | `project.inlang/settings.json`, `messages/{ro,en}.json`, `src/i18n/locale.ts` | T1 | ro/en compile; locale from URL; missing en key falls back to ro in tests, never shows a key |
| T3 | Route registry | `src/routes/registry.ts`, `src/routes/registry.test.ts` | T1 | every route of §1 incl. the 4 index pages, ro/en path, template, MVP flag; test: unique paths, pairs resolve, every breadcrumb parent exists |
| T4 | Content schemas + port | `src/content/schema/*.ts`, `src/content/source/{types,static}.ts` | T1 | schemas parse; `approved` without reviewer fails; production source hides drafts (tested) |
| T5 | Content: site settings + hubs (draft) | `src/content/data/ro/{site-settings,hubs/*}.ts` | T4 | 10 hubs, brand voice, no banned words (test greps "revoluționar", "garantat", "cele mai avansate"), all `draft` |
| T6 | Content: methods, team, prose pages (draft) | `src/content/data/ro/{methods,practitioners,pages}/*.ts` | T4 | 8 methods each with `notSuitableFor`; 6 practitioners; legal pages marked placeholder |
| T7 | Styles | `src/styles/app.css`, Tailwind config | T1, D1, D2 | CSS ≤ 25 KB gz; tokens from `@psi/design`; no hex values |
| T8 | Layout + theme + nav | `src/templates/Layout.tsx`, `src/assets/theme-init.ts` | T2, T7, U(NavBar, MobileMenu, SiteFooter, ThemeToggle, LanguageSwitch, Logo, Button, Section) | no-JS works; theme persists; menu closes on Escape; axe clean |
| T9 | Landing | `src/templates/Home.tsx` | T5, T8, U(AmbientField, AskBar, Chip, HubCard, GlassCard, ProgressSignal, PractitionerCard, Button) | sections of §2 in order; one primary per view; LCP < 2.5 s |
| T10 | Hub + Method templates | `src/templates/{Hub,Method}.tsx` | T5, T6, T8, U(Breadcrumbs, FaqList, ReviewNote, HubCard, PractitionerCard, AskBar, Prose, Button, Notice, Chip) | all 18 + 4 index pages render in staging; drafts 404 in production |
| T11 | Team, Contact, Prose, errors | `src/templates/{Team,Contact,ProsePage,NotFound,ServerError}.tsx` | T6, T8, U(PractitionerCard, Prose, GlassCard, Notice) | NAP from settings only (one source); 404/500 localised |
| T12 | Intake | `src/intake/{schema,deliver,rate-limit}.ts`, `src/routes/api/intake.ts` | T11, U(TextField, RadioGroup, Checkbox, Notice) | SSE and no-JS paths tested; no health/free-text field; Plunk mocked in tests; failure shows phones |
| T13 | Guide stub + seam | `src/guide/{adapter,stub,crisis}.ts`, `src/routes/api/guide.ts`, `/ghid` page | T9, U(GuideMessage, Notice) | question never logged (test); crisis list → fixed notice; `GUIDE_MODE=off` hides AskBar |
| T14 | SEO | `src/seo/{meta,jsonld}.ts`, `src/routes/seo.ts` | T3, T4 | JSON-LD types of §5 validated; sitemap only published; robots/noindex per `SITE_ENV` |
| T15 | Redirects | `src/middleware/redirects.ts`, `src/content/redirects.csv` | T3; audit for the full table | 301 test over every row; trailing slash and case normalised |
| T16 | Cache, compression, headers | `src/middleware/{cache,security-headers}.ts` | T8 | warm cache before ready; headers as §6; CSP blocks third-party |
| T17 | Datastar syntax check | `e2e/datastar.spec.ts` (Playwright) | T8, T12, T13 | real browser: toggle, menu, form errors/success, AskBar patch all work on v1.0.5 |
| T18 | Perf CI | Lighthouse CI config | T9–T11 | budgets of §6 asserted on home, a hub, contact |
| T19 | Image + seb.app.yaml + authz | `Dockerfile`, `seb.app.yaml`, `authz.manifest.json` | T1 | image builds from root, runs non-root; YAML validates against SEB schema |
| T20 | GitOps + secrets | `gitops/services/psizone-web/**`, `gitops/apps/overlays/dev/{psizone-web.yaml,kustomization.yaml}`, `gitops/services/plunk/senders/psizone-web.json`, `estate/APP-SECRETS.md` | T19 | `kubectl kustomize overlays/dev` renders; two Deployments (production + preview); ExternalSecret per-key for Plunk key + `INTAKE_TO` only; stated before push (live change) |
| T21 | CI workflow | `.github/workflows/psizone-web.yml` | T19 | builds, pushes, bumps tag on `dev` |

## 9. Owner questions

1. **Address**: Gen. Alexandru Cernat 126 (live site) or Al. I. Cuza 72 (2024 press)? Opening hours?
2. **Legal entity name** (data controller for the privacy notice), DPO if any, and who drafts/approves legal
   texts (a lawyer recommended).
3. **Inbox for booking requests**: the Gmail address is a consumer account without a DPA; move to a
   `@psizone.ro` mailbox? Which phone is primary?
4. **Clinical reviewers**: which psychologist approves each hub and method? Without approvals nothing clinical
   goes live in production.
5. **Team**: which practitioners appear, with which credentials (CPR status), photos and written consent?
6. **Free text in the form**: keep it out (recommended, no health data) or allow a short message?
7. **AskBar before the guide exists**: show the honest stub (recommended) or hide it?
8. **Prices** on the site (`/preturi`) or ranges, and when?
9. **English at launch**: only home, contact, team and legal (recommended) or wait for hubs too?
10. **EQ-SYNC on Psizone**: a method page or only a link to eq-sync.ro? BrainBoost: keep the programme? Speech
    therapy and kinetoterapie (on the current homepage): who writes the logopedie hub; drop kinetoterapie?
11. **Staging host** `nou` acceptable? **Cutover**: repoint the apex yourself in Cloudflare (recommended) and
    when; and does the public site run on the dev cluster or wait for a prod environment (only `dev` exists)?
12. **Analytics**: none at launch (recommended: no cookie banner needed) or a cookieless tool later? The
    current Meta/TikTok pixels are not carried over.
13. **Logo**: the real file (the orb is a placeholder) before launch?
