/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface DayIndexProps {
	/** Translated word before the numeral, e.g. "Ziua". */
	dayWord: string;
	day: number;
	total: number;
	/** Translated accessible summary, e.g. "Ziua 1 din 21". */
	label: string;
	/** Optional figure caption in mono, e.g. "Fig. 01 — …". */
	caption?: string;
	class?: string;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * The hero face of a programme: a large Fraunces numeral over a tick index (one tick per day).
 * Past days are drawn, today stands tall, the rest wait in hairline. Never a missed state.
 */
export function DayIndex({
	dayWord,
	day,
	total,
	label,
	caption,
	class: className,
}: DayIndexProps): JSX.Element {
	const days = Array.from({ length: total }, (_, i) => i + 1);
	return (
		<figure class={cx("pz-dayindex", className)}>
			<div class="pz-dayindex__num" role="img" aria-label={label}>
				<span class="pz-dayindex__word" aria-hidden="true">
					{dayWord}
				</span>
				<span class="pz-dayindex__day" aria-hidden="true">
					{day}
				</span>
				<span class="pz-dayindex__total" aria-hidden="true">{`/ ${total}`}</span>
			</div>
			<ol class="pz-dayindex__ticks" aria-hidden="true">
				{days.map((d) => (
					<li class={d < day ? "is-done" : d === day ? "is-today" : "is-next"} />
				))}
			</ol>
			<div class="pz-dayindex__scale" aria-hidden="true">
				<span>{pad(1)}</span>
				<span>{pad(Math.ceil(total / 2))}</span>
				<span>{pad(total)}</span>
			</div>
			{caption ? <figcaption class="pz-dayindex__caption">{caption}</figcaption> : null}
		</figure>
	);
}
