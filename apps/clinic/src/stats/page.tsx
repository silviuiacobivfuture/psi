import { Banner, EmptyState, Icon, PageHeader, Segmented, Toolbar } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import { formatMoney } from "../domain/money";
import { PERIODS, type Period, type Span, type StatsQuery } from "../domain/periods";
import type { Ctx } from "../lib/context";
import { addDays, weekdayShort } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Report, ReportSlice } from "../port/report-schema";
import { Bars, Columns, Heat } from "./charts";
import { hours, num, spanText, trendOf } from "./format";
import { DataTable } from "./table";
import { Tiles } from "./tiles";

export interface StatsView {
	query: StatsQuery;
	span: Span;
	compare: Span | null;
	people: ReadonlyArray<{ id: string; name: string }>;
	/** Null when the figures could not be had. */
	report: Report | null;
}

const PERIOD_LABEL: Readonly<Record<Period, (l: Locale) => string>> = {
	today: (l) => m.st_p_today({}, at(l)),
	week: (l) => m.st_p_week({}, at(l)),
	month: (l) => m.st_p_month({}, at(l)),
	"last-month": (l) => m.st_p_last_month({}, at(l)),
	"last-30": (l) => m.st_p_last_30({}, at(l)),
	custom: (l) => m.st_p_custom({}, at(l)),
};

const hrefFor = (q: StatsQuery, change: Partial<StatsQuery>): string => {
	const merged = { ...q, ...change };
	const p = new URLSearchParams({ period: merged.period, compare: merged.compare });
	if (merged.period === "custom") {
		if (merged.from !== undefined) p.set("from", merged.from);
		if (merged.to !== undefined) p.set("to", merged.to);
	}
	if (merged.person !== undefined) p.set("person", merged.person);
	return `/stats?${p.toString()}`;
};

function Controls({ ctx, view }: { ctx: Ctx; view: StatsView }): JSX.Element {
	const o = at(ctx.locale);
	const q = view.query;
	return (
		<>
			<Segmented
				label={m.st_period({}, o)}
				current={q.period}
				items={PERIODS.filter((p) => p !== "custom").map((p) => ({
					key: p,
					label: PERIOD_LABEL[p](ctx.locale),
					href: hrefFor(q, { period: p }),
				}))}
			/>
			<form method="get" action="/stats" class="stat-controls" aria-label={m.st_period({}, o)}>
				<input type="hidden" name="period" value="custom" />
				<label class="adm-field">
					<span>{m.st_from({}, o)}</span>
					<input class="adm-input" type="date" name="from" value={view.span.from} required />
				</label>
				<label class="adm-field">
					<span>{m.st_to({}, o)}</span>
					<input class="adm-input" type="date" name="to" value={view.span.to} required />
				</label>
				<label class="adm-field">
					<span>{m.st_person({}, o)}</span>
					<select class="adm-input" name="person">
						<option value="">{m.st_all_people({}, o)}</option>
						{view.people.map((p) => (
							<option key={p.id} value={p.id} selected={q.person === p.id}>
								{p.name}
							</option>
						))}
					</select>
				</label>
				<label class="adm-check">
					<input type="hidden" name="compare" value="0" />
					<input type="checkbox" name="compare" value="1" checked={q.compare === "1"} />
					{m.st_compare({}, o)}
				</label>
				<button class="adm-btn adm-btn--primary" type="submit">
					{m.st_apply({}, o)}
				</button>
			</form>
		</>
	);
}

function Card({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: string;
	children: JSX.Element | JSX.Element[];
}): JSX.Element {
	return (
		<section class="adm-card stat-card" aria-label={title}>
			<h2 class="adm-h2">{title}</h2>
			{hint === undefined ? null : <p class="adm-muted">{hint}</p>}
			{children}
		</section>
	);
}

function sliceRows(
	list: ReadonlyArray<ReportSlice>,
	ctx: Ctx,
	money: boolean,
): { head: string[]; rows: string[][] } {
	const o = at(ctx.locale);
	return {
		head: [
			m.st_t_name({}, o),
			m.st_t_appts({}, o),
			m.st_t_att({}, o),
			m.st_t_canc({}, o),
			m.st_t_noshow({}, o),
			m.st_t_hours({}, o),
			...(money ? [m.st_t_revenue({}, o)] : []),
		],
		rows: list.map((s) => [
			s.name,
			num(s.appointments, ctx.locale),
			s.attended === null ? "—" : num(s.attended, ctx.locale),
			s.cancelled === null ? "—" : num(s.cancelled, ctx.locale),
			s.noShow === null ? "—" : num(s.noShow, ctx.locale),
			hours(s.bookedMin, ctx.locale),
			...(money ? [s.revenueBani === null ? "—" : formatMoney(s.revenueBani, ctx.locale)] : []),
		]),
	};
}

function Breakdown({
	ctx,
	id,
	title,
	list,
	money,
	linkPeople,
	byHours,
}: {
	ctx: Ctx;
	id: string;
	title: string;
	list: ReadonlyArray<ReportSlice>;
	money: boolean;
	linkPeople?: (id: string) => string;
	byHours?: boolean;
}): JSX.Element | null {
	if (list.length === 0) return null;
	const o = at(ctx.locale);
	const table = sliceRows(list, ctx, money);
	return (
		<Card title={title}>
			<div class="stat-pair">
				<Bars
					id={id}
					title={m.st_chart_bars({ title }, o)}
					bars={list.map((s) => ({
						label: s.name,
						value: byHours === true ? s.bookedMin : s.appointments,
						text:
							byHours === true
								? `${hours(s.bookedMin, ctx.locale)} h`
								: num(s.appointments, ctx.locale),
						...(linkPeople === undefined
							? {}
							: { href: linkPeople(s.id), linkLabel: m.st_drill_open({ name: s.name }, o) }),
					}))}
				/>
				<DataTable caption={title} head={table.head} rows={table.rows} />
			</div>
		</Card>
	);
}

function Body({ ctx, view, report }: { ctx: Ctx; view: StatsView; report: Report }): JSX.Element {
	const o = at(ctx.locale);
	const money = ctx.can.group("money") && report.current.revenueBani !== null;
	const c = report.current;
	const trend = trendOf(c, report.previous, ctx.locale);
	// 2024-01-01 was a Monday: seven days from it are the weekday names, in the viewer's language.
	const days = [0, 1, 2, 3, 4, 5, 6].map((i) => weekdayShort(ctx.locale, addDays("2024-01-01", i)));
	const drilled = view.query.person !== undefined;
	const trendTitle = trend.weekly ? m.st_c_week({}, o) : m.st_c_day({}, o);
	const busy = c.heat.flat().some((n) => n > 0);
	return (
		<>
			<Tiles report={report} locale={ctx.locale} money={money} />
			{c.appointments + c.cancelled === 0 ? (
				<EmptyState icon="chart" title={m.st_empty({}, o)} />
			) : (
				<>
					<Card title={trendTitle}>
						<div class="stat-pair">
							<Columns columns={trend.points} title={m.st_chart_trend({}, o)} desc={trendTitle} />
							<DataTable
								caption={trendTitle}
								head={[
									trend.weekly ? m.st_t_week({}, o) : m.st_t_day({}, o),
									m.st_t_current({}, o),
									...(report.previous === null ? [] : [m.st_t_previous({}, o)]),
								]}
								rows={trend.points.map((p) => [
									trend.weekly ? p.label : `${p.date.slice(8)}.${p.date.slice(5, 7)}`,
									num(p.value, ctx.locale),
									...(p.previous === undefined ? [] : [num(p.previous, ctx.locale)]),
								])}
								scroll
							/>
						</div>
					</Card>
					{drilled ? null : (
						<Breakdown
							ctx={ctx}
							id="stat-person"
							title={m.st_c_person({}, o)}
							list={c.byPerson.filter((s) => s.appointments + (s.cancelled ?? 0) > 0)}
							money={money}
							linkPeople={(id) => hrefFor(view.query, { person: id })}
						/>
					)}
					<Breakdown
						ctx={ctx}
						id="stat-service"
						title={m.st_c_service({}, o)}
						list={c.byService}
						money={money}
					/>
					<Breakdown
						ctx={ctx}
						id="stat-room"
						title={m.st_c_room({}, o)}
						list={c.byRoom.filter((s) => s.appointments > 0)}
						money={false}
						byHours
					/>
					{busy ? (
						<Card title={m.st_c_heat({}, o)} hint={m.st_c_heat_hint({}, o)}>
							<section class="stat-heatscroll" tabindex={0} aria-label={m.st_chart_heat({}, o)}>
								<Heat
									heat={c.heat}
									days={days}
									title={m.st_chart_heat({}, o)}
									cell={(day, hour, n) => m.st_heat_cell({ day, hour, n }, o)}
								/>
							</section>
							<details class="stat-data">
								<summary>{m.st_data({}, o)}</summary>
								<DataTable
									caption={m.st_c_heat({}, o)}
									head={[
										m.st_t_weekday({}, o),
										...Array.from({ length: 14 }, (_, i) => String(7 + i)),
									]}
									rows={days.map((d, r) => [
										d,
										...Array.from({ length: 14 }, (_, i) => String(c.heat[r]?.[7 + i] ?? 0)),
									])}
									scroll
								/>
							</details>
						</Card>
					) : null}
				</>
			)}
		</>
	);
}

/** The statistics screen: the period and who, the KPI tiles, then the charts each with its table. */
export async function renderStats(ctx: Ctx, view: StatsView): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const who = view.people.find((p) => p.id === view.query.person);
	const title = who === undefined ? m.nav_stats({}, o) : m.st_drill_title({ name: who.name }, o);
	return Page({
		ctx,
		current: "stats",
		title: m.nav_stats({}, o),
		children: (
			<div class="adm-page stat-page">
				<PageHeader title={title}>
					{who === undefined ? null : (
						<a class="adm-btn" href={hrefFor(view.query, { person: undefined })}>
							<Icon name="chevron-left" />
							{m.st_drill_back({}, o)}
						</a>
					)}
				</PageHeader>
				<p class="adm-muted">
					{spanText(view.span.from, view.span.to, ctx.locale)}
					{view.compare === null
						? null
						: ` · ${m.st_vs({ span: spanText(view.compare.from, view.compare.to, ctx.locale) }, o)}`}
				</p>
				<Toolbar>
					<Controls ctx={ctx} view={view} />
				</Toolbar>
				{view.report === null ? (
					<Banner tone="error" icon="alert">
						<strong>{m.st_error_title({}, o)}</strong>
						<p style="margin:2px 0 8px">{m.st_error_text({}, o)}</p>
						<a class="adm-btn" href={hrefFor(view.query, {})}>
							{m.retry({}, o)}
						</a>
					</Banner>
				) : (
					<Body ctx={ctx} view={view} report={view.report} />
				)}
			</div>
		),
	});
}
