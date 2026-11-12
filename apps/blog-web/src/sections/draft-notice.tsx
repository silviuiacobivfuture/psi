import type { DraftArticle } from "@psi/content";
import { StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { draftStatus } from "./article-meta";

/**
 * Above an unreviewed draft (staging only): what it is, that AI helped write it, and where every
 * fact comes from, so the reviewer can check it line by line.
 */
export function DraftNotice({
	article: a,
	locale,
}: {
	article: DraftArticle;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	return (
		<div class="bl-notice">
			<StatusBadge tone="info">{draftStatus(a, locale)}</StatusBadge>
			<p class="mt-4 text-body text-ink">
				{a.kind === "health" ? m.draft_note_health({}, o) : m.draft_note({}, o)}
				{a.aiDrafted ? ` ${m.draft_ai({}, o)}` : ""}
			</p>
			{a.provenance.length > 0 ? (
				<>
					<p class="bl-overline mt-6">{m.draft_provenance({}, o)}</p>
					<ul class="mt-3 space-y-1 font-mono text-[12px] leading-5 text-ink-muted">
						{a.provenance.map((p) => (
							<li>{p}</li>
						))}
					</ul>
				</>
			) : null}
		</div>
	);
}
