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
import { IsoDateSchema } from "../port/schema";
import { DayGrid, MonthGrid, WeekGrid } from "./calendar-grid";
import { detailBody } from "./detail-routes";
import { editorBody, openState } from "./editor-routes";

export const ViewSchema = z.enum(["day", "week", "month"]);
export type View = z.infer<typeof ViewSchema>;

export const CalendarQuerySchema = z.object({
	view: ViewSchema.catch("day"),
	date: IsoDateSchema.catch(""),
	col: z.string().optional(),
	new: z.string().optional(),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
	appt: z.string().max(40).optional(),
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
				<button
					type="button"
					class="adm-btn adm-btn--primary cal-new"
					data-on:click={`@get('/calendar/editor?date=${view === "month" ? today : date}&time=09:00${col === undefined ? "" : `&col=${col}`}')`}
				>
					<Icon name="plus" />
					{m.ap_new_button({}, o)}
				</button>
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
		<div
			class="adm-page adm-page--wide"
			data-on:keydown__window={`(evt.key === 'n' || evt.key === 'N') && !evt.ctrlKey && !evt.metaKey && !evt.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') && !$editor && (evt.preventDefault(), @get('/calendar/editor?date=${date}&time=09:00'))`}
		>
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
					<a class="adm-btn adm-btn--primary" href={`/calendar?new=1&date=${date}`}>
						<Icon name="plus" />
						{m.new_appointment({}, o)}
					</a>
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

export async function renderCalendar(
	ctx: Ctx,
	query: z.infer<typeof CalendarQuerySchema>,
): Promise<JSX.Element> {
	const date = query.date === "" ? todayIso() : query.date;
	const { from, to } = rangeFor(query.view, date);
	let view: CalendarView;
	try {
		view = { data: await ctx.port.calendar(ctx.app, from, to), failed: false };
	} catch {
		view = { data: null, failed: true };
	}
	const o = at(ctx.locale);
	const editorState =
		query.new === "1"
			? await openState(ctx, { date, time: query.time ?? "09:00", col: query.col ?? "", id: "" })
			: null;
	const detail = query.appt === undefined ? null : await detailBody(ctx, query.appt);
	const blank = editorState ?? (await openState(ctx, { date, time: "09:00", col: "", id: "" }));
	return Page({
		ctx,
		current: "calendar",
		wide: true,
		title: m.calendar_title({}, o),
		children: <CalendarBody ctx={ctx} query={query} view={view} />,
		overlays: (
			<div
				data-signals={JSON.stringify({
					editor: editorState !== null,
					detail: detail !== null,
					...(blank === null ? {} : { ed: blank }),
				})}
			>
				<Sheet signal="editor" title={m.ap_sheet_title({}, o)} closeLabel={m.close({}, o)}>
					{editorState === null ? (
						<div id="editor-body" />
					) : (
						<div dangerouslySetInnerHTML={{ __html: await editorBody(ctx, editorState) }} />
					)}
				</Sheet>
				<Sheet signal="detail" title={m.ap_sheet_title({}, o)} closeLabel={m.close({}, o)}>
					{detail === null ? (
						<div id="detail-body" />
					) : (
						<div dangerouslySetInnerHTML={{ __html: detail }} />
					)}
				</Sheet>
			</div>
		),
	});
}
