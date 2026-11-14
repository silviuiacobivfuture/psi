import type { JSX } from "hono/jsx/jsx-runtime";
import { monthLong, monthStart, parseDay, range, weekdayShort, weekStart } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

/**
 * The month: a day per cell, its visits counted (the load as a bar, the count in words); tapping a day opens it. The
 * counts come from the service's summary: the month never reads its visits one by one.
 */
export function MonthGrid({
	days: counts,
	date,
	locale,
	today,
}: {
	days: ReadonlyMap<string, number>;
	date: string;
	locale: Locale;
	today: string;
}): JSX.Element {
	const first = monthStart(date);
	const start = weekStart(first);
	const days = range(start, 42);
	const peak = Math.max(1, ...counts.values());
	const month = parseDay(first).getUTCMonth();
	const o = at(locale);
	return (
		<section class="cal-month" id="cal" aria-label={monthLong(locale, first)}>
			{range(start, 7).map((d) => (
				<div key={d} class="cal-month__dow">
					{weekdayShort(locale, d)}
				</div>
			))}
			{days.map((d) => {
				const n = counts.get(d) ?? 0;
				return (
					<a
						key={d}
						class="cal-month__day"
						href={`/calendar?view=day&date=${d}`}
						data-day={d}
						data-count={n}
						data-out={parseDay(d).getUTCMonth() === month ? "false" : "true"}
						aria-current={d === today ? "date" : undefined}
					>
						<span class="cal-month__n">{Number(d.slice(8))}</span>
						{n > 0 ? (
							<>
								<span class="cal-month__bar" style={`--load:${n / peak}`} />
								<span class="cal-month__count">{m.count_appointments({ n }, o)}</span>
							</>
						) : null}
					</a>
				);
			})}
		</section>
	);
}
