# Plan: hemisync-web, the Hemi-Sync România site (hemi-sync.ro)

Status: plan, not built. App `apps/hemisync-web` (`@psi/hemisync-web`): Node 24 + Hono rendering typed TSX on
the server, Datastar v1.0.5 (`@starfederation/datastar-sdk` for SSE), Tailwind 4, Paraglide JS 3 (`ro` reference,
`en` second), components only from `@psi/ui` on `@psi/design` (`hemisync-light` "Dawn" default, `hemisync-dark`
"Night"). Content comes from typed modules now and from the CMS later (the planned `docs/plans/blog-and-content.md`,
not written yet).

Read on 2026-11-11:
- psi: `docs/brands/*`, the brand books `0-shared-foundations` and `3-hemi-sync`, `packages/design/index.d.ts`,
  the component guides, `tools/site-audit/audit/AUDIT.md`, `gitops/services/APP-SECRETS.md`
- the live www.hemi-sync.ro: the sitemap (522 URLs), home, /programe, /programe/gateway-voyage, /produse,
  /descarcari, /club, /intrebari-frecvente, /despre, /termeni-si-conditii
- psizone.ro through its WordPress and WooCommerce APIs
- rmx `apps/wise-proconsult` and its gitops; `../seb/schema/app.schema.json`

## 1. Findings that change the brief

1. **The live hemi-sync.ro is already a working shop.** It is a Next.js build with about 389 products
   (`/produse/<slug>`, 15 categories under `/categorie-produs/<slug>`). It has a cart (`/cos`), checkout
   (`/plata`), card payments through **EuPlătesc.ro**, and accounts (`/cont/*`) holding purchased meditations
   ("nelimitat în timp"). Programme deposits are set in EUR and charged in RON at the BNR rate, and free audio
   is served from `/api/gratuit/<slug>`. A site without accounts would strand existing customers, so the
   cutover splits paths (section 8) until phase 2 reaches parity.
2. **The operator is a different legal entity.** The footer and the T&C name *Nicoară Eniko Ritta Întreprindere
   Familială* (CUI 17297241, F30/151/2005), with Psih. Ritta Nicoară as trainer. `CONTEXT.md` describes the
   Galați team instead. The merchant of record, ANPC details, invoice issuer, data controller and DNS owner all
   depend on this (question 1).
3. **The "244 products" on psizone.ro are affiliate links, not stock.** All 244 are WooCommerce `external` items
   priced in USD; none can be bought there, and each links through ShareASale to hemi-sync.com. Their slugs do
   not match hemi-sync.ro (`/produse/baroque-garden` returns 404), so they need a mapping table. psizone also has
   medical categories (`cancer-support`, `blood-pressure`, `allergies`, `add-adhd`) that must not come back.
4. **There are no English URLs today.** The ro/en switch is client-side only and `/en` returns 404. hreflang
   needs a new `/en/…` scheme, and there are no old English URLs to redirect.
5. **`@psi/ui` does not exist yet, and `@psi/design` is typed for React** (`window.Psizone`). Every page waits on
   server-TSX ports (track U). Track U is a list of requirements, to reconcile with whichever plan owns `@psi/ui`.
6. **Some live copy states claims as fact.** Gateway calls Focus 21 "pragul către realități" and says states
   "devin portaluri"; the DEC page says its frequencies come from "exceptional healers" and that remote support
   helps healing. These are `CLAIM_PARANORMAL` / `CLAIM_EFFICACY`, to be rewritten as experience, never copied.

## 2. Decisions

- **Keep the live Romanian URL scheme at the root.** English goes under `/en/`, with translated top-level
  segments and shared item slugs (`/en/programmes/gateway-voyage`). Free exercises stay at `/descarcari` and
  gain `/descarcari/<slug>`. This amends AUDIT.md, which proposes `/exercitii/<slug>`.
- **One events model.** Residential programmes, Outreach workshops and online workshops are all
  `/programe/<slug>`, with a `kind` filter. Each type page shows its upcoming sessions and an "Ediții anterioare"
  archive, which absorbs psizone's dated past-event pages.
- **The MVP sells nothing itself.** It is a catalogue, and its buy buttons hand off to the legacy cart or to
  hemi-sync.com (section 6).
- **The language switch is a plain link**, with no `Accept-Language` redirect. **Dawn is always the default
  theme**; Night is opt-in.
- **Articles stay hosted at `hemi-sync.ro/articole/<slug>`** for the brand's search value. The shared blog
  becomes their *source*, not their host. This departs from "link to the shared blog" (question 14).
- **New app endpoints never live under `/api/*`.** That prefix stays with the legacy app until phase 2. Forms
  post to `/forms/<kind>`; audio is served at `/audio/<slug>`.
- **Phases:**
  - **P1 (MVP):** the public site, forms, free exercises, the catalogue; staging, then cutover behind the edge
    proxy.
  - **P2:** accounts through estate SSO, cart and checkout, invoicing, gated AudioTracks, migrating the existing
    purchases.
  - **P3:** CMS, full English, the AI guide (with a separate Hemi-Sync index), slug cleanup.

## 3. Sitemap

| Path (RO) | EN | Phase | Source to absorb |
| --- | --- | --- | --- |
| `/` | `/en/` | P1 | hemi-sync.ro home |
| `/programe` (calendar, catalogue, filters) | `/en/programmes` | P1 | hemi-sync.ro /programe |
| `/programe/<slug>`: 12 programmes plus the workshop types below | `/en/programmes/<slug>` | P1 | hemi-sync.ro programme pages; psizone workshop pages and posts |
| `/programe/arhiva` (past sessions by year) | `/en/programmes/archive` | P3 | session data |
| `/descarcari`, `/descarcari/<slug>` | `/en/free-exercises/…` | P1 | hemi-sync.ro /descarcari (6 exercises, brochures) |
| `/produse`, `/produse/<slug>`, `/categorie-produs/<slug>` | `/en/products/…` | P1 catalogue, P2 cart | hemi-sync.ro catalogue plus the 244 psizone affiliate items |
| `/tehnologia`, `/nivelurile-focus` | `/en/technology`, `/en/focus-levels` | P1 | hemi-sync.ro; the Focus sections on Gateway |
| `/club` (Clubul Delfinului) | `/en/dolphin-energy-club` | P1 | hemi-sync.ro /club, rewritten |
| `/despre`, `/despre/<person>` (9) | `/en/about/…` | P1 | hemi-sync.ro |
| `/institutul-monroe`, `/robert-monroe` | `/en/…` | P1 | hemi-sync.ro; psizone `despre-institutul-monroe` |
| `/media`, `/media/<slug>` (64 videos) | `/en/media/…` | P1 | hemi-sync.ro (YouTube) |
| `/articole`, `/articole/<slug>` (16) | `/en/articles/…` | P1 | hemi-sync.ro; Hemi-Sync posts from psizone |
| `/recomandari`, `/feedback` | `/en/…` | P1 | hemi-sync.ro; the Hemi-Sync quotes on psizone `marturii` |
| `/intrebari-frecvente` | `/en/faq` | P1 | hemi-sync.ro (46 questions, 7 groups) |
| `/contact` | `/en/contact` | P1 | hemi-sync.ro |
| `/termeni-si-conditii`, `/politica-de-confidentialitate`, `/despre-cookie-uri` | `/en/legal/…` | P1 | hemi-sync.ro, after legal review |
| `/marci-si-licente` (new: Monroe® and Hemi-Sync® notices) | `/en/legal/trademarks` | P1 | footer and T&C wording |
| `/cont/*`, `/cos`, `/plata/*` | none | P2 (legacy app until then) | the current app |

**Workshop types from psizone**, each becoming `/programe/<slug>` with its archive:
- Explorarea Conștiinței / Excursion (`workshop-excursie`, `workshop-explorarea-constiintei` and the dated
  Galați, Iași and Constanța editions)
- Excursie Avansată
- Creative Life
- Deep Connection (fix the "Conection" typo)
- Optimise Your Life (duplicate dated pages)
- Out of Body
- online workshops and webinars (`workshop-uri-online`, `webinar-online`, `webinar-calea-hemi-sync`)

`/outreach-excursion-workshop` gets a 301 to its `/programe/<slug>`. The teen workshop stays with Psizone.

## 4. Pages: sections, components, content, gaps

**Components to port from `@psi/design`:** Logo, AmbientField, Button, GlassCard, Chip, StatusBadge, TextField,
HubCard, NavBar, PractitionerCard, ArticleCard, Prose, AudioPlayer, ProductCard.

**New in `@psi/ui`** (each also gets a guide in `@psi/design`): SiteFooter, LangSwitch, ThemeToggle, MobileNav,
Accordion, Picture, SessionRow (dates, place, price, places left, status), Select, Textarea, Checkbox,
FormStatus, Breadcrumbs, VideoFacade, FocusLadder.

**Changes to existing components:**
- NavBar: a `utilities` slot. It allows 4–6 links and two actions, and the live site has 10 links.
- ProductCard: `href` and `external` props, with `rel="sponsored"` on external links.
- AudioPlayer: a real `<audio>` element, plus download and transcript links.

**Navigation:**
- Top: Programe · Exerciții gratuite · Produse · Clubul Delfinului · Despre · Articole.
- Footer and mobile menu: Media, Tehnologia, Nivelurile Focus, FAQ, Contact.

| Page | Sections in order | @psi/ui | Missing content: owner questions |
| --- | --- | --- | --- |
| Home | Hero (dawn photo, "Călătoria ta spre interior *începe aici.*", "Descoperă programele"); upcoming programmes; free exercises (before any product); technology; Focus levels; experiences; "O metodă, nu o credință"; Robert Monroe; final call to action; newsletter | AmbientField over Picture, Button, HubCard ×3, AudioPlayer ×2, GlassCard, FocusLadder, TextField, Checkbox, FormStatus | Consent for the named testimonials; rights to the hero photo |
| Programme catalogue | Hero; filters (kind, level, month); "Sesiuni programate"; all programmes; "Nu știi de unde să începi?"; newsletter | Chip, SessionRow, HubCard, StatusBadge, Button | Order of programmes; prerequisites |
| Programme or workshop page | Hero (name with ®, level); what you explore; how it runs; Focus levels; location; facilitator; details and what is included; dates and registration form; "Ediții anterioare"; related programmes; FAQ excerpt; brochure | Picture, GlassCard, FocusLadder, PractitionerCard, SessionRow, Select, TextField, Textarea, Checkbox, Accordion, HubCard | Starlines dates and prices; cancellation terms for each programme; brochure PDFs; which workshop types still run; past editions (date, city) |
| Free exercises | "Începe să asculți, gratuit."; how to listen (headphones); the exercises; translated texts; apps; brochures; "Vrei mai mult?" leading to programmes, then products | AudioPlayer ×6, Accordion, Button, GlassCard | Written permission to stream and download each title; durations for exercises 1–3; whether "Lumina vindecătoare" is free or paid |
| Products and product page | Search; categories; grid with "Arată mai multe"; product: media, title with ®, description, format and language, price in RON or "La Hemi-Sync®", related products | ProductCard, Chip, TextField, Picture, Breadcrumbs, Button | Which titles are sold directly and at what RON prices; affiliate ID; descriptions for the 244 English-only titles |
| Focus levels and technology | Named states with no hierarchy (as FAQ 9 says); ladder 10/12/15/21, then 23–27; which programme reaches each level. Binaural demo (100 Hz / 104 Hz → 4 Hz); "not therapy" | FocusLadder, Prose, HubCard, AudioPlayer, GlassCard | Approved wording for Focus 21 and above; citations for "brain mapping", or remove it |
| Clubul Delfinului | What DEC is; how a request runs; who can ask; membership (120 RON a year) and its conditions; the complementary-care disclaimer at the top; write to the coordinator | Prose, GlassCard, Button, form fields | Approval of the rewritten claims; whether membership is paid online |
| About, people, Monroe, Robert Monroe | "O metodă a experienței directe"; team; invited trainers; principles; legal entity block; lineage | PractitionerCard, Prose, GlassCard, Picture | Whether to publish the US trainers' phone numbers; the lead trainer (Ritta Nicoară or Adrian Turcu); image rights |
| Media, recommendations, feedback | Series filter; video grid; detail pages; consent before any embed loads; recommendations list; feedback form | VideoFacade, Chip, ArticleCard, form fields | How to frame the remote-viewing and UFO interviews |
| Articles | Index; article page in the `blog-light` reading theme | ArticleCard, Prose | Question 14 |
| FAQ | 7 groups and 46 questions; the safety group shown open | Accordion, Prose | Notes on epilepsy, driving and headphone volume (missing today) |
| Contact and legal | Form; email and phones; venue (Plaiul Foii); T&C, privacy, cookies, trademarks; ANPC and SAL badges | TextField, Textarea, Checkbox, FormStatus, Prose, SiteFooter | Postal address; receiving inbox; a lawyer's review of the entity change |

## 5. Interactivity (Datastar)

**Rules for every interactive part:**
- Every link and form works without JavaScript.
- Datastar is served from `/static/datastar-1.0.5.js`, never a CDN.
- Server responses go through the SDK (`ServerSentEventGenerator`, `patchElements`, `patchSignals`).

| Feature | How it works |
| --- | --- |
| AudioPlayer | Native `<audio preload="none">`; **never autoplay**. A page signal `playing` holds the current player's id, and play pauses every other player. `timeupdate` sets the `progress` signal, which lights the played part of the waveform in glow-1; the waveform stays still under reduced motion. Each player carries a headphones note in `meta` and a transcript link. Files come from `/audio/<slug>` with Range support (object storage behind it). No-JS fallback: `controls`. |
| Language switch | An `<a>` to the counterpart URL, taken from the server-side route table (`src/i18n/routes.ts`) that also emits hreflang. A `lang` cookie only triggers a "Read in English?" banner on `/`; it never redirects. |
| Theme toggle | A button flips `data-theme` on `<html>` between `hemisync-light` and `hemisync-dark` and writes a `theme` cookie. The server renders from the cookie, so nothing flashes. `color-scheme` follows the theme. |
| Mobile nav | The `menuOpen` signal opens a native `<dialog>` with `showModal()`, which handles focus and Escape; the button carries `aria-expanded`. No-JS fallback: the button is an anchor to the footer site map. |
| Forms: newsletter, registration, contact, DEC request, feedback | Datastar `@post('/forms/<kind>')`. Hono parses the body with a zod schema shared by every kind (`src/forms/schemas.ts`). Errors come back as an SSE patch of the fields ("Eroare: …" in TextField `error`). Success replaces the form with a FormStatus fragment. No-JS fallback: a normal POST, then redirect-after-POST to a result page. Every form has a honeypot, a minimum fill time and a rate limit per client IP, read from a header the edge sets. Downstream, an HMAC-signed n8n webhook (`flows.psizone.ro`) emails the organiser and confirms to the person; the newsletter goes to the estate's Plunk with double opt-in and a stored consent record. Registration requires a session, 18+ for residential programmes, and agreeing to the T&C and privacy policy. The reply says "a request, not a booking", as the current T&C does. |
| Catalogue | Filters and "Arată mai multe" are crawlable links with query strings. Datastar enhances them by patching the grid from `?fragment=1`. Search is the same route, with a debounce. |
| Media | VideoFacade shows a poster first; clicking it loads the youtube-nocookie iframe. Nothing loads from YouTube before that click. |

## 6. Commerce and catalogue

**The catalogue (P1)** is built on one zod `Product` schema:
- `slug`; `title` (® as licensed)
- `kind`: `own-digital` | `external` | `book`
- `categories[]`, `lang`, `durationSec`
- `priceRon` for own items; `externalUrl` and `externalPriceUsd` for external ones
- `image`, and a `description` in ro and en

An importer builds it from the hemi-sync.ro crawl (site-audit `crawl:hemisync`) and the psizone export
(`export:psizone`). It dedupes by normalised title, then by hemi-sync.com target, and writes
`content/data/products.json` plus `product-map.csv` (psizone slug → hemi-sync.ro slug, used for the redirects).

**What the catalogue shows:**
- External items: "Cumpără de la Hemi-Sync® (hemi-sync.com)", an affiliate disclosure, `rel="sponsored"`.
- Medical psizone categories are dropped.
- Prices never appear before the free exercises.
- Own digital items: full pages here. Their buy action goes to the legacy cart, served by the current app
  through the path-split, until P2. If the legacy app cannot stay up, the button becomes "Cere acest titlu"
  (an enquiry).
- Trade-off: no payment code in the MVP and no regression for existing buyers, at the cost of depending on the
  legacy app for a few months.

**P2: full shop:**
- **Sign-in:** the estate's sign-in, OIDC to `login.psizone.ro`. Permissions are declared through Polaris in
  `authz.manifest.json`.
- **Data:** orders, entitlements and registrations in Postgres (CNPG), with users, orders and purchased titles
  imported from the current app (question 2).
- **Payments, recommended:** keep **EuPlătesc.ro**. It is the incumbent, already holds the merchant contract,
  works in RON and handles EUR deposits at the BNR rate.
  - Netopia mobilPay is the local alternative.
  - Stripe accepts RON and has the best API, but needs a new merchant account. Choose it only if the merchant
    entity changes anyway.
- **Invoices:** one for every payment, through an invoicing API (SmartBill or Oblio) that also uploads to RO
  e-Factura. The accountant must confirm whether B2C e-Factura applies to the Î.F.
- **Withdrawal:** digital content needs express consent to the loss of the withdrawal right (the checkbox the
  current T&C already describes). Programme cancellation follows each programme's terms.

**Gated audio (P2, after a licence).** An `AudioTracks` collection: slug, Monroe catalogue number, licence
reference, and an entitlement rule (`free-with-account` | `purchased` | `participant-of:<programme>`). Files live
in private object storage and are served through short-lived signed URLs. The 26 psizone audio pages hold Monroe
titles uploaded as public MP3s (Metamusic, `MA111DL_Spiral_of_Light`, `Partners_Meditation` and others). They
are **not republished** until Monroe or Interstate confirms the licence in writing. Until then they return 410,
or redirect to `/descarcari` where an equivalent free exercise exists.

## 7. SEO, i18n and performance

**Redirects inside hemi-sync.ro.** Paths are kept. The only 301s are `/outreach-excursion-workshop`, the
duplicate SyncCreation entries (merged into one page with two sessions), and, in P3, the truncated
`hs-calatoria-…` product slugs. `/api/gratuit/<slug>` gets a 301 to `/audio/<slug>` when the legacy app retires.
The app serves them from `src/seo/redirects.ts`.

**psizone.ro → hemi-sync.ro.** The psizone.ro apex is the owner's WordPress, which the estate never touches, so
these 301s are served by whatever serves psizone.ro: the WordPress Redirection plugin (CSV import) at launch,
the Psizone app later.
- Source: `audit/redirects.csv` (from `audit:redirects`), filtered to `target_brand=hemisync` with absolute
  targets, plus `product-map.csv` for `/product/<slug>/` and `/product-category/<slug>/`.
- Blocker: the audit has not run yet; no `audit/` data exists.
- Workshop pages → `/programe/<slug>`.
- Dated posts → `#editii-anterioare` on that page.
- `produse-hemi-sync` and `shop` → `/produse`.
- Posts → `/articole/<slug>`.
- `despre-institutul-monroe` → `/institutul-monroe`.
- Audio pages → 410, or `/descarcari`.

**i18n:**
- Paraglide holds the interface strings (`messages/ro.json` is the reference, then `en.json`). Content modules
  carry `Localized<T>`.
- A missing English translation means there is **no** English page and no hreflang alternate for it.
- Every page has hreflang `ro`, `en` (when it exists) and `x-default` → ro, plus a self-canonical on
  `PUBLIC_ORIGIN=https://www.hemi-sync.ro`.
- The apex hemi-sync.ro redirects to www.

**Production or staging.** Behind the Worker the app sees `Host: hemisync.psizone.ro`, so the host header
cannot tell production from staging. The Worker sends `X-Public-Host` and `X-Client-IP`, signed with a shared
secret (`EDGE_SECRET`). The app treats a request as production only when that signature is valid. Every other
request gets `X-Robots-Tag: noindex` and a disallow-all robots.txt.

**Structured data:** Organization; Event for each session (dates, Plaiul Foii, offer in EUR, availability);
Product with an Offer for own items only; FAQPage; BreadcrumbList; VideoObject; Person for trainers. The sitemap
is generated per locale. Every page has a unique meta description.

**Budgets**, checked in CI by a Lighthouse run against staging:

| Metric | Budget |
| --- | --- |
| LCP | ≤ 2.5 s p75 on mobile (2.0 s in the lab) |
| CLS | < 0.05 |
| INP | < 200 ms |
| JavaScript | ≤ 25 KB gz |
| CSS | ≤ 40 KB gz |
| HTML | ≤ 60 KB gz |
| Hero image | ≤ 150 KB AVIF at 828w |

**Photography.** Originals (≤ 30 at launch, ≤ 4000 px) live in `content/photos/`. `scripts/images.ts` (sharp)
writes AVIF, WebP and JPEG at 480, 828, 1200, 1600 and 2400 px with hashed names. `Picture` sets `sizes`,
width and height, and lazy-loads below the fold; the hero gets `fetchpriority="high"` and a preload with
`imagesrcset`. Alt text is required by the schema; `""` marks a decorative image. Assets are cached immutable
for a year; HTML gets `s-maxage=300` with stale-while-revalidate.

**Fonts.** Self-hosted Fraunces and Inter, latin-ext woff2, with at most 2 preloads. `@psi/ui` must override
`components.css`, which loads them from Google Fonts (a GDPR exposure).

## 8. Deployment

**The constraint.** In `app.schema.json`, `hosts[].prefix` (`^(@|[a-z0-9][a-z0-9.-]*)$`) is a label under the
estate's one zone. psi's hosts are `<prefix>.WLDOMAIN`, answered by `*.psizone.ro`. hemi-sync.ro cannot be
declared.

| Option | What | Pros | Cons |
| --- | --- | --- | --- |
| A. SEB adds extra zones | Identity `EXTRA_ZONES`, `hosts[].zone`, a DNS-01 solver per zone, collision checks per zone in dns-plan | The durable fix; declarative; parity holds | A platform change (SEB release, then `platform.lock` bump); needs the hemi-sync.ro zone on Cloudflare with a scoped token |
| **B. Edge Worker (launch)** | A Cloudflare Worker on `www.hemi-sync.ro` proxies to `hemisync.psizone.ro` and adds the signed `X-Public-Host` and `X-Client-IP` headers | No platform change; also does the **legacy path-split**; rollback is a route change | An extra hop; Worker quotas; the zone must be on Cloudflare |
| C. Hand-written Ingress | A raw Ingress with an HTTP-01 certificate | Fast | Cannot be declared in `seb.app.yaml`, so parity drifts. **Rejected.** |

**Decision:** B at launch. File A in SEB now and switch to it once released.

**Legacy path-split (B, until P2).** These paths go to the current app:
- `/cont/*`, `/cos`, `/plata/*`
- `/api/*`, including `/api/gratuit/*` and the EuPlătesc return and notification URLs (confirm the exact paths
  with question 2)
- `/_next/*` and the legacy public assets its pages load (`/brand/*`, `/cinematic/*`; list them from the legacy
  build)

Everything else goes to hemisync-web.

**Staging.** `hemisync.psizone.ro`. The label `hemisync` collides with none of the owner's records. Exposure is
public with `gate: off`; it is noindex by the rule above. PR previews come through `previews.yaml`.

**Files:**
- `apps/hemisync-web/Dockerfile`: `node:24-slim`; pnpm through corepack from the root `packageManager`; build
  context is the repo root; `pnpm --filter @psi/hemisync-web... build`, then `pnpm deploy --prod` into the
  runner; uid 1001; port 3000; `/healthz`.
- `apps/hemisync-web/seb.app.yaml`, validated against the schema:
  - `key: hemisync-web`; namespace `hemisync-web`; image `psi/hemisync-web`
  - host `{prefix: hemisync, exposure: public, ingress: hemisync-web, gate: off}`
  - probes on `/healthz`; requests 25m / 128Mi, limits 500m / 384Mi
  - the secret `apps/hemisync-web/env` with `N8N_FORMS_WEBHOOK_URL`, `N8N_FORMS_HMAC`, `PLUNK_API_KEY`,
    `EDGE_SECRET`
  - the shared `platform/harbor/pull`
- `apps/hemisync-web/authz.manifest.json`: public routes only in P1.
- `gitops/services/hemisync-web/base/`: kustomization; deployment (non-root, owner alert annotation,
  `assert-secrets` initContainer for the four keys, Reloader on the app secret); service; ingress; resourcequota
  (LimitRange plus quota); harbor-pull and app ExternalSecrets. Images follow psi's `WLREGISTRY/WLAPPS` pattern
  (as `gitops/services/changelog`), not rmx's hard-coded Harbor host.
- `gitops/services/hemisync-web/overlays/dev/kustomization.yaml`: the whitelabel component; `images:` with the
  CI tag; host `hemisync.WLDOMAIN` set through replacements.
- `gitops/apps/overlays/dev/hemisync-web.yaml` (Argo Application, git-sourced label), added to that overlay's
  `kustomization.yaml` and to `previews.yaml`.
- A new row in `gitops/services/APP-SECRETS.md`.
- A CI workflow that builds into `registry.psizone.ro/psi/hemisync-web` and bumps the overlay tag.

## 9. Build tasks (for parallel builders)

**How to read this table:**
- Each task is one PR.
- "Done" always also means: type-check, lint, scoped tests (≤ 4 workers) and build are green; no `any` or `!`;
  no bare strings in JSX; files ≤ 500 lines.
- App tasks listing U-ids wait for those components. Until then they use the U0 stub, never an app-local copy.

| ID | Task | Files | Depends on | Done when |
| --- | --- | --- | --- | --- |
| U0 | `@psi/ui` skeleton: server-TSX runtime, theme attribute, tokens CSS, self-hosted fonts | `packages/ui/` | none | Builds; a page renders both Hemi-Sync themes |
| U1 | Port Button, GlassCard, Chip, StatusBadge, Logo, AmbientField (mist, reduced motion) | `packages/ui/src/*` | U0 | Snapshot and axe tests pass; focus ring ≥ 3:1 in both themes |
| U2 | NavBar with `utilities`; MobileNav, SiteFooter, LangSwitch, ThemeToggle | `packages/ui/src/nav/*`, guides in `packages/design/component-guides/` | U1 | Works without JS; `<dialog>` handles Escape and focus |
| U3 | TextField; Select, Textarea, Checkbox, FormStatus | `packages/ui/src/form/*` | U1 | Labels always visible; "Eroare:" errors use `aria-describedby` |
| U4 | HubCard, ProductCard (`href`, `external`), PractitionerCard, ArticleCard, Prose; SessionRow, Breadcrumbs, Accordion | `packages/ui/src/cards/*` | U1 | ® kept exactly; Accordion uses `<details>` |
| U5 | AudioPlayer (native audio, signal hooks); Picture, VideoFacade, FocusLadder | `packages/ui/src/media/*` | U1 | No autoplay; `preload=none`; still under reduced motion |
| A1 | App skeleton: Hono, layout, `/healthz`, static assets, self-hosted Datastar 1.0.5, Tailwind 4, Nx targets | `apps/hemisync-web/{package.json,project.json,tsconfig.json,src/server.ts,src/layout/*}` | U0 | `nx run @psi/hemisync-web:build` passes; `/healthz` returns 200 |
| A2 | i18n: Paraglide, `ro.json` and `en.json`, route table with localized segments, hreflang helper | `messages/*`, `src/i18n/*` | A1 | Every route maps both ways; unit tests |
| A3 | Theme cookie, shell, nav and footer wired to the route table | `src/layout/shell.tsx` | A2, U2 | No theme flash; Lighthouse accessibility ≥ 95 |
| A4 | Edge trust: verify `X-Public-Host` and `X-Client-IP` signatures; production/staging switch | `src/edge/trust.ts` | A1 | Unsigned requests are noindex; tests cover a forged header |
| C1 | zod schemas: Programme, Session, Exercise, Product, Category, Person, Faq, MediaItem, Article, FocusLevel, Page (`Localized<T>`) | `src/content/schema/*.ts` | A1 | Invalid content fails the build |
| C2 | Importer: hemi-sync.ro crawl plus psizone export → products, categories, media (64), articles (16), people (9); `product-map.csv` | `scripts/import/*.ts` | C1, site-audit `crawl:hemisync` and `export:psizone` | 244 mapped or listed as unmatched; no medical categories; every sitemap URL has content |
| C3 | Programmes, sessions and workshops; past editions merged; claims rewritten | `content/programmes/*.ts` | C1, question 9 | No `CLAIM_*` wording; ® on first use |
| C4 | Exercises, FAQ, Focus levels, DEC, about, legal, recommendations (RO) | `content/*.ts` | C1 | Owner sign-off on the DEC and Focus wording |
| P1 | Home | `src/pages/home.tsx` | A3, C3, C4, U4, U5 | Exercises before products; one `display-xl`; LCP budget met on staging |
| P2 | Programme catalogue; programme and workshop pages with archive | `src/pages/programmes/*` | A3, C3, U3, U4 | Filters are links; Event JSON-LD validates |
| P3 | Free exercises page and `/audio/<slug>` route | `src/pages/exercises.tsx`, `src/routes/audio.ts` | A3, C4, U5 | Range returns 206; one player at a time; works without JS |
| P4 | Products: list, category, detail, search fragment | `src/pages/products/*` | A3, C2, U4 | `rel=sponsored` on external links; crawlable paging |
| P5 | Technology, Focus levels, Club, About and people, Monroe, Robert Monroe, recommendations, feedback | `src/pages/*` | A3, C2, C4, U4 | Parity with the live pages, claims rewritten |
| P6 | Media index and 64 detail pages; article index and pages (`blog-light`) | `src/pages/{media,articles}/*` | A3, C2, U4, U5 | No YouTube request before the click |
| P7 | FAQ, contact, legal, trademarks | `src/pages/*` | A3, C4, U3, U4 | FAQPage JSON-LD validates; ANPC and SAL in the footer |
| F1 | Forms: zod schemas, `/forms/<kind>` SSE handlers, redirect-after-POST fallback, honeypot, rate limit, n8n and Plunk clients | `src/forms/*` | A4, U3 | Errors patch over SSE; tests cover invalid input |
| S1 | Redirects module, sitemaps, robots, canonicals, JSON-LD helpers | `src/seo/*` | A2, A4, C2 | Scripted check: every URL in the live sitemap returns 200 or 301 |
| S2 | psizone.ro redirect CSV for the WordPress Redirection plugin | `apps/hemisync-web/redirects/psizone.csv` | C2, the site audit | Every Hemi-Sync row of the audit is covered |
| S3 | Image pipeline and Lighthouse budget in CI | `scripts/images.ts`, CI step | A1 | Section 7 budgets are enforced |
| D1 | Dockerfile, `seb.app.yaml`, `authz.manifest.json` | `apps/hemisync-web/*` | A1 | Image builds from the repo root; manifest validates against the schema |
| D2 | Gitops base and dev overlay, Argo Application, previews, `APP-SECRETS.md` row, CI workflow | `gitops/services/hemisync-web/*`, `gitops/apps/overlays/dev/*` | D1 | `kustomize build` passes; host is `hemisync.psizone.ro` |
| D3 | Edge Worker: proxy, signed headers, legacy path-split (written, not deployed) | `apps/hemisync-web/edge/worker.ts` | D2, A4, questions 2 and 3 | Tested against staging and a legacy stub; rollback documented |
| D4 | SEB issue: extra zones (option A) | an issue in the SEB repository | none | Filed with a schema proposal |

**Order:**
1. In parallel: U0–U5, A1, A2 and A4, C1 and C2, then D1 and D2.
2. Then: the P tasks, F1, S1–S3.
3. Last: D3 and the cutover. The cutover is a live change, announced before it is pushed.

## 10. Open questions for the owner

1. **Entity.** Is Nicoară Eniko Ritta Î.F. the operator, merchant of record, invoice issuer and data controller,
   or does a Psizone company take over? Who is the lead trainer?
2. **Current app.** Who hosts the Next.js site, and can we have its source and a data export (users, orders,
   entitlements, registrations, the newsletter list with consents)? Can it keep serving the legacy paths behind
   the Worker until P2? What are the EuPlătesc callback URLs?
3. **DNS.** Who holds hemi-sync.ro, and is its zone on Cloudflare? This decides option B now and A later.
4. **Licensing.** The authoritative trademark list and how ® is written (Gateway Experience™ or ®, Focus™,
   Explorare 27 or Exploration 27®, Explorarea Conștiinței®). Written permission to stream and download the free
   exercises. The status of the 26 Monroe MP3s on psizone.ro.
5. **Affiliate.** Which account: ShareASale (psizone's) or direct hemi-sync.com links? Under whose name?
6. **Own products.** Exactly which titles are sold directly, at what RON prices, and where are the files?
7. **Payments and invoicing.** Keep EuPlătesc? Which invoicing tool is used today? The accountant confirms the
   B2C e-Factura duty.
8. **Programmes.** Starlines dates and prices; cancellation and refund terms for each programme; instalments.
9. **Workshops.** Which psizone workshop types still run? The past editions (date, city) for the archive; photo
   consent from participants.
10. **Consent.** Written consent for named testimonials and for the people pages (including the US trainers'
    phone numbers).
11. **Claims.** Approval of the rewritten Club and Focus 21+ wording (experience, not fact).
12. **English.** Who translates, and which pages are in English at launch (recommended: home, programmes,
    exercises, FAQ, contact)?
13. **Photography.** Originals and usage rights for the hero and programme images.
14. **Articles.** Hosted on hemi-sync.ro with the blog as their source (recommended), or moved to the shared
    blog's host?
15. **Analytics.** None was detected. Use a cookieless self-hosted option (Plausible or Umami, so no consent
    banner), or none?
