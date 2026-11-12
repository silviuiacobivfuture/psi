/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import type { ImageCredit } from "./picture";

export interface ImageCreditsLabels {
	/** "by", between the work and its author. */
	by: string;
	/** Before the licence link, e.g. "Licence". */
	licence: string;
	/** The link to the work's source page. */
	source: string;
}

export interface ImageCreditsProps {
	credits: ReadonlyArray<ImageCredit>;
	labels: ImageCreditsLabels;
	class?: string;
}

/**
 * The photographs a site uses, each with its author, source and licence. The changes made are said
 * once, in the page's own words, beside the list.
 */
export function ImageCredits({
	credits,
	labels,
	class: className,
}: ImageCreditsProps): JSX.Element {
	return (
		<ul class={cx("divide-y divide-line border-y border-line", className)}>
			{credits.map((c) => (
				<li class="py-5">
					<p class="text-body text-ink">
						<cite class="not-italic font-semibold">{c.title}</cite>
						{` ${labels.by} ${c.author}`}
					</p>
					<p class="mt-1 text-body-sm text-ink-muted">
						{`${labels.licence}: `}
						<a
							class="underline underline-offset-4 hover:text-ink"
							href={c.licenceUrl}
							rel="license"
						>
							{c.licence}
						</a>
						{" · "}
						<a class="underline underline-offset-4 hover:text-ink" href={c.sourceUrl}>
							{labels.source}
						</a>
					</p>
				</li>
			))}
		</ul>
	);
}
