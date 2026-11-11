import type { Article, DraftArticle } from "@psi/content";
import type { JSX } from "hono/jsx/jsx-runtime";
import { readingMinutes } from "../content/articles";
import { brandName, topicLabel } from "../content/topics";
import { longDate } from "../dates";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** "Psizone · Autism": the brand and topic overline every list entry and article carries. */
export function overline(a: Article, locale: Locale): string {
	return `${brandName(a.brand, locale)} · ${topicLabel(a.topic, locale)}`;
}

/** A draft's status: a health draft says it has not been reviewed clinically. */
export function draftStatus(a: DraftArticle, locale: Locale): string {
	const o = at(locale);
	return a.kind === "health" ? m.status_draft_health({}, o) : m.status_draft({}, o);
}

/** The mono metadata of a list entry: date and reading time, or the review state. */
export function RowMeta({ article: a, locale }: { article: Article; locale: Locale }): JSX.Element {
	const o = at(locale);
	if (a.status === "in-review") {
		return (
			<>
				<span class="bl-status">{m.status_in_review({}, o)}</span>
				<span>{m.byline_pending({}, o)}</span>
			</>
		);
	}
	const minutes = <span>{m.reading_time({ minutes: String(readingMinutes(a, locale)) }, o)}</span>;
	if (a.status === "draft") {
		return (
			<>
				<span class="bl-status">{draftStatus(a, locale)}</span>
				<time datetime={a.draftedAt}>{longDate(a.draftedAt, locale)}</time>
				{minutes}
			</>
		);
	}
	return (
		<>
			<time datetime={a.publishedAt}>{longDate(a.publishedAt, locale)}</time>
			{minutes}
		</>
	);
}

/** The byline row under the standfirst: author · reviewed by · date, or the review state. */
export function Byline({ article: a, locale }: { article: Article; locale: Locale }): JSX.Element {
	const o = at(locale);
	if (a.status === "in-review") {
		return (
			<p class="bl-byline">
				<span class="bl-status">{m.status_in_review({}, o)}</span>
				<span>{m.byline_pending({}, o)}</span>
			</p>
		);
	}
	const minutes = <span>{m.reading_time({ minutes: String(readingMinutes(a, locale)) }, o)}</span>;
	if (a.status === "draft") {
		return (
			<p class="bl-byline">
				<span class="bl-status">{draftStatus(a, locale)}</span>
				<time datetime={a.draftedAt}>
					{m.byline_drafted({ date: longDate(a.draftedAt, locale) }, o)}
				</time>
				{minutes}
			</p>
		);
	}
	const published = (
		<time datetime={a.publishedAt}>
			{m.byline_published({ date: longDate(a.publishedAt, locale) }, o)}
		</time>
	);
	if (a.kind === "editorial") {
		return (
			<p class="bl-byline">
				<span class="text-ink">{m.byline_by({ name: a.author.team[locale] }, o)}</span>
				<span>{m.byline_editorial({}, o)}</span>
				{published}
				{minutes}
			</p>
		);
	}
	return (
		<p class="bl-byline">
			<span class="text-ink">{m.byline_by({ name: a.author.name }, o)}</span>
			<span>
				{m.byline_reviewed(
					{ name: a.reviewer.name, date: longDate(a.reviewer.reviewedAt, locale) },
					o,
				)}
			</span>
			{published}
			{minutes}
		</p>
	);
}
