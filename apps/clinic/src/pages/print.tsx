import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { appName } from "../chrome";
import { Layout } from "../layout";
import type { Ctx } from "../lib/context";
import { dayLong, hhmm, IsoDay, range, todayIso, weekStart } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { CalendarData } from "../port/port";
import type { Appointment, Column } from "../port/schema";

export const PrintQuerySchema = z.object({
	view: z.enum(["day", "week"]).catch("day"),
	date: IsoDay.catch(""),
	/** "all", or one column's id. */
	scope: z.string().max(40).catch("all"),
	orient: z.enum(["portrait", "landscape"]).catch("portrait"),
});
export type PrintQuery = z.infer<typeof PrintQuerySchema>;

interface Row {
	a: Appointment;
	who: string;
	service: string;
}

const rowsOf = (
	data: CalendarData,
	col: Column,
	dates: ReadonlyArray<string>,
): Map<string, Row[]> => {
	const out = new Map<string, Row[]>();
	for (const d of dates) {
		const list = data.appointments
			.filter((a) => a.columnId === col.id && a.date === d)
			.sort((x, y) => x.startMin - y.startMin)
			.map((a) => ({
				a,
				who: a.title ?? data.clients.find((c) => c.id === a.clientId)?.name ?? "",
				service: data.services.find((s) => s.id === a.serviceId)?.name ?? "",
			}));
		if (list.length > 0) out.set(d, list);
	}
	return out;
};

const KIND = (kind: Column["kind"], locale: Locale): string => {
	const o = at(locale);
	return kind === "person"
		? m.column_person({}, o)
		: kind === "device"
			? m.column_device({}, o)
			: kind === "room"
				? m.column_room({}, o)
				: m.column_group({}, o);
};

function TableFor({
	data,
	col,
	dates,
	locale,
	week,
}: {
	data: CalendarData;
	col: Column;
	dates: ReadonlyArray<string>;
	locale: Locale;
	week: boolean;
}): JSX.Element {
	const o = at(locale);
	const byDay = rowsOf(data, col, dates);
	return (
		<section class="prt__col">
			<h2>
				{col.name} <small>{KIND(col.kind, locale)}</small>
			</h2>
			{byDay.size === 0 ? (
				<p>{m.print_none({}, o)}</p>
			) : (
				<table>
					<thead>
						<tr>
							<th scope="col">{m.field_time({}, o)}</th>
							<th scope="col">{m.field_client({}, o)}</th>
							<th scope="col">{m.field_service({}, o)}</th>
							<th scope="col">{m.ap_status({}, o)}</th>
							<th scope="col">{m.note_label({}, o)}</th>
						</tr>
					</thead>
					{[...byDay.entries()].map(([d, rows]) => (
						<tbody key={d}>
							{week ? (
								<tr class="prt__day">
									<th scope="colgroup" colspan={5}>
										{dayLong(locale, d)}
									</th>
								</tr>
							) : null}
							{rows.map(({ a, who, service }) => (
								<tr key={a.id}>
									<td class="prt__time">
										{hhmm(a.startMin)}–{hhmm(a.startMin + a.durationMin)}
									</td>
									<td>{who}</td>
									<td>{service}</td>
									<td>{statusLabel(a.status, locale)}</td>
									<td>{a.note}</td>
								</tr>
							))}
						</tbody>
					))}
				</table>
			)}
		</section>
	);
}

/** One grid for a day with few columns: a row per start time, a cell per column, nothing for empty hours. */
function CompactDay({
	data,
	cols,
	date,
	locale,
}: {
	data: CalendarData;
	cols: ReadonlyArray<Column>;
	date: string;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const day = data.appointments.filter(
		(a) => a.date === date && cols.some((c) => c.id === a.columnId),
	);
	const starts = [...new Set(day.map((a) => a.startMin))].sort((x, y) => x - y);
	if (starts.length === 0) return <p>{m.print_none({}, o)}</p>;
	return (
		<section class="prt__col">
			<table class="prt__grid">
				<thead>
					<tr>
						<th scope="col">{m.field_time({}, o)}</th>
						{cols.map((c) => (
							<th key={c.id} scope="col">
								{c.name}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{starts.map((s) => (
						<tr key={s}>
							<th scope="row" class="prt__time">
								{hhmm(s)}
							</th>
							{cols.map((c) => (
								<td key={c.id}>
									{day
										.filter((a) => a.columnId === c.id && a.startMin === s)
										.map((a) => (
											<p key={a.id}>
												<strong>
													{a.title ?? data.clients.find((x) => x.id === a.clientId)?.name ?? ""}
												</strong>
												<br />
												{hhmm(a.startMin)}–{hhmm(a.startMin + a.durationMin)} ·{" "}
												{data.services.find((x) => x.id === a.serviceId)?.name ?? ""} ·{" "}
												{statusLabel(a.status, locale)}
												{a.note === "" ? null : (
													<>
														<br />
														{a.note}
													</>
												)}
											</p>
										))}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

export function printRange(q: PrintQuery): {
	date: string;
	from: string;
	to: string;
	dates: string[];
} {
	const date = q.date === "" ? todayIso() : q.date;
	return q.view === "day"
		? { date, from: date, to: date, dates: [date] }
		: {
				date,
				from: weekStart(date),
				to: range(weekStart(date), 7)[6] ?? date,
				dates: range(weekStart(date), 7),
			};
}

/** The print page: black on white, full names and times, a row per appointment, a page per column. */
export function PrintPage({
	ctx,
	q,
	data,
}: {
	ctx: Ctx;
	q: PrintQuery;
	data: CalendarData;
}): JSX.Element {
	const o = at(ctx.locale);
	const { dates, from, to } = printRange(q);
	const cols = q.scope === "all" ? data.columns : data.columns.filter((c) => c.id === q.scope);
	const title =
		q.view === "day"
			? dayLong(ctx.locale, from)
			: `${dayLong(ctx.locale, from)} – ${dayLong(ctx.locale, to)}`;
	const printed = new Intl.DateTimeFormat(ctx.locale, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Bucharest",
	}).format(new Date());
	return (
		<Layout locale={ctx.locale} theme="admin-light" title={`${m.print_title({}, o)} · ${title}`}>
			<main class="prt" data-theme="admin-light" data-orient={q.orient} data-view={q.view}>
				<header class="prt__head">
					<div>
						<h1>
							{appName(ctx.app, ctx.locale)} · {m.print_title({}, o)}
						</h1>
						<p>{title}</p>
					</div>
					<p class="prt__by">{m.print_by({ name: ctx.person.name, when: printed }, o)}</p>
					<button
						type="button"
						class="adm-btn adm-btn--primary prt__go"
						data-on:click="window.print()"
					>
						{m.print({}, o)}
					</button>
				</header>
				{q.view === "day" && q.scope === "all" && cols.length <= 4 ? (
					<CompactDay data={data} cols={cols} date={from} locale={ctx.locale} />
				) : (
					cols.map((c) => (
						<TableFor
							key={c.id}
							data={data}
							col={c}
							dates={dates}
							locale={ctx.locale}
							week={q.view === "week"}
						/>
					))
				)}
			</main>
		</Layout>
	);
}
