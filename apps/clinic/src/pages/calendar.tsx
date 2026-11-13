import { Banner, EmptyState, Icon, Segmented, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import {
	addDays,
	addMonths,
	dayLong,
	hhmm,
	monthLong,
	monthStart,
	nowMinutes,
	todayIso,
	weekStart,
} from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { CalendarData } from "../port/port";
import { IsoDateSchema, NewAppointmentSchema } from "../port/schema";
import { DayGrid, MonthGrid, WeekGrid } from "./calendar-grid";

export const ViewSchema = z.enum(["day", "week", "month"]);
export type View = z.infer<typeof ViewSchema>;

export const CalendarQuerySchema = z.object({
	view: ViewSchema.catch("day"),
	date: IsoDateSchema.catch(""),
	col: z.string().optional(),
	new: z.string().optional(),
});

/** The new-appointment form's signals, as the page sends them. */
export const NewApptSignalsSchema = z.object({
	apDate: NewAppointmentSchema.shape.date,
	apTime: z.string().regex(/^\d{2}:\d{2}$/),
	apCol: NewAppointmentSchema.shape.columnId,
	apClient: NewAppointmentSchema.shape.clientId,
	apService: NewAppointmentSchema.shape.serviceId,
});

const href = (view: View, date: string, col?: string): string =>
	`/calendar?view=${view}&date=${date}${col === undefined ? "" : `&col=${col}`}`;

function stepDate(view: View, date: string, dir: 1 | -1): string {
	return view === "day"
		? addDays(date, dir)
		: view === "week"
			? addDays(date, 7 * dir)
			: addMonths(date, dir);
}

export function rangeFor(view: View, date: string): { from: string; to: string } {
	if (view === "day") return { from: date, to: date };
	if (view === "week") return { from: weekStart(date), to: addDays(weekStart(date), 6) };
	const start = weekStart(monthStart(date));
	return { from: start, to: addDays(start, 41) };
}

function Toolbar({
	view,
	date,
	locale,
	col,
}: {
	view: View;
	date: string;
	locale: Locale;
	col: string | undefined;
}): JSX.Element {
	const o = at(locale);
	const today = todayIso();
	const title =
		view === "month"
			? monthLong(locale, date)
			: view === "week"
				? `${dayLong(locale, weekStart(date))} – ${dayLong(locale, addDays(weekStart(date), 6))}`
				: dayLong(locale, date);
	return (
		<div class="adm-stack adm-noprint" data-signals="{datePick:false,calMenu:false}">
			<div class="cal-bar">
				<a
					class="adm-iconbtn"
					href={href(view, stepDate(view, date, -1), col)}
					aria-label={m.prev({}, o)}
				>
					<Icon name="chevron-left" />
				</a>
				<button
					type="button"
					class="cal-bar__title"
					aria-haspopup="dialog"
					aria-label={`${m.pick_day({}, o)}: ${title}`}
					data-on:click="$datePick = true"
				>
					<span>{title}</span>
					<Icon name="chevron-down" />
				</button>
				<a
					class="adm-iconbtn"
					href={href(view, stepDate(view, date, 1), col)}
					aria-label={m.next({}, o)}
				>
					<Icon name="chevron-right" />
				</a>
			</div>
			<div class="cal-bar">
				<Segmented
					label={m.view_label({}, o)}
					current={view}
					items={[
						{ key: "day", label: m.view_day({}, o), href: href("day", date) },
						{ key: "week", label: m.view_week({}, o), href: href("week", date, col) },
						{ key: "month", label: m.view_month({}, o), href: href("month", date) },
					]}
				/>
				<a class="adm-btn" href={href(view, today, col)}>
					{m.today({}, o)}
				</a>
				<div
					class="adm-menu"
					style="margin-left:auto"
					data-on:keydown="evt.key === 'Escape' && ($calMenu = false)"
				>
					<button
						type="button"
						class="adm-iconbtn"
						aria-haspopup="true"
						aria-label={m.more_actions({}, o)}
						data-attr:aria-expanded="$calMenu"
						data-on:click="$calMenu = !$calMenu"
					>
						<Icon name="more" />
					</button>
					<div class="adm-menu__panel" data-show="$calMenu" style="display:none">
						<button
							type="button"
							class="adm-menu__item"
							data-on:click="$calMenu = false; window.print()"
						>
							<Icon name="download" />
							{m.print({}, o)}
						</button>
					</div>
				</div>
			</div>
			<Sheet signal="datePick" title={m.pick_day({}, o)} closeLabel={m.close({}, o)}>
				<form method="get" action="/calendar" class="adm-stack">
					<input type="hidden" name="view" value={view} />
					{col === undefined ? null : <input type="hidden" name="col" value={col} />}
					<label class="adm-field">
						<span>{m.field_date({}, o)}</span>
						<input class="adm-input" type="date" name="date" value={date} required />
					</label>
					<button class="adm-btn adm-btn--primary" type="submit">
						{m.go_to_date({}, o)}
					</button>
				</form>
			</Sheet>
		</div>
	);
}

function NewSheet({
	data,
	date,
	locale,
	open,
}: {
	data: CalendarData;
	date: string;
	locale: Locale;
	open: boolean;
}): JSX.Element {
	const o = at(locale);
	const first = data.columns[0];
	const signals = JSON.stringify({
		newAppt: open,
		apDate: date,
		apTime: hhmm(9 * 60),
		apCol: first?.id ?? "",
		apClient: "",
		apService: data.services[0]?.id ?? "",
	});
	return (
		<div data-signals={signals}>
			<Sheet signal="newAppt" title={m.new_title({}, o)} closeLabel={m.close({}, o)}>
				<form class="adm-stack" data-on:submit__prevent="@post('/calendar/new')">
					<label class="adm-field">
						<span>{m.field_client({}, o)}</span>
						<select class="adm-input" required data-bind="apClient">
							<option value="" />
							{data.clients
								.filter((c) => c.status === "current")
								.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
						</select>
					</label>
					<label class="adm-field">
						<span>{m.field_service({}, o)}</span>
						<select class="adm-input" data-bind="apService">
							{data.services.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name} · {s.durationMin} min
								</option>
							))}
						</select>
					</label>
					<label class="adm-field">
						<span>{m.field_column({}, o)}</span>
						<select class="adm-input" data-bind="apCol">
							{data.columns.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</select>
					</label>
					<div class="adm-row">
						<label class="adm-field" style="flex:1">
							<span>{m.field_date({}, o)}</span>
							<input class="adm-input" type="date" data-bind="apDate" />
						</label>
						<label class="adm-field" style="flex:1">
							<span>{m.field_time({}, o)}</span>
							<input class="adm-input" type="time" step="900" data-bind="apTime" />
						</label>
					</div>
					<div class="adm-row">
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.save({}, o)}
						</button>
						<button class="adm-btn" type="button" data-on:click="$newAppt = false">
							{m.cancel({}, o)}
						</button>
					</div>
				</form>
			</Sheet>
		</div>
	);
}

export interface CalendarView {
	data: CalendarData | null;
	failed: boolean;
}

/** The calendar screen in all its states: grid, empty, error. */
export function CalendarBody({
	ctx,
	query,
	view,
}: {
	ctx: Ctx;
	query: z.infer<typeof CalendarQuerySchema>;
	view: CalendarView;
}): JSX.Element {
	const { locale } = ctx;
	const o = at(locale);
	const today = todayIso();
	const date = query.date === "" ? today : query.date;
	const mins = nowMinutes();
	const { data } = view;
	return (
		<div class="adm-page adm-page--wide">
			<Toolbar view={query.view} date={date} locale={locale} col={query.col} />
			{view.failed || data === null ? (
				<Banner tone="error" icon="alert">
					<strong>{m.error_title({}, o)}</strong>
					<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
					<a class="adm-btn" href={href(query.view, date, query.col)}>
						{m.retry({}, o)}
					</a>
				</Banner>
			) : data.appointments.length === 0 ? (
				<EmptyState
					icon="calendar"
					title={m.calendar_empty_title({}, o)}
					text={m.calendar_empty_text({}, o)}
				>
					{ctx.can.write("appointments_create") ? (
						<a class="adm-btn adm-btn--primary" href="/calendar?new=1">
							<Icon name="plus" />
							{m.new_appointment({}, o)}
						</a>
					) : null}
				</EmptyState>
			) : query.view === "day" ? (
				<DayGrid data={data} date={date} locale={locale} today={today} nowMin={mins} />
			) : query.view === "week" ? (
				<WeekBody
					data={data}
					date={date}
					locale={locale}
					today={today}
					nowMin={mins}
					col={query.col}
				/>
			) : (
				<MonthGrid data={data} date={date} locale={locale} today={today} />
			)}
		</div>
	);
}

function WeekBody({
	data,
	date,
	locale,
	today,
	nowMin,
	col,
}: {
	data: CalendarData;
	date: string;
	locale: Locale;
	today: string;
	nowMin: number;
	col: string | undefined;
}): JSX.Element {
	const column = data.columns.find((c) => c.id === col) ?? data.columns[0];
	if (column === undefined) return <div />;
	return (
		<>
			<nav class="cal-chips adm-noprint" aria-label={m.field_column({}, at(locale))}>
				{data.columns.map((c) => (
					<a
						key={c.id}
						class="cal-chip"
						href={href("week", date, c.id)}
						aria-current={c.id === column.id ? "true" : undefined}
					>
						<span class="adm-dot" style={`background:var(--cal-${c.colour})`} />
						{c.name}
					</a>
				))}
			</nav>
			<WeekGrid
				data={data}
				date={date}
				locale={locale}
				today={today}
				nowMin={nowMin}
				column={column}
			/>
		</>
	);
}

/** The calendar's data for a query, as the grid shows it (an error is a state of the grid, not a crash). */
async function loadCalendar(
	ctx: Ctx,
	query: z.infer<typeof CalendarQuerySchema>,
): Promise<CalendarView> {
	const date = query.date === "" ? todayIso() : query.date;
	const { from, to } = rangeFor(query.view, date);
	try {
		return { data: await ctx.port.calendar(ctx.app, from, to), failed: false };
	} catch {
		return { data: null, failed: true };
	}
}

/** The grid again, for a live update: the same markup the page was first served with, under the same id. */
export async function renderCalendarLive(
	ctx: Ctx,
	query: z.infer<typeof CalendarQuerySchema>,
): Promise<JSX.Element> {
	return (
		<div id="cal-live" style="display:contents">
			<CalendarBody ctx={ctx} query={query} view={await loadCalendar(ctx, query)} />
		</div>
	);
}

export async function renderCalendar(
	ctx: Ctx,
	query: z.infer<typeof CalendarQuerySchema>,
): Promise<JSX.Element> {
	const date = query.date === "" ? todayIso() : query.date;
	const view = await loadCalendar(ctx, query);
	const o = at(ctx.locale);
	const sheetData = view.data;
	const live = new URLSearchParams({ screen: "calendar", view: query.view, date });
	if (query.col !== undefined) live.set("col", query.col);
	return Page({
		ctx,
		current: "calendar",
		wide: true,
		title: m.calendar_title({}, o),
		children: (
			<div id="cal-live" style="display:contents" data-init={`@get('/live?${live.toString()}')`}>
				<CalendarBody ctx={ctx} query={query} view={view} />
			</div>
		),
		overlays: (
			<>
				{sheetData === null || !ctx.can.write("appointments_create") ? null : (
					<NewSheet data={sheetData} date={date} locale={ctx.locale} open={query.new === "1"} />
				)}
			</>
		),
	});
}
