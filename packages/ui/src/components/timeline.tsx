/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface TimelineChapter {
	id: string;
	/** Short mark on the spine, e.g. "01". */
	index: string;
	/** The chapter's name: "Galați", "Pe pistă". */
	eyebrow: string;
	title: string;
	text: string;
	/** Milestones of the chapter, shown as quiet chips. */
	marks?: ReadonlyArray<string>;
}

export interface TimelineProps {
	/** Accessible name of the list. */
	label: string;
	chapters: ReadonlyArray<TimelineChapter>;
	class?: string;
}

/**
 * A composite timeline: a spine that draws itself as the page scrolls, and chapters that rise out
 * of depth into the reading plane, settle, then recede. Depth is motion, not decoration: no
 * gradients, no shadows. Everything is still under prefers-reduced-motion.
 */
export function Timeline({ label, chapters, class: className }: TimelineProps): JSX.Element {
	return (
		<ol class={cx("pz-timeline", className)} aria-label={label}>
			<span class="pz-timeline__spine" aria-hidden="true" />
			{chapters.map((c, i) => (
				<li id={c.id} class={cx("pz-timeline__chapter", i % 2 === 1 && "is-right")}>
					<span class="pz-timeline__node" aria-hidden="true">
						{c.index}
					</span>
					<article class="pz-timeline__card">
						<p class="pz-timeline__eyebrow">{c.eyebrow}</p>
						<h3 class="pz-timeline__title">{c.title}</h3>
						<p class="pz-timeline__text">{c.text}</p>
						{c.marks && c.marks.length > 0 ? (
							<ul class="pz-timeline__marks">
								{c.marks.map((m) => (
									<li>{m}</li>
								))}
							</ul>
						) : null}
					</article>
				</li>
			))}
		</ol>
	);
}
