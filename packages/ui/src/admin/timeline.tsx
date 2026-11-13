/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { type Status, StatusPill } from "./parts";

export interface TimelineItem {
	key: string;
	/** When, as written ("Mar 4 Nov, 10:00"). */
	when: string;
	title: string;
	/** A status draws the marker and the pill; none is a plain upcoming entry. */
	status: Status | null;
	statusLabel: string;
	href?: string;
}

export interface TimelineProps {
	items: ReadonlyArray<TimelineItem>;
	label: string;
	empty: string;
}

/** A compact vertical timeline: a marker per entry, joined by a line, the status in words. */
export function Timeline({ items, label, empty }: TimelineProps): JSX.Element {
	if (items.length === 0) return <p class="adm-muted">{empty}</p>;
	return (
		<ol class="adm-timeline" aria-label={label}>
			{items.map((i) => (
				<li key={i.key} class={cx("adm-timeline__item", i.status === null && "is-upcoming")}>
					<span
						class="adm-timeline__mark"
						data-status={i.status ?? "upcoming"}
						aria-hidden="true"
					/>
					<div class="adm-timeline__body">
						{i.href === undefined ? (
							<span class="adm-timeline__when">{i.when}</span>
						) : (
							<a class="adm-timeline__when" href={i.href}>
								{i.when}
							</a>
						)}
						<span class="adm-muted">{i.title}</span>
					</div>
					{i.status === null ? (
						<span class="adm-muted adm-timeline__state">{i.statusLabel}</span>
					) : (
						<StatusPill status={i.status} label={i.statusLabel} />
					)}
				</li>
			))}
		</ol>
	);
}
