import type { JSX } from "hono/jsx/jsx-runtime";
import { roleLabel } from "../chrome";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Column, Fold, Mark } from "./model";

/** What a mark says, in words: the text a screen reader reads and a phone shows. */
export function markWords(mark: Mark, locale: Locale): string {
	const o = at(locale);
	switch (mark) {
		case "all":
			return m.rm_mark_all({}, o);
		case "assigned":
			return m.rm_mark_assigned({}, o);
		case "own":
			return m.rm_mark_own({}, o);
		case "none":
			return m.rm_mark_none({}, o);
		default: {
			const never: never = mark;
			return never;
		}
	}
}

export function foldWords(fold: Fold, locale: Locale): string {
	const o = at(locale);
	switch (fold) {
		case "full":
			return m.rm_mark_all({}, o);
		case "partial":
			return m.rm_mark_partial({}, o);
		case "none":
			return m.rm_mark_none({}, o);
		default: {
			const never: never = fold;
			return never;
		}
	}
}

/** One mark: ✓ for everything, a few words for a narrowed scope, — for nothing; never colour alone. */
export function MarkView({ mark, locale }: { mark: Mark; locale: Locale }): JSX.Element {
	const words = markWords(mark, locale);
	if (mark === "all" || mark === "none")
		return (
			<span class={`rm-mark rm-mark--${mark}`}>
				<span aria-hidden="true">{mark === "all" ? "✓" : "—"}</span>
				<span class="adm-sr">{words}</span>
			</span>
		);
	return <span class={`rm-mark rm-mark--part`}>{words}</span>;
}

export function FoldView({ fold, locale }: { fold: Fold; locale: Locale }): JSX.Element {
	const words = foldWords(fold, locale);
	if (fold === "partial") return <span class="rm-mark rm-mark--part">{words}</span>;
	return (
		<span class={`rm-mark rm-mark--${fold === "full" ? "all" : "none"}`}>
			<span aria-hidden="true">{fold === "full" ? "✓" : "—"}</span>
			<span class="adm-sr">{words}</span>
		</span>
	);
}

/** Under a mark held only through an included role: "din Recepție". Nothing for a row the column holds itself. */
export function FromView({
	column,
	row,
	locale,
}: {
	column: Column;
	row: string;
	locale: Locale;
}): JSX.Element | null {
	const from = column.from.get(row);
	if (from === undefined) return null;
	return (
		<small class="rm-from adm-muted" data-from={from.id}>
			{m.rm_from({ role: roleLabel(from, locale) }, at(locale))}
		</small>
	);
}

/** A column's name as people read it: the platform role's own words, a seed role translated, a custom role's name. */
export const columnName = (c: Column, locale: Locale): string =>
	c.kind === "platform" ? m.rm_platform({}, at(locale)) : roleLabel(c, locale);

/** The column's heading: its name, and in words whether it is the viewer's own or a custom role. */
export function ColumnHead({
	column,
	yours,
	locale,
}: {
	column: Column;
	yours: boolean;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	return (
		<span class="rm-col">
			<span class="rm-col__name">{columnName(column, locale)}</span>
			{column.kind === "platform" ? (
				<span class="rm-col__note">{m.rm_platform_short({}, o)}</span>
			) : null}
			{column.kind === "role" && !column.system ? (
				<span class="rm-col__note">{m.rm_custom({}, o)}</span>
			) : null}
			{yours ? <span class="rm-you">{m.rm_yours({}, o)}</span> : null}
		</span>
	);
}

export function Legend({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const items: ReadonlyArray<{ mark: JSX.Element; text: string }> = [
		{ mark: <MarkView mark="all" locale={locale} />, text: m.rm_legend_all({}, o) },
		{ mark: <MarkView mark="own" locale={locale} />, text: m.rm_legend_own({}, o) },
		{ mark: <MarkView mark="assigned" locale={locale} />, text: m.rm_legend_assigned({}, o) },
		{ mark: <FoldView fold="partial" locale={locale} />, text: m.rm_legend_partial({}, o) },
		{ mark: <MarkView mark="none" locale={locale} />, text: m.rm_legend_none({}, o) },
	];
	return (
		<section class="adm-card rm-legend" aria-label={m.rm_legend({}, o)} data-legend>
			<h2 class="adm-h2">{m.rm_legend({}, o)}</h2>
			<ul>
				{items.map((i) => (
					<li key={i.text}>
						{i.mark} <span>{i.text}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
