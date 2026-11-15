import { Banner, EmptyState, Icon, Segmented, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import {
	addDays,
	addMonths,
	dayLong,
	monthLong,
	nowMinutes,
	todayIso,
	weekStart,
} from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { CalendarData } from "../port/port";
import { DayGrid, WeekGrid } from "./calendar-grid";
import { type CalendarView, loadCalendar } from "./calendar-load";
import { MonthGrid } from "./calendar-month";
import {
	CATEGORY_FILTERS,
	type CalendarQuery,
	CalendarQuerySchema,
	type CategoryFilter,
	type View,
} from "./calendar-query";
import { detailBody } from "./detail-routes";
import { editorBody, openState } from "./editor-routes";

export { CalendarQuerySchema };

const hrefBase = (view: View, date: string, col?: string): string =>
	`/calendar?view=${view}&date=${date}${col === undefined ? "" : `&col=${col}`}`;

function stepDate(view: View, date: string, dir: 1 | -1): string {
	return view === "day"
		? addDays(date, dir)
		: view === "week"
			? addDays(date, 7 * dir)
			: addMonths(date, dir);
}

function Toolbar({
	view,
	date,
	locale,
	col,
	cat,
	columns,
	canCreate,
}: {
	view: View;
	date: string;
	locale: Locale;
	col: string | undefined;
	cat: CategoryFilter;
	columns: ReadonlyArray<{ id: string; name: string }>;
	canCreate: boolean;
}): JSX.Element {
	const o = at(locale);
	const href = (v: View, d: string, c?: string): string =>
		`${hrefBase(v, d, c)}${cat === "team" ? "" : `&cat=${cat}`}`;
	const today = todayIso();
	const title =
		view === "month"
			? monthLong(locale, date)
			: view === "week"
				? `${dayLong(locale, weekStart(date))} – ${dayLong(locale, addDays(weekStart(date), 6))}`
				: dayLong(locale, date);
	return (
		<div
			class="cal-toolbar adm-noprint"
			data-signals="{datePick:false,calMenu:false,printOpen:false}"
		>
			<div class="cal-bar cal-bar--nav">
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
			<div class="cal-bar cal-bar--views">
				<Segmented
					label={m.view_label({}, o)}
					current={view}
					items={[
						{ key: "day", label: m.view_day({}, o), href: href("day", date) },
						{
							key: "week",
							label: m.view_week({}, o),
							href: href("week", date, col),
						},
						{
							key: "month",
							label: m.view_month({}, o),
							href: href("month", date),
						},
					]}
				/>
				{/* The month counts every calendar the person may see: it has no columns to filter. */}
				{view === "month" ? null : (
					<Segmented
						label={m.cal_cols_label({}, o)}
						current={cat}
						items={CATEGORY_FILTERS.map((k) => ({
							key: k,
							label: m[`cal_cat_${k}` as const]({}, o),
							href: `${hrefBase(view, date, col)}&cat=${k}`,
						}))}
					/>
				)}
				<a class="adm-btn" href={href(view, today, col)}>
					{m.today({}, o)}
				</a>
			</div>
			<div class="cal-bar cal-bar--end">
				{canCreate ? (
					<button
						type="button"
						class="adm-btn adm-btn--primary cal-new"
						data-on:click={`@get('/calendar/editor?date=${view === "month" ? today : date}&time=09:00${col === undefined ? "" : `&col=${col}`}')`}
					>
						<Icon name="plus" />
						{m.ap_new_button({}, o)}
					</button>
				) : null}
				<button
					type="button"
					class="adm-iconbtn cal-full"
					data-full-toggle
					aria-pressed="false"
					aria-label={m.cal_fullscreen({}, o)}
					title={m.cal_fullscreen({}, o)}
				>
					<Icon name="maximize" class="cal-full__on" />
					<Icon name="minimize" class="cal-full__off" />
				</button>
				<div class="adm-menu" data-on:keydown="evt.key === 'Escape' && ($calMenu = false)">
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
							data-on:click="$calMenu = false; $printOpen = true"
						>
							<Icon name="download" />
							{m.print({}, o)}
						</button>
					</div>
				</div>
			</div>
			<Sheet signal="printOpen" title={m.print_options({}, o)} closeLabel={m.close({}, o)}>
				<form
					method="get"
					action="/calendar/print"
					target="_blank"
					class="adm-stack"
					rel="noopener"
				>
					<label class="adm-field">
						<span>{m.print_period({}, o)}</span>
						<select class="adm-input" name="view">
							<option value="day" selected={view !== "week"}>
								{m.print_day({}, o)}
							</option>
							<option value="week" selected={view === "week"}>
								{m.print_week({}, o)}
							</option>
						</select>
					</label>
					<label class="adm-field">
						<span>{m.field_date({}, o)}</span>
						<input class="adm-input" type="date" name="date" value={date} required />
					</label>
					<label class="adm-field">
						<span>{m.print_scope({}, o)}</span>
						<select class="adm-input" name="scope">
							<option value="all">{m.print_all({}, o)}</option>
							{columns.map((c) => (
								<option key={c.id} value={c.id} selected={c.id === col}>
									{c.name}
								</option>
							))}
						</select>
					</label>
					<label class="adm-field">
						<span>{m.print_orient({}, o)}</span>
						<select class="adm-input" name="orient">
							<option value="portrait">{m.print_portrait({}, o)}</option>
							<option value="landscape">{m.print_landscape({}, o)}</option>
						</select>
					</label>
					<input type="hidden" name="auto" value="1" />
					<button class="adm-btn adm-btn--primary" type="submit" data-on:click="$printOpen = false">
						<Icon name="download" />
						{m.print_open({}, o)}
					</button>
				</form>
			</Sheet>
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

/** The calendar screen in all its states: grid, empty, error. */
export function CalendarBody({
	ctx,
	query,
	view,
}: {
	ctx: Ctx;
	query: CalendarQuery;
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
			class="cal-page"
			data-on:keydown__window={`(evt.key === 'n' || evt.key === 'N') && ${ctx.can.write("appointments_create") ? "true" : "false"} && !evt.ctrlKey && !evt.metaKey && !evt.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') && !$editor && (evt.preventDefault(), @get('/calendar/editor?date=${date}&time=09:00'))`}
		>
			<Toolbar
				view={query.view}
				date={date}
				locale={locale}
				col={query.col}
				cat={query.cat}
				columns={data?.columns ?? []}
				canCreate={ctx.can.write("appointments_create")}
			/>
			<div class="cal-page__body">
				{view.failed || data === null ? (
					<Banner tone="error" icon="alert">
						<strong>{m.error_title({}, o)}</strong>
						<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
						<a class="adm-btn" href={hrefBase(query.view, date, query.col)}>
							{m.retry({}, o)}
						</a>
					</Banner>
				) : (
						query.view === "month"
							? (view.days?.size ?? 0) === 0
							: query.view === "week"
								? // The week reads one calendar: an empty one still shows its grid and the others' chips.
									data.columns.length === 0
								: data.appointments.length === 0
					) ? (
					<EmptyState
						icon="calendar"
						title={m.calendar_empty_title({}, o)}
						text={m.calendar_empty_text({}, o)}
					>
						{ctx.can.write("appointments_create") ? (
							<a class="adm-btn adm-btn--primary" href={`/calendar?new=1&date=${date}`}>
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
					<MonthGrid days={view.days ?? new Map()} date={date} locale={locale} today={today} />
				)}
			</div>
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
						href={hrefBase("week", date, c.id)}
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

/** The grid again, for a live update: the same markup the page was first served with, under the same id. */
export async function renderCalendarLive(ctx: Ctx, query: CalendarQuery): Promise<JSX.Element> {
	return (
		<div id="cal-live" style="display:contents">
			<CalendarBody ctx={ctx} query={query} view={await loadCalendar(ctx, query)} />
		</div>
	);
}

export async function renderCalendar(ctx: Ctx, query: CalendarQuery): Promise<JSX.Element> {
	const date = query.date === "" ? todayIso() : query.date;
	const o = at(ctx.locale);
	const canCreate = ctx.can.write("appointments_create");
	const opening = canCreate && query.new === "1";
	// What the grid shows, the editor's state and the visit opened by the address do not depend on one another: they are
	// read together, the page waiting for the slowest.
	const [view, editorState, detail, fresh] = await Promise.all([
		loadCalendar(ctx, query),
		opening
			? openState(ctx, {
					date,
					time: query.time ?? "09:00",
					col: query.col ?? "",
					id: "",
					client: query.client ?? "",
				})
			: Promise.resolve(null),
		query.appt === undefined ? Promise.resolve(null) : detailBody(ctx, query.appt),
		canCreate && !opening
			? openState(ctx, { date, time: "09:00", col: "", id: "" })
			: Promise.resolve(null),
	]);
	const blank = editorState ?? fresh;
	const live = new URLSearchParams({
		screen: "calendar",
		view: query.view,
		date,
	});
	if (query.col !== undefined) live.set("col", query.col);
	if (query.cat !== "team") live.set("cat", query.cat);
	return Page({
		ctx,
		current: "calendar",
		wide: true,
		canvas: true,
		fullscreen: true,
		title: m.calendar_title({}, o),
		children: (
			<div id="cal-live" style="display:contents" data-init={`@get('/live?${live.toString()}')`}>
				<CalendarBody ctx={ctx} query={query} view={view} />
			</div>
		),
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
						<div
							dangerouslySetInnerHTML={{
								__html: await editorBody(ctx, editorState),
							}}
						/>
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
