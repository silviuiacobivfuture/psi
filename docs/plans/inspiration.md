# psi inspiration: exquisite, calm, AI-first

Research date 2026-11-11. Stack constraint: server-rendered HTML, Tailwind 4, Datastar; every effect below is CSS, SVG or a few lines of JS. Tokens (`--bg`, `--surface-1`, `--glow-1..3`, `--ink`, `--accent`, `--shadow-glow`, `--radius-*`) are the ones in `packages/design/brand-books/0-shared-foundations.md`.

Method and limits, stated honestly. Every site in section 1 was loaded. Twelve were also screenshotted in a headless browser (marked "seen"); for the rest I only had page text plus downloaded stylesheets. Counts like "backdrop-filter x26" come from those stylesheets. Statements about what a technique is used for are marked "inferred" when the CSS shows it exists but I did not watch it run. I could not verify Apple Newsroom, Calm, Vercel or OpenAI visually (403, empty text, or no render), so they are not referenced. `ast-grep` was not usable (`sg` on this machine is the Linux `group` command), so I fell back to plain grep, only on downloaded third-party HTML/CSS in the scratchpad.

---

## 1. References (15)

Brand codes: PZ Psizone, EQ EQ-SYNC, HS Hemi-Sync, BL Blog.

| # | URL | Take exactly this | Brand |
|---|---|---|---|
| 1 | https://www.perplexity.ai (seen) | Ask-first home. One centred line ("What do you want to know?"), one large rounded input (about 640px wide, radius about 28px) with a mode pill group and mic/send inside the bar, and two soft suggestion cards under it. Nothing else competes. CSS contains `view-transition` x18, `mask-image` x57, 14 reduced-motion blocks (inferred: used for answer transitions). Copy the bar anatomy, not the sidebar. | PZ, EQ, BL |
| 2 | https://www.diabrowser.com (seen) | Best single reference for the "calm futurist" tone. A variable serif (CSS: `Exposure VAR` + `ABC Oracle`) set tiny as the tagline and enormous as a wordmark clipped behind the product window; soft blurred leaf-shadow ground; floating pill nav; the section ends in a concave arc instead of a straight edge; the AI shows as a quiet "Ask anything..." bar inside the window. CSS has a `chroma-sweep` keyframe (0.9s ease-in-out, background-position 100% to 0 plus blur 1px to 0): a one-time gradient sweep on a word. | PZ, HS |
| 3 | https://claude.com (seen) | Paper ground, serif display "Question what's next" at about 72px, short serif subline, one large rounded input card (radius about 28px) with hairline border and a single dark pill action, a real photo with a 16px radius beside it. Proof that a serif plus plain ink pills feels more premium than any gradient. CSS has 8 reduced-motion blocks and mask-image edges. | BL, HS |
| 4 | https://www.raycast.com (seen) | Dithered, grainy glow bands (diagonal blurred light with visible noise at the edges) on near-black, plus a floating inset nav bar with hairline border and rounded 16px corners. CSS: `radial-gradient` x45, `mix-blend` x6, `backdrop-filter` x22, 11 reduced-motion blocks. Take the grain-in-the-glow and the floating nav; re-hue to teal or gold, never red. | PZ, EQ |
| 5 | https://linear.app (seen) | Left-aligned two-line headline (about 64px) over a product window cropped by the fold, hairline separators, mono for identifiers, "Fig 0.1" numbered figure labels (page text). Take the cropped-window device for the AI guide card and "Fig" numbering for EQ-SYNC's day/session structure. | EQ, PZ |
| 6 | https://www.granola.ai (seen) | Giant serif headline (about 80px, four lines, tight leading) left on a pale ground, olive pill CTA, a "New" chip, and a note-window mock with a **visible typing caret** at the end of live text. Imagery is halftone-grained. Take the headline scale and the caret as the AI streaming signature. | HS, BL |
| 7 | https://endel.io (seen) | Monochrome hairline waveforms and line-art on pure black; one white-outlined pill CTA with a soft glow; zero colour noise. Page text confirms "generative visuals". Take the hairline sound-wave language for EQ-SYNC. Do not copy the device collage. | EQ |
| 8 | https://ouraring.com (seen) | Condensed serif display (CSS: `Editorial New` + `AkkuratLL`), two-line left headline on a warm blush ground, one photograph that carries all the emotion (a hand), uppercase micro-eyebrows. Take the restraint and the warm ground for Psizone light and Blog. The blue CTA is off-palette; ignore it. | PZ light, BL |
| 9 | https://www.eightsleep.com (seen) | Full-bleed real-room photo (curtain, window light, wood) with a translucent dark floating nav (`backdrop-filter` x13) and one big headline. Take the photo grade (warm, lifted blacks) and glass nav over photography. Do not take the all-caps headline or the discount banner. | HS, PZ |
| 10 | https://press.stripe.com (seen) | Deep warm-brown ground, italic serif tagline, a vertical tick-mark index as navigation, a canvas scene (1 `<canvas>`), ruled single-column list with italic titles and indented blockquotes (page text). Take the tick index for the 21-day tracker and the ruled editorial list for the Blog index. | BL, EQ |
| 11 | https://thebrowser.company (text + CSS) | One-statement hero ("We're building better ways to use the internet..."), two links, nothing else. CSS: `EB Garamond` + `Inter`, 6 keyframes, reduced-motion handled. Take the one-sentence discipline for Hemi-Sync section intros and Blog landings. | HS, BL |
| 12 | https://www.headspace.com (text only) | Topic chips as the entry point: "Stress less", "Sleep soundly", "Manage anxiety", under the question "What kind of headspace are you looking for?". Take the chips-as-questions pattern for the guide's suggestions (in our voice, no mascot, no yellow). | PZ |
| 13 | https://overworldaudio.com (text only) | A permanent "Sound On/Off" toggle in the top bar; instructions adapt for desktop (drag/scroll) and touch. Take the explicit, always-visible sound switch (audio is never autoplayed, per our floor). | EQ, HS |
| 14 | https://heronaiapp.com (text only) | AI framed as "Observe, Advise, Act, Learn", acts "only after approval"; bracketed numerals `[01]`. Take the trust framing for the guide ("answers only from reviewed content, you decide the next step"). Do not take the blueprint/boot-sequence look. | PZ |
| 15 | https://www.awwwards.com/websites/sites_of_the_day/ (listing, live to 11 Nov 2026) | Where to keep watching. Current list includes Cyera AI Guardian, Heron AI, Overworld Audio, Neutomni, Agrumea Farm, Cartier "Le Choeur des Pierres". Awwwards-level craft is mostly custom motion; our budget is CSS-only, so we win by restraint and type, not WebGL. | all |

Counter-examples seen (use in section 5): https://www.brain.fm (neon magenta/blue illustration, heavy sans, highlighter block behind a word) and https://www.calmerry.com (generic blue SaaS clinic, stock photo frames).

---

## 2. Cross-brand principles distilled from the references

1. One typographic gesture per screen: a single huge Fraunces line (refs 2, 3, 6, 8), everything else small and quiet.
2. One photograph or one field of light, never both competing (refs 8, 9 vs 4).
3. The AI is an input first, a chat second (refs 1, 3, 2): a large rounded bar in the hero, answers appear below it, in place.
4. Motion is slow and rare: one ambient loop, one reveal system, one hover glow. Everything else is still.
5. Grain makes gradients feel physical and stops them looking like a stock "AI" aurora (ref 4; a 2026 trend roundup also calls plain aurora gradients "genre shorthand for AI", so our hedge is grain, two-hue limits and real photography).
6. Edges: concave arcs, 24-36px radii, hairline borders with an inner top highlight (refs 2, 4, 9).

---

## 3. "psi exquisite" spec per brand

Shared scale (Fraunces, load axes `opsz 9..144`, `wght`, `SOFT 0..100`): `font-variation-settings:'SOFT' 100,'opsz' 144` for sizes at or above 56px; `'opsz' 72` at 36-55px; `'opsz' 24` at 20-35px; 18 for prose.

- display-xl `clamp(3.5rem, 2rem + 7vw, 7.5rem)` (56 to 120px), weight 300, line-height 0.96, letter-spacing -0.025em. One per page.
- display `clamp(2.25rem, 1.4rem + 3.4vw, 4.5rem)` weight 340, line-height 1.05.
- h3 28/1.2 weight 380. Body 17-18/1.65 (EQ mono 15-16/1.7). Overline 12px, tracking 0.14em, uppercase.
- Section padding `space-9` desktop, `space-7` mobile; hero min-height `100svh` minus nav; max content 1200, 12 columns, 24 gutter; reading 680.
- Radii: pill 999px; card 24px; hero media 36px; inset hero frame margin 16px. Concave arc at hero bottom (ref 2): `clip-path:ellipse(80% 100% at 50% 0)` on the following section's top, or an SVG wave divider.
- Reveals 600-900ms (fade plus 8-16px rise), hover 200-300ms ease-out, ambient loops 22-60s. All off under `prefers-reduced-motion`.

### 3.1 Psizone (dark first)

- **Hero**: centred column, max 880. Overline "Centrul de neuropsihologie, Galați"; display-xl **"Vezi schimbarea."** with only "schimbarea" as gradient text (recipe 4); one sentence below; then the AskBar (3.5). Three aurora orbs behind (recipe 1) plus grain (recipe 2). Primary action "Programează evaluarea" sits right of the bar on desktop and under it on mobile. Optional ghost word "Vezi" at 22vw, opacity 0.05, clipped by the concave arc (ref 2 device); skip if it fights the AskBar.
- **Below the fold**: full-bleed ProgressSignal line (recipe 7) drawing as the section enters, three numbers in mono ("QEEG", "sesiuni", "săptămâni" only with real data), then HubCards rotating glow-1/2/3 on 24px radius glass over a faint field; practitioner cards with a peach ring (glow-3 = humans).
- **Colour**: bg `#0A1013`, orbs at 22-38% opacity, glow-2 lilac only on the guide. Gradient text uses glow-1 to ink only (both pass 4.5:1 on bg). Grain 6-7%.
- **Shapes**: pill buttons and ask bar; cards 24px; one blob-morph avatar/orb behind the ask bar (recipe 12).
- **Light theme**: Oura-style warm calm (ref 8): mist ground, one real photo (hands, daylight room), orbs at 14% with multiply grain.
- **Motion**: orb drift 22/26/30s alternate; reveals staggered 80ms; hero text fades in 700ms; page-to-page View Transition (recipe 11) morphing the AskBar into the guide page.

### 3.2 EQ-SYNC (Night)

- **Hero**: asymmetric, Linear-style (ref 5). Left 7 columns: overline "Program de 21 de zile", display-xl at 104px max (mono neighbours need less shout), mono 16px sentence, gold pill "Vreau programul gratuit", and a quiet chip "Folosește căști". Right 5 columns: a "Ziua 7 / 21" Fraunces numeral at 160px, weight 200, with the 21-tick row beneath (ref 10 tick index): played ticks gold, today ringed, rest `line-strong`. Full-width hairline waves along the bottom (recipe 5) like ref 7.
- **Grid/rhythm**: strict 12 columns, 8px baseline, labels in mono 13px with tracking 0.04em; session list as ruled rows (ref 10), not cards.
- **Colour**: navy `#141C24`, cream ink; gold only for today, the action and the played waveform (one gold thing per screen); teal waves at 55% opacity; horizontal light bands as a `repeating-linear-gradient` at 4% (ref 4 dithered with grain 8%).
- **Shapes**: cards `radius-md` (16px), pills for buttons; player track a 2px hairline with a 12px gold thumb.
- **Motion**: waves sway 14s/19s linear (recipe 5); numerals count up once with `@property` integer (optional); sound toggle always visible (ref 13), never autoplay.
- **Micro**: mono caret blink in the ask bar; "6/21" ticks fill with a 400ms scale-in; celebrate attendance, never show missed days.

### 3.3 Hemi-Sync România (Dawn)

- **Hero**: Eight Sleep/Claude framing: a full-width photograph inset 16px from the viewport edges, radius 36px, 78svh tall, Romanian landscape at dawn (Piatra Craiului, mist). Headline in the sky, 6 columns max, 2 lines: "Călătoria ta spre interior" in Fraunces 300 and *începe aici.* in italic 300, size 96-112px, white with a 2% dark top gradient for legibility (verify 4.5:1 on the real photo, add a scrim if not). Overline in Inter caps. Under it a small GlassCard (recipe 3) with the first programme and an ink pill "Descoperă programele". Mist rises from the bottom (recipe 6).
- **Grid**: asymmetric two-column rows (photo 7 / text 5), alternating; generous 144px rhythm.
- **Colour**: white ground, lavender wash `#F3F0FF` sections; violet only for links, active Focus level, played waveform; peach/sky exist only as mist over photos.
- **Shapes**: ink pills; arches for programme images (`border-radius:999px 999px 24px 24px`, a "window at dawn"); concave arc between sections (ref 2).
- **Motion**: 60s mist; photo parallax limited to 4% via `animation-timeline:scroll()`; sentence-by-sentence reveals; section intros are a single sentence (ref 11).
- **Night theme**: indigo ground, peach focus ring, same mist at lower opacity.

### 3.4 Blog (Paper)

- **Index hero**: ref 3 + ref 10: serif display line "Răspunsuri, nu zgomot." (example), AskBar in `blog` tone (hairline border, no glow), then a ruled list of articles (title in Fraunces 28, one-line standfirst, brand tag overline, date) instead of a card wall; featured article as a 3:2 cover at 24px radius.
- **Article**: single 680 column; overline brand + category; h1 Fraunces 56/1.05 opsz 144 weight 340; first paragraph answers the question; byline row "Autor · Revizuit de · data"; prose Fraunces 20/34 opsz 18; teal underline links; reading-progress hairline (recipe 13); end with the "Întreabă ghidul despre acest articol" block and one next step.
- **Colour/motion**: paper `#FAF7F2`, no orbs, grain 3% only; reveals limited to images fading in; View Transition for list to article only.

### 3.5 The AI-guide surface (all brands, tinted per theme)

- **Ask bar**: pill, 64px tall desktop / 56px mobile, `surface-1` with `line-control` border, 24px inner padding, placeholder from brand ("Întreabă-ne orice despre copilul tău..."), send button 44px accent circle, mic only if supported. On focus: 2px focus ring plus a 6s rotating conic hairline in glow-2 (PZ) or glow-1 (EQ), static under reduced motion. Hero placement: directly under the sub-line, 720px max, centred (PZ) or left (EQ). Not a floating bottom-right bubble.
- **Suggestion chips**: 3-4 real questions in the family voice, pill, 40px, `ai-soft` fill, sentence case ("Cum decurge o evaluare?"). Chips are links to `?q=` so they work without JS.
- **Streamed answer card**: appears under the bar, `ai-soft` surface, radius 24px, overline "Ghidul Psizone" with a 20px orb, text Manrope 17/1.65 (mono for EQ), streamed word chunks via Datastar patches inside an `aria-live="polite"` region with the caret (recipe 10). Inline citation chips `[1]` (24px circles, `line-control` border) open a source row.
- **Sources row** (Perplexity pattern, ref 1): 2-3 compact cards under the answer: source title, "revizuit de [nume], [data]". This is our trust mechanic; never show an answer without at least one source or an explicit "nu avem încă conținut revizuit despre asta, scrie-ne".
- **Footer line**: "Răspuns din conținut revizuit. Nu înlocuiește consultul." plus one accent action (booking). Follow-up chips below.
- **States**: thinking = orb pulse 1.6s (static under RM) plus text "Caut în conținutul revizuit..."; empty = three chips; error = `danger` token with a word and a retry link; no-match = honest redirect to a human.

---

## 4. Recipes

All assume tokens exist; every animated one is neutralised under `prefers-reduced-motion`. Text contrast rules: only `glow-1` may colour text, and only on `bg` / `surface-1` (PALETTE.md); `glow-2`/`glow-3` stay decorative.

**1. Aurora orb field** (no filter blur: transparent radial edges are cheaper)
```css
.aurora{position:absolute;inset:0;overflow:hidden;z-index:-1;pointer-events:none}
.aurora i{position:absolute;width:55vmax;aspect-ratio:1;border-radius:50%;opacity:.34;will-change:transform;
  background:radial-gradient(circle at 40% 40%,var(--o),transparent 65%);animation:drift var(--t) ease-in-out infinite alternate}
.aurora i:nth-child(1){--o:var(--glow-1);--t:26s;left:-15vmax;top:-22vmax}
.aurora i:nth-child(2){--o:var(--glow-2);--t:30s;right:-20vmax;top:4vmax;animation-delay:-9s}
.aurora i:nth-child(3){--o:var(--glow-3);--t:22s;left:28vw;bottom:-32vmax;opacity:.2}
@keyframes drift{to{transform:translate3d(8vmax,6vmax,0) scale(1.15)}}
@media (prefers-reduced-motion:reduce){.aurora i{animation:none}}
```

**2. Grain overlay** (static, so nothing to reduce; use `opacity .05` + `multiply` on light themes)
```css
body::after{content:"";position:fixed;inset:0;z-index:60;pointer-events:none;opacity:.07;mix-blend-mode:overlay;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
```

**3. Glass card with edge light** (card background keeps at least 72% of `surface-1` so `ink` stays above 4.5:1; re-check the worst-case composite over the brightest orb)
```css
.glass{position:relative;border-radius:var(--radius-lg);border:1px solid var(--line);
  background:color-mix(in oklab,var(--surface-1) 74%,transparent);backdrop-filter:blur(24px) saturate(140%);
  box-shadow:inset 0 1px 0 color-mix(in oklab,var(--ink) 14%,transparent),0 24px 60px -32px #000a}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;opacity:.55;transition:opacity .3s;
  background:conic-gradient(from 200deg at 50% 0,var(--glow-1),transparent 28%,transparent 72%,var(--glow-2));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.glass:hover::before{opacity:.95}
```

**4. Gradient text for one word** (both stops are text-safe on `bg`; sweep plays once, like Dia's `chroma-sweep`)
```css
.hl{background:linear-gradient(100deg,var(--glow-1) 25%,var(--ink) 85%) 100% 0/220% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;animation:sweep 1.4s ease-out .2s forwards}
@keyframes sweep{to{background-position:0 0}}
@media (prefers-reduced-motion:reduce){.hl{animation:none;background-position:0 0}}
```
Provide a plain `color:var(--glow-1)` rule under `@supports not (background-clip:text)`.

**5. Sound waves (EQ-SYNC)**: two hairline paths, seamless loop (period 600 user units, translate by one period)
```html
<svg class="waves" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
  <path class="w a" d="M0 80q150-70 300 0t300 0t300 0t300 0t300 0t300 0"/>
  <path class="w b" d="M0 80q150 50 300 0t300 0t300 0t300 0t300 0t300 0"/></svg>
```
```css
.waves{width:100%;height:160px;overflow:hidden}.w{fill:none;stroke-width:1.25;vector-effect:non-scaling-stroke;animation:sway 14s linear infinite}
.a{stroke:var(--glow-1)}.b{stroke:var(--glow-2);opacity:.6;animation-duration:19s;animation-direction:reverse}
@keyframes sway{to{transform:translateX(-600px)}}
@media (prefers-reduced-motion:reduce){.w{animation:none}}
```

**6. Dawn mist (Hemi-Sync)**, 60s, oversized layer translated rather than repainting gradients
```css
.mist{position:absolute;left:-10%;right:-10%;bottom:0;height:55%;pointer-events:none;animation:mist 60s ease-in-out infinite alternate;
  background:radial-gradient(55% 60% at 22% 100%,color-mix(in oklab,var(--glow-2) 48%,transparent),transparent 70%),
             radial-gradient(45% 55% at 78% 100%,color-mix(in oklab,var(--glow-3) 40%,transparent),transparent 70%);
  -webkit-mask:linear-gradient(to top,#000 25%,transparent);mask:linear-gradient(to top,#000 25%,transparent)}
@keyframes mist{to{transform:translateX(6%)}}
@media (prefers-reduced-motion:reduce){.mist{animation:none}}
```

**7. Progress signal line** (draws as the section scrolls in; stays fully drawn where unsupported). Markup: `<svg class="signal"><path pathLength="1" d="..."/></svg>`
```css
.signal path{fill:none;stroke:var(--glow-1);stroke-width:2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:0}
@supports (animation-timeline:view()){
  .signal path{stroke-dashoffset:1;animation:draw linear both;animation-timeline:view();animation-range:entry 10% cover 55%}}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.signal path{animation:none;stroke-dashoffset:0}}
```

**8. Hover-glow button with pointer-follow** (overlay uses `--accent-hover` so label contrast is the token pair already checked)
```css
.btn{position:relative;isolation:isolate;transition:transform .25s ease-out,box-shadow .25s}
.btn::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;opacity:0;transition:opacity .25s;
  background:radial-gradient(110px circle at var(--mx,50%) var(--my,50%),var(--accent-hover),var(--accent))}
.btn:hover{box-shadow:var(--shadow-glow);transform:translateY(-1px)}.btn:hover::before{opacity:1}
@media (prefers-reduced-motion:reduce){.btn,.btn::before{transition:none}.btn:hover{transform:none}}
```
```js
document.addEventListener('pointermove',e=>{const b=e.target.closest?.('.btn');if(!b)return;const r=b.getBoundingClientRect();
  b.style.setProperty('--mx',e.clientX-r.left+'px');b.style.setProperty('--my',e.clientY-r.top+'px')})
```
(A true magnetic pull is optional: at most 4px, skipped under reduced motion.)

**9. Staggered scroll reveal** (content stays visible where unsupported)
```css
@supports (animation-timeline:view()){
  .rise{animation:rise linear both;animation-timeline:view();animation-range:entry 0% entry 60%}
  .rise:nth-child(2){animation-range:entry 8% entry 68%}.rise:nth-child(3){animation-range:entry 16% entry 76%}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}}
@media (prefers-reduced-motion:reduce){.rise{animation:none}}
```
Note: `animation-timeline` must come after the `animation` shorthand, which resets it.

**10. Streaming caret for the AI answer** (set `data-done` when the SSE stream ends)
```css
.stream::after{content:"";display:inline-block;width:.45ch;height:1.05em;margin-left:3px;vertical-align:-.15em;
  background:var(--accent);border-radius:1px;animation:caret 1s steps(2,start) infinite}
.stream[data-done]::after{display:none}
@keyframes caret{to{visibility:hidden}}
@media (prefers-reduced-motion:reduce){.stream::after{animation:none;opacity:.7}}
```
Container: `aria-live="polite" aria-busy="true"` while streaming, `false` at the end.

**11. View Transitions** (cross-document; progressive enhancement, I did not verify current browser support, so check caniuse before relying on it)
```css
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.4s}
.ask-bar{view-transition-name:ask}
@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}
```

**12. Organic blob** (a 20-30s border-radius morph; behind the ask bar or as a portrait mask)
```css
.blob{aspect-ratio:1;border-radius:60% 40% 55% 45%/50% 60% 40% 50%;animation:morph 24s ease-in-out infinite alternate;
  background:radial-gradient(circle at 30% 30%,var(--glow-2),var(--glow-1) 60%,transparent 72%);opacity:.5}
@keyframes morph{to{border-radius:42% 58% 40% 60%/58% 42% 60% 40%;transform:rotate(25deg)}}
@media (prefers-reduced-motion:reduce){.blob{animation:none}}
```

**13. Reading progress hairline (Blog)**
```css
.read{position:fixed;inset:0 0 auto;height:2px;background:var(--glow-1);transform-origin:0 50%;transform:scaleX(0)}
@supports (animation-timeline:scroll()){.read{animation:grow linear both;animation-timeline:scroll(root)}}
@keyframes grow{to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.read{animation:none;transform:scaleX(0)}}
```

---

## 5. Anti-patterns for these brands

1. Neon, saturated illustration and highlighter blocks (Brain.fm seen: magenta/blue, heavy sans). Contradicts "calm", and EQ-SYNC's brand book bans neon and HUDs.
2. Red or high-chroma glow bands (Raycast seen). Keep the technique (grain-dithered light), change the hue to our teal/gold/violet at low opacity.
3. Generic SaaS-clinic template: pastel blue, tilted stock photo frames, trust-badge row, countdown banners (Calmerry seen). Psizone is human and specific, not a template.
4. Plain, grain-free aurora blobs as the only identity. A 2026 trend roundup calls this the shorthand for "AI product". Limit to two live hues per screen plus grain plus real photography.
5. Floating bottom-right chat bubble; chat sidebars on landings. The guide lives in the hero bar and on its own page.
6. Glass over body text; `glow-2`/`glow-3` as text; gradient text on more than one word; gold text in paragraphs; violet buttons on Hemi-Sync.
7. Boot-sequence, blueprint, coordinates, "INITIALIZE" copy (Heron AI). Sci-fi HUD is banned for EQ-SYNC and wrong for clinic trust.
8. All-caps display headlines and promotional banners over calm imagery (Eight Sleep seen). Sentence case, one idea.
9. Efficacy statistics and counters ("86% see improvement", "119% increase"; seen on Oura and Brain.fm). We never print invented percentages; use true counts (days, sessions, minutes).
10. WebGL/Three.js hero scenes, parallax stacks, scroll-jacking, custom cursors. Heavy, inaccessible, off-stack.
11. Autoplay audio, looping video with sound, streak-shaming, red "missed day".
12. Motion that ignores `prefers-reduced-motion`, more than one ambient loop per screen, or loops shorter than 20s.
13. An AI answer without a source, a reviewer and a date; calling it "AI" or "chatbot" on Psizone (it is "ghidul Psizone"); mixing Hemi-Sync imagery on clinical pages.
