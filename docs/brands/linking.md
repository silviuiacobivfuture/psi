# Linking between the psi sites

How the four public sites link to each other, and what each one may say about the others. The owner
asked for "more content/visibility, proper linking and synergy between the platforms" (2026-11-12);
this page is that decision written down, and the code follows it.

## The sites

| Site | App (local) | Env var (canonical origin) | Dev/staging host today |
| --- | --- | --- | --- |
| Psizone | `apps/psizone-web` (:4310) | `PSIZONE_URL` | `landing.psizone.ro` |
| EQ-SYNC | `apps/eqsync-web` (:4320) | `EQSYNC_URL` | `eqsync.psizone.ro` |
| Hemi-Sync România | `apps/hemisync-web` (:4330) | `HEMISYNC_URL` | `hemisync.psizone.ro` |
| Blog | `apps/blog-web` (:4340) | `BLOG_URL` | `blog.psizone.ro` |

Each app parses all four variables with zod at boot (`src/estate.ts`); unset means the local port
above, a malformed value stops the boot. Production sets them to the brands' own domains (psizone.ro,
eq-sync.ro, hemi-sync.ro, and the blog's host) when those cut over. Every canonical URL, hreflang,
sitemap `<loc>` and estate link is built from these origins, never from the request's host.

## The rules

1. **The estate row.** Every site's footer carries one quiet line, *Psizone · EQ-SYNC · Hemi-Sync
   România · Blog*, each in its own name and linking to that site's home in the visitor's language
   (`/` or `/en`). The current site is marked, not removed. Component: `EstateRow` in `@psi/ui`,
   links from `estateLinks()`. The row's label is neutral ("Site-uri înrudite" / "Related sites"),
   never "our sites", because the sites do not all have the same operator (rule 4).
2. **Psizone's clinical pages are hubs, not shop windows.** They never carry EQ-SYNC or Hemi-Sync
   promotion in their body (brand book: "keep Hemi-Sync and EQ-SYNC in their own themes"; CONTEXT:
   Psizone's guide never recommends Hemi-Sync for clinical questions). A sister brand appears on
   Psizone only in: the footer row, `/povestea` (the owners' story names EQ-Sync as one of their own
   patented methods), and the compass group of rule 5.
3. **EQ-SYNC is Psizone's own method.** EQ-SYNC may say so, and it sends clinical questions to
   Psizone (its compass hint for Psizone says exactly that). Its structured data still names its own
   trader, EQSYNC SRL, with no parent relation to Psizone.
4. **Hemi-Sync România has a different operator.** The live footer and T&C name *Nicoară Eniko Ritta
   Întreprindere Familială* (CUI 17297241), not the Galați team (`docs/plans/hemisync-web.md`, finding
   2). Hemi-Sync links to the other sites only through the footer row, its compass group (rule 5,
   neutral label) and the blog, and nothing on it implies that Psizone runs it. Its JSON-LD carries
   only its name and URL. **Owner sign-off: pending** (see open decisions).
5. **The compass** on every site has a group of the other sites (`estateGroup()` in each app's
   `src/estate.ts`, passed through the Compass `groups` prop): "Alte site-uri" / "Other sites", and on
   the blog "Site-urile mărcilor" / "The brands' sites". There is no navbar; the owner rejected them.
6. **The blog.** Every article belongs to one brand (`brand` field) and its one next step links back
   to that brand's site (`apps/blog-web/src/pages/article.tsx`, `nextStep`). The feed is built
   separately and is not part of this layer.

Nothing else cross-links. In particular: no sister-brand banners, no "partner" badges, no `sameAs`
or `parentOrganization` between the brands in structured data, no `rel=nofollow` on estate links
(they are ordinary links between related sites).

## Visibility (what every page's head carries)

- `<link rel="canonical">` on the site's own origin; `hreflang` for `ro`, `en` and `x-default`
  (= Romanian) only when both versions exist.
- Open Graph (`og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:locale` +
  alternate) and Twitter (`summary` until real share images exist), plus `theme-color` from the
  current theme's `bg` token.
- JSON-LD: `WebSite` + the organization on home pages; `BreadcrumbList` on every other page.
  Psizone is a `MedicalClinic` (also on `/contact`) with the address and phones the live
  psizone.ro/contact published; EQ-SYNC an `Organization` with its trader data; Hemi-Sync name + URL
  only. The builders print facts and never supply one: no postal code, hours, logo, share image or
  legal name until they exist.
- `/sitemap.xml` on every site: the app's parameter-free GET routes (plus, on the blog, every
  published article) are rendered in-process when the sitemap is requested, and each one that
  answers `200` with HTML, has a canonical and is not `noindex` becomes an entry with the
  canonical and hreflang alternates its own head printed. Pages other changes add appear without
  editing the sitemap; redirects (old slugs), 404 placeholders, feeds and drafts drop out; and
  translated English slugs pair exactly. Cached for an hour (`cache-control`).
- `robots.txt` names the sitemap **only** when `PSI_ALLOW_INDEXING=true`. The default stays: every
  response carries `X-Robots-Tag: noindex, nofollow` and robots.txt disallows everything.

Code: `packages/ui/src/{estate.ts,components/estate-row.tsx,seo/*,robots.ts}` and, per app,
`src/estate.ts` and `src/seo.tsx`.

## Open owner decisions

1. **Hemi-Sync operator sign-off.** Recorded as *pending*, not given: the brief that set rule 4 is not
   the owner's approval, and `docs/plans/hemisync-web.md` question 1 is still open. Confirm Nicoară
   Eniko Ritta Î.F. operates hemi-sync.ro (merchant, data controller) and that rule 4 is right;
   `CONTEXT.md` still says one team runs all three brands. Once confirmed, change "pending" in rule 4
   to the date of sign-off.
2. **Hemi-Sync in the compass.** Rule 4 says "only footer row and blog", rule 5 says "a compass group
   on every site". The build follows rule 5 with a neutral label; say if Hemi-Sync's compass should
   drop the group.
3. **Psizone's address.** Gen. Alexandru Cernat 126 (live site, used in JSON-LD) or Al. I. Cuza 72
   (2024 press)? Postal code, opening hours and the legal entity's name are missing.
4. **Production origins.** Set the four `*_URL` variables in each deployment (dev hosts above; the
   brand domains at cutover), and `PSI_ALLOW_INDEXING=true` only in production.
5. **EQ-SYNC on Psizone's compass.** The compass sheet also shows on hub pages; the group is outside
   the page body, as rule 2 allows. A comment in `apps/psizone-web/src/sections/header.tsx` says the
   compass never names EQ-Sync on hub pages: the estate group now does. Say if hub pages should hide it.
8. **`/metode/eq-sync` on Psizone.** The Psizone content draft has a non-clinical method page for
   EQ-Sync (kept off hubs and the compass) that links to a hard-coded `https://eq-sync.ro/`. It is a
   fourth place EQ-SYNC appears on Psizone beyond rule 2's three, and it bypasses `EQSYNC_URL`
   (`docs/plans/psizone-web.md` question 10: method page or only a link?). Owner to decide; the link
   should come from `ESTATE.eqsync` either way.
6. **Share images.** No real OG image exists for any brand; cards stay `summary` until one does.
7. **The blog's copyright line** reads "© {year} Psizone, EQ-SYNC și Hemi-Sync România", which
   attributes the blog's rights to all three jointly. Under rule 4 it may need to name the
   publisher only (and each article's brand its own text). Unchanged until the owner decides.
