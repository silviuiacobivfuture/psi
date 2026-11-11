One component library for a family of four: **Psizone** (the neuro-psychology centre), **EQ-SYNC** (a 21-day sound programme for mental calm), **Hemi-Sync România** (Monroe Institute programmes, products and workshops) and the **Blog** (the shared reading space). Every component reads the same token names; each brand is a pair of themes that changes colour, ambient background, second typeface, corner feel and voice. Build once, switch `data-theme`, and the screen becomes the right brand.

Each brand has its own section in this book (Psizone, EQ-SYNC, Hemi-Sync, Blog). This page is what they share.

## The themes

| Brand | Themes (`data-theme`) | Feel in three words | Primary mode |
| --- | --- | --- | --- |
| Psizone | `psizone-dark`, `psizone-light` | luminous, calm, human | dark |
| EQ-SYNC | `eqsync-dark`, `eqsync-light` | nocturnal, sonic, precise | dark |
| Hemi-Sync | `hemisync-light`, `hemisync-dark` | dawn, journey, contemplative | light |
| Blog | `blog-light`, `blog-dark` | paper, quiet, editorial | light |

Set the theme on `<html>`. A brand's site uses only its own two themes; the Blog themes are used for long reading on any brand's site (see the Blog section).

## Shared foundations

**The family voice.** Romanian first, with correct diacritics (ă â î ș ț with comma-below). Second person singular, warm and direct. Sentence case everywhere, including buttons; uppercase only for `overline` eyebrows. No emoji and no exclamation marks. Explain what happens and how it is measured; never promise cures, never quote invented percentages, never call anything "revoluționar". Trademarks (Hemi-Sync®, Gateway Voyage®, Monroe Institute®) are written exactly as licensed.

**The shared face.** All four brands set headlines in **Fraunces** (`--font-display`), with `font-variation-settings: 'SOFT' 100, 'opsz' 144` for display sizes (class `.pz-display`). This is what makes the family recognisable side by side. One `display-xl` line per page.

**The second face is the brand's.** Text and labels change per theme through `--pz-body` and `--pz-label`, set in `components/bundle.css`: Manrope (`--font-sans`) for Psizone and Blog interfaces, IBM Plex Mono (`--font-mono`) for EQ-SYNC, Inter (`--font-inter`) for Hemi-Sync. Measurements, times and codes are always IBM Plex Mono (`data` style). All faces load from Google Fonts with full Romanian support (imported in `bundle.css`).

**Colour roles, not colours.** Use roles and let the theme fill them:
- Grounds: `bg`, `surface-1` (solid cards, inputs), `surface-2` (raised, hover), `surface-glass` (with `blur-glass`, only over the ambient field or photography).
- Text: `ink`, `ink-muted`, `ink-faint` (placeholders only). All pass 4.5:1 on `bg`, `surface-1` and `surface-2` in all eight themes.
- Brand light: `glow-1` (lead hue; the only glow allowed as text, and only on `bg` and `surface-1`), `glow-2` and `glow-3` (decorative only).
- Action: `accent` for the single primary action per view, `on-accent` on it, `accent-hover` plus `shadow-glow` on hover.
- Tints: `accent-soft` (selected), `ai-soft` (anything the AI guide wrote), `warm-soft` (people and stories).
- Borders: `line` (decorative), `line-strong` (visible rules), `line-control` (every input and bordered control; at least 3:1 everywhere).
- Status: `success`, `warning`, `danger`, `info`, always with a word.

**Ambient field.** Every brand has a living background, the `AmbientField` component, that behaves differently per theme (orbs, sound bands, dawn mist, almost nothing). One per screen, behind heroes and the AI guide; never behind long text.

**Shape.** Soft everywhere: buttons, chips, inputs on the sites and avatars are pills (`radius-pill`); cards `radius-lg`; hero media `radius-xl`; dense app screens `radius-sm`–`radius-md`. EQ-SYNC tightens cards to `radius-md` (its theme does this automatically).

**Space.** 4px base, `space-1` (4) to `space-10` (144). Sections get `space-9` vertical padding on desktop, `space-7` on mobile. Generous whitespace is the glamour: when in doubt, remove text and add space. Reading width at most 680px.

**Motion.** Hover and press 200–300 ms ease-out; reveals 600–900 ms (fade plus an 8–16px rise); ambient loops 22–60 s depending on brand. Everything respects `prefers-reduced-motion`: no drift, no sway, no waveform animation, instant reveals.

**Focus.** 2px solid `focus` ring with a 2px offset on every interactive element, at least 3:1 on every surface in every theme.

**Iconography.** Lucide icons (MIT): 24px grid, 1.75–2px stroke, round caps and joins, coloured `ink` or `ink-muted`, `accent` only when active. Always beside a label, except close, send, play and menu. No emoji, no filled or duotone sets.

**Logos.** The `Logo` component shows the current theme's brand. All three are placeholders until the real files arrive: Psizone's gradient orb is a stand-in, not the mark, and EQ-SYNC and Hemi-Sync are typographic. Replace files in the Logos asset group and update `Logo` when they exist.

**Accessibility floor.** Contrast as above in all eight themes; status never by colour alone; every image has alt text or is marked decorative; audio never autoplays; transcripts or summaries accompany guided audio where possible.

## Using the system

- Load React 18, then `components/bundle.css` and `components/bundle.js`; components are on `window.Psizone`.
- Use tokens through CSS custom properties (`var(--accent)`, `var(--space-5)`); never paste hex values.
- Never add a brand-specific token name. If a brand needs something new, add the same token to all eight themes.
- Figures in component previews (prices, durations, names) are samples, not real data.
