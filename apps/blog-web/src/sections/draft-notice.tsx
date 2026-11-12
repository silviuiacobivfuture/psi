import type { DraftArticle } from "@psi/content";
import { StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { draftStatus } from "./article-meta";

/** The web addresses among a draft's provenance: repository paths mean nothing to a reader. */
function webSources(provenance: ReadonlyArray<string>): string[] {
	return provenance.filter((p) => /^https?:\/\//.test(p));
}

/**
 * Above an unreviewed draft: what it is and that AI helped write it, then where its facts come
 * from, collapsed (open on demand) and limited to web addresses. The reviewer sees the full
 * provenance, repository files included, in the CMS.
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
			{webSources(a.provenance).length > 0 ? (
				<details class="bl-provenance mt-5">
					<summary class="bl-overline">{m.draft_provenance({}, o)}</summary>
					<ul class="mt-3 space-y-1 font-mono text-[12px] leading-5 text-ink-muted">
						{webSources(a.provenance).map((p) => (
							<li class="break-words">{p}</li>
						))}
					</ul>
				</details>
			) : null}
		</div>
	);
}
