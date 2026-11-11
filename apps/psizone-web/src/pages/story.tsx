import { AmbientField, Prose, Timeline } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { STORY_CHAPTERS, STORY_PARAGRAPHS, STORY_PULL_QUOTE } from "../content/story";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Closing, Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/** After which paragraph the story's turning line is set apart. */
const QUOTE_AFTER = 10;

export function StoryPage({
	locale,
	theme,
	origin,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}/povestea`;
	const chapters = STORY_CHAPTERS.map((c, i) => ({
		id: c.id,
		index: String(i + 1).padStart(2, "0"),
		eyebrow: c.eyebrow[locale],
		title: c.title[locale],
		text: c.text[locale],
		marks: c.marks.map((mark) => mark[locale]),
	}));
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${m.story_title({}, o)} — Psizone`}
			description={m.story_lead({}, o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="-mt-20">
					<div class="mx-auto max-w-6xl px-5 pb-24 pt-44">
						<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
							{m.story_overline({}, o)}
						</p>
						<h1 class="display mt-6 max-w-4xl text-display-xl text-ink">{m.story_title({}, o)}</h1>
						<p class="mt-8 max-w-2xl text-body-lg text-ink-muted">{m.story_lead({}, o)}</p>
					</div>
				</AmbientField>

				<section class="mx-auto max-w-6xl px-5 py-24" aria-labelledby="istoric">
					<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
						{m.story_timeline_overline({}, o)}
					</p>
					<h2 id="istoric" class="display mt-4 max-w-3xl text-display-lg text-ink">
						{m.story_timeline_title({}, o)}
					</h2>
					<Timeline class="mt-20" label={m.story_timeline_label({}, o)} chapters={chapters} />
				</section>

				<section class="border-t border-line bg-surface-1" aria-labelledby="povestea">
					<div class="mx-auto max-w-6xl px-5 py-24">
						<p id="povestea" class="text-overline uppercase tracking-[0.14em] text-ink-muted">
							{m.story_full_overline({}, o)}
						</p>
						<Prose class="mt-10">
							{STORY_PARAGRAPHS.map((p, i) => (
								<>
									<p>{p[locale]}</p>
									{i === QUOTE_AFTER ? (
										<blockquote class="story-quote">
											<p>{STORY_PULL_QUOTE[locale]}</p>
										</blockquote>
									) : null}
								</>
							))}
						</Prose>
					</div>
				</section>
				<Closing locale={locale} />
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
