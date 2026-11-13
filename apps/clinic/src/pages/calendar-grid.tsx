import type { JSX } from "hono/jsx/jsx-runtime";
import {
	dayShort,
	hhmm,
	monthLong,
	monthStart,
	parseDay,
	range,
	weekdayShort,
	weekStart,
} from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { CalendarData } from "../port/port";
import type { Appointment, Column } from "../port/schema";

/** Scrolling the grid shrinks the floating action to its icon, like scrolling the page. */
const SCROLL_FAB = {
	"data-on:scroll__throttle.100ms": "$fabSmall = evt.target.scrollTop > 24",
} as const;

const slotOpen = (date: string, startMin: number, columnId: string): string =>
	`@get('/calendar/editor?date=${date}&time=${hhmm(startMin)}&col=${columnId}')`;

export function hoursFor(appts: ReadonlyArray<Appointment>): { dayStart: number; hours: number } {
	const first = Math.min(480, ...appts.map((a) => Math.floor(a.startMin / 60) * 60));
	const last = Math.max(
		1200,
		...appts.map((a) => Math.ceil((a.startMin + a.durationMin) / 60) * 60),
	);
	return { dayStart: first, hours: (last - first) / 60 };
}

function Hours({
	dayStart,
	hours,
	nowMin,
}: {
	dayStart: number;
	hours: number;
	nowMin: number | null;
}): JSX.Element {
	return (
		<div class="cal__hours" aria-hidden="true">
			{Array.from({ length: hours }, (_, i) => (
				<span key={i} class="cal__hour" style={`top:calc(${i} * var(--hour-h))`}>
					{hhmm(dayStart + i * 60)}
				</span>
			))}
			{nowMin === null ? null : (
				<span class="cal__nowdot" style={`--now:${nowMin};--day-start:${dayStart}`} />
			)}
		</div>
	);
}

import { AppointmentTile as AppointmentCard } from "./appt-tile";

function Slots({
	date,
	columnId,
	dayStart,
	hours,
	locale,
	busy,
}: {
	date: string;
	columnId: string;
	dayStart: number;
	hours: number;
	locale: Locale;
	busy: ReadonlyArray<Appointment>;
}): Array<JSX.Element | null> {
	return Array.from({ length: hours * 2 }, (_, i) => {
		const startMin = dayStart + i * 30;
		// Only a slot wholly in a free gap is a target: one an appointment half covers would be a sliver.
		if (busy.some((a) => a.startMin < startMin + 30 && a.startMin + a.durationMin > startMin))
			return null;
		return (
			<button
				key={i}
				type="button"
				class="cal__slot"
				style={`--i:${i}`}
				aria-label={m.pick_slot({ time: hhmm(startMin) }, at(locale))}
				data-on:click={slotOpen(date, startMin, columnId)}
			/>
		);
	});
}

const KIND_LABEL = (kind: Column["kind"], locale: Locale): string => {
	const o = at(locale);
	return kind === "person"
		? m.column_person({}, o)
		: kind === "device"
			? m.column_device({}, o)
			: kind === "room"
				? m.column_room({}, o)
				: m.column_group({}, o);
};

export interface GridProps {
	data: CalendarData;
	date: string;
	locale: Locale;
	today: string;
	nowMin: number;
}

/** One day: a column per practitioner, device, room or group. */
export function DayGrid({ data, date, locale, today, nowMin }: GridProps): JSX.Element {
	const appts = data.appointments.filter((a) => a.date === date);
	const { dayStart, hours } = hoursFor(appts);
	const svc = (id: string): string => data.services.find((s) => s.id === id)?.name ?? "";
	return (
		<div class="cal" id="cal" style={`--cols:${data.columns.length};--hours:${hours}`}>
			<div class="cal__scroll" {...SCROLL_FAB}>
				<div class="cal__grid">
					<div class="cal__corner" />
					{data.columns.map((c) => (
						<div key={c.id} class="cal__colhead" style={`--c:var(--cal-${c.colour})`}>
							<span class="cal__swatch" />
							<span class="cal__colname">
								<span>{c.name}</span>
								<small>{KIND_LABEL(c.kind, locale)}</small>
							</span>
						</div>
					))}
					<Hours
						dayStart={dayStart}
						hours={hours}
						nowMin={
							date === today && nowMin >= dayStart && nowMin <= dayStart + hours * 60
								? nowMin
								: null
						}
					/>
					{data.columns.map((c) => (
						<div key={c.id} class="cal__col" data-col={c.id}>
							<Slots
								date={date}
								columnId={c.id}
								dayStart={dayStart}
								hours={hours}
								locale={locale}
								busy={appts.filter((a) => a.columnId === c.id)}
							/>
							{appts
								.filter((a) => a.columnId === c.id)
								.map((a) => (
									<AppointmentCard
										key={a.id}
										appt={a}
										client={data.clients.find((x) => x.id === a.clientId)}
										flag={a.clientId === null ? undefined : data.flags?.[a.clientId]}
										serviceName={svc(a.serviceId)}
										colour={c.colour}
										locale={locale}
										dayStart={dayStart}
									/>
								))}
							{date === today && nowMin >= dayStart && nowMin <= dayStart + hours * 60 ? (
								<div class="cal__now" style={`--now:${nowMin};--day-start:${dayStart}`} />
							) : null}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/** One calendar's week: a column per day. */
export function WeekGrid({
	data,
	date,
	locale,
	today,
	nowMin,
	column,
}: GridProps & { column: Column }): JSX.Element {
	const days = range(weekStart(date), 7);
	const appts = data.appointments.filter((a) => a.columnId === column.id);
	const { dayStart, hours } = hoursFor(appts);
	const svc = (id: string): string => data.services.find((s) => s.id === id)?.name ?? "";
	return (
		<div class="cal cal--week" id="cal" style={`--cols:7;--hours:${hours}`}>
			<div class="cal__scroll" {...SCROLL_FAB}>
				<div class="cal__grid">
					<div class="cal__corner" />
					{days.map((d) => (
						<a
							key={d}
							class="cal__colhead"
							href={`/calendar?view=day&date=${d}`}
							aria-current={d === today ? "date" : undefined}
							style={`--c:var(--cal-${column.colour});text-decoration:none;color:inherit`}
						>
							<small class="adm-muted">{weekdayShort(locale, d)}</small>
							<strong>{dayShort(locale, d)}</strong>
						</a>
					))}
					<Hours
						dayStart={dayStart}
						hours={hours}
						nowMin={
							days.includes(today) && nowMin >= dayStart && nowMin <= dayStart + hours * 60
								? nowMin
								: null
						}
					/>
					{days.map((d) => (
						<div key={d} class="cal__col">
							<Slots
								date={d}
								columnId={column.id}
								dayStart={dayStart}
								hours={hours}
								locale={locale}
								busy={appts.filter((a) => a.date === d)}
							/>
							{appts
								.filter((a) => a.date === d)
								.map((a) => (
									<AppointmentCard
										key={a.id}
										appt={a}
										client={data.clients.find((x) => x.id === a.clientId)}
										flag={a.clientId === null ? undefined : data.flags?.[a.clientId]}
										serviceName={svc(a.serviceId)}
										colour={column.colour}
										locale={locale}
										dayStart={dayStart}
									/>
								))}
							{d === today && nowMin >= dayStart && nowMin <= dayStart + hours * 60 ? (
								<div class="cal__now" style={`--now:${nowMin};--day-start:${dayStart}`} />
							) : null}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/** The month: a day per cell, the load as a bar; tapping a day opens it. */
export function MonthGrid({ data, date, locale, today }: Omit<GridProps, "nowMin">): JSX.Element {
	const first = monthStart(date);
	const start = weekStart(first);
	const days = range(start, 42);
	const counts = new Map<string, number>();
	for (const a of data.appointments)
		if (a.status !== "cancelled") counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
	const peak = Math.max(1, ...counts.values());
	const month = parseDay(first).getUTCMonth();
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
						data-out={parseDay(d).getUTCMonth() === month ? "false" : "true"}
						aria-current={d === today ? "date" : undefined}
					>
						<span class="cal-month__n">{Number(d.slice(8))}</span>
						{n > 0 ? (
							<>
								<span class="cal-month__bar" style={`--load:${n / peak}`} />
								<span class="cal-month__count">{m.count_appointments({ n }, at(locale))}</span>
							</>
						) : null}
					</a>
				);
			})}
		</section>
	);
}
