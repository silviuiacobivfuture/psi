# Design system: Psizone Platform

One component library, ten themes: four brands (each dark and light) and the admin console's own two. Online version with live previews: https://claude.ai/artifact/KCDyT243fZZhkYDVYRfFo5

## Principles (full text in `brand-books/`)

1. **One family, four feelings.** Same components and token names everywhere; each brand changes colour, second typeface, ambient background, corner feel and voice through its theme.
2. **Fraunces is the family's voice.** Every brand sets headlines in Fraunces (SOFT 100 at display sizes).
3. **Show, don't claim.** Little text on landing pages, depth in hubs, the blog and the AI guide; describe process and measurement, never hype.
4. **Space is the luxury.** When in doubt, remove text and add space; reading width at most 680px.
5. **Soft everywhere.** Pills, large radii, no sharp corners.
6. **Calm motion.** Slow ambient loops, gentle reveals, nothing under `prefers-reduced-motion`.
7. **Accessible in every theme.** Text at least 4.5:1, focus rings and control borders at least 3:1, status never by colour alone (see `PALETTE.md`).
8. **Roles, not colours.** Use `var(--accent)`, `var(--surface-1)`; never hex values. A new token goes into all the site themes or none; roles that only the console needs live in `tokens.json` `color.adminTokens` and exist only in the admin themes.

## Themes

`psizone-dark` · `psizone-light` · `eqsync-dark` · `eqsync-light` · `hemisync-light` · `hemisync-dark` · `blog-light` · `blog-dark`, and the console's `admin-light` · `admin-dark` (calmer, denser, warm paper by day and a deep green-black night; status, calendar-column and per-app tint roles that exist only in these two), set on `<html data-theme="…">`.

## Files

- `tokens.json`: colours for all themes, type scale and families, spacing, radius, shadows, blur. Source of truth.
- `PALETTE.md`: every colour value per theme and the contrast checks.
- `components.css`: component styles, per-brand overrides, Google Fonts import (Fraunces, Manrope, Inter, IBM Plex Mono).
- `components.js`: 18 React 18 components as a browser bundle on `window.Psizone`. For the Next.js apps, port them to typed `.tsx` files using `index.d.ts` as the contract.
- `index.d.ts`: component props.
- `component-guides/`: when and how to use each component.

## Turning tokens into CSS

The design system page generates `tokens.css` as: `:root, [data-theme="psizone-dark"] { --bg: …; … }`, then one `[data-theme="<id>"] { … }` block per further theme for colours and shadows, `:root { --space-*; --radius-*; --blur-*; --font-display; --font-sans; --font-inter; --font-mono }`, and a class per type style. Generate the same from `tokens.json` in the build (a small script or Style Dictionary).

## Placeholders

Logos for all three brands are placeholders until the real files arrive.
