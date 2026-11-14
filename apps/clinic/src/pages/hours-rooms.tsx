import { EmptyState, Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { dayLong, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { RoomClosure } from "../port/availability-port";

/** What the closure form shows: empty, or what was sent when the service refused it. */
export interface ClosureValues {
	from: string;
	until: string;
	part: boolean;
	start: string;
	end: string;
}
export const blankClosure = (today: string): ClosureValues => ({
	from: today,
	until: "",
	part: false,
	start: "",
	end: "",
});

const closureText = (c: RoomClosure, locale: Locale): string =>
	c.start === undefined
		? m.av_one_off_closed_day({}, at(locale))
		: m.av_one_off_closed_part({ span: `${hhmm(c.start)}–${hhmm(c.end ?? 0)}` }, at(locale));

/**
 * A room's closed days and hours (a room has closures only, never weekly hours): the list from today on, and a form
 * closing a date or a range, the whole day or part of it.
 */
export function RoomClosures({
	locale,
	rooms,
	room,
	items,
	editable,
	values,
	problems,
}: {
	locale: Locale;
	rooms: ReadonlyArray<{ id: string; name: string }>;
	room: string;
	items: ReadonlyArray<RoomClosure>;
	editable: boolean;
	values: ClosureValues;
	problems: ReadonlyArray<string>;
}): JSX.Element {
	const o = at(locale);
	if (rooms.length === 0)
		return (
			<div class="adm-card">
				<EmptyState icon="sidebar" title={m.av_rooms_empty({}, o)} />
			</div>
		);
	const base = `/settings/hours/rooms/${encodeURIComponent(room)}/closures`;
	return (
		<section class="adm-card adm-stack" id="closures" aria-labelledby="av-closures">
			<h2 class="adm-h2" id="av-closures">
				{m.av_rooms_title({}, o)}
			</h2>
			<p class="adm-muted">{m.av_rooms_lead({}, o)}</p>
			<form method="get" action="/settings/hours" class="av-dates">
				<input type="hidden" name="tab" value="rooms" />
				<label class="adm-field">
					<span>{m.av_room_pick({}, o)}</span>
					<select class="adm-input" name="room">
						{rooms.map((r) => (
							<option key={r.id} value={r.id} selected={r.id === room}>
								{r.name}
							</option>
						))}
					</select>
				</label>
				<div class="av-dates__go">
					<button class="adm-btn" type="submit">
						{m.av_room_show({}, o)}
					</button>
				</div>
			</form>
			{items.length === 0 ? (
				<p class="adm-muted" data-closures-empty>
					{m.av_room_open({}, o)}
				</p>
			) : (
				<ul class="av-entries">
					{items.map((c) => (
						<li key={c.id} class="av-entry" data-closure={c.id}>
							<span class="av-entry__main">
								<strong>{dayLong(locale, c.date)}</strong>
								<span class="adm-muted">{closureText(c, locale)}</span>
							</span>
							{editable ? (
								<form
									method="post"
									action={`${base}/${encodeURIComponent(c.id)}/remove`}
									data-action="rooms.closure_remove"
								>
									<button
										class="adm-btn adm-btn--ghost"
										type="submit"
										aria-label={m.av_closure_remove_on({ date: dayLong(locale, c.date) }, o)}
									>
										<Icon name="trash" />
										<span>{m.av_room_reopen({}, o)}</span>
									</button>
								</form>
							) : null}
						</li>
					))}
				</ul>
			)}
			{editable ? (
				<form method="post" action={base} class="adm-stack av-add" data-action="rooms.closure_add">
					<h3 class="av-title">{m.av_closure_add_title({}, o)}</h3>
					{problems.length === 0 ? null : (
						<ul class="av-problems" data-problems role="alert">
							{problems.map((text) => (
								<li key={text}>
									<Icon name="alert" />
									<span>{text}</span>
								</li>
							))}
						</ul>
					)}
					<div class="av-dates">
						<label class="adm-field">
							<span>{m.av_one_off_from({}, o)}</span>
							<input class="adm-input" type="date" name="from" value={values.from} required />
						</label>
						<label class="adm-field">
							<span>{m.av_one_off_until({}, o)}</span>
							<input class="adm-input" type="date" name="until" value={values.until} />
						</label>
					</div>
					<label class="adm-check">
						<input type="checkbox" name="part" value="1" checked={values.part} />
						{m.av_closure_part({}, o)}
					</label>
					<div class="av-dates">
						<label class="adm-field">
							<span>{m.av_one_off_start({}, o)}</span>
							<input class="adm-input" type="time" step={300} name="start" value={values.start} />
						</label>
						<label class="adm-field">
							<span>{m.av_one_off_end({}, o)}</span>
							<input class="adm-input" type="time" step={300} name="end" value={values.end} />
						</label>
					</div>
					<div class="cl-buttons">
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.av_closure_add({}, o)}
						</button>
					</div>
				</form>
			) : null}
		</section>
	);
}
