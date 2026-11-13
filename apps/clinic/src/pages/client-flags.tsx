import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { BlacklistEntry, NoteCategory } from "../port/schema-clinical";

export const severityText = (s: BlacklistEntry["severity"], locale: Locale): string =>
	m[`cl_sev_${s}` as const]({}, at(locale));
export const blacklistCategoryText = (c: BlacklistEntry["category"], locale: Locale): string =>
	m[`cl_bl_cat_${c}` as const]({}, at(locale));
export const noteCategoryText = (c: NoteCategory, locale: Locale): string =>
	m[`cl_cat_${c}` as const]({}, at(locale));

/** "Listă neagră · motiv": red when it blocks, amber when it warns; the reason is staff-only text. */
export function BlacklistBadge({
	entry,
	locale,
	short = false,
}: {
	entry: BlacklistEntry;
	locale: Locale;
	/** Without the reason (a tile, a narrow row). */
	short?: boolean;
}): JSX.Element {
	const o = at(locale);
	const blocks = entry.severity !== "warn";
	return (
		<span
			class={`cl-flag ${blocks ? "cl-flag--block" : "cl-flag--warn"}`}
			data-blacklist={entry.severity}
			title={`${severityText(entry.severity, locale)} · ${entry.reason}`}
		>
			<Icon name="alert" />
			<span>
				{m.cl_blacklist_badge({}, o)}
				{short ? "" : ` · ${entry.reason}`}
			</span>
		</span>
	);
}
