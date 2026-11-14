import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { type Draft, type DraftRow, type DraftSchedule, rowKey, WEEKDAYS } from "./hours-draft";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** A weekday's name (1 = Monday). */
export function dayName(weekday: number, locale: Locale): string {
	const key = DAY_KEYS[weekday - 1] ?? "mon";
	return m[`cat_day_${key}`]({}, at(locale));
}

/** What a refusal said, placed: beside a row, on a schedule's dates, or over the whole editor. */
export interface Placed {
	rows: ReadonlyMap<string, ReadonlyArray<string>>;
	schedules: ReadonlyMap<number, ReadonlyArray<string>>;
	general: ReadonlyArray<string>;
}
export const NOTHING_PLACED: Placed = { rows: new Map(), schedules: new Map(), general: [] };

const idOf = (key: string): string => `av-${key.replace(".", "-")}`;

function Problems({ id, items }: { id: string; items: ReadonlyArray<string> }): JSX.Element | null {
	if (items.length === 0) return null;
	return (
		<ul class="av-problems" id={id} data-problems>
			{items.map((text) => (
				<li key={text}>
					<Icon name="alert" />
					<span>{text}</span>
				</li>
			))}
		</ul>
	);
}

function Interval({
	locale,
	schedule,
	index,
	row,
	editable,
	problems,
}: {
	locale: Locale;
	schedule: number;
	index: number;
	row: DraftRow;
	editable: boolean;
	problems: ReadonlyArray<string>;
}): JSX.Element {
	const o = at(locale);
	const key = rowKey(schedule, index);
	const day = dayName(row.weekday, locale);
	const bad = problems.length > 0;
	const described = bad ? { "aria-describedby": `${idOf(key)}-p`, "aria-invalid": "true" } : {};
	return (
		<div class={bad ? "av-row av-row--bad" : "av-row"} data-row={key}>
			<input type="hidden" name={`${key}.d`} value={String(row.weekday)} />
			<div class="av-row__times">
				<input
					class="adm-input"
					type="time"
					step={300}
					name={`${key}.start`}
					value={row.start}
					aria-label={m.av_row_start({ day }, o)}
					{...described}
				/>
				<span aria-hidden="true">–</span>
				<input
					class="adm-input"
					type="time"
					step={300}
					name={`${key}.end`}
					value={row.end}
					aria-label={m.av_row_end({ day }, o)}
					{...described}
				/>
			</div>
			<fieldset class="av-modes">
				<legend class="adm-sr">{m.av_modes({ day }, o)}</legend>
				<label class="av-chip">
					<input type="checkbox" name={`${key}.onsite`} value="1" checked={row.onsite} />
					<span>{m.av_mode_onsite({}, o)}</span>
				</label>
				<label class="av-chip">
					<input type="checkbox" name={`${key}.online`} value="1" checked={row.online} />
					<span>{m.av_mode_online({}, o)}</span>
				</label>
			</fieldset>
			{editable ? (
				<button
					class="adm-iconbtn"
					type="submit"
					name="op"
					value={`remove:${schedule}:${index}`}
					aria-label={m.av_row_remove({ day, from: row.start, to: row.end }, o)}
				>
					<Icon name="trash" />
				</button>
			) : null}
			<Problems id={`${idOf(key)}-p`} items={problems} />
		</div>
	);
}

function scheduleTitle(s: DraftSchedule, locale: Locale): string {
	const o = at(locale);
	if (s.override) return m.av_schedule_period({}, o);
	if (s.week !== "") return m.av_schedule_week({ week: s.week }, o);
	return m.av_schedule_regular({}, o);
}

function Schedule({
	locale,
	schedule,
	index,
	editable,
	placed,
	removable,
}: {
	locale: Locale;
	schedule: DraftSchedule;
	index: number;
	editable: boolean;
	placed: Placed;
	removable: boolean;
}): JSX.Element {
	const o = at(locale);
	const head = `av-s${index}`;
	return (
		<section class="adm-card av-schedule" aria-labelledby={head} data-schedule={index}>
			<div class="av-schedule__head">
				<h3 class="av-title" id={head}>
					{scheduleTitle(schedule, locale)}
				</h3>
				{schedule.override ? (
					<span class="adm-pill adm-pill--requested">{m.av_schedule_period_hint({}, o)}</span>
				) : null}
			</div>
			<input type="hidden" name={`s${index}.week`} value={schedule.week} />
			<input type="hidden" name={`s${index}.override`} value={schedule.override ? "1" : ""} />
			<div class="av-dates">
				<label class="adm-field">
					<span>{m.av_valid_from({}, o)}</span>
					<input class="adm-input" type="date" name={`s${index}.from`} value={schedule.from} />
				</label>
				<label class="adm-field">
					<span>{m.av_valid_until({}, o)}</span>
					<input class="adm-input" type="date" name={`s${index}.until`} value={schedule.until} />
				</label>
			</div>
			<Problems id={`${head}-p`} items={placed.schedules.get(index) ?? []} />
			<ul class="av-days">
				{WEEKDAYS.map((weekday) => {
					const rows = schedule.rows
						.map((row, i) => ({ row, i }))
						.filter(({ row }) => row.weekday === weekday);
					return (
						<li key={weekday} class="av-day" data-weekday={weekday}>
							<span class="av-day__name">{dayName(weekday, locale)}</span>
							<div class="av-day__rows">
								{rows.length === 0 ? <span class="adm-muted">{m.av_day_off({}, o)}</span> : null}
								{rows.map(({ row, i }) => (
									<Interval
										key={rowKey(index, i)}
										locale={locale}
										schedule={index}
										index={i}
										row={row}
										editable={editable}
										problems={placed.rows.get(rowKey(index, i)) ?? []}
									/>
								))}
							</div>
							{editable ? (
								<button
									class="adm-btn adm-btn--ghost av-day__add"
									type="submit"
									name="op"
									value={`add:${index}:${weekday}`}
									aria-label={m.av_row_add_on({ day: dayName(weekday, locale) }, o)}
								>
									<Icon name="plus" />
									<span>{m.av_row_add({}, o)}</span>
								</button>
							) : null}
						</li>
					);
				})}
			</ul>
			{editable ? (
				<div class="av-schedule__tools">
					<button class="adm-btn" type="submit" name="op" value={`copy-monday:${index}`}>
						{m.av_copy_monday({}, o)}
					</button>
					{removable ? (
						<button
							class="adm-btn adm-btn--ghost"
							type="submit"
							name="op"
							value={`remove-schedule:${index}`}
						>
							<Icon name="trash" />
							<span>{m.av_schedule_remove({}, o)}</span>
						</button>
					) : null}
				</div>
			) : null}
		</section>
	);
}

/**
 * The weekly rules editor: every schedule of the draft, each weekday with its intervals (start, end, modes). Read-only
 * (inputs disabled, no buttons) for someone who may not edit this person's hours.
 */
export function RulesEditor({
	locale,
	person,
	draft,
	editable,
	placed,
	dirty,
}: {
	locale: Locale;
	person: string;
	draft: Draft;
	editable: boolean;
	placed: Placed;
	/** The draft holds changes not saved yet. */
	dirty: boolean;
}): JSX.Element {
	const o = at(locale);
	const body = (
		<>
			{/* Enter in a field saves (the first submit button is the one a form submits with). */}
			{editable ? (
				<button class="adm-sr" type="submit" name="op" value="save" tabindex={-1}>
					{m.av_save({}, o)}
				</button>
			) : null}
			<Problems id="av-general" items={placed.general} />
			<fieldset class="av-fieldset" disabled={!editable}>
				<legend class="adm-sr">{m.av_rules_title({}, o)}</legend>
				{draft.map((s, j) => (
					<Schedule
						key={`s${j}`}
						locale={locale}
						schedule={s}
						index={j}
						editable={editable}
						placed={placed}
						removable={j > 0}
					/>
				))}
			</fieldset>
			{editable ? (
				<div class="av-savebar">
					<button class="adm-btn" type="submit" name="op" value="add-period">
						<Icon name="plus" />
						<span>{m.av_schedule_add_period({}, o)}</span>
					</button>
					{dirty ? <span class="adm-muted">{m.av_unsaved({}, o)}</span> : null}
					<button class="adm-btn adm-btn--primary" type="submit" name="op" value="save">
						{m.av_save({}, o)}
					</button>
				</div>
			) : null}
		</>
	);
	// Read-only: the same schedules, with nothing to submit and no action to offer.
	if (!editable)
		return (
			<div class="adm-stack av-rules" id="rules">
				{body}
			</div>
		);
	return (
		<form
			method="post"
			action={`/settings/hours/${encodeURIComponent(person)}/rules`}
			class="adm-stack av-rules"
			data-action="availability.rules"
			id="rules"
		>
			{body}
		</form>
	);
}
