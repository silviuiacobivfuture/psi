import { EmptyState, Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { dayLong, hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Availability, Practitioner } from "../port/availability-port";
import { Pick } from "./form-choices";

type Exception = Availability["exceptions"][number];

/** What the add form shows: empty, or what was sent when the service refused it. */
export interface OneOffValues {
	from: string;
	until: string;
	kind: "closed-day" | "closed-part" | "open";
	start: string;
	end: string;
	onsite: boolean;
	online: boolean;
	also: ReadonlyArray<string>;
}
export const blankOneOff = (today: string): OneOffValues => ({
	from: today,
	until: "",
	kind: "closed-day",
	start: "",
	end: "",
	onsite: true,
	online: true,
	also: [],
});

const span = (e: { start?: number | undefined; end?: number | undefined }): string =>
	`${hhmm(e.start ?? 0)}–${hhmm(e.end ?? 0)}`;

/** One one-off day in words: closed all day, closed for part of it, or extra hours (and how they are held). */
export function exceptionText(e: Exception, locale: Locale): string {
	const o = at(locale);
	if (e.kind === "closed")
		return e.start === undefined
			? m.av_one_off_closed_day({}, o)
			: m.av_one_off_closed_part({ span: span(e) }, o);
	const modes = (e.modes ?? ["onsite", "online"])
		.map((mode) => (mode === "onsite" ? m.av_mode_onsite({}, o) : m.av_mode_online({}, o)))
		.join(", ");
	return m.av_one_off_open({ span: span(e), modes }, o);
}

function Row({
	locale,
	person,
	item,
	editable,
}: {
	locale: Locale;
	person: string;
	item: Exception;
	editable: boolean;
}): JSX.Element {
	const o = at(locale);
	return (
		<li class="av-entry" data-one-off={item.id}>
			<span class="av-entry__main">
				<strong>{dayLong(locale, item.date)}</strong>
				<span class={item.kind === "closed" ? "adm-muted" : "av-extra"}>
					{exceptionText(item, locale)}
				</span>
			</span>
			{editable ? (
				<form
					method="post"
					action={`/settings/hours/${encodeURIComponent(person)}/one-offs/${encodeURIComponent(item.id)}/remove`}
					data-action="availability.one_off_remove"
				>
					<button
						class="adm-btn adm-btn--ghost"
						type="submit"
						aria-label={m.av_one_off_remove_on({ date: dayLong(locale, item.date) }, o)}
					>
						<Icon name="trash" />
						<span>{m.av_remove({}, o)}</span>
					</button>
				</form>
			) : null}
		</li>
	);
}

function Kind({
	locale,
	value,
	on,
}: {
	locale: Locale;
	value: OneOffValues["kind"];
	on: boolean;
}): JSX.Element {
	const o = at(locale);
	const text = {
		"closed-day": m.av_kind_closed_day({}, o),
		"closed-part": m.av_kind_closed_part({}, o),
		open: m.av_kind_open({}, o),
	}[value];
	return (
		<label class="av-chip">
			<input type="radio" name="kind" value={value} checked={on} />
			<span>{text}</span>
		</label>
	);
}

/** The one-off days from today on, and the form that adds a date or a range (to this practitioner and others). */
export function OneOffs({
	locale,
	person,
	items,
	editable,
	others,
	values,
	problems,
}: {
	locale: Locale;
	person: string;
	items: ReadonlyArray<Exception>;
	editable: boolean;
	others: ReadonlyArray<Practitioner>;
	values: OneOffValues;
	problems: ReadonlyArray<string>;
}): JSX.Element {
	const o = at(locale);
	return (
		<section class="adm-card adm-stack" id="one-offs" aria-labelledby="av-one-offs">
			<h2 class="adm-h2" id="av-one-offs">
				{m.av_one_offs_title({}, o)}
			</h2>
			<p class="adm-muted">{m.av_one_offs_lead({}, o)}</p>
			{items.length === 0 ? (
				<EmptyState icon="calendar" title={m.av_one_offs_empty({}, o)} />
			) : (
				<ul class="av-entries">
					{items.map((item) => (
						<Row key={item.id} locale={locale} person={person} item={item} editable={editable} />
					))}
				</ul>
			)}
			{editable ? (
				<form
					method="post"
					action={`/settings/hours/${encodeURIComponent(person)}/one-offs`}
					class="adm-stack av-add"
					data-action="availability.one_off_add"
				>
					<h3 class="av-title">{m.av_one_off_add_title({}, o)}</h3>
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
					<fieldset class="av-modes">
						<legend>{m.av_kind({}, o)}</legend>
						{(["closed-day", "closed-part", "open"] as const).map((k) => (
							<Kind key={k} locale={locale} value={k} on={values.kind === k} />
						))}
					</fieldset>
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
					<p class="adm-muted">{m.av_one_off_times_hint({}, o)}</p>
					<fieldset class="av-modes">
						<legend>{m.av_one_off_modes({}, o)}</legend>
						<label class="av-chip">
							<input type="checkbox" name="onsite" value="1" checked={values.onsite} />
							<span>{m.av_mode_onsite({}, o)}</span>
						</label>
						<label class="av-chip">
							<input type="checkbox" name="online" value="1" checked={values.online} />
							<span>{m.av_mode_online({}, o)}</span>
						</label>
					</fieldset>
					<Pick legend={m.av_one_off_also({}, o)} name="also" items={others} on={values.also} />
					<div class="cl-buttons">
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.av_one_off_add({}, o)}
						</button>
					</div>
				</form>
			) : null}
		</section>
	);
}
