/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import {
	addDays,
	type DayCell,
	groupByPart,
	localDate,
	localTime,
	type PartOfDay,
	type PickerSlot,
	type SlotMode,
	weekCells,
} from "../slot-week";

/** Every word the picker shows, from the app's own i18n: the library ships none. */
export interface SlotPickerLabels {
	/** "45 min" */
	duration: (minutes: number) => string;
	/** The week strip's group name. */
	chooseDay: string;
	prevWeek: string;
	nextWeek: string;
	today: string;
	/** "3 ore libere" (spoken, hidden from sight in the day strip). */
	freeTimes: (count: number) => string;
	noTimes: string;
	parts: Readonly<Record<PartOfDay, string>>;
	mode: string;
	modes: Readonly<Record<SlotMode, string>>;
	practitioner: string;
	anyone: string;
	/** The spoken and visible summary of the choice, e.g. "joi, 19 noiembrie, 10:15, cu Ana, la cabinet". */
	selected: (when: string, who: string, mode: string) => string;
	nothingSelected: string;
	/** The time was taken between view and select. */
	taken: string;
	emptyWeek: string;
	/** "Prima săptămână cu ore: 23–29 nov" */
	jumpToNext: (range: string) => string;
}

/** What a change of the picker asks the app for: the whole form is posted, these only name the step. */
export interface SlotPickerActions {
	/** A Datastar expression run when a day, a time, the mode or the practitioner changes. */
	change: string;
	/** Expression for the previous week; absent when this is the first week that may be shown. */
	prev?: string;
	/** Expression for the next week; absent at the end of the horizon. */
	next?: string;
	/** Expression that jumps to the first week that has times, when this one has none. */
	jump?: string;
}

export interface SlotPickerProps {
	/** A prefix for every id inside, so a page and a chat bubble never share one. */
	id: string;
	locale: "ro" | "en";
	variant?: "full" | "compact";
	labels: SlotPickerLabels;
	service: { name: string; durationMinutes: number };
	timeZone: string;
	/** Today's date in the practice's zone. */
	today: string;
	/** The Monday of the week shown. */
	week: string;
	/** The week's free times, already narrowed to the chosen mode and practitioner. */
	slots: ReadonlyArray<PickerSlot>;
	/** The day whose times are listed. */
	day: string;
	/** The chosen slot's id. */
	selected?: string;
	mode: SlotMode;
	modes: ReadonlyArray<SlotMode>;
	who: string;
	practitioners: ReadonlyArray<{ id: string; name: string }>;
	/** The time the visitor had picked was taken meanwhile. */
	taken?: boolean;
	/** When the week is empty: the Monday of the first week with times, if any. */
	nextWithTimes?: string;
	actions: SlotPickerActions;
}

const INTL: Readonly<Record<"ro" | "en", string>> = { ro: "ro-RO", en: "en-GB" };

function noonOf(date: string): number {
	return Date.parse(`${date}T12:00:00Z`);
}

/** "joi", "19", "19 noiembrie" and "16–22 nov": a plain date, formatted without any zone. */
export function dateWords(date: string, locale: "ro" | "en") {
	const tag = INTL[locale];
	const f = (opts: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(tag, { timeZone: "UTC", ...opts }).format(noonOf(date));
	return {
		weekday: f({ weekday: "short" }).replace(/\.$/, ""),
		long: f({ weekday: "long", day: "numeric", month: "long" }),
		day: f({ day: "numeric" }),
	};
}

/** "16–22 nov" or "30 nov – 6 dec". */
export function weekRange(week: string, end: string, locale: "ro" | "en"): string {
	const tag = INTL[locale];
	const month = (d: string) =>
		new Intl.DateTimeFormat(tag, { timeZone: "UTC", month: "short" })
			.format(noonOf(d))
			.replace(/\.$/, "");
	const day = (d: string) => String(Number(d.slice(8)));
	return month(week) === month(end)
		? `${day(week)}–${day(end)} ${month(end)}`
		: `${day(week)} ${month(week)} – ${day(end)} ${month(end)}`;
}

function Chevron({ dir }: { dir: "prev" | "next" }): JSX.Element {
	return (
		<svg
			viewBox="0 0 20 20"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d={dir === "prev" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} />
		</svg>
	);
}

function Tick(): JSX.Element {
	return (
		<svg
			class="pz-slot__tick"
			viewBox="0 0 20 20"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m4.5 10.5 3.6 3.6 7.4-8" />
		</svg>
	);
}

function DayButton({
	cell,
	picker,
}: {
	cell: DayCell;
	picker: Pick<SlotPickerProps, "id" | "locale" | "day" | "labels" | "actions">;
}): JSX.Element {
	const words = dateWords(cell.date, picker.locale);
	const free = cell.count > 0;
	return (
		<label
			class="pz-day"
			data-today={cell.today ? "" : undefined}
			data-free={free ? "" : undefined}
			title={words.long}
		>
			<input
				class="pz-day__input"
				type="radio"
				id={`${picker.id}-d-${cell.date}`}
				name="day"
				value={cell.date}
				checked={free && picker.day === cell.date}
				disabled={!free}
				data-on:change={picker.actions.change}
			/>
			<span class="pz-day__name" aria-hidden="true">
				{words.weekday}
			</span>
			<span class="pz-day__num" aria-hidden="true">
				{words.day}
			</span>
			<span class="pz-day__dot" aria-hidden="true" />
			<span class="sr-only">
				{`${words.long}${cell.today ? `, ${picker.labels.today}` : ""}, ${free ? picker.labels.freeTimes(cell.count) : picker.labels.noTimes}`}
			</span>
		</label>
	);
}

/**
 * The schedule, drawn: the service and its length, a mode toggle and a practitioner filter when
 * there is a choice, a seven-day strip (today marked, empty days greyed, week to week), and the
 * chosen day's times by morning, afternoon and evening as large tappable buttons. Every control is
 * a native radio or button inside the app's form, so the keyboard and screen readers get the
 * platform's behaviour; a change posts the form to the app, which answers with this fragment
 * again, from the store's current times. Nothing here decides what is free: it draws what it is given.
 */
export function SlotPicker(props: SlotPickerProps): JSX.Element {
	const { id, locale, labels, week, day, slots, actions, variant = "full" } = props;
	const cells = weekCells(week, slots, props.timeZone, props.today);
	const end = cells[6]?.date ?? week;
	const empty = cells.every((cell) => cell.count === 0);
	const groups = groupByPart(
		slots.filter((slot) => localDate(slot.start, props.timeZone) === day),
		props.timeZone,
	);
	const chosen = slots.find((slot) => slot.id === props.selected);
	const chosenTime = chosen === undefined ? undefined : localTime(chosen.start, props.timeZone);
	const chosenWho = chosen?.practitionerName ?? "";
	return (
		<section
			id={`${id}-picker`}
			class={cx("pz-slots", variant === "compact" && "pz-slots--compact")}
			aria-labelledby={`${id}-service`}
		>
			<input type="hidden" name="week" value={week} />
			<header class="pz-slots__head">
				<h3 id={`${id}-service`} class="pz-slots__service">
					{props.service.name}
				</h3>
				<span class="pz-slots__len">{labels.duration(props.service.durationMinutes)}</span>
			</header>

			{props.modes.length > 1 ? (
				<fieldset class="pz-seg" aria-label={labels.mode}>
					{props.modes.map((mode) => (
						<label class="pz-seg__item">
							<input
								type="radio"
								name="mode"
								value={mode}
								checked={props.mode === mode}
								data-on:change={actions.change}
							/>
							<span>{labels.modes[mode]}</span>
						</label>
					))}
				</fieldset>
			) : (
				<input type="hidden" name="mode" value={props.mode} />
			)}

			{props.practitioners.length > 1 ? (
				<fieldset class="pz-who" aria-label={labels.practitioner}>
					<label class="pz-who__item">
						<input
							type="radio"
							name="who"
							value=""
							checked={props.who === ""}
							data-on:change={actions.change}
						/>
						<span>{labels.anyone}</span>
					</label>
					{props.practitioners.map((p) => (
						<label class="pz-who__item">
							<input
								type="radio"
								name="who"
								value={p.id}
								checked={props.who === p.id}
								data-on:change={actions.change}
							/>
							<span>{p.name}</span>
						</label>
					))}
				</fieldset>
			) : null}

			<div class="pz-week">
				<div class="pz-week__bar">
					<button
						type="button"
						class="pz-week__step"
						aria-label={labels.prevWeek}
						disabled={actions.prev === undefined}
						data-on:click__prevent={actions.prev}
					>
						<Chevron dir="prev" />
					</button>
					<span class="pz-week__range" aria-hidden="true">
						{weekRange(week, end, locale)}
					</span>
					<button
						type="button"
						class="pz-week__step"
						aria-label={labels.nextWeek}
						disabled={actions.next === undefined}
						data-on:click__prevent={actions.next}
					>
						<Chevron dir="next" />
					</button>
				</div>
				<fieldset class="pz-week__days">
					<legend class="sr-only">{`${labels.chooseDay}, ${weekRange(week, end, locale)}`}</legend>
					{cells.map((cell) => (
						<DayButton cell={cell} picker={{ id, locale, day, labels, actions }} />
					))}
				</fieldset>
			</div>

			{props.taken === true ? (
				<p class="pz-slots__notice" role="alert">
					{labels.taken}
				</p>
			) : null}

			{empty ? (
				<div class="pz-slots__empty">
					<p>{labels.emptyWeek}</p>
					{props.nextWithTimes !== undefined && actions.jump !== undefined ? (
						<button type="button" class="pz-slots__jump" data-on:click__prevent={actions.jump}>
							{labels.jumpToNext(
								weekRange(props.nextWithTimes, addDays(props.nextWithTimes, 6), locale),
							)}
						</button>
					) : null}
				</div>
			) : (
				groups.map((group) => (
					<fieldset class="pz-times" aria-label={labels.parts[group.part]}>
						<legend class="pz-times__part">{labels.parts[group.part]}</legend>
						<div class="pz-times__grid">
							{group.slots.map((slot) => (
								<label class="pz-slot">
									<input
										type="radio"
										id={`${id}-t-${slot.start}`}
										name="slot"
										value={slot.id}
										checked={props.selected === slot.id}
										data-on:change={actions.change}
									/>
									<span class="pz-slot__face">
										<Tick />
										{slot.time}
									</span>
								</label>
							))}
						</div>
					</fieldset>
				))
			)}

			<p id={`${id}-live`} class="pz-slots__live" aria-live="polite" aria-atomic="true">
				{chosen === undefined || chosenTime === undefined
					? labels.nothingSelected
					: labels.selected(
							`${dateWords(day, locale).long}, ${chosenTime}`,
							chosenWho,
							labels.modes[chosen.mode],
						)}
			</p>
		</section>
	);
}

export interface ServiceCardsProps {
	id: string;
	legend: string;
	services: ReadonlyArray<{ slug: string; name: string; durationMinutes: number; modes: string }>;
	selected: string;
	duration: (minutes: number) => string;
	/** The expression run when another service is chosen (the form is posted). */
	change: string;
}

/** The services a visitor can book, as cards: one native radio each, the whole card the target. */
export function ServiceCards(props: ServiceCardsProps): JSX.Element {
	return (
		<fieldset class="pz-svcs">
			<legend class="pz-field__label">{props.legend}</legend>
			<div class="pz-svcs__grid">
				{props.services.map((service) => (
					<label class="pz-svc">
						<input
							type="radio"
							id={`${props.id}-s-${service.slug}`}
							name="service"
							value={service.slug}
							checked={props.selected === service.slug}
							data-on:change={props.change}
						/>
						<span class="pz-svc__name">{service.name}</span>
						<span class="pz-svc__meta">
							{`${props.duration(service.durationMinutes)} · ${service.modes}`}
						</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}
