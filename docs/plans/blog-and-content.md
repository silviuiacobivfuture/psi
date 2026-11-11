# Plan: the Blog, the content source, and the psi web-app scaffold

Status: plan, 2026-11-11. Other builders are working in parallel (see the Differs table). Scope: (A) `apps/blog-web`, (B) the content
source behind every psi site, (C) the skeleton every psi web app follows. The stack is decided
and is not reopened here: Node 24 + Hono typed TSX, Datastar v1.0.5, Tailwind 4, Paraglide JS 3
(ro reference, en second), `@psi/ui` on `@psi/design`, no React on the sites, platform from SEB.

**What this supersedes in `docs/brands/CONTEXT.md`** (the owner updates CONTEXT/HISTORY):
"Payload also handling authentication" becomes sign-in through the estate's hub (Authentik
behind it) and permissions through Polaris. "The same React components" becomes `@psi/ui`, which
is Hono JSX rendered on the server. `@psi/design`'s React preview kit (`components.js`,
`window.Psizone`) is reference only.

## Ground truth this plan rests on (verified 2026-11-11)

| Fact | Source |
|---|---|
| payload, `@payloadcms/*` latest **3.93.0**. Node `^22.23.4 \|\| >=24.22.1`. `@payloadcms/next` peers Next `15.2.9–15.4.x \|\| >=16.3.3 <17` | npm registry |
| Payload custom auth: collection `auth.strategies[{name, authenticate({headers,payload,req})}]`, `auth.disableLocalStrategy`. The docs do **not** say how the admin login screen behaves without the local strategy. SSO is an Enterprise feature | payloadcms.com/docs/authentication |
| Localisation per field, `fallback` true by default; per-locale status (`experimental.localizeStatus`) is beta. Hono JSX: `jsxImportSource: "hono/jsx"`, `c.html()` awaits async components | payloadcms.com, hono.dev |
| Datastar client **v1.0.5** exists only as a GitHub tag (2026-11-09, `bundles/datastar.js`). The npm `@starfederation/datastar` is still `1.0.0-beta.11`. `@starfederation/datastar-sdk` is **1.0.0** | GitHub API, npm |
| Paraglide 3.2.2: CLI `paraglide-js compile --project ./project.inlang --outdir ./src/paraglide` (in use in psizone-web); messages take an explicit locale. `urlPatterns` not verified, so not relied on | psizone-web, paraglidejs.com, npm |
| Directus 12.6.1 needs Node >=26; licence "SEE LICENSE IN license" (BSL per our knowledge, unverified) | npm |
| SEB `hosts[]` = `{prefix, exposure, ingress, middleware, gate}`: **no path**, and a prefix under the one zone | seb `schema/app.schema.json` |
| Business apps never talk to Authentik. They sign in through the **hub** (Polaris's OIDC broker: code + PKCE S256, 5-minute ES256 tokens). Roles in a token are **for display only**: every decision is an OpenFGA Check. The issuer is `hubIssuerAt(HUB_HOST_PREFIX, BASE_DOMAIN)`, which gives `https://login.psizone.ro` for psi | seb `docs/autorizare/18-…`, `21-…` §2.2–2.3; `autorizare-sdk/src/hub/endpoints.ts` |
| An app declares `oidc:`, `authz:`, `databases:`, `storage:`, `secrets:` and `health:` in `seb.app.yaml` (schema `seb.app/v1`). SEB's seeding mints `HUB_CLIENT_ID/SECRET` and the `AUTORIZARE_*` values from it | seb `schema/app.schema.json`; rmx `apps/flow-platform/seb.app.yaml` |
| psi has **no** `estate/platform.lock`, `.seb-bundle/`, `.github/` or `scripts/new-app.mjs`. `gitops/apps/overlays/dev/kustomization.yaml` does not list `apps/`. `@psi/ui` and `apps/psizone-web` exist as the first slice (11ff868). `apps/eqsync-web`, `hemisync-web` and now `blog-web` (only `package.json`, inlang, `tsconfig`; it copies `--packages=external`) are in progress, with no Dockerfile, `project.json` or `seb.app.yaml` yet | this repo |

Consequence: until SEB's bundle is pinned and the hub is provisioned for psi, nothing can sign
in. **The sites launch on typed, in-repo content** (the `static` adapter, as the psizone-web plan
already does) and switch to the CMS by swapping the adapter.


## (A) The Blog — `apps/blog-web`

### Where it lives: recommendation

**Each article has one canonical URL, on its brand's own site, under that brand's `pathBase`**
(default `/blog`). One deployment, `apps/blog-web`, renders every brand's articles. It has **no
public host**: each brand site proxies `pathBase/*` and `/en/pathBase/*` in-cluster to the
blog-web Service (a `@psi/server` route), sending `X-Psi-Brand` and its public origin. Ingress
path routing is out because SEB `hosts[]` carry no path, and hand-written Ingresses are rejected
in the sibling plans.

| Option | For | Against |
|---|---|---|
| **Path under each brand site, proxied (chosen)** | Each brand keeps its own SEO authority. Hemi-Sync content stays off psizone.ro. The brand header is natural. Per-brand blogs are the default shape. Works behind the Cloudflare edge bridge the siblings plan | One in-cluster hop |
| One host (`blog.psizone.ro`) | One feed and one sitemap | EQ-SYNC and Hemi-Sync articles would rank for psizone.ro. Cross-domain canonicals. Contradicts the Hemi-Sync split |
| A blog module inside each site app | No path routing | Three copies of the routes, cache and feeds. Breaks the "one shared publication" engine |

**Brands are a config table**, `apps/blog-web/src/brands.ts`, parsed with zod at boot. Each row
is `{brand, publicOrigin, pathBase, locales, sharedIndex}`. Hemi-Sync is
`pathBase: "/articole"`, matching the hemisync-web plan. The route segments below are relative to
`pathBase`. The "shared publication" is one engine, one editorial calendar and one design.
**Filtering by brand**: every listing is one brand's (the proxying site's). The optional
all-brands index, `/blog/toate`, carries brand chips that link to each brand's own listing, and
its cards link to their canonical origins. Per-brand blogs = `sharedIndex: false`. A single blog
host later = one more row plus redirects. Staging origins are `<prefix>.psizone.ro` (`nou`,
`eqsync`, `hemisync`, per the siblings); real domains come through the edge bridge (Open
question 3).

### Routes (ro is the reference; en uses localised segments and CMS-localised slugs)

| ro | en | What |
|---|---|---|
| `/blog` | `/en/blog` | The brand's listing: featured article, then newest first. 12 per page |
| `/blog/pagina/:n` | `/en/blog/page/:n` | Crawlable pagination (no `?page`) |
| `/blog/subiect/:topic` (+`/pagina/:n`) | `/en/blog/topic/:topic` | Filtered by topic. Topic chips are links that work without JS |
| `/blog/:slug` | `/en/blog/:slug` | The article |
| `/blog/autori/:slug` | `/en/blog/authors/:slug` | Author or reviewer page (Person, credentials, articles) |
| `/blog/toate` | `/en/blog/all` | All brands, only if `sharedIndex`. Cards carry absolute links |
| `/blog/rss.xml`, `/blog/subiect/:topic/rss.xml` | `/en/blog/rss.xml` | RSS 2.0 per brand and locale. Items: standfirst, topic `<category>`, `dc:creator` |
| `/blog/sitemap.xml` | (same file, with `xhtml:link` alternates) | Referenced from each site's sitemap index |
| `/blog/_assets/*` | | blog-web's own CSS and Datastar, inside the proxied prefix (immutable cache). `/healthz` stays internal |

The route table is the app's own, keyed by locale. It does not rely on Paraglide `urlPatterns`,
which are unverified for v3. The locale comes from the `/en` prefix. A request for an `en` slug
that has no reviewed `en` version returns 404, and that page emits no `hreflang`. Article slugs
`pagina`, `subiect`, `autori`, `toate`, `rss.xml`, `sitemap.xml` (and en equivalents) are
reserved: the CMS slug validator refuses them.

Listing and filtering: the brand is always the proxying site's; topics are that brand's `Topics`.
Datastar is progressive only: `data-on-click` on a chip calls `@get` and the server patches the
list, while the plain link still works without JS. The theme toggle (`blog-light` default,
`blog-dark` from `prefers-color-scheme` or a cookie) is a Datastar signal plus a cookie, so the
server renders the right `data-theme` with no flash.

### The article page (what the brand book requires, made enforceable)

Top to bottom: `NavBar` with `Logo brand={siteBrand}` (explicit — under `blog-*`, `auto` shows
the wrong brand) · breadcrumbs · H1 · **standfirst** (required, ≤ 60 words, answers the
headline) · mono meta line: author · clinical reviewer · "Revizuit clinic la <data>" · reading
time · cover (alt required) · `Prose` body · sources (required on health) · optional FAQ ·
**exactly one next step** (required union `nextStep` = hub | method | programme | booking |
guide; one accent button; `GuideMessage` only when `kind === "guide"`) · three related
`ArticleCard`s (navigation, not a CTA). No pop-ups, nothing between paragraphs. A health article
without a reviewer **cannot reach a production page**: the interface in (B) returns only
published, reviewed entries. Staging (`SITE_ENV=staging`) shows drafts with a "Ciornă —
nerevizuită clinic" notice and noindex, as in the psizone-web plan.

### SEO
- `<link rel=canonical>` to the brand's `publicOrigin`. `hreflang` ro/en, with `x-default` set to ro, only
  for locales that exist. OG/Twitter tags. `article:published_time`/`modified_time`.
- JSON-LD `@graph` from `@psi/seo`. Health (`kind: "health"`): `MedicalWebPage` (`lastReviewed`,
  `reviewedBy` Person, `about` from the hub, `inLanguage`) with `mainEntity` an `Article`
  (headline, description = standfirst, image, `datePublished`/`dateModified`, `author` Person →
  author page, `publisher` = brand Organization, `MedicalClinic` for Psizone). Others:
  `BlogPosting`. Always `BreadcrumbList`; `FAQPage` only with an FAQ block.
- Performance: no client JS is needed to read. Datastar loads `defer` from `pathBase/_assets`. The cover
  gets a `srcset` from the CMS image sizes, and the LCP image is preloaded. Fonts are
  self-hosted (design-system D5). Target LCP < 2.5 s on mobile; motion respects `prefers-reduced-motion`.

### Backlog (content-strategy.md): 20 articles, wave 1 = 1–10

All 20 are Psizone clinical articles (`kind: health`, review required). Each is seeded as a
draft with `backlogNo`, its hub/method and topic. The writing is editorial work, not a build task.

Mapping:
- 1–3 `/copii/autism` (3 + ABA) · 4–5 `/copii/adhd` (5 + Neurofeedback) · 6, 14 `/adolescenti`
- 7 `/copii/integrare-senzoriala` · 8 `/copii/logopedie` · 9, 19 Evaluare și QEEG
- 10–12 `/adulti/anxietate-depresie` · 13 TMS · 15 `/adulti/cuplu-familie` · 16 `/adulti/post-avc`
- 17 `/adulti/psiho-oncologie` · 18 Psihoterapie (hipnoză) · 20 `/programe/sport`


## (B) The content source

### Options against the hard requirements

Hard requirements: **R1** editors sign in through the estate's SSO (the hub, Authentik behind
it) · **R2** permissions through Polaris/OpenFGA, no roles held in the tool · **R3** a clinical
review gate storing approver and date · **R4** multi-brand · **R5** ro/en · **R6** media in the
estate's object storage.

| | R1 | R2 | R3 | R4 | R5 | R6 | Cost / risk |
|---|---|---|---|---|---|---|---|
| **Payload 3.93 headless in `apps/cms`** | custom strategy against the hub. **Unproven in the admin login → spike** | access functions call OpenFGA (Check / ListObjects → `Where`) | fields + hooks + a custom endpoint: strong | a `brand` field (no plugin) | native per field | `@payloadcms/storage-s3` | React/Next 16 confined to one back office. Fast upstream release pace |
| Content in git (structured YAML + Markdown) | ✗ GitHub identities | ✗ CODEOWNERS is a second role system | reviewer and date are schema-required and CI fails without them, but nothing proves who typed them | ✓ | ✓ | sync script to the bucket | No editor for clinicians; Claude Code writes everything |
| Directus 12 | native OpenID, pointable at the hub | ✗ own roles/policies. Mapping roles from the token breaks "roles are display-only" | flows, custom | ✓ | translations pattern | native S3 | Node ≥26 image, non-OSI licence (unverified), Vue admin |
| Custom Hono back office | ✓ native | ✓ native | ✓ exactly as designed | ✓ | ✓ | presigned uploads | Must build the rich-text editor, versions, media library and lists: months |

### Recommendation: Payload 3 as a headless back office in `apps/cms`, gated by a spike

**One path:** the sites launch on the `static` adapter (typed in-repo content, already the
siblings' approach). They move to Payload once M0b passes and B1/B4 clear. The adapter is chosen
by the env value `CONTENT_SOURCE=static|payload`, parsed in `env.ts`; no code changes.

**Payload 3.93** runs as its own app, `apps/cms` (Next 16, Postgres on CNPG, S3 storage), used
only by editors and clinicians, never on a public site. The sites stay React-free, never import
`payload`, and read through `@psi/content`. React in `apps/cms` needs a **written, owner-approved
exception** to CLAUDE.md's "No React", scoped to that folder (Open question 2). It meets R1–R6 at
the lowest build cost; its weakest point (R1 in the admin) is small enough to prove in days.

**Spike M0 (3 days, go/no-go)** on Node ≥ 24.22.1 proves: (a) admin sign-in through the hub
(OIDC code + PKCE) via a `hub` strategy and a custom login view (`admin.components.views.login`
or a login button), `disableLocalStrategy: true`; (b) first sign-in creates a `users` shadow row
`{personId (hub sub), email, name}` with **no role fields**; (c) one collection's `read`/`update`
decided by an OpenFGA Check through the SEB SDK; (d) upload to the Hetzner bucket; (e) ro/en
with `fallback: false`. It is split so work can start now: **M0a** (no blockers)
covers boot, (d) and (e); **M0b** (needs B1 and B4) covers (a)–(c). **Launch and fallback:**
until M0b passes, the sites run on the `static` adapter, with clinician approval committed by
the owner. That fails R1/R2, so it is a dated stopgap. On no-go, the stopgap stays while a custom
Hono back office is built. The sites do not change; both sit behind `@psi/content`.

**Replacing the Payload-specific items in content-strategy.md:** Redirects → our own `Redirects`
collection (the plugin has no brand), enforced by `@psi/server` middleware. Embed on publish →
`afterChange` enqueues a Payload job → pgvector in the same CNPG (AI-guide phase; first confirm
the mirrored CNPG image ships `vector`). 12-month re-review → a daily jobs-queue task plus Novu.
**Multi-tenant plugin: not used** — its per-user `tenants` array is a second membership store,
which the Polaris rule forbids.

### Sign-in and permissions for the CMS
- `seb.app.yaml` `oidc: {client: cms, kind: confidential, redirectUris: [https://cms.{base}/api/auth/callback/hub]}`; SEB mints `HUB_CLIENT_ID/SECRET` into `secret/apps/cms/hub`.
- `apps/cms/authz.manifest.json`, module `cms`: object `cms_brand` (psizone | eqsync | hemisync,
  parent the psi organisation); relations `read`, `write`, `publish`, `clinical_review`,
  `manage_media`, `manage_redirects`, `admin`; roles `cms:editor`, `cms:publisher`,
  `cms:clinical_reviewer`, `cms:admin`. `estate/authz.json` already globs it; model id pinned.
- Access functions: `read` without a user is `{ _status: { equals: "published" } }`. With a
  user, `ListObjects(cms_brand, read)` becomes `{ brand: { in: […] } }`. `create`/`update` check
  `write`; publishing checks `publish`. Results are memoised per request. Nothing reads
  `org_roles`.
- The hub/OpenFGA SDK comes from `.seb-bundle/libs/npm/*.tgz`, installed under a psi alias
  (`"@psi/platform-authz": "file:…tgz"`) so no `rmx` import appears in psi. Blocked on B1.

### The clinical review gate
- On Hubs, Methods, Articles, KnowledgeEntries, FAQs and Pages with `clinical: true`. The
  `review` group is **localised** (each locale reviewed separately): `state` (`pending` |
  `changes_requested` | `approved`), `reviewer` → Practitioners, `reviewerPersonId` (hub sub,
  server-set), `approvedAt`, `approvedHash` (sha256 of that locale's content fields),
  `nextReviewDue` (+12 months), `notes`.
- Approval only through `POST /api/review/:collection/:id/:locale/approve` (or `/reject`), and
  only when a Check on `cms_brand:<brand>#clinical_review` passes, the person is linked to a
  Practitioner with `isClinician`, and the reviewer is not the author.
- `beforeChange` refuses `_status: "published"` unless every locale with a title is `approved`
  **and** its `approvedHash` matches; each refusal names its reason. Any edit after approval
  sets that locale back to `pending`.
- `reviewRequired` is forced true for Psizone and for `kind: health`. It is editable only for
  EQ-SYNC/Hemi-Sync `wellness`/`news` (Open question 6).
- Append-only `ReviewEvents` (who, what, hash, when). A daily job flags `nextReviewDue < now` and
  notifies the reviewer through Novu; it does **not** unpublish (Open question 5).

### Content model (fields that matter)

Common to every collection: `brand` (required), `slug` (localised, unique per brand+locale),
`title` and `seo{metaTitle, metaDescription, ogImage}` (localised); drafts and versions on;
localisation `ro` (default) / `en` with `fallback: false`.

| Collection | Fields that matter |
|---|---|
| **Hubs** | `path` (e.g. `/copii/autism`), `audience[]`, `intro` (short rich text), `sections` (blocks), `methods`↔, `faqs`, `articles` (join), `programmes`, `practitioners`, `review`, `localSeoCity` (Galați) |
| **Methods** | `summary`, `howItWorks`, `whatIsMeasured`, **`notSuitableFor` (required)**, `sessionFormat`, `hubs`↔, `explainerVideo`, `review` |
| **Articles** | `standfirst` (required, ≤60 words), `body` (allowed nodes only: h2, h3, p, lists, quote, link, image-with-caption, callout), `cover` (alt required), `kind` (health \| wellness \| news), `topics`, `hubs`, `methods`, `author` → Practitioners, `sources[]{label,url}` (required for health), `faq[]{q,a}`, **`nextStep` (required union)**, `readingMinutes` (computed), `backlogNo`, `review` |
| **Topics** (added) | `name`, `slug`, `hub?` (the Psizone hub it mirrors), `order` |
| **KnowledgeEntries** | `question`, `answer` (80–250 words, validated), `audience`, `hub`, `method`, `index` (psizone-clinical \| eqsync \| hemisync, kept separate), `sources`, `review` |
| **FAQs** | `question`, `answer` (short rich text), `hub` \| `method` \| `article`, `order`, `review` |
| **Programmes** (prices) | `kind` (evaluation, therapy programme, workshop, course, 21-day), `description`, `priceMode` (exact \| range \| on-request), `priceMin`, `priceMax`, `currency` (RON), `unit`, `sessions`, `durationMinutes`, `hubs`, `methods`, `validFrom`, `bookingRef` |
| **Practitioners** | `personId?` (hub sub; required to review), `name`, `credentials`, `registrationNo` (COPSI), `photo`, `bio`, `methods`, `hubs`, `languages`, `isClinician`, `listed`, `sameAs[]`. They double as authors |
| **Products** | `brand` (hemisync \| eqsync), `sku`, `type` (audio, CD, book, course), `description`, `price`, `media`, `trademarkNote`, `externalUrl`. Catalogue only: no checkout in the MVP |
| **Events** | `kind`, `startsAt`/`endsAt` (Europe/Bucharest), `location` \| `online`, `programme` (price), `facilitators`, `capacity`, `registrationUrl`, `archiveGroup` (one archive per workshop type) |
| **AudioTracks** | `brand`, `file` (**private** bucket), `durationSec`, `programmeDay` (EQ-SYNC 1–21), `focusLevel`, `access` (public \| signed-in \| purchased), `licence` (Monroe confirmation), `transcript`/`summary`. Served by signed URL |
| **Pages** | `path`, `blocks` (hero, text, cards, FAQ ref, CTA), `clinical` (adds `review`). The editorial-policy page is one of these |
| **Redirects** | `brand`/`host`, `from` (path), `to` (path or URL), `status` (301 \| 308), `source` (`wp-import` \| manual) |
| Media, Users, ReviewEvents, global `SiteChrome` per brand (nav, footer, NAP) | supporting collections |

Media → `psi-media-<env>` (public-read, Payload image sizes); audio → `psi-audio-<env>` (private).
Both declared in `storage:`, credentials `platform/object-storage/<env>`, endpoint
`OBJECT_STORAGE_ENDPOINT` from `estate/identity.yaml`.

### The typed interface the sites consume — `packages/content` (`@psi/content`)

```ts
// zod schemas are the source; types are inferred from them. In production only PUBLISHED, REVIEWED
// (per locale) entries cross this interface: the adapter filters, the schema re-asserts.
export interface ContentSource {
  article(q: { brand: Brand; locale: Locale; slug: string }): Promise<Article | null>;
  articles(q: { brand: Brand | "all"; locale: Locale; topic?: string; page: number; size: number }): Promise<Paged<ArticleSummary>>;
  topics(q: { brand: Brand; locale: Locale }): Promise<Topic[]>;
  person(q: { locale: Locale; slug: string }): Promise<Practitioner | null>;
  hub(q: …): Promise<Hub | null>; method(q: …): Promise<Method | null>; page(q: …): Promise<Page | null>;
  programmes(q: …): Promise<Programme[]>; events(q: …): Promise<Event[]>; chrome(q: { brand: Brand; locale: Locale }): Promise<SiteChrome>;
  redirect(q: { host: string; path: string }): Promise<Redirect | null>;
  alternates(q: { kind: Kind; id: string }): Promise<Partial<Record<Locale, string>>>;
}
```

- **The body is source-neutral**: `RichBlock[]`, a small AST matching what `Prose` renders —
  `heading(2|3)`, `paragraph(inline[])`, `list`, `quote`, `figure(Media)`, `callout`; inline
  `text{bold, italic}`, `link{href, external}`. Never Lexical JSON, Markdown or HTML.
- **Review shape** (psizone-web's, kept): `review: {status: "draft" | "approved", author, reviewedBy: PersonRef, lastReviewed: Date}`. `approved` requires both, and it is required on every health entry. Production adapters return only `approved`; `{includeDrafts: true}` exists for staging only.
- **`@psi/content` absorbs psizone-web's port** (`src/content/source/types.ts`, its schemas) so all
  sites share one. **Adapters**: `static` (typed in-repo modules, parsed at boot; launch source and
  test data; seeded with the 20 backlog stubs and the editorial-policy page);
  `payload` (REST `GET /api/<collection>?where…&locale=…&depth=1`, Lexical → `RichBlock`, zod,
  throws on drift). One **contract test suite** runs against every adapter: changing the source
  means writing one adapter that passes it.
- Caching in `@psi/server`: in-process LRU, 60 s TTL, stale-while-revalidate; a CMS
  `afterChange` → `/_hooks/revalidate` (HMAC) webhook after the MVP. Draft preview: a signed
  short-lived link from the CMS; the adapter in draft mode with a server-side key, never cached.

**Migration path:** (0) static → Payload cutover: import the typed modules and carry each entry's `reviewedBy`/`lastReviewed` into its `review` record (`approved`, hash computed at import), so nothing falls back to pending; then set `CONTENT_SOURCE=payload`; (1) AI guide: pgvector + embed jobs, separate indexes per
`index`; (2) per-locale publish status once `localizeStatus` leaves beta; (3) WordPress import
into drafts + Redirects from `tools/audit` output; (4) the revalidate webhook; (5) per-brand blogs
(config only); (6) if Payload's admin stops paying for itself, a custom Hono back office over the
same Postgres — the sites are untouched because of `@psi/content`.


## (C) The shared psi web-app scaffold

SEB's `pnpm new-app` writes `apps/<n>/{package.json, tsconfig, src/main.ts (bare node:http),
Dockerfile, seb.app.yaml}`, `gitops/services/<n>/{base, overlays/<env>}` and
`gitops/apps/overlays/<env>/apps/<n>.yaml`. psi needs Hono/TSX/Tailwind/Paraglide/Datastar four
times over and **must not write `gitops/apps/`** (genesis owns it). **Recommendation: build
`tools/new-app` in psi** (`pnpm new-app <name>`), but small, after `@psi/server`. It keeps SEB's
rules (kebab-case, refuses an existing name, registry/domain/envs from `estate/identity.yaml`,
biome format, prints the registration notice) with psi's template. All four web apps are
already being written by hand, so its payoff is later apps (booking, portal) and a golden test
that pins the shape. The real guard against drift is **`@psi/server`**: shared plumbing keeps
each app's skeleton thin.

### Layout (the committed `apps/psizone-web` slice is the reference; additions marked +)
```
apps/<name>/
  package.json  tsconfig.json  project.inlang/settings.json  messages/{ro,en}.json
  + project.json  + vitest.config.ts  + Dockerfile  + seb.app.yaml
  + authz.manifest.json      # sites: declares no protected resources (as the siblings plan); cms: module `cms`
  src/server.tsx             # exports `app` (tested in-process via app.request); serve() unless NODE_ENV=test
  + src/env.ts               # zod schema of this app's env, parsed first thing (fail loud)
  src/i18n.ts                # Locale type, at(locale), base(locale); + src/i18n/routes.ts route table
  + src/routes/*.tsx         # one file per route group, handlers only; server.tsx mounts them
  src/layout.tsx  src/pages/*.tsx  src/sections/*.tsx   # Hono JSX composed only from @psi/ui
  + src/content/*.ts         # this app's queries over @psi/content (no fetch anywhere else)
  src/styles.css  src/paraglide/ (generated, gitignored)  public/assets/
gitops/services/<name>/base/{kustomization,deployment,service,ingress,externalsecret,harbor-pull-externalsecret}.yaml
gitops/services/<name>/overlays/dev/kustomization.yaml   # host patches, whitelabel image; CI moves newTag
```

**i18n, as committed**: one inlang project **per app**. `@psi/ui` holds no strings; its components
take already-translated text as props. The locale is passed explicitly (`m.key({}, at(locale))`),
so no AsyncLocalStorage middleware is needed. The CLI is `paraglide-js compile --project
./project.inlang --outdir ./src/paraglide`.

### Shared packages (they export TS source; apps bundle them)

| Package | State | Responsibility |
|---|---|---|
| `@psi/ui` | exists | Hono JSX components (Logo, NavBar, Prose(children), ArticleCard, Chip, Button, GuideMessage, ThemeToggle …), `datastar.js` v1.0.5 vendored. **Add for the blog**: `RichText` (renders `RichBlock[]` inside `Prose`), `Breadcrumbs`, `ReviewMeta` (author · reviewer · date) |
| `@psi/server` | new | Shared plumbing so four apps cannot drift: `parseEnv(schema)` (fail loud), `proxyBlog()` (pathBase → blog-web Service), `/healthz`, `/assets/*` (Datastar + hashed CSS, immutable), security headers (CSP `script-src 'self'`), theme cookie, redirects middleware, localised 404/500, the content LRU cache, SIGTERM drain |
| `@psi/content` | new | (B) above |
| `@psi/seo` | new | JSON-LD builders, canonical/hreflang, RSS 2.0, sitemaps |

### Scripts and Nx targets (`project.json` with `nx:run-commands`, as CLAUDE.md requires)

| Target | Command | Notes |
|---|---|---|
| `build` | `i18n` → `css` (`tailwindcss -i src/styles.css -o public/assets/app.css --minify`) → `esbuild src/server.tsx --bundle --platform=node --format=esm --target=node24 --outfile=dist/server.js` → copy `public/` and `@psi/ui/datastar.js` into `dist/` | **Finding:** psizone-web builds with `--packages=external`. That leaves `@psi/ui` (exported as `.ts`/`.tsx` source with extensionless imports) for Node to load at runtime, which it cannot: `import('@psi/ui')` from `apps/psizone-web` fails with `ERR_MODULE_NOT_FOUND` (checked 2026-11-11). Bundle the workspace packages (drop the flag, or `--external` only third-party packages) and read Datastar from `dist/`, not through `import.meta.resolve` |
| `dev` | `pnpm i18n && pnpm css && (pnpm css:watch & tsx watch src/server.tsx)` | As committed |
| `test` | `vitest run --maxWorkers=4` | `app.request()`; no markup snapshots |
| `type-check` | `pnpm i18n && tsc --noEmit` | |
| `lint` | `biome check --config-path .mono/biome.json apps/<n>` | From the workspace root |

Versions: `hono@^4.13.18`, `@hono/node-server` (as committed, `^1.19`; 2.x is a separate
upgrade), `@starfederation/datastar-sdk@1.0.0` (SSE), `@inlang/paraglide-js@^3.2.2`,
`tailwindcss`/`@tailwindcss/cli@^4.3.5`, `zod`, `esbuild`, `tsx`. **tsconfig**: as committed
(`"jsx": "react-jsx"`, `"jsxImportSource": "hono/jsx"`, `"noEmit": true`,
`"noUncheckedIndexedAccess": true`). **Tailwind 4**: `styles.css` imports `tailwindcss` and the
`@psi/design`/`@psi/ui` CSS, with `@source` on `packages/ui/src` (a symlinked workspace package is
not scanned otherwise). **Datastar**: `/assets/datastar.js` from `@psi/ui`; SSE handlers use
`ServerSentEventGenerator` from `@starfederation/datastar-sdk`.

### Health, secrets, image, declaration
- **Health**: `GET /healthz` → `200 ok`, with no dependency on the CMS (readiness and liveness).
  Content outages are served from the stale cache.
- **Secrets fail loud, four layers** (as `gitops/services/changelog/base/externalsecret.yaml`
  and rmx `flow-platform`): `src/env.ts` zod at boot prints `MISSING REQUIRED SECRET: <KEY>` per
  key, then `process.exit(1)`; the ExternalSecret uses per-key `data[].remoteRef.property`
  (`dataFrom.extract` only for optional keys); an `assert-secrets` busybox initContainer runs one
  literal `[ -n "${KEY:-}" ]` per key (never an `eval` loop); a row in `estate/APP-SECRETS.md`.
  blog-web requires `PREVIEW_HMAC_SECRET` only from M6 on (plain config: `CONTENT_SOURCE`, `CONTENT_API_URL=http://cms.cms.svc`).
  cms requires `DATABASE_URL` (composed by ESO from `apps/cms/db`), `PAYLOAD_SECRET`,
  `HUB_CLIENT_ID/SECRET`, `S3_ACCESS_KEY_ID/SECRET_ACCESS_KEY`, `AUTORIZARE_*`.
- **Dockerfile** (build context: the repository root):
  ```dockerfile
  ARG REGISTRY_HOST
  ARG REGISTRY_PROJECT_MIRROR
  FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-slim@sha256:<pin> AS build
  WORKDIR /repo
  RUN corepack enable
  COPY . .
  RUN pnpm install --frozen-lockfile --filter @psi/<n>... && pnpm exec nx run @psi/<n>:build
  FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-slim@sha256:<pin>
  WORKDIR /app
  COPY --from=build /repo/apps/<n>/dist ./dist
  ENV NODE_ENV=production PORT=8080
  USER 1000
  EXPOSE 8080
  CMD ["node", "dist/server.js"]
  ```
  Neither ARG has a default: an empty registry fails the `FROM` loudly. `node:24-slim` matches the
  sibling plans, and the image is pinned by digest. Bundled, the runtime needs no `node_modules`.
  A root `.dockerignore` excludes `node_modules`, `dist`, `.nx` and `.env*`. `apps/cms` differs:
  a Next standalone build.
- **seb.app.yaml** (validated against SEB's `schema/app.schema.json`): `schema: seb.app/v1`,
  `key`/`name`/`namespace` = `<n>`; `components[0]` = `{path, gitops: gitops/services/<n>,
  image: psi/<n>, port: 8080, hosts: [{prefix, exposure: public, ingress: <n>}] (sites only; blog-web none), workloads:
  [{kind: Deployment, requiredEnv, initContainers: [assert-secrets], probes: /healthz}]}`;
  `secrets`, `externalSecrets`, `health.secretChecks`, `ci.workflows: [{file: apps.yml, bumps:
  [gitops/services/<n>]}]`. cms adds `oidc`, `authz`, `databases: [{kind: cnpg, name: cms-db}]`,
  `storage`.
- **gitops/services/<n>**: Deployment with `runAsNonRoot`, `imagePullSecrets: harbor-pull`,
  `reloader.stakater.com/auto`, `alerts.psizone.ro/owner`; Ingress on traefik +
  `cert-manager.io/cluster-issuer: letsencrypt-prod`, host patched per overlay. **blog-web has no
  Ingress**: only a ClusterIP Service that the sites call. The overlay follows psi's own
  `gitops/services/changelog` convention (whitelabel component + `images: [{name:
  WLREGISTRY/WLAPPS/<n>, newTag: "unbuilt"}]`, which CI moves), as the sibling plans do.
  Registration (the Argo Application under `gitops/apps/overlays/dev/` and its kustomization
  entry) is **not** in this plan: genesis owns that tree (B2). The psizone/hemisync plans list
  that edit; the owner decides who makes it (Open question 9).
- **CI**: psi has no `.github/`. Adopt SEB's `tools/estate/scaffold/.github/workflows/apps.yml`
  (branches `[dev]`): it builds each changed app with a Dockerfile, pushes
  `registry.psizone.ro/psi/<n>:<sha7>` and bumps the overlay. Needs the `k8s` runner and the
  OpenBao repository variables (B3).


## Where this differs from the sibling plans (psizone-web, eqsync-web, hemisync-web)

| Topic | Sibling plan | This plan | Resolution |
|---|---|---|---|
| Image build | psizone-web: `tsc` + `pnpm deploy --prod` | one bundled `dist/server.js` | **This supersedes it** (and fixes `--packages=external`, see (C)) |
| Content port | psizone-web: `src/content/source/types.ts` per app | `@psi/content`, shared | C1 defines the shared port from psizone-web's field names; psizone-web imports it |
| Articles | hemisync: own pages (P6); eqsync: `/blog/*` 301 out | blog-web behind each site's proxy | Open question 10 |
| Argo registration | the app tasks write `gitops/apps/overlays/dev/*` | genesis owns that tree | Open question 9 |
| Port | psizone/eqsync plans: 3000; committed server defaults to 4310 | 8080 (SEB template) | Any one value, set by `PORT` in the Deployment and declared as `port:` in `seb.app.yaml`; pick 8080 for every psi web app |
| CI | psizone-web plan: per-app `psizone-web.yml` | one shared `apps.yml` | Shared `apps.yml` (SEB scaffold): one workflow, every app with a Dockerfile |
| blog-web | being scaffolded now, independently: no server yet, `--packages=external` copied | proxied, internal-only, bundled | The builder adopts (A) + (C); P1 covers its build flag |

## Build task list (for parallel builders)

**Blockers outside the builders** (owner, genesis or SEB): **B1** pin `estate/platform.lock` and
install `.seb-bundle` (unblocks the hub/OpenFGA SDK) · **B2** genesis lists `apps/` in
`gitops/apps/overlays/dev` and writes the registrations (deploys) · **B3** GitHub `k8s` runner +
`OPENBAO_*`/`REGISTRY_PUSH_SECRET`/`GIT_PUSH_SECRET` variables (CI) · **B4** hub provisioned for
psi (`login.psizone.ro`) and the `cms` client minted (the spike's live run).

Rules for every task: green `build`, `lint`, `type-check` and `test` for the project; files of
500 lines or fewer; no `any`/`!`/casts; every user-facing string through the app's Paraglide messages.

| ID | Task | Paths | Depends | Acceptance |
|---|---|---|---|---|
| P1 | Fix the image build in every app that copied `--packages=external` (psizone-web, blog-web, any sibling): bundle `@psi/*`, copy `datastar.js` into `dist/`, add `project.json` (build, dev, test, type-check, lint) | `apps/*-web/{package.json,project.json}`, `src/server.tsx` | — (coordinate with each app builder) | `node dist/server.js` runs from a folder holding only `dist/` and serves `/healthz` and `/assets/datastar.js` |
| P2 | `@psi/server`: `parseEnv`, healthz, assets (immutable), CSP, theme cookie, `proxyBlog()`, redirects middleware and content cache (both take injected functions, so no dependency on C1), localised 404/500/503, SIGTERM | `packages/server/` | — | Tests: a missing key prints the named message and exits 1; healthz 200; CSP header; proxy forwards `X-Psi-Brand` + origin and times out to 503; cache serves stale while the source is down |
| P3 | Datastar integrity: record the sha256 of `packages/ui/assets/datastar.js` (tag v1.0.5) and test it | `packages/ui/assets/`, `packages/ui/src/*.test.ts` | — | The test fails on any byte change; the header comment says v1.0.5 |
| P4 | ui additions for the blog: `RichText` (`RichBlock[]` inside `Prose`), `Breadcrumbs`, `ReviewMeta` | `packages/ui/src/components/` | C1 | RichText emits only the allowed tags; external links get `rel="noopener"`; no strings inside ui (props only); `Logo` with an explicit `brand` under `blog-*` shows that brand |
| C1 | `@psi/content`: define the schemas and `ContentSource` (Hub, Method, Practitioner, FAQ, Article, Topic, Page, SiteChrome, RichBlock, review shape) from psizone-web's typed modules (`src/content/{hubs,team}.ts`) and its plan §3 field names; psizone-web imports it | `packages/content/src/`, `apps/psizone-web/src/content/` | — (coordinate with the psizone-web builder) | Health entry without `reviewedBy`+`lastReviewed` fails to parse when `approved`; boundary tests (empty, max standfirst, diacritics); psizone-web green on the shared port |
| C2 | `static` adapter + reusable contract suite; seed the 20 backlog stubs (wave 1 flagged, each mapped to a hub or method) and the editorial-policy page | `packages/content/src/adapters/static/`, `…/contract/` | C1 | Contract suite passes; production mode never returns drafts; `includeDrafts` only in staging; en absent → `null` |
| C3 | payload adapter (REST → zod, Lexical → `RichBlock`) | `packages/content/src/adapters/payload/` | C1, M2 | Contract suite green against recorded Payload responses and one live dev run; unknown Lexical node → named error |
| S1 | `@psi/seo`: Article/BlogPosting, MedicalWebPage, Person, Organization/MedicalClinic, BreadcrumbList, FAQPage, Event; hreflang/canonical; RSS; sitemap | `packages/seo/` | C1 | Required properties present per Google's structured-data docs; RSS has valid RFC-822 dates; hreflang only for existing locales |
| G1 | `tools/new-app` generator: template = the fixed psizone-web skeleton + `@psi/server` + `env.ts`, Dockerfile, `seb.app.yaml`, `gitops/services/<n>`; golden test | `tools/new-app/` | P1, P2 | Generates into a temp workspace and build/test/type-check/lint pass there; refuses a bad or existing name; writes only `apps/<n>` + `gitops/services/<n>`; prints the registration notice |
| CI1 | CI workflow from SEB's scaffold + root `.dockerignore` | `.github/workflows/apps.yml`, `.dockerignore` | — (live: B3) | actionlint clean; `docker build` of blog-web with both build args succeeds locally |
| A1 | blog-web routes (listing, pagination, topic, article, author, `toate`, rss, sitemap, `_assets`), `brands.ts`, theme toggle; brand from `X-Psi-Brand` | `apps/blog-web/src/` | P1, P4, C2, S1 | Every route in (A) answers in ro and en under each `pathBase`; one next step per article; Logo = the proxying brand; works with JS disabled; missing/unknown brand header → 404 |
| A2 | blog-web `seb.app.yaml` (no `hosts`) + `gitops/services/blog-web` (ClusterIP Service only, ExternalSecret `data[]`, assert-secrets) | `apps/blog-web/seb.app.yaml`, `gitops/services/blog-web/` | P1 | `kubectl kustomize overlays/dev` renders, with no Ingress; the yaml validates against SEB's `app.schema.json` |
| A3 | Mount `proxyBlog()` in each site at its `pathBase` (+ `/en`) | `apps/{psizone,eqsync,hemisync}-web/src/server.tsx` | P2, A1 (coordinate with each site builder) | Proxied pages carry the site's brand and public origin; site `/healthz` does not depend on blog-web; blog-web down → the site's localised 503, not a hang |
| M0a | **Spike, no blockers**: Payload 3.93 boots on Node ≥24.22.1 + Next 16 against a local Postgres; storage-s3 upload to the bucket; ro/en `fallback: false`; one collection with drafts | `apps/cms/` (spike branch) | — | Evidence for boot, (d), (e) in (B) |
| M0b | **Spike, platform half**: hub OIDC custom strategy + login view, `disableLocalStrategy`, users shadow row, one OpenFGA access function | `apps/cms/` (spike branch) | M0a, B1, B4 | A go/no-go note covering (a)–(c), each with evidence |
| M1 | `apps/cms/authz.manifest.json` (module `cms`) | `apps/cms/authz.manifest.json` | — (generation: B1) | Validates against the manifest schema the rmx manifests use; generation through SEB's `authz/tools/generate.py` once B1 lands (`estate/authz.json` still names rmx-era modules to fix first) |
| M2 | Collections + globals (one file each) | `apps/cms/src/collections/*.ts` | M0b go | Fields as in (B); localisation `fallback: false`; no role fields on users |
| M3 | Clinical review gate: review group, approve/reject endpoints, hash check, ReviewEvents | `apps/cms/src/review/` | M1, M2 | Each refusal reason is its own test and asserts nothing was written; an edit after approval returns the locale to `pending` |
| M4 | Re-review job + Novu notification | `apps/cms/src/jobs/` | M3 | Overdue items flagged, the reviewer notified, nothing unpublished |
| M5 | cms deploy: Dockerfile (Next standalone), `seb.app.yaml` (oidc, authz, cnpg, storage), `gitops/services/cms` incl. CNPG cluster | `apps/cms/`, `gitops/services/cms/` | M0a | Renders; secrets fail loud at the env, ExternalSecret and initContainer layers |
| M6 | Signed draft preview cms → blog-web (adds `PREVIEW_HMAC_SECRET` as required) | `apps/cms/src/preview/`, `apps/blog-web/src/routes/preview.tsx` | A1, M3 | Expired or forged token → 403; preview responses `no-store` |
| M7 | Static → Payload cutover: import typed modules with their review records | `apps/cms/src/import/` | C2, C3, M3 | Every imported approved entry stays `approved` with matching hash; contract suite gives identical results on both adapters for the imported set |

Parallel waves: ① P1, P2, P3, C1, CI1, M1, M0a → ② P4, C2, S1, G1, A2 → ③ A1 (+ M0b once B1/B4
clear) → ④ A3, M2 → ⑤ C3, M3, M5 → ⑥ M4, M6, M7.


## Open questions for the owner
1. **One shared blog, or one per brand?** The plan works either way. Keep `/blog/toate`?
   Recommended: yes, until traffic says otherwise.
2. **React exception for `apps/cms`** (back office only), written into CLAUDE.md? Recommended:
   yes, scoped to that folder; the alternative, a custom back office, costs months.
3. **Domains**: when does the apex psizone.ro leave the old WordPress? Who controls DNS for
   eq-sync.ro and hemi-sync.ro (outside the estate zone)? Are the staging hosts `nou`/`eqsync`/`hemisync`.psizone.ro fine?
4. **Clinical reviewers**: who are they? Each needs a hub account with mandatory TOTP (doc 18).
5. **Overdue re-review**: flag and notify only (recommended), an "under review" note, or unpublish?
6. **EQ-SYNC / Hemi-Sync articles**: clinical review for all, or only those with health claims?
7. **English at launch**, or ro first? Each locale needs its own review.
8. Still open from before: Monroe licensing for AudioTracks; exact prices or ranges; the centre's
   address (the NAP shown on every page).
9. **Argo registrations**: genesis or the app tasks? (Differs table.)
10. **Who renders Hemi-Sync/EQ-SYNC articles**: blog-web behind each site's proxy (recommended), or the siblings' own pages / 301? (Differs table.)
