# EQ-SYNC web (eq-sync.ro): build plan

Status: plan, 2026-11-11. App `apps/eqsync-web` (`@psi/eqsync-web`). The stack is fixed and not up for debate here: Node 24, Hono rendering typed TSX on the server, Datastar v1.0.5 (`@starfederation/datastar-sdk`), Tailwind 4, Paraglide JS 3 (ro reference, en second), and components only from `@psi/ui` on `@psi/design` (`eqsync-dark` "Night" primary, `eqsync-light` "Day"). There is no React.
Sources: the brand books (`0-shared-foundations.md`, `2-eq-sync.md`), the component guides, `tools/site-audit/audit/AUDIT.md`, the live site (fetched read-only on 2026-11-11: `/`, `/biblioteca`, `/inregistrare`, `/termeni`, `/confidentialitate`, `/retragere`, `/anulare-abonament`, `/sedinte-online`, `/blog/`), SEB at `57bbddc` and rmx at `6ac76dc4e`.
Where the docs disagree, CLAUDE.md wins. It supersedes the Payload/React/Next.js wording still in `docs/brands/CONTEXT.md` and `packages/design/README.md`.
Sibling plans: `@psi/ui` APIs and task IDs come from `docs/plans/design-system.md` (§4, §5, §9); the CMS is in `docs/plans/blog-and-content.md`; and the cross-zone options match `docs/plans/hemisync-web.md` §deployment.

## 0. What the live site already is (this sets the parity bar)

- One long home page with anchors (`#metoda`, `#adrian`, `#testimoniale`, `#faq`), plus `/biblioteca` (40 protocols), `/cos`, `/autentificare`, `/inregistrare`, `/contact`, `/sedinte-online`, `/blog/` (2 posts with `demo-` slugs) and seven legal pages.
- Accounts use a password. The backend is Supabase (EU) for both the database and auth, per `/confidentialitate`. Emails go out through Zoho Mail. Payments are Stripe card subscriptions; the privacy page says "activ odată cu lansarea abonamentelor". The hosting line on that page still reads "[furnizor VPS/server, de completat]".
- Commercial model:
  - The free programme gives 4 guided exercises for 21 days, counted from email confirmation. The bonus "Relaxare profundă" unlocks on day 20 and stays permanently. After day 21 the 4 exercises disappear, and one reminder email goes out before the end.
  - Protocols cost 24,99 lei per protocol per month and renew automatically. Each protocol holds one subscription slot and can be swapped month to month. Volume discounts are -10% at 3, -15% at 6, -20% at 12, -25% at 18 and -30% at 26.
  - There is a 14-day withdrawal per protocol, refunded even after use. Monthly renewals are not refunded.
  - Bank transfer is offered "în situații excepționale": prepaid 1, 3, 6 or 12 months, with no renewal.
- Trader: SC EQSYNC SRL, CUI 55664251, J2026056705007 (EUID ROONRC.J2026056705007), Galați, str. Gheorghe Doja nr. 6, bl. 3A, sc. 2, et. 2, ap. 29; tel. 0773 819 193. It is not a VAT payer, so prices are final.
- There is no cutover to the new site before parity. The new site replaces a working shop with accounts, so eq-sync.ro switches only after phase C (§7) is green on staging.

## 1. Sitemap

All Romanian paths are canonical. English lives under `/en/` with English slugs from one typed route table (`src/routes/table.ts`), and the table generates `hreflang` and `sitemap.xml`.

| Path (ro) | en | Phase | Replaces / note |
|---|---|---|---|
| `/` | `/en/` | A | home (shortened; depth moves to its own pages) |
| `/metoda` | `/en/method` | A | `#metoda` |
| `/despre` | `/en/about` | A | `#adrian` |
| `/intrebari` | `/en/faq` | A | `#faq`; the nav label stays "FAQ" |
| `/protocoale`, `/protocoale/<slug>` | `/en/protocols/…` | A (view), C (buy) | `/biblioteca` (301); paths follow AUDIT.md "EQ-SYNC under `/protocoale/<slug>`" |
| `/inregistrare` | `/en/sign-up` | B | free programme signup ("Vreau programul gratuit") |
| `/autentificare` | `/en/sign-in` | B | sign-in by email code (no passwords) |
| `/cont`, `/cont/program`, `/cont/protocoale/<slug>` | `/en/account/…` | B / C | account, the 21-day listening flow, protocol player |
| `/cos`, `/comanda/<id>` | `/en/cart` | C | cart, then the return page after Stripe Checkout |
| `/cont/abonament`, `/cont/retragere` | | C | subscription and the in-account withdrawal function |
| `/contact`, `/sedinte-online` | `/en/contact`, `/en/consultation` | A | contact form; 1:1 call (Calendly as a plain link-out, no embed) |
| `/termeni`, `/confidentialitate`, `/cookie-uri`, `/retragere`, `/retur-rambursare`, `/anulare-abonament`, `/disclaimer` | `/en/legal/…` | A | the current legal set. `/disclaimer` replaces "Disclaimer medical → #faq". Romanian is legally binding; the en pages say so |
| `/testimoniale` | | Later | only once consented testimonials exist (§2); until then there is no nav link (the live nav links to an empty section) |
| Blog | | Link-out | the nav "Blog" points to the shared blog app (`docs/plans/blog-and-content.md`); `/blog/*` 301s there once it exists. The two `demo-` posts are dropped (owner Q14) |
| Later | | D | AI guide (AskBar), self-service bank-transfer orders, Netopia, in-app booking, English audio |

Nav: 5 links (Metodă, Protocoale, Despre, FAQ, Blog) and 2 actions, which stays within the NavBar guide's limits:
- a static "Contul meu" as `glass`, which goes to `/autentificare` when signed out;
- "Vreau programul gratuit" as `primary`.
The label is static so public HTML does not vary by session (§5). The cart count lives in a sticky `CartSummary` on `/protocoale/*` and `/cos`.

## 2. Pages

Copy in quotes below is verbatim from the live HTML. Builders take full text from the audit crawl (`data/crawl/eqsync`). Lines flagged ⚑ break the brand book or AUDIT.md claim rules and need rewriting plus Adrian's sign-off before reuse.
Component names follow `design-system.md` §4: Hero, Section, Footer, NavBar, LanguageSwitch, ThemeToggle, plus the planned shared extras FaqList, Notice and Checkbox. EQ-SYNC asks the `@psi/ui` backlog for five more: Steps, SpectrumBar, CartLine, CartSummary, ConsentBanner.

**Home `/`.**
- Hero on `AmbientField`. The overline is "Program gratuit de echilibrare · 21 de zile"; H1 (`display-xl`) "Îți promitem un drum de 21 de zile, sesiune cu sesiune, spre o liniște mentală adevărată."; `Button` primary "Vreau programul gratuit"; `Button` glass "Vezi cum funcționează" → `/metoda`; then a `Notice`: "Instrument de wellness, nu dispozitiv medical. Contraindicat persoanelor cu epilepsie sau afecțiuni convulsive". ⚑ Drop "TEHNOLOGIE VALIDATĂ DE NEUROCERCETĂTORI" and "program de neuromodelare cerebrală".
- Problem: "Recunoști starea asta?" then "Mintea rămâne „pe fugă” mult după ce pericolul a trecut", with three `GlassCard solid`: "Minte agitată", "Somn superficial", "Sistem nervos în alertă" (live body lines kept).
- Mechanism teaser: "Fiecare ureche primește un ton ușor diferit" → link to `/metoda`.
- Sample, on a solid section (never on the AmbientField): "Așa sună un exercițiu EQ-SYNC" with an `AudioPlayer` (public 2-minute sample, meta "~2 minute · protocolul Echilibrare · folosește căști").
- Offer: "21 de zile gratuite. Apoi alegi tu." with two offer cards (`GlassCard solid` holding a price in mono; free 0 RON and 24,99 lei / protocol / lună), then "14 zile garanție - banii înapoi dacă nu ești mulțumit."
- Closing: "Primul pas e o singură sesiune, în ritmul tău." ⚑ The subline "fără riscuri" contradicts the contraindications.
- Footer: `Footer` with the trader data from §0, the legal links and the ANPC SAL pictogram.

**Metodă `/metoda`.**
- "Cum funcționează, fără jargon": a three-step `Steps` with the live headings "Fiecare ureche primește un ton ușor diferit", "Creierul „recompune” diferența dintre cele două tonuri" and "Undele cerebrale tind să urmeze acel ritm".
- `SpectrumBar` with Delta through Gamma, the target band "Țintă: Alpha · 8–12 Hz", and the live band labels.
- "Programul gratuit: 21 de zile, 4 exerciții ghidate, cu căștile" with the three live steps, then a headphones `Notice` and the CTA.
- Missing: sources for the entrainment claim (owner Q9).

**Despre `/despre`.**
- "Povestea din spatele EQ-SYNC" with a `PractitionerCard` (Adrian Turcu, "Psiholog, psihopedagog, psihoterapeut de cuplu și familie"), the stats as mono data ("20+ ani experiență clinică", "Acreditare Institutul Monroe", "Fondator EQ-SYNC"), and `Prose` holding the live story shortened to three paragraphs. ⚑ "a însoțit mii de persoane" (an unsourced number) and "știința și transformarea reală se întâlnesc".
- The Monroe wording must follow Monroe's trademark rules (owner Q10). There is no Hemi-Sync® mention on this site beyond the credential.

**FAQ `/intrebari`.**
- `FaqList` with 6 items, using the live questions verbatim: "Am nevoie de echipament special?", "Cum decurge o ședință?", "Ce se întâmplă după cele 21 de zile gratuite?", "Ce se întâmplă dacă nu sunt mulțumit de un protocol cumpărat?", "E un dispozitiv medical sau un tratament?", "Există contraindicații?". The live answers are good and stay; split the long "după cele 21 de zile" answer.
- Followed by the DISCLAIMER block (verbatim from the live site) and FAQPage JSON-LD.

**Protocoale `/protocoale`.**
- H1 "Alege protocolul potrivit pentru tine" and an intro, then a filter row of `Chip`s for the 10 categories, each holding 4 protocols: Calmare, stres și reglare · Somn și regenerare · Dimineață, energie și activare · Energie și recuperare · Claritate mentală și decizii · Performanță cognitivă și concentrare · Emoții, frici și stabilitate · Resurse interioare și dezvoltare personală · Relații, iertare și iubire · Protocoale complexe EQ-SYNC.
- Then a `ProductCard` grid (price "24,99 lei/lună", action "Adaugă în coș"), the discount ladder, the "Prețuri finale, fără TVA adăugat" line, the wellness disclaimer, and a sticky `CartSummary`.
- Filtering works without a server round-trip: a Datastar signal plus `data-show` per card. Search arrives in phase D (via the AskBar).
- ⚑ "copiile piratate alterează frecvențele și reduc eficiența exercițiilor" is an efficacy claim.

**Protocol `/protocoale/<slug>`.**
- Title, category, the 4 exercises it is built from (the live data lists base exercises, e.g. "Respirație - Calm Rapid, Echilibrare Cerebrală și Împământare, Relaxare, Echilibrare Emoțională"), "Despre acest protocol" and "Rutină recomandată" (live copy), a headphones `Notice`, and "Adaugă în coș".
- Missing per exercise: duration, band, and a sample, if any (owner Q8).

**Înregistrare `/inregistrare`.**
- H1 "Creează-ți contul EQ-SYNC" and the live line "Ai 21 de zile, de la confirmarea adresei de email, ca să parcurgi integral programul gratuit de echilibrare."
- Fields (`TextField`, `Checkbox`): prenume; email; "Sunt de acord cu Termenii și Politica de confidențialitate" (required); "Am peste 18 ani" (required, from Terms §3); news by email (optional, unticked).
- This drops nume, telefon and both password fields (data minimisation, passwordless sign-in; owner Q2).
- Success panel: "Verifică-ți emailul" plus "Retrimite emailul de confirmare".

**Autentificare `/autentificare`.** Email, then a 6-digit code (also delivered as a link). The no-JS form posts in full.

**Cont `/cont`.**
- `ProgramTracker` (total 21, done and today from the account; §3), the 4 exercises plus the bonus as `AudioPlayer`s, and the "Ziua 20" bonus `StatusBadge info` "Deblocat".
- My protocols: slots, each with a swap action.
- Subscription: status, next renewal and "Anulează reînnoirea abonamentului"; the "Retrage-te din contract" function; data export and delete account.
- Uses the Day theme toggle and has no AmbientField.

**Coș `/cos`.**
- `CartLine` per protocol, a tier line ("-10% de la 3 protocoale"), the total in mono, and three ticks recorded as consents: terms; "Solicit acces imediat la protocoale"; and an acknowledgement of the withdrawal rules as written in `/retragere`.
- Then `Button` "Plătește cu cardul" → Stripe Checkout. Sign-in is required first; the cart survives sign-in in a cookie.

**Legal.**
- Port the live texts, which were updated on 27.10.2026 (privacy on 12.07.2026), into `Prose`. Fix the subprocessors (Supabase and Zoho replaced by the estate's hosting at Hetzner DE, Stripe, the invoicing provider and the mail provider).
- Romanian-market checklist (confirm with a lawyer or accountant):
  - Trader identity and contact on every page, under OUG 34/2014 art. 6 and Legea 365/2002.
  - Total price shown final (non-VAT payer), subscription terms and renewal clearly before payment, and the "comandă cu obligație de plată" wording on the pay button.
  - The 14-day withdrawal, a model withdrawal form, and an online withdrawal function with a confirmation on a durable medium. The live site already has "Retrageți-vă din contract aici", which fits the CRD art. 11a "withdrawal function" (EU 2023/2673, from 19.06.2026; check the RO transposition).
  - The ANPC SAL pictogram and link (ANPC Ord. 449/2022).
  - SOL/ODR: the EU ODR platform closed on 20.07.2025 (Reg. 2024/3228), so the link is dead. Keep the SOL pictogram until the lawyer confirms whether Ord. 449/2022 still requires it.
  - GDPR privacy and the cookie banner (Legea 506/2004) with reject-all equal to accept-all.
  - The medical disclaimer and contraindications, and 18+.
  - e-Factura for B2C invoices (§4).

**Testimoniale (later).** Every testimonial needs all of the following:
- Written consent stored as a record (`consents` row plus the signed form), revocable, with removal within 7 days of withdrawal.
- A first name with an initial or age, as the person chooses; no health details; no outcome numbers or promises (AUDIT `TESTIMONIAL_OUTCOME`/`_SENSITIVE`); no minors.
- A line on the page saying how testimonials are collected and checked (the unfair-practices rules on reviews).
- A check against the CPR ethics code, because Adrian is a psychologist (owner Q11).

## 3. Datastar interactivity

All wiring goes through `@psi/ui/datastar`'s typed helpers (`ds.on`, `ds.signals`, `post(...)`); a raw `data-*` attribute is a lint error (design-system §5). Server side, `@psi/ui/server` provides `readSignalsAs(schema)` and `patch()`.
The Datastar bundle is `@psi/ui`'s vendored `datastar-1.0.5.js` (≈14 KB gz, measured). There is no app JS beyond it.
context7 was down while planning, so the Datastar and Paraglide 3 API names in this plan are unverified; check them against the v1.0.5 and Paraglide references.

- **AudioPlayer** (design-system U7). Local underscore signals `_<id>Playing` and `_<id>Time` are never sent to the server. `<audio preload="none">` points at `/audio/<exercise>`; it has no `autoplay` and only the click handler calls `play()`. There is a `<noscript>` native player, and the meta line always says "folosește căști".
  - Seek uses a range input that sets `currentTime`.
  - The app passes `ds` that adds `_<id>Listened` (accumulated only while playing). At ≥80% or on `ended` it fires `post('/cont/ascultari/<exercise>')`, and the SSE reply patches `ProgramTracker` by its `id`.
- **ProgramTracker.**
  - `total=21`. Today = days since `confirmed_at` (Europe/Bucharest), plus 1.
  - `done` = the number of distinct programme days with at least one completed listen. This counts listening days, not the 4 exercises; a 4-item checklist sits beside it (owner Q6).
  - There is no red or missed state. The day 20 bonus unlocks server-side, and the "6/21" count is in mono.
  - It updates only through the SSE patch above, with no polling.
- **Signup form.**
  - Signals hold the fields plus a honeypot. `data-on:submit__prevent="@post('/inregistrare')"`, and `data-indicator` disables the button.
  - The server reads the signals, then zod-parses them with the same schema the no-JS `<form method=post>` uses (the server tells the two apart by the Datastar request header).
  - Errors come back as `patchElements` of the form, using `TextField error` "Eroare: …". Success patches in the "Verifică-ți emailul" panel.
  - The response is the same whether or not the email already exists (no enumeration); an existing account gets a "you already have an account" email instead.
  - Rate limit: 5 per IP and 3 per email per hour.
- **Theme toggle.** Uses `@psi/ui`'s `ThemeToggle`: a form posting to `/_psi/theme`, which sets a cookie, enhanced by Datastar to flip `data-theme` in place. The server renders `data-theme` from the cookie, so there is no flash. Night is the default.
- **Language switch.** `LanguageSwitch`: a plain `<a hreflang>` to the counterpart URL from the route table, with no JS. `/` is never redirected by Accept-Language.
- **Mobile nav.** `NavBar`'s native `popover` menu, which handles light dismiss and Escape without JS. No Datastar is needed.
- **Also.**
  - Category filter: signals only.
  - Add to cart: `@post('/cos/<slug>')` patches `CartSummary`.
  - Consent banner: `@post('/cookie-uri/preferinte')`.
  - Analytics stays off until consent (§5).

## 4. Accounts, commerce, audio

**Identity, MVP: passwordless email inside the app, not Authentik.**
- The estate's Authentik is a workforce IdP. Its enrolment blueprint drops new users into a zero-access `pending` group awaiting admin promotion, and it lives at `sso.psizone.ro`, the wrong brand and zone for consumers.
- The app keeps `customers`, `login_codes` (hashed, 10 min, 5 tries) and `sessions` (`__Host-eqs` cookie, HttpOnly, SameSite=Lax, 30-day rolling) behind a narrow `CustomerIdentity` interface, so it can move later to a customer IdP (Authentik customer tenant or the CMS) for SSO with hemi-sync.ro.
- Migration is easy: import Supabase users by email, with name, `confirmed_at` and progress. No password hashes migrate.
- `apps/eqsync-web/authz.manifest.json` declares the app with no customer roles. Entitlement to a protocol is subscription data, not a permission. Staff tooling (later) gets roles through Polaris.

**Payments, MVP: Stripe only (already the live processor), hosted Checkout plus the Customer Portal.**
- One Product, "Protocol EQ-SYNC", with one monthly RON Price, `billing_scheme=tiered`, `tiers_mode=volume`. Per-unit tiers: 1–2 at 24,99 · 3–5 at 22,49 · 6–11 at 21,24 · 12–17 at 19,99 · 18–25 at 18,74 · 26+ at 17,49 lei. Rounding per unit needs confirming (owner Q4).
- Quantity is the number of slots, and the app maps slots to protocols.
- Adding protocols updates the quantity with `proration_behavior=always_invoice`.
- Webhooks are idempotent through a `stripe_events` table: `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.paid|payment_failed`, `charge.refunded`.
- Cancelling the renewal goes through the Portal, configured as "cancel at period end".
- Swap: self-service, once per billing period per slot (the live site does it by hand; owner Q5).
- Withdrawal (MVP): the in-account function records the request, sends an email confirmation, removes access and reduces the quantity with `proration_behavior=none`, so there is no automatic credit and no double refund. Staff issue the refund in the Stripe dashboard within the 14 legal days. Automatic refunds come in phase D.
- Deferred: Netopia (no need while Stripe works), and bank-transfer prepaid, which staff grant as a manual entitlement for now (owner Q12).

**Invoices.**
- A non-VAT payer still issues invoices, and B2C invoices have gone through RO e-Factura since 01.01.2025, with penalties from 01.07.2025 (sources conflict on thresholds; the accountant confirms).
- Stripe invoices are not e-Factura. So on `invoice.paid`, an `InvoiceProvider` adapter calls SmartBill or Oblio, whichever the accountant already uses (owner Q3). The provider issues the invoice with the exemption mention, submits it to the SPV and emails the PDF; the app stores the provider id and status.
- Later: take over the rmx e-Factura service (Meridian, `../_RMX_READONLY/apps/rmx-invoice-svc`) as a psi app.

**Audio.**
- Storage: a private bucket `psi-eqsync-audio` (BUCKET_PREFIX `psi`, Hetzner nbg1), declared under `storage` in `seb.app.yaml`. Keys follow `exercises/<slug>/<version>.m4a`, and the catalogue maps protocols to their 4 base exercises.
- Delivery: `GET /audio/<exercise>` checks the session and entitlement (free window, bonus, active slot), then returns a 302 to a presigned GET (TTL 1 h, `Cache-Control: private, no-store`). Range requests go straight to object storage. The public sample route is open and cacheable.
- Encoding: stereo only, AAC 256 kbps or higher (or Opus 160 kbps or higher) from the masters. Never mono and never low-bitrate joint stereo, both of which smear the left/right offset the method depends on. Verify with Adrian by ear.
- Licensing: the Terms claim EQSYNC SRL owns all audio. Confirm the voice and music contracts and that no Monroe/Hemi-Sync® material sits inside EQ-SYNC tracks (owner Q10). Signed URLs deter sharing, they do not prevent it; that is accepted, with no DRM.

**Email.**
- Mail covers confirmation, sign-in codes, a reminder on day 19, the bonus on day 20, receipts and links, and the withdrawal confirmation.
- The reminder and bonus emails are sent by a daily CronJob (`jobs` in `seb.app.yaml`).
- SEB's Plunk sender would be `noreply@eqsync.psizone.ro` (sender = subdomain of `MAIL_DOMAIN`). Until SEB supports per-app mail domains (§6), send from `noreply@eq-sync.ro` through the existing Zoho SMTP, with credentials in OpenBao (owner Q13). A `dig` on 2026-11-11 shows eq-sync.ro already publishes Zoho MX, SPF (`include:zohomail.eu`) and DKIM (`zmail._domainkey`).

## 5. SEO, performance, caching

**SEO.**
- Per-page title and description from the content modules, a canonical URL, `hreflang` ro/en/x-default, and a `sitemap.xml` and `robots.txt` built from the route table.
- JSON-LD: Organization (EQSYNC SRL), Person (Adrian), FAQPage, BreadcrumbList, and Product plus Offer per protocol (`UnitPriceSpecification`, `billingDuration P1M`, RON).
- One `display-xl` H1 per page and OG images per page.
- 301s: `/biblioteca` → `/protocoale`, `/blog/*` → the blog, `/sedinte-online` kept.
- The staging host sends `X-Robots-Tag: noindex` and `Disallow: /`, enforced by `PUBLIC_ORIGIN` not matching eq-sync.ro.

**Budget (CI-checked).**
- JS ≤ 16 KB gz per page (the Datastar 1.0.5 bundle measures 14.1 KB gz; there is no app JS).
- CSS ≤ 25 KB gz.
- HTML ≤ 40 KB gz.
- Fonts: self-hosted as in design-system D5. `components.css` currently imports Google Fonts, which D5 removes.
- The AmbientField is CSS-only, with no canvas.
- Images: AVIF/WebP with `sizes`.
- Targets on mid-range mobile over 4G: LCP < 2.0 s, CLS < 0.05, INP < 200 ms.
- No third-party script before consent. Analytics: none or a cookieless self-hosted tool, versus GA4 behind consent (owner Q7).

**Caching.**
- Public pages are pure functions of the content modules and the theme cookie. Render them once per locale and theme (2 × 2 variants) into an in-memory cache and serve them with a strong ETag and `Cache-Control: public, max-age=0, must-revalidate`, plus `Vary: Cookie`. That gives no shared edge cache, but a revalidation costs a hash lookup.
- Nothing else on a public page varies by session: the account link is static, and the cart count loads only on shop pages, through `data-init` plus a `get` call.
- Hashed assets: `immutable, max-age=31536000`.
- `/cont/*`, `/cos`, `/audio/*` and the APIs: `private, no-store`.
- Compression: brotli or gzip at Traefik.

## 6. Deployment

**Image (`apps/eqsync-web/Dockerfile`).**
- `node:24-slim` multi-stage with the repository root as build context. pnpm comes through corepack from the root `packageManager`, then `pnpm install --frozen-lockfile`.
- Build `@psi/design`, `@psi/ui` and then `@psi/eqsync-web` (tsc, Tailwind, Paraglide compile), and finish with a pruned production install via `pnpm deploy`. pnpm 10 needs `inject-workspace-packages=true` or `--legacy` for that; use whatever the psizone-web Dockerfile settles on.
- The runtime stage runs as non-root uid 1001 on `PORT=3000` with `CMD node dist/server.js`.
- `/healthz` is liveness; `/readyz` checks the database.

**`apps/eqsync-web/seb.app.yaml`** (schema `seb.app/v1`, modelled on `seb/examples/lumen/apps/atlas` and rmx `wise-proconsult`):
- `key: eqsync`, `name: eqsync-web`, namespace `eqsync-web`.
- One component:
  - `gitops: gitops/services/eqsync-web`, image `psi/eqsync-web` at `registry.psizone.ro`, port 3000.
  - Host `prefix: eqsync`, `exposure: public`, `gate: off`.
  - Deployment probes `/healthz` and `/readyz`, requests 25m/128Mi and limits 500m/512Mi, `restartOnSecretChange`.
- `databases`: CNPG `eqsync-db` with backups via the estate's db-backup.
- `storage`: `psi-eqsync-audio`.
- `externalSecrets`: harbor-pull plus `eqsync-web-secrets` extracting `apps/eqsync-web/env`.
- `secrets`:
  - `apps/eqsync-web/app` holds `SESSION_KEY` (generated).
  - `apps/eqsync-web/db` holds the db-user.
  - `apps/eqsync-web/env`, seeded from env-file, holds `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INVOICE_API_KEY`, `SMTP_*`, `S3_*` and `PUBLIC_ORIGIN`.
- `jobs`: `eqsync-reminders` at `0 7 * * *`.
- `ci.workflows`: `eqsync-web.yml`, bumping `gitops/services/eqsync-web`.
- `groups`, `docs` and `findings` are present (all required by the schema).

**GitOps (new; psi has no `gitops/services/*` and no `.github/` yet).**
- `gitops/services/eqsync-web/base/{deployment,service,ingress,externalsecret,harbor-pull-externalsecret,cnpg-cluster,cronjob,resourcequota,kustomization}.yaml`.
- `overlays/dev/kustomization.yaml`: whitelabel component, host `eqsync.WLDOMAIN` replaced from `BASE_DOMAIN` at index 1, and the CI-bumped image tag.
- Argo registration: `gitops/apps/overlays/dev/eqsync-web.yaml` (an Application like `changelog.yaml`) listed in that overlay's `kustomization.yaml`.
- `.github/workflows/eqsync-web.yml` builds and pushes to Harbor, then commits the tag.

**Staging.** `https://eqsync.psizone.ro`. Derived hosts in psi are `<prefix>.psizone.ro` (`AUTHENTIK_HOST` is `sso.psizone.ro`, and SEB decision D27 says no `.dev` in any address), which matches hemisync-web's `hemisync.psizone.ro`. Staging runs Stripe in test mode, noindex, and a "Mediu de test" banner.

**eq-sync.ro is a different zone.**
- `DNS_ZONE: psizone.ro` is the only zone the estate writes. external-dns has `domainFilters[0]=DNS_ZONE`, cert-manager DNS-01 uses a Cloudflare token scoped to that zone, and `seb.app.yaml` hosts are prefixes under the apex.
- eq-sync.ro is on Cloudflare under a different nameserver pair (nina/kip vs iris/rob for psizone.ro), which possibly means a different account (owner Q1).

| Option | DNS record | Certificate | Host schema | Verdict |
|---|---|---|---|---|
| **A. SEB "additional zones"**: identity `EXTRA_ZONES` (same name as hemisync-web), host gains an optional `zone` (`@`/`www` allowed), external-dns domainFilters list, one cert-manager DNS-01 solver per zone, preflight and dns-plan per zone, and a per-app mail domain for Plunk DKIM | external-dns, as code | DNS-01, a token per zone (secret refs in identity) | extended by SEB | **Target.** hemi-sync.ro needs the same. File it in SEB now, then bump `estate/platform.lock` |
| **B. Cloudflare edge bridge**: a proxied eq-sync.ro record with a Worker (or Cloudflare for SaaS custom hostname) forwarding to `eqsync.psizone.ro`; the app sets `PUBLIC_ORIGIN=https://eq-sync.ro` and trusts `X-Forwarded-Host` | by hand or wrangler-as-code in `tools/` | Cloudflare edge plus the estate cert on the origin | unchanged | **Bridge** only if launch comes before the SEB release; give it a sunset date. hemisync-web recommends B for its launch, so one Worker pattern serves both |
| C. A hand-written Ingress for eq-sync.ro plus HTTP-01 and a manual A record | manual | HTTP-01 | bypasses the schema | **Rejected**: not as code, and the lean dev profile has no stable load-balancer IP |

**Cutover after phase C passes on staging.** Freeze the live site, export Supabase (users, confirmations, progress) and Stripe customers and subscriptions (same Stripe account, mapped by email), import, verify counts, switch DNS through A (or B), and keep the 301s.

## 7. Build tasks

The app is blocked on `@psi/ui`, which does not exist yet; `@psi/design`'s components are React. `docs/plans/design-system.md` §9 owns these tasks: D1–D5 (tokens, fonts), U1–U9 (scaffold, typed Datastar, i18n, components, layout, server helpers), G1–G2 (gallery and e2e gates). EQ-SYNC depends on D2, D5, U4 (Logo, Button, GlassCard, StatusBadge, Prose, AmbientField), U5 (ProductCard, ProgramTracker, PractitionerCard), U6 (Chip, TextField), U7 (AudioPlayer), U8 (Document, Hero, Section, Footer, NavBar, LanguageSwitch, ThemeToggle) and U9 (server helpers). Nothing from that list is built in `apps/`. The one new task here, X-EQ, joins that backlog.

| ID | Task (paths) | Depends | Acceptance |
|---|---|---|---|
| X-EQ | `@psi/ui` additions (backlog of design-system.md): FaqList, Notice and Checkbox (shared with psizone-web), plus Steps, SpectrumBar, CartLine, CartSummary and ConsentBanner | U4, U6 | FaqList is `<details>`-based; ConsentBanner gives reject and accept equal weight and works without JS; SpectrumBar has a text equivalent |
| A1 | `apps/eqsync-web` scaffold: `package.json`, `project.json`, `tsconfig.json`, `src/server.ts`, `src/app.ts`, layout via `Document`, `/healthz`, `src/styles.css` (two lines, per design-system §6) | U1, U8 | `nx run @psi/eqsync-web:build/test/lint/type-check` green |
| A2 | i18n: Paraglide project, `messages/{ro,en}.json`, `src/routes/table.ts` (localized slugs and hreflang), a lint check for bare JSX strings | A1 | every UI string goes through `m.*()`; en falls back to ro with a log line |
| A3 | Content modules `src/content/{home,method,about,faq,legal,catalogue}.ts`, each a `Record<Locale, T>` parsed by zod at boot (40 protocols, base exercises) | A1 | boot fails on invalid content; ro is complete |
| A4–A8 | Pages under `src/pages/`: home, metoda, despre, intrebari, protocoale (list and detail) | A2, A3, U4–U8, X-EQ | §2 sections; one primary per view; ⚑ lines removed; axe shows 0 serious issues |
| A9 | Legal pages, the trader block, the ANPC SAL badge, the cookie-consent endpoint | A3, X-EQ | the §2 checklist is ticked by the owner's lawyer |
| A10 | `/contact` (zod form → email), `/sedinte-online` (Calendly link-out) | A2, U6 | no third-party request without consent |
| A11 | SEO: meta, JSON-LD, `sitemap.xml`, `robots.txt`, the 301 map, noindex on staging | A4–A9 | Rich Results test passes; the staging host is noindexed |
| B1 | Database: `src/db/schema.ts`, migrations (customers, login_codes, sessions, consents, enrolments, listens, subscriptions, slots, withdrawals, invoices, stripe_events) | A1 | migrations run as an initContainer; there are rollback notes |
| B2 | Auth: `src/auth/` (email code, sessions, rate limits) | B1, B6 | no password anywhere; codes hashed; enumeration-safe |
| B3 | Free-programme signup `/inregistrare`, double opt-in, consents | B2, U6, U9, X-EQ | the 21 days start at confirmation; works with and without JS |
| B4 | Listening flow `/cont`, `/cont/program`, `POST /cont/ascultari/:id` | B3, B5, U5, U7 | tracker semantics as in §3; bonus unlocks on day 20; the 4 exercises are gone after day 21 |
| B5 | Audio: `src/integrations/storage.ts`, `/audio/:id` with a presigned 302 | B1 | entitlement enforced; seek still works after the TTL (tested) |
| B6 | Mail: `src/integrations/mail.ts`, templates, CronJob `src/jobs/reminders.ts` | A2 | sends from `noreply@eq-sync.ro`; reminder once on day 19 |
| C1 | Cart and Stripe Checkout: `src/routes/cart.ts` | B2, X-EQ | consents recorded before the redirect; quantity equals slots |
| C2 | Webhooks: `src/integrations/stripe.ts` | B1 | idempotent; signature verified; slots stay in sync |
| C3 | Account subscription: swap, Portal cancel, the withdrawal function and its email | C2 | matches the live `/retragere` and `/anulare-abonament` behaviour |
| C4 | `InvoiceProvider` adapter (SmartBill or Oblio) | C2, Q3 | one invoice per `invoice.paid`; the e-Factura status is stored |
| C5 | Migration script `tools/eqsync-migrate/` (Supabase and Stripe import) | B1, C2 | dry-run report; counts match |
| E1 | `apps/eqsync-web/Dockerfile` | A1 | image < 200 MB; runs as non-root |
| E2 | `seb.app.yaml`, `authz.manifest.json`, `seb.seed.sh` | E1 | validates against `seb/schema/app.schema.json` |
| E3 | `gitops/services/eqsync-web/**`, `gitops/apps/overlays/dev/eqsync-web.yaml` | E2 | `kustomize build` is clean; the host is `eqsync.psizone.ro` |
| E4 | `.github/workflows/eqsync-web.yml` (build, push, tag bump, budget check via Lighthouse CI) | E1 | the budgets in §5 fail the build when exceeded |
| E5 | The SEB "additional zones" proposal, as an issue in the SEB repo (not here) | – | accepted, or the bridge from option B is chosen |

Parallel lanes: X-EQ alongside design-system U5–U8. A1 then A2 and A3, then A4–A11 per page. B1 then B2–B6. C1–C5. E1–E4 can start right after A1.
Phases: **A** marketing pages on staging; **B** free programme; **C** shop (parity, then cutover); **D** later work.

## 8. Owner questions

1. Is the eq-sync.ro Cloudflare zone in the same account as psizone.ro? May the estate's DNS token manage it, or can the zone be moved?
2. Can phone and password be dropped from signup (passwordless email codes)?
3. Which invoicing tool and accountant do you use today (SmartBill, Oblio, other), and how are B2C invoices reported to e-Factura now?
4. Should discounted prices be rounded per unit (22,49 …) or on the total?
4b. How does the live Stripe account model protocols today: one subscription per protocol, or quantity on one subscription? How many users and active subscriptions are there, and can you export them from Supabase and Stripe?
5. Should protocol swaps be self-service, taking effect immediately once per month, or stay manual as now?
6. Does the 21-day tracker count listening days (proposed) or the 4 exercises?
7. Analytics: none or cookieless (proposed), or keep GA4 behind consent?
8. Per exercise: duration, frequency band, sample clip, and an English version? If there is no English audio, the en site says sessions are in Romanian.
9. Sources for the method and entrainment statements, and approval to remove the ⚑ lines in §2.
10. Licensing: the contracts for voice and music, the Monroe credential wording, and confirmation that there is no Monroe material in the tracks.
11. Testimonials: do any consented ones exist, and has the CPR ethics position been checked?
12. Keep bank-transfer prepaid? Price of the 1:1 consultation, and keep Calendly?
13. Mail sender `noreply@eq-sync.ro` through Zoho SMTP until SEB per-app mail domains exist?
14. Drop the two `demo-` blog posts? One shared blog, or one per brand?
15. Logos and portrait files (all placeholders today).
