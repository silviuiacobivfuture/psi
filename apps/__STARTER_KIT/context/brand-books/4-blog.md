# Blog

The shared reading space for articles from all three brands, built on one Payload blog engine. Assumption to confirm: one publication for the group, with each article tagged to a brand and opened in the Blog theme for reading. The feel is **paper, quiet, editorial**: the calm of a good magazine, where nothing competes with the words.

Themes: `blog-light` ("Paper", primary) and `blog-dark` ("Night", for evening reading). A brand site switches to the Blog theme on article pages; its header keeps the brand's `Logo` (pass `brand` explicitly) so readers know whose article it is.

## Who it reads for

Parents and adults searching a question at night or on a phone, often from Google. They need the answer fast, then depth, then a gentle next step.

## Voice

- Answer first: the first paragraph answers the headline's question.
- Every health article names its author and its clinical reviewer, with the review date.
- Calm and explanatory, never alarmist. Cite sources with links.
- End with one next step: a hub, the AI guide, or booking. No pop-ups mid-article.

## Colour

- Paper ground (`bg` #FAF7F2) and warm black ink (#1A1714); night is warm charcoal with parchment ink.
- `accent` is ink: buttons are quiet ink pills so they don't shout inside an article.
- `glow-1` teal underlines links and draws the quote rule; `glow-2` and `glow-3` appear only in cover art.

## Type

Long-form text in **Fraunces at text size** (20/34, `opsz` 18) inside `Prose`, 680px measure. Headings in Fraunces; metadata in mono; interface in Manrope. This is the only place body copy is set in the serif.

## Ambient

Barely there (16% opacity, no motion), used only in article cover art when there is no photo.

## Imagery

- One strong cover per article: a real photo, or brand ambient art when there is none.
- In-article images are explanatory (diagrams, QEEG maps, steps), with captions.
- Never: stock brains, smiling-models-with-headphones stock, decorative GIFs.

## Signature components

`Prose`, `ArticleCard`, `GuideMessage` (an "Ask the guide about this article" block at the end), `Logo` with an explicit `brand`.

## Do and don't

| Do | Don't |
| --- | --- |
| Answer in the first paragraph | Long intros |
| Author, reviewer, review date on every health article | Anonymous health advice |
| One next step at the end | Pop-ups and mid-article banners |
| Serif body, generous leading | Mono or sans long reads |
