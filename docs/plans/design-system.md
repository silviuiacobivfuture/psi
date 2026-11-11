# Plan: the psi design system (`@psi/design` + `@psi/ui`)

Status: plan, not built. Date: 2026-11-11. Scope: the design language and the component library every
psi app renders with. Stack is decided (CLAUDE.md): Node 24, Hono + `hono/jsx` server-rendered TSX,
Datastar v1.0.5, `@starfederation/datastar-sdk` 1.0.0, Tailwind 4.3, Paraglide JS 3, pnpm + Nx + Biome.

## 0. Where we start

- `packages/design/tokens.json` is the source of truth: 8 themes x 24 colour roles, 3 per-theme
  shadows, 12 type styles (5 display-family), 4 families, `space-1`..`space-10`, 5 radii, 2 blurs.
- `components.js` and `index.d.ts` are the React 18 originals. They are a **reference only** and are
  deleted once `@psi/ui` covers them (task X1).
- **A spike is already in the tree (uncommitted)**: `packages/design/scripts/build-theme.mjs` and
  `theme.generated.css`; `packages/ui/src/components/*.tsx` (18 ports + ThemeToggle) styled by the
  kit's `.pz-*` CSS, moved to `packages/ui/src/components.css`; `packages/ui/assets/datastar.js`
  (v1.0.5); `apps/psizone-web`. This plan **keeps** the spike's direction (generated `@theme inline`
  colour roles, `data-theme` blocks, server-rendered TSX, vendored Datastar) and **changes** five
  things: Datastar attributes go through a typed helper (spike: `attrs: Record<string,string>`, and
  `@post('${action}')` built by string interpolation); styling moves to Tailwind utilities; brand
  differences become tokens; fonts are self-hosted; tests and gates exist. Tasks below say which spike
  file each one adopts.

Verified against current docs (2026-11-11): Datastar attribute syntax is `data-on:click`,
`data-bind:x` or `data-bind="x"`, `data-signals:x` or object form, `data-attr:`, `data-class:`,
`data-style:`, `data-show`, `data-text`, `data-indicator:`, `data-ref:`, `data-on-intersect`,
`data-init`; modifiers `__prevent`, `__debounce.500ms`, `__throttle`, `__once`; signals with a
leading `_` are not sent to the backend; GET sends signals as the `datastar` query parameter, other
methods as a JSON body (data-star.dev/reference/attributes, /actions). Expressions are compiled with
`Function()`: the policy needs `'unsafe-eval'` **or** Datastar's nonce mode (the 1.0.5 bundle reads a
nonce from `<html>`; data-star.dev/reference/security). The SDK's `/web` entry
(`ServerSentEventGenerator.stream`, `readSignals`, `patchElements(html, {selector, mode})`,
`patchSignals`) fits Hono's Request/Response. `hono/jsx` uses `class` (not `className`), `style` as
object or string, and its `JSX.HTMLAttributes` carries an `[attributeName: string]: any` index
signature (hono 4.13 `intrinsic-elements.d.ts`), so **any** attribute compiles and none is checked.
Tailwind 4: `@theme`, `@theme inline` (for values that reference other variables), `@theme static`,
`--color-*: initial` to clear a namespace, and `--text-<name>--line-height|--letter-spacing|--font-weight`
companions (tailwindcss.com/docs/theme, /font-size).

## 1. Token pipeline

**One generator, three outputs, all committed.** `packages/design/scripts/build-theme.ts` (TypeScript,
run by Node 24's type stripping; replaces the spike's `.mjs`) parses `tokens.json` with a zod schema
(`packages/design/src/schema.ts`) and writes:

1. `packages/design/theme.generated.css`, exported as `@psi/design/theme.css`.
2. `packages/design/src/tokens.generated.ts`: the closed scales as `as const` arrays plus their union
   types (`THEMES`, `BRANDS`, `COLOR_ROLES`, `TYPE_STYLES`, `SPACE_STEPS`, `RADIUS_STEPS`,
   `SHADOWS`), exported as `@psi/design/tokens`. Components type their props from these.
3. `packages/design/PALETTE.md` (it already claims to be generated; make it true, including the
   contrast table from section 3).

Committed, not built on demand, because Tailwind's CLI in every app `@import`s the CSS by package
path without a pre-build, reviewers see token changes as CSS diffs, and the editor resolves the TS.
Biome already ignores `**/*.generated.*`. Drift is a test failure, not a convention (below).

**Additions to `tokens.json`** (done in D1, values lifted from the kit CSS, nothing invented):

- Each theme entry gains `brand` (`psizone|eqsync|hemisync|blog`) and `mode` (`dark|light`), so the
  generator never parses ids.
- A `brand` group of **per-theme non-colour tokens**, emitted in every theme block under a `pz-`
  prefix: `pz-body`, `pz-label` (Manrope / IBM Plex Mono / Inter / Manrope), `pz-label-tracking`
  (`0.005em`, EQ-SYNC `0.02em`), `pz-label-size` (EQ-SYNC 13px), `pz-radius-card` (`radius-lg`,
  EQ-SYNC `radius-md`), `pz-ambient-opacity`, `pz-ambient-duration` (22s / sway / 60s / none). This
  replaces the `[data-theme^="eqsync"] .pz-btn {…}` override blocks: a brand changes values, not
  selectors. A new brand token goes into all eight themes or none (the zod schema enforces it).
- `fontSizeMin` on the five display-family styles (the spike hard-codes 52/40/32/26/22 in the script;
  those numbers move into data and need the owner's confirmation, see Q3).
- A `contrast` list: the pairs the brand books promise, with minimums (section 3).

**Generated CSS layout:**

```css
:root, [data-theme="psizone-dark"] { color-scheme: dark; --bg: #0A1013; …24 roles, 3 shadows, 7 pz-* }
[data-theme="psizone-light"] { color-scheme: light; … }      /* one block per further theme */
@custom-variant dark (&:where([data-theme$="-dark"], [data-theme$="-dark"] *));
@custom-variant eqsync (&:where([data-theme^="eqsync"], [data-theme^="eqsync"] *));  /* + 3 brands */
@theme {                                    /* resets FIRST: a later reset would wipe earlier names */
  --color-*: initial; --spacing-*: initial; --radius-*: initial; --text-*: initial;
}
@theme inline {                             /* closed palette: no bg-red-500 */
  --color-bg: var(--bg); --color-surface-1: var(--surface-1); …every colour role
  --font-body: var(--pz-body); --font-label: var(--pz-label);
  --radius-card: var(--pz-radius-card); --tracking-label: var(--pz-label-tracking);
}
@theme {
  --spacing-1: 4px; … --spacing-10: 144px;  /* p-5 = 24px = space-5 */
  --radius-sm: 10px; … --radius-pill: 999px;
  --font-display: "Fraunces", …; --font-sans: …; --font-inter: …; --font-mono: …;
  --blur-glass: 24px; --blur-ambient: 90px;
  --text-display-xl: clamp(<fontSizeMin>, <fluid>, <fontSize>);   /* values read from tokens.json */
  --text-display-xl--line-height: <lineHeight>; --text-display-xl--letter-spacing: <letterSpacing>;
  --text-display-xl--font-weight: <fontWeight>;  …all 12 styles
}
@utility shadow-glass { box-shadow: var(--shadow-glass); }    /* + float, glow: per-theme values */
```

Mapping rule (the both-ways test encodes it): colour `x` → `--x` per theme and `--color-x`;
`space-n` → `--spacing-n`; `radius-x` → `--radius-x`; `blur-x` → `--blur-x`; type style `s` →
`--text-s` + companions; shadow `x` → `--x` per theme + `@utility x`; brand `pz-x` → `--pz-x` per
theme. Shadows are utilities rather than `@theme` entries because the per-theme property and the
Tailwind variable would share the name `--shadow-glass` and reference themselves.

Resulting vocabulary: `bg-bg`, `bg-surface-1`, `bg-surface-glass backdrop-blur-glass`, `text-ink`,
`text-ink-muted`, `border-line-control`, `outline-focus`, `bg-accent text-on-accent`, `font-display`,
`font-body`, `font-label`, `text-display-xl`, `text-label`, `p-5`, `gap-7`, `rounded-card`,
`rounded-pill`, `shadow-glass`, `dark:`, `eqsync:`.

**Nx:** `packages/design/project.json` with `tokens` (runs the generator; inputs `tokens.json`,
`scripts/**`, `src/schema.ts`; outputs the three files), `test` (vitest, includes the drift check),
`type-check`, `lint`. `build` depends on `tokens`; every app's `build` already depends on `^build`.

**Tests** (`packages/design/src/__tests__/`):
- `drift.test.ts`: generator output in memory equals the three committed files byte for byte.
- `tokens-both-ways.test.ts`: parse `theme.generated.css` with `postcss`. JSON → CSS: every theme x
  every per-theme token has exactly one declaration with exactly the JSON value in that theme's block;
  every scale token has its mapped `@theme` variable. CSS → JSON: every declaration in every theme
  block, `@theme` block and `@utility` maps back to a token (the only allowlisted lines are the
  `*: initial` resets and `color-scheme`). `:root` equals `psizone-dark`.
- `tailwind-probe.test.ts`: compile a probe file through `@tailwindcss/node` with the theme and assert
  `p-5` → 24px via `--spacing-5`, `p-11`, `bg-red-500`, `rounded-2xl` produce **no** rule (the scales
  are closed), `backdrop-blur-glass`, `rounded-card` and `text-display-xl` exist. The Tailwind docs
  document only the `--spacing` multiplier, not named `--spacing-<n>` steps; this probe is what proves
  the named steps win. If it shows otherwise, D2 falls back to `--spacing: 4px` (then `space-5` is
  `p-6`, `space-10` is `p-36`) and closes the scale with a lint rule that allows only the ten
  token-backed multipliers 1, 2, 3, 4, 6, 8, 12, 16, 24, 36.

## 2. Fonts

**Self-host, never Google Fonts.** The Google CDN sends every visitor's IP to Google (LG München I,
2022, found that unlawful without consent), adds a third-party DNS+TLS round trip before first text,
and cannot be cached across sites any more. The spike's `@import url("https://fonts.googleapis.com…")`
in `packages/ui/src/components.css` is removed in U4.

- **Source and subset:** `packages/design/scripts/fonts.sh` downloads the OFL variable TTFs from the
  google/fonts repository at a pinned commit (sha256 checked), clamps axes with
  `fonttools varLib.instancer` and subsets with `pyftsubset --flavor=woff2` into **one `latin-ro`
  subset per file** (one request per face, rather than Fontsource's latin + latin-ext pair):
  U+0020-007E, U+00A0-00FF, Ă ă (U+0102-0103), Ș ș Ț ț (U+0218-021B), legacy cedilla Ş ş Ţ ţ
  (U+015E-015F, U+0162-0163), „ ” ‚ ‘ ’ – — … · (U+2010-2026), € (U+20AC), ® ™, → (U+2192), and
  θ (U+03B8, used in `data` samples) for the mono face only.
- **Files** (committed in `packages/design/fonts/`, with `OFL.txt` per family):
  `fraunces-roman.woff2` (opsz 9-144, wght 300-700, SOFT 0-100), `fraunces-italic.woff2` (quotes,
  Hemi-Sync `em`), `manrope.woff2` (wght 400-800), `inter.woff2` (wght 400-700),
  `plex-mono-400|500|600.woff2` (static cuts; Plex Mono has no variable font).
- **CSS:** the generator also emits `packages/design/fonts.generated.css` (`@font-face`,
  `font-display: swap`, plus a metric-matched local fallback face per family with `size-adjust` /
  `ascent-override` so the swap does not shift layout); exported as `@psi/design/fonts.css`.
- **Preload, at most two per page**, chosen by brand by the `Document` head (U8): Fraunces roman (every
  brand's headline) + the brand's body face (Manrope for Psizone and Blog, Plex Mono 400 for EQ-SYNC,
  Inter for Hemi-Sync). Italic and the other mono weights load on demand.
- **Serving:** `@psi/ui/server`'s `serveUiAssets()` serves fonts and Datastar from content-hashed paths
  with `Cache-Control: public, max-age=31536000, immutable`.
- **Budget test** (`fonts.test.ts`): each file ≤ 60 KB, `fraunces-roman` ≤ 110 KB; every subset file
  contains ă â î ș ț Ă Â Î Ș Ț (read the cmap with `fontkit` or a 30-line cmap reader).

## 3. Contrast and accessibility gates

**Contrast, per theme, from data.** `packages/design/src/contrast.ts` holds ~40 lines of WCAG 2
relative-luminance arithmetic plus alpha compositing (a translucent role is composited over the
ground it sits on), as SEB does it, without a colour library. `contrast.test.ts` reads the
`contrast` list from `tokens.json` and checks every pair in all 8 themes. The list, from
`0-shared-foundations.md` and each token's `usage` (it promises more than PALETTE.md checks):

| Foreground | On | Min |
| --- | --- | --- |
| ink, ink-muted, ink-faint | bg, surface-1, surface-2 | 4.5 |
| ink, ink-muted | surface-glass over bg; accent-soft, ai-soft, warm-soft over bg and over surface-1 | 4.5 |
| glow-1 | bg, surface-1 | 4.5 |
| on-accent | accent, accent-hover | 4.5 |
| success, warning, danger, info (text, always with a word) | bg, surface-1, surface-2 | 4.5 |
| focus, line-control | bg, surface-1, surface-2 | 3.0 |

**Measured today: 360 checks, 1 failure** — `eqsync-light` `info` on `surface-2` is **4.48:1**. Either
darken EQ-SYNC Day's `info` a step or the plan forbids info text on `surface-2` (Q4). Everything else
passes, including the pairs PALETTE.md never measured (on-accent on accent-hover, status roles,
text on the soft tints). The test fails the build on any shortfall and prints theme, pair, ratio.

**Focus.** One rule in `@psi/ui`'s base layer, so no component can forget it:
`:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }`. An ast-grep rule
(`.mono/ast-grep/patterns/no-outline-none.yml`) refuses `outline-none` in `packages/ui` and `apps`
unless the same class string carries `focus-visible:outline-*`.

**Reduced motion.** The base layer collapses every animation and transition under
`prefers-reduced-motion: reduce` (SEB's `0.01ms !important` rule, so `transitionend` still fires), and
`AmbientField`, the player waveform and reveals declare `motion-reduce:animate-none` on top. Checked in
the browser (G2): with `reducedMotion: "reduce"`, `element.getAnimations()` is empty for the ambient
field and a playing waveform in every theme; with motion allowed it is not (the pair keeps the test
honest).

**axe, in two places, because happy-dom has no layout or computed colours:**
- unit (happy-dom, `axe-core`, tags `wcag2a, wcag2aa, wcag22aa`, `color-contrast` off): every component
  variant from the fixtures, for names, roles, ARIA, labels, landmarks, list structure;
- browser (G2, Playwright + `@axe-core/playwright`, full rule set **including** `color-contrast`):
  every fixture page in all 8 themes. This is where glass over the ambient field, real fonts and real
  cascades are measured.

## 4. `@psi/ui` component API

**Conventions.** Every component is a synchronous `hono/jsx` function with an exported `Props`
interface and an explicit `JSX.Element` return type. `class?: string` is appended, never replaces.
Content text arrives as props already localised by the app (`m.hero_title()`); the library's own
fixed strings (play, pause, send, "Day 4 of 21", "Error:", nav landmark name) come from `@psi/ui`'s
own Paraglide catalog (`packages/ui/messages/{ro,en}.json`), called as `m.ui_play({}, { locale })`
with the locale read from a `UiLocale` context the app's `Document` sets once. Strings two apps need
live in the library, like components. Enumerations (`tone`, `variant`, `hue`, `theme`) are typed from
`@psi/design/tokens`. Datastar wiring is passed as `ds?: DsAttrs` (section 5), never as a raw record.
**No-JS first:** every component renders a working page without Datastar; Datastar enhances.

| Component | Props (adapted from `index.d.ts`) | Behaviour |
| --- | --- | --- |
| Logo | `brand?: Brand \| "auto"`, `variant?: "lockup" \| "mark"`, `size?`, `href?` | HTML+CSS; `auto` shows the theme's brand via `eqsync:`/`hemisync:` display variants |
| AmbientField | `intensity?: "low" \| "medium" \| "high"`, `children` | HTML+CSS (`pz-ambient` keyframes); wave paths computed server-side; opacity/duration from `pz-ambient-*` tokens |
| Button | union: `{ href: string }` renders `<a>`; else `{ type?: "button" \| "submit"; disabled? }`; `variant`, `size`, `arrow?`, `ds?` | HTML+CSS; Datastar only through `ds` |
| GlassCard | `as?: "div" \| "section" \| "article" \| "aside"`, `solid?` | HTML+CSS |
| Chip | union: static `{ tone }` renders `<span>`; toggle `{ pressed: SignalRef<boolean> }` renders `<button aria-pressed>`; link `{ href, current? }` | toggle: `data-on:click` flips the signal, `data-attr:aria-pressed` mirrors it; server renders the initial `aria-pressed` |
| StatusBadge | `tone`, `children` (the word is required: `children: string`) | HTML+CSS |
| TextField | `name`, `label`, `type?`, `value?`, `hint?`, `error?`, `required?`, `autocomplete?`, `bind?: SignalRef<string>` | HTML; ids derived from `name`; `aria-describedby`/`aria-invalid` server-side; optional `data-bind` |
| AskBar | `action: AppPath` (no-JS: `<form method="get">` to the guide page), `stream: AppPath` (SSE), `target: string` (answer element id), `label`, `placeholder`, `suggestions?: readonly string[]` | `data-bind` question signal; `data-on:submit__prevent` → `@post(stream)`; suggestions set the signal and post; `data-indicator` disables send while answering; server replies with `datastar-patch-elements` of `GuideMessage` appended into `#target` |
| GuideMessage | `role: "guide" \| "user"`, `id`, `sources?: GuideSource[]`, `children` | HTML+CSS; stable `id` so SSE can patch or append |
| HubCard | `title`, `href`, `eyebrow?`, `text?`, `tags?`, `hue?: 1 \| 2 \| 3`, `headingLevel?: 2 \| 3` | HTML+CSS (whole card is the link) |
| ProgressSignal | `label`, `delta?`, `startLabel`, `endLabel`, `caption?`, `startNoise?`, `endNoise?` | HTML+SVG computed on the server; `role="img"` + label |
| NavBar | `links: NavLink[]`, `actions?: Child` (≤ 2), `homeHref`, `menuLabel` | HTML; mobile menu is a native `popover` + `popovertarget` button (no JS, light dismiss, Esc) |
| PractitionerCard | `name`, `role?`, `photo?: Image`, `specialties?`, `action?: Child` | HTML+CSS |
| ArticleCard | `title`, `href`, `image?: Image`, `topic?`, `excerpt?`, `author?`, `minutes?`, `reviewed?: Date` | HTML+CSS; dates formatted by locale on the server |
| Prose | `children` (CMS HTML is rendered by the app's sanitiser, never `dangerouslySetInnerHTML` of raw input) | HTML+CSS (`pz-prose`) |
| AudioPlayer | `id`, `title`, `src`, `duration` (s), `meta?` | Local signals `_<id>Playing`, `_<id>Time` (underscore: never sent to the server); `<audio>` `data-on:play/pause/timeupdate__throttle.250ms` feed them; button `data-on:click` via `data-ref`; play/pause **labels are both server-rendered and swapped with `data-show`**, no text inside expressions; progress via one `data-style:--pz-progress`, not 48 expressions; `<noscript>` renders native `<audio controls>`; never autoplays |
| ProgramTracker | `total`, `done`, `title`, `note?`, `id` | HTML; the app re-renders it and patches it by `id` over SSE when a day completes |
| ProductCard | `title`, `price: string` (formatted by the app), `kind?`, `text?`, `image?`, `badge?`, `action: Child` (the app's add-to-cart form/button) | HTML+CSS; no cart logic in the library |

**Layout primitives (minimal, in `packages/ui/src/layout/`):** `Document` (html/head/body: `lang`,
`data-theme` from the server, title/meta, two font preloads, the app stylesheet, the Datastar module
script with nonce, `UiLocale` provider), `Container` (`width?: "read" \| "page"`: 680px reading
width or page width, side gutters), `Section` (`space-9` / mobile `space-7` vertical padding,
`labelledBy`, optional `reveal` using `data-on-intersect__once` to add a class), `Stack`
(`gap: SpaceStep`), `Grid` (`min: "card" \| "wide"`: auto-fill columns), `Hero` (AmbientField +
one `display-xl` heading slot + lead + actions + AskBar slot), `Footer` (columns of links, legal line,
LanguageSwitch), `LanguageSwitch` (plain `<a hreflang>` links to the same page in the other locale;
no JS), `ThemeToggle` (a `<form method="post" action="/_psi/theme">` button that sets a cookie and
redirects back, enhanced with Datastar to flip `data-theme` in place; replaces the spike's cookie
string inside an expression). The server reads the cookie to render the right `data-theme`, so there
is no flash.

## 5. Typing Datastar in `hono/jsx`

hono's index signature means `data-on:click={anything}` type-checks and nothing is verified. So
**attributes are produced only by a typed helper** and spread: `<button {...ds.on("click", js`…`)}>`.
`packages/ui/src/datastar/` (exported as `@psi/ui/datastar`), three files:

- `expr.ts`: `type Expr = string & { readonly __expr: unique symbol }`; a tagged template
  `js\`$${q} = ${value}\`` where an interpolated `Expr` or `SignalRef` is inserted verbatim and **any
  other value is `JSON.stringify`-ed**, so user or CMS text can never become code (Datastar does not
  sanitise expressions). `signal<T>(name)` returns `SignalRef<T>`; names are validated against
  `^_?[a-z][a-zA-Z0-9]*$` (camelCase, so no key-casing surprises).
- `attrs.ts`: `type DsAttrs = Readonly<Partial<Record<\`data-${string}\`, string>>>` and builders
  `on(event: DsEvent, expr, mods?: OnMods)`, `bind(ref)`, `signals(record: Record<string, Json>)`
  (object form, JSON-serialised), `show`, `text`, `attr(name, expr)`, `cls(name, expr)`,
  `style(prop, expr)`, `indicator(ref)`, `ref(name)`, `init`, `onIntersect(expr, mods?)`, and `merge(...)`
  to combine. `OnMods` is a typed object (`{ prevent?: true; debounce?: \`${number}ms\`; throttle?;
  once?; window?; outside? }`) rendered to `__prevent__debounce.500ms`.
- `actions.ts`: `get(path: AppPath, opts?)`, `post(path, opts?)` returning `Expr`, where
  `AppPath = \`/${string}\`` (same-origin only) and `opts` is typed (`contentType?: "json" \| "form"`,
  `filterSignals?`, `requestCancellation?`).

Server side, `@psi/ui/server` adds `readSignalsAs(schema, request)` (SDK `readSignals` + zod parse:
the boundary rule) and `patch(stream, jsx, opts)` (renders `hono/jsx` to a string, then
`patchElements`). Guard: `.mono/ast-grep/patterns/no-raw-datastar-attr.yml` flags any JSX attribute
named `data-on*`, `data-bind*`, `data-signals*`, `data-attr*`, `data-class*` outside
`packages/ui/src/datastar/`. CSP: render with Datastar's nonce mode (nonce on `<html>`, script
`nonce`), not `'unsafe-eval'`; the nonce comes from Hono's `secureHeaders` per request.

## 6. Styling: Tailwind utilities, three component stylesheets

**Recommendation: Tailwind utilities in the components; retire the kit's 1,169-line `.pz-*` sheet.**
One vocabulary across library and apps, a closed scale enforced by Tailwind itself (only token-backed
utilities exist), dead CSS removed by the compiler, and brand differences live in tokens
(`font-label`, `rounded-card`, `tracking-label`) instead of selector overrides. Variants are typed
maps of **complete literal class strings** (`const VARIANT: Record<ButtonVariant, string>`), joined
with `cx`; never assembled (`pz-chip--${tone}` is invisible to Tailwind's scanner). No `cva`, no
`tailwind-merge`: overrides happen through props, not by fighting class order.

Plain CSS stays for exactly three things utilities express badly (keyframes and descendant styling
of content the component does not author), each in `@layer components` under
`packages/ui/src/css/`: `ambient.css` (`pz-ambient`, blobs, EQ-SYNC bands, drift/sway keyframes),
`prose.css` (`pz-prose` for CMS HTML), `player.css` (waveform bars and the `--pz-progress` mask).

Entry point `@psi/ui/styles.css`:

```css
@import "tailwindcss";
@import "@psi/design/theme.css";
@import "@psi/design/fonts.css";
@import "./css/base.css";        /* body font/colour, :focus-visible, reduced motion */
@import "./css/ambient.css"; @import "./css/prose.css"; @import "./css/player.css";
@source "./components"; @source "./layout";
```

An app's `src/styles.css` is two lines: `@import "@psi/ui/styles.css";` and `@source "./";`, built
by `@tailwindcss/cli` (as `apps/psizone-web` already does).

## 7. Component gallery: yes, `apps/design-gallery`

Needed: it is the only place the 18 components x 8 themes are seen in a browser, the target of the
browser axe/contrast/motion gate (G2), and the owner's review surface replacing the React artifact.
A small Hono app: `/` lists components; `/:theme/:component` renders every fixture of one component
in one theme (`<html data-theme>`); `/matrix/:component` shows all 8 themes side by side through
nested `data-theme` wrappers; a theme and locale switcher in the chrome. Fixtures live **in the
library** (`packages/ui/src/fixtures/<component>.fixtures.tsx`: named variants with sample props) so
unit tests and the gallery render the same variants. The gallery owns real tiny endpoints for
behaviour (an SSE route that streams a canned `GuideMessage` for AskBar), which are its own code, not
mocks. Dev only (Q2), no Dockerfile until that is answered.

## 8. Testing

- **vitest + happy-dom** per package (`environment: "happy-dom"`, `--maxWorkers=4`), one project at a
  time. `packages/ui/src/__tests__/support/render.ts`: `render(jsx)` awaits `jsx.toString()`, sets
  `document.body.innerHTML`, returns `@testing-library/dom` queries scoped to it.
- **Assert behaviour-bearing output, never markup snapshots:** roles and accessible names
  (`getByRole("button", { name: … })`), `aria-*` states, `href`s, which element carries which
  `data-*` attribute and its exact expression (so a broken Datastar wiring fails), presence of
  token-backed classes where they carry meaning (`bg-accent` on the primary button), fallbacks
  (`<noscript>` player, `<form method="get">` AskBar).
- **No mocks of own code**: render real components with real helpers; the SDK is exercised with real
  `Request`/`Response` objects in `server` tests.
- **Per-component test file**: every fixture renders, axe (structural) is clean, both locales render
  without a missing message, escaping holds (a title of `"<b>'x'"` arrives as text; a suggestion of
  `"'); alert(1); ('"` appears in the expression only as a JSON string literal).
- **Discipline tests in `@psi/ui`:** no JSX text literal with letters in `src/components` or
  `src/layout` (ast-grep, i18n-first); every file ≤ 500 lines; every exported component has fixtures.
- **Browser (G2):** Playwright in `apps/design-gallery/e2e/`: axe per theme x component, reduced
  motion, keyboard path (Tab reaches every control with a visible ring), Datastar behaviours (chip
  toggles `aria-pressed`, player state toggles labels, AskBar streams a message into its target).

## 9. Build tasks

Each task: one builder, its own worktree, `pnpm install --frozen-lockfile`, green `pnpm affected`.
**GATE** marks what must be merged before brand apps (`apps/psizone-web` and siblings) build pages
on the library; the rest can land while they do.

| ID | Task | Paths | Depends | Acceptance |
| --- | --- | --- | --- | --- |
| D1 GATE | Extend `tokens.json` (theme `brand`/`mode`, `pz-*` brand tokens, `fontSizeMin`, `contrast` list) + zod schema | `packages/design/tokens.json`, `src/schema.ts` | none | schema parses the file; every brand token has 8 values; values match the kit CSS overrides |
| D2 GATE | TS generator replacing `build-theme.mjs`; outputs theme CSS, `tokens.generated.ts`, PALETTE.md; `project.json` targets | `packages/design/scripts/build-theme.ts`, `theme.generated.css`, `src/tokens.generated.ts`, `PALETTE.md`, `project.json`, `package.json` exports | D1 | output matches section 1 layout; `nx run design:tokens` idempotent |
| D3 GATE | Drift, both-ways and Tailwind probe tests | `packages/design/src/__tests__/{drift,tokens-both-ways,tailwind-probe}.test.ts` | D2 | removing a token from either side fails with its name; `p-11`/`bg-red-500` produce no CSS |
| D4 GATE | Contrast math + test over the `contrast` list; decide the EQ-SYNC Day `info` failure | `packages/design/src/contrast.ts`, `__tests__/contrast.test.ts` | D1 | 360 pairs checked; failure output names theme, pair, ratio; green after Q4 |
| D5 GATE | Fonts: fetch/subset script, woff2 + OFL files, `fonts.generated.css`, budget test | `packages/design/scripts/fonts.sh`, `fonts/`, `fonts.generated.css`, `__tests__/fonts.test.ts` | D2 | sizes within budget; Romanian glyphs present; no Google URL anywhere (`rg fonts.googleapis`) |
| U1 GATE | `@psi/ui` scaffold: `project.json`, vitest happy-dom, test support (render, axe), `styles.css` + `css/base.css` | `packages/ui/{project.json,vitest.config.ts,src/styles.css,src/css/base.css,src/__tests__/support/*}` | D2 | an app compiling `@psi/ui/styles.css` gets focus and reduced-motion rules (asserted on compiled CSS) |
| U2 GATE | Typed Datastar helper + ast-grep guard | `packages/ui/src/datastar/{expr,attrs,actions}.ts`, tests, `.mono/ast-grep/patterns/no-raw-datastar-attr.yml` | U1 | non-Expr interpolation is JSON-encoded; invalid signal names throw; guard flags a raw `data-on:click` |
| U3 GATE | `@psi/ui` i18n: Paraglide project, ro/en catalog, `UiLocale` context | `packages/ui/{project.inlang,messages/*,src/i18n.ts}` | U1 | same component renders `Redă`/`Play` under ro/en; context verified with nested components |
| U4 GATE | Port to Tailwind: Logo, Button, GlassCard, StatusBadge, Prose, AmbientField (+ `ambient.css`, `prose.css`), icons from Lucide as inline SVG; delete the Google import | `packages/ui/src/components/*.tsx`, `src/css/*`, fixtures, tests | U1, U2, U3 | fixtures render; unit axe clean; no `.pz-*` class left in these components except the two CSS-authored ones |
| U5 | Cards: HubCard, ArticleCard, PractitionerCard, ProductCard, GuideMessage, ProgressSignal, ProgramTracker | same layout | U4 | as U4; ProgramTracker/GuideMessage keep stable ids for SSE |
| U6 GATE | Interactive: Chip, TextField, AskBar | same layout | U2, U3, U4 | no-JS fallbacks render; expressions exact; hostile suggestion text stays a string literal |
| U7 | AudioPlayer (+ `player.css`) | same layout | U2, U3, U4 | underscore signals; labels swapped by `data-show`; `<noscript>` native player; no autoplay attribute |
| U8 GATE | Layout: Document, Container, Section, Stack, Grid, Hero, Footer, NavBar (popover menu), LanguageSwitch, ThemeToggle | `packages/ui/src/layout/*.tsx`, `components/nav-bar.tsx` | U3, U4, D5 | Document emits lang, data-theme, ≤ 2 preloads, nonce'd Datastar script; ThemeToggle works as a plain form |
| U9 GATE | `@psi/ui/server`: `serveUiAssets`, theme cookie route, `readSignalsAs`, `patch` | `packages/ui/src/server/*.ts` | U2 | immutable caching headers; invalid signals return 400 via zod; patch output parses as the component |
| G1 | `apps/design-gallery` scaffold, routes, fixture pages, canned SSE route | `apps/design-gallery/**` | U4, U8, U9 | every fixture reachable in every theme; Nx build/test/lint green |
| G2 | Playwright gate: axe incl. contrast x 8 themes, reduced motion, keyboard, Datastar behaviours | `apps/design-gallery/e2e/**` | G1, U5, U6, U7 | zero violations; failures name theme + component + rule |
| X1 | Retire the React originals: delete `components.js`, `index.d.ts`, `packages/ui/src/components.css`; rewrite README "Using the system", component-guides' React wording | `packages/design/*`, `packages/ui/src/components.css` | U4-U8 | `rg "React\|window.Psizone\|className"` finds nothing in `packages/design` and `packages/ui` |

Parallel lanes after D2: {D3, D4, D5} and {U1 → U2, U3} run side by side; then U4 → {U5, U6, U7, U8,
U9} in parallel; G1/G2 last. Critical path to the gate: D1 → D2 → U1 → U4 → U8.

## 10. Open questions for the owner

1. **First visit theme:** each brand's "primary mode" from the brand book (Psizone dark, Hemi-Sync
   light…) regardless of the device, or follow the visitor's `prefers-color-scheme` until they choose?
   Recommendation: brand primary mode; the toggle remembers a choice.
2. **Gallery reach:** keep `apps/design-gallery` local-only, or deploy it to psi dev behind sign-in
   for review? Recommendation: dev, behind sign-in.
3. **Mobile display sizes:** the spike's minimums (display-xl 52px, display-lg 40px, display-md 32px,
   headline 26px, quote 22px at narrow widths) are not in the brand books, and the maximums have just
   moved in `tokens.json` (display-xl 88 → 120px, display-lg 64 → 72px, display-md 44 → 48px,
   uncommitted as of this plan). Confirm both ends.
4. **EQ-SYNC Day `info`:** 4.48:1 on `surface-2`. Darken the token (changes the colour slightly), or
   accept the rule that info text never sits on `surface-2` in that theme? Recommendation: darken.
5. **Logos:** when the real Psizone, EQ-SYNC and Hemi-Sync files arrive (SVG preferred), `Logo` swaps
   its placeholders; until then pages ship the placeholders. Is that acceptable for a public launch?
