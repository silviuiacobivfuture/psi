import { StatCard } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { formatMoney } from "../domain/money";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Figures, Report } from "../port/report-schema";
import { type DeltaKind, deltaText, hours, num, pctText, percent } from "./format";

interface Measure {
	cancelPct: number | null;
	noShowPct: number | null;
	occupancyPct: number | null;
	conversionPct: number | null;
}

const measure = (f: Figures): Measure => ({
	cancelPct: percent(f.cancelled, f.appointments + f.cancelled),
	noShowPct: percent(f.noShow, f.appointments),
	occupancyPct: percent(f.bookedMin, f.capacityMin),
	conversionPct: percent(f.requestsConverted, f.requests),
});

/** The tile's second line: the previous period's figure and how far this one moved from it. */
function against(
	now: number | null,
	before: number | null | undefined,
	say: (n: number) => string,
	kind: DeltaKind,
	locale: Locale,
): string | undefined {
	if (before === undefined || before === null || now === null) return undefined;
	return m.st_prev({ prev: say(before), delta: deltaText(now, before, kind, locale) }, at(locale));
}

/** The KPI tiles of the screen: the live counts, then the period's figures with their comparison. */
export function Tiles({
	report,
	locale,
	money,
}: {
	report: Report;
	locale: Locale;
	money: boolean;
}): JSX.Element {
	const o = at(locale);
	const { current: c, previous: p, snapshot: s } = report;
	const now = measure(c);
	const was = p === null ? null : measure(p);
	const pct = (n: number): string => pctText(n, locale);
	const tile = (
		key: string,
		label: string,
		value: string,
		hint: string | undefined,
	): JSX.Element => (
		<div key={key} data-kpi={key}>
			<StatCard label={label} value={value} {...(hint === undefined ? {} : { hint })} />
		</div>
	);
	return (
		<div class="stat-tiles">
			{tile("today", m.st_kpi_today({}, o), num(s.today, locale), undefined)}
			{tile("week", m.st_kpi_week({}, o), num(s.week, locale), undefined)}
			{tile("month", m.st_kpi_month({}, o), num(s.month, locale), undefined)}
			{tile(
				"appointments",
				m.st_kpi_appts({}, o),
				num(c.appointments, locale),
				against(c.appointments, p?.appointments, (n) => num(n, locale), "count", locale),
			)}
			{tile(
				"occupancy",
				m.st_kpi_occ({}, o),
				pctText(now.occupancyPct, locale),
				[
					m.st_kpi_occ_hint(
						{ booked: hours(c.bookedMin, locale), cap: hours(c.capacityMin, locale) },
						o,
					),
					against(now.occupancyPct, was?.occupancyPct, pct, "points", locale),
				]
					.filter((x) => x !== undefined)
					.join(" · "),
			)}
			{tile(
				"cancellations",
				m.st_kpi_cancel({}, o),
				pctText(now.cancelPct, locale),
				[
					m.st_kpi_cancel_hint({ n: c.cancelled }, o),
					against(now.cancelPct, was?.cancelPct, pct, "points", locale),
				]
					.filter((x) => x !== undefined)
					.join(" · "),
			)}
			{tile(
				"no-shows",
				m.st_kpi_noshow({}, o),
				pctText(now.noShowPct, locale),
				[
					m.st_kpi_noshow_hint({ n: c.noShow }, o),
					against(now.noShowPct, was?.noShowPct, pct, "points", locale),
				]
					.filter((x) => x !== undefined)
					.join(" · "),
			)}
			{tile(
				"clients",
				m.st_kpi_clients({}, o),
				c.newClients === null || c.returningClients === null
					? "—"
					: `${num(c.newClients, locale)} / ${num(c.returningClients, locale)}`,
				c.newClients === null || c.returningClients === null
					? undefined
					: (against(c.newClients, p?.newClients, (n) => num(n, locale), "count", locale) ??
							m.st_kpi_clients_hint({ n: c.newClients, r: c.returningClients }, o)),
			)}
			{money && c.revenueBani !== null
				? tile(
						"revenue",
						m.st_kpi_revenue({}, o),
						formatMoney(c.revenueBani, locale),
						against(c.revenueBani, p?.revenueBani, (n) => formatMoney(n, locale), "count", locale),
					)
				: null}
			{tile(
				"packages",
				m.st_kpi_packages({}, o),
				num(s.packagesActive, locale),
				s.packagesEnding === null ? undefined : m.st_kpi_packages_hint({ n: s.packagesEnding }, o),
			)}
			{tile(
				"requests",
				m.st_kpi_requests({}, o),
				num(c.requests, locale),
				[
					m.st_kpi_requests_hint({ pct: pctText(now.conversionPct, locale) }, o),
					against(c.requests, p?.requests, (n) => num(n, locale), "count", locale),
				]
					.filter((x) => x !== undefined)
					.join(" · "),
			)}
		</div>
	);
}
