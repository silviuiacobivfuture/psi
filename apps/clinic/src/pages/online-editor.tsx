import { toLocal } from "@psi/scheduling/domain";
import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { BookableService, BookingPause, Practitioner } from "../port/availability-port";

/** What the pause form shows: a new pause's defaults, a pause's own values, or what was sent when it was refused. */
export interface PauseValues {
	level: "organisation" | "site" | "service" | "practitioner";
	site: string;
	service: string;
	practitioner: string;
	when: "now" | "window";
	from: string;
	until: string;
	messageRo: string;
	messageEn: string;
	defaultRo: string;
	defaultEn: string;
	callbacksOpen: boolean;
	blockStaff: boolean;
}

/** A new pause: the whole organisation, from now, the short default words, callbacks open, staff still booking. */
export function newPause(): PauseValues {
	const ro = m.av_pause_default_callbacks({}, { locale: "ro" });
	const en = m.av_pause_default_callbacks({}, { locale: "en" });
	return {
		level: "organisation",
		site: "",
		service: "",
		practitioner: "",
		when: "now",
		from: "",
		until: "",
		messageRo: ro,
		messageEn: en,
		defaultRo: ro,
		defaultEn: en,
		callbacksOpen: true,
		blockStaff: false,
	};
}

/** An instant as a `datetime-local` value in the clinic's zone. */
export const localStamp = (ms: number, timeZone: string): string => {
	const l = toLocal(ms, timeZone);
	return `${l.date}T${hhmm(l.minutes)}`;
};

/** A saved pause as the form shows it; default words stay marked as the default, so leaving them keeps it so. */
export function pauseValues(p: BookingPause, timeZone: string): PauseValues {
	return {
		level: p.scope.level,
		site: p.scope.level === "site" ? p.scope.site : "",
		service: p.scope.level === "service" ? p.scope.service : "",
		practitioner: p.scope.level === "practitioner" ? p.scope.practitionerId : "",
		when: p.from === undefined ? "now" : "window",
		from: p.from === undefined ? "" : localStamp(p.from, timeZone),
		until: p.until === undefined ? "" : localStamp(p.until, timeZone),
		messageRo: p.message.ro,
		messageEn: p.message.en,
		defaultRo: p.defaultMessage ? p.message.ro : "",
		defaultEn: p.defaultMessage ? p.message.en : "",
		callbacksOpen: p.callbacksOpen,
		blockStaff: p.blockStaff,
	};
}

function Level({
	locale,
	value,
	on,
	children,
}: {
	locale: Locale;
	value: PauseValues["level"];
	on: boolean;
	children?: JSX.Element;
}): JSX.Element {
	const o = at(locale);
	const say = {
		organisation: m.av_level_organisation({}, o),
		site: m.av_level_site({}, o),
		service: m.av_level_service({}, o),
		practitioner: m.av_level_practitioner({}, o),
	}[value];
	return (
		<div class="av-level">
			<label class="av-chip">
				<input type="radio" name="level" value={value} checked={on} />
				<span>{say}</span>
			</label>
			{children}
		</div>
	);
}

function Choose({
	name,
	label,
	value,
	items,
}: {
	name: string;
	label: string;
	value: string;
	items: ReadonlyArray<{ id: string; name: string }>;
}): JSX.Element {
	return (
		<label class="adm-field">
			<span class="adm-sr">{label}</span>
			<select class="adm-input" name={name} aria-label={label}>
				<option value="">—</option>
				{items.map((i) => (
					<option key={i.id} value={i.id} selected={i.id === value}>
						{i.name}
					</option>
				))}
			</select>
		</label>
	);
}

/** Creating or changing a pause: what it covers, when, what visitors read, callbacks and staff. */
export function PauseEditor({
	locale,
	id,
	values,
	sites,
	services,
	practitioners,
	problem,
}: {
	locale: Locale;
	/** The pause changed; null for a new one. */
	id: string | null;
	values: PauseValues;
	sites: ReadonlyArray<string>;
	services: ReadonlyArray<BookableService>;
	practitioners: ReadonlyArray<Practitioner>;
	problem: string | null;
}): JSX.Element {
	const o = at(locale);
	return (
		<form
			method="post"
			action={
				id === null
					? "/settings/online/pauses"
					: `/settings/online/pauses/${encodeURIComponent(id)}`
			}
			class="adm-card adm-stack av-pause-form"
			id="editor"
			data-action={id === null ? "booking_pause.create" : "booking_pause.update"}
			aria-labelledby="av-pause-editor"
		>
			<h2 class="adm-h2" id="av-pause-editor">
				{id === null ? m.av_pause_new_title({}, o) : m.av_pause_edit_title({}, o)}
			</h2>
			{problem === null ? null : (
				<ul class="av-problems" data-problems role="alert">
					<li>
						<Icon name="alert" />
						<span>{problem}</span>
					</li>
				</ul>
			)}
			<fieldset class="av-levels">
				<legend>{m.av_pause_what({}, o)}</legend>
				<Level locale={locale} value="organisation" on={values.level === "organisation"} />
				<Level locale={locale} value="site" on={values.level === "site"}>
					<Choose
						name="site"
						label={m.av_level_site({}, o)}
						value={values.site}
						items={sites.map((s) => ({ id: s, name: s }))}
					/>
				</Level>
				<Level locale={locale} value="service" on={values.level === "service"}>
					<Choose
						name="service"
						label={m.av_level_service({}, o)}
						value={values.service}
						items={services.map((s) => ({ id: s.slug, name: s.name }))}
					/>
				</Level>
				<Level locale={locale} value="practitioner" on={values.level === "practitioner"}>
					<Choose
						name="practitioner"
						label={m.av_level_practitioner({}, o)}
						value={values.practitioner}
						items={practitioners}
					/>
				</Level>
			</fieldset>
			<fieldset class="av-modes">
				<legend>{m.av_pause_when({}, o)}</legend>
				<label class="av-chip">
					<input type="radio" name="when" value="now" checked={values.when === "now"} />
					<span>{m.av_pause_now({}, o)}</span>
				</label>
				<label class="av-chip">
					<input type="radio" name="when" value="window" checked={values.when === "window"} />
					<span>{m.av_pause_window({}, o)}</span>
				</label>
			</fieldset>
			<div class="av-dates">
				<label class="adm-field">
					<span>{m.av_pause_from({}, o)}</span>
					<input
						class="adm-input"
						type="datetime-local"
						step={300}
						name="from"
						value={values.from}
					/>
				</label>
				<label class="adm-field">
					<span>{m.av_pause_until({}, o)}</span>
					<input
						class="adm-input"
						type="datetime-local"
						step={300}
						name="until"
						value={values.until}
					/>
				</label>
			</div>
			<p class="adm-muted">{m.av_pause_zone_hint({}, o)}</p>
			<label class="adm-field">
				<span>{m.av_pause_message_ro({}, o)}</span>
				<textarea class="adm-input" name="messageRo" rows={3} maxlength={600}>
					{values.messageRo}
				</textarea>
			</label>
			<label class="adm-field">
				<span>{m.av_pause_message_en({}, o)}</span>
				<textarea class="adm-input" name="messageEn" rows={3} maxlength={600}>
					{values.messageEn}
				</textarea>
			</label>
			<input type="hidden" name="defaultRo" value={values.defaultRo} />
			<input type="hidden" name="defaultEn" value={values.defaultEn} />
			<p class="adm-muted">{m.av_pause_message_hint({}, o)}</p>
			<label class="adm-check">
				<input type="checkbox" name="callbacksOpen" value="1" checked={values.callbacksOpen} />
				{m.av_pause_callbacks({}, o)}
			</label>
			<label class="adm-check">
				<input type="checkbox" name="blockStaff" value="1" checked={values.blockStaff} />
				{m.av_pause_block_staff({}, o)}
			</label>
			<div class="cl-buttons">
				<button class="adm-btn adm-btn--primary" type="submit">
					{id === null ? m.av_pause_create({}, o) : m.av_pause_save({}, o)}
				</button>
				<a class="adm-btn" href="/settings/online">
					{m.cancel({}, o)}
				</a>
			</div>
		</form>
	);
}
