/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface ProgramTrackerProps {
	title: string;
	/** Translated, e.g. "Ziua 7 din 21". */
	subtitle: string;
	total: number;
	done: number;
	/** Translated accessible name of a day, e.g. (d, "done") → "Ziua 3, completă". */
	dayLabel: (day: number, state: "done" | "today" | "next") => string;
	note?: string;
	class?: string;
}

/** The 21 days, celebrating showing up; never streak-shaming. */
export function ProgramTracker({
	title,
	subtitle,
	total,
	done,
	dayLabel,
	note,
	class: className,
}: ProgramTrackerProps): JSX.Element {
	const today = done + 1;
	const days = Array.from({ length: total }, (_, i) => i + 1);
	return (
		<section class={cx("pz-tracker", className)} aria-label={title}>
			<div class="pz-tracker__head">
				<div>
					<div class="pz-tracker__title">{title}</div>
					<div class="pz-tracker__sub">{subtitle}</div>
				</div>
				<div class="pz-tracker__count">{`${done}/${total}`}</div>
			</div>
			<ol class="pz-tracker__days">
				{days.map((d) => {
					const state = d <= done ? "done" : d === today ? "today" : "next";
					return (
						<li class={`pz-tracker__day is-${state}`} aria-label={dayLabel(d, state)}>
							{d}
						</li>
					);
				})}
			</ol>
			{note ? <p class="pz-tracker__note">{note}</p> : null}
		</section>
	);
}
