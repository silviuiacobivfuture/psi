import { dayMonth, hhmm, parseDay } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Appointment, AuditEvent } from "../port/schema";
import { actionKey, actionLabel } from "./labels";
import { type AuditLookup, type AuditObject, objectOf } from "./lookup";

const weekday = (l: Locale, iso: string): string =>
	new Intl.DateTimeFormat(l, { timeZone: "UTC", weekday: "long" }).format(parseDay(iso));

const DAY_MS = 86_400_000;

/** "joi 14:00" for a visit within a week of the event, "12 nov, 14:00" otherwise. */
function whenOf(a: Appointment, eventAt: string, locale: Locale): string {
	const near =
		Math.abs(parseDay(a.date).getTime() - parseDay(eventAt.slice(0, 10)).getTime()) < 7 * DAY_MS;
	return near
		? `${weekday(locale, a.date)} ${hhmm(a.startMin)}`
		: `${dayMonth(locale, a.date)}, ${hhmm(a.startMin)}`;
}

/** What an object is called, in the middle of a sentence ("programarea lui Ana de joi 14:00", "Ana Popescu"). */
export function objectName(
	o: AuditObject,
	e: AuditEvent,
	lookup: AuditLookup,
	locale: Locale,
): string {
	const l = at(locale);
	switch (o.type) {
		case "appointment": {
			const a = lookup.appointments.get(o.id);
			if (a === undefined) return m.jr_o_appointment_unknown({}, l);
			const client =
				a.clientId === null ? (a.title ?? "") : (lookup.clients.get(a.clientId)?.name ?? "");
			return client === ""
				? m.jr_o_appointment_unknown({}, l)
				: m.jr_o_appointment({ client, when: whenOf(a, e.at, locale) }, l);
		}
		case "client":
			return lookup.clients.get(o.id)?.name ?? m.jr_o_client_unknown({}, l);
		case "request": {
			const r = lookup.requests.get(o.id);
			return r === undefined ? m.jr_o_request_unknown({}, l) : m.jr_o_request({ name: r.name }, l);
		}
		case "role":
			return lookup.roles.get(o.id) ?? m.jr_o_role_unknown({}, l);
		case "member":
			return (
				lookup.people.get(o.id)?.name ?? lookup.roles.get(o.id) ?? m.jr_o_member_unknown({}, l)
			);
		case "package":
			return lookup.packages.get(o.id)?.name ?? m.jr_o_package_unknown({}, l);
		case "reminder":
			// A reminder is the day-before message of one appointment, and its id is that appointment's.
			return objectName({ type: "appointment", id: o.id }, e, lookup, locale);
		default:
			return actionLabel(e.action, locale);
	}
}

/** The object as a table cell says it: "Maria Popescu · joi 14:00" for a visit, else as in a sentence. */
export function objectShort(
	o: AuditObject,
	e: AuditEvent,
	lookup: AuditLookup,
	locale: Locale,
): string {
	const a =
		o.type === "appointment" || o.type === "reminder" ? lookup.appointments.get(o.id) : undefined;
	if (a === undefined) return objectName(o, e, lookup, locale);
	const who = a.clientId === null ? (a.title ?? "") : (lookup.clients.get(a.clientId)?.name ?? "");
	return who === "" ? objectName(o, e, lookup, locale) : `${who} · ${whenOf(a, e.at, locale)}`;
}

/** The viewer-language sentence for the event: "A anulat programarea lui X de joi 14:00, motiv: …". */
export function sentenceOf(e: AuditEvent, lookup: AuditLookup, locale: Locale): string {
	const l = at(locale);
	const o = objectOf(e);
	const object = objectName(o, e, lookup, locale);
	const reason = e.reason === undefined ? "" : m.jr_s_reason({ reason: e.reason }, l);
	const say = (text: string): string => `${text}${reason}`;
	switch (actionKey(e.action)) {
		case "appointment_create":
			return say(m.jr_s_appointment_create({ object }, l));
		case "appointment_edit":
			return say(m.jr_s_appointment_edit({ object }, l));
		case "appointment_cancel":
			return say(m.jr_s_appointment_cancel({ object }, l));
		case "appointment_delete":
			return say(m.jr_s_appointment_delete({ object }, l));
		case "appointment_restore":
			return say(m.jr_s_appointment_restore({ object }, l));
		case "appointment_attendance":
			return say(m.jr_s_appointment_attendance({ object }, l));
		case "payment_add":
			return say(m.jr_s_payment_add({ object }, l));
		case "client_create":
			return say(m.jr_s_client_create({ object }, l));
		case "client_edit":
			return say(m.jr_s_client_edit({ object }, l));
		case "client_archive":
			return say(m.jr_s_client_archive({ object }, l));
		case "client_restore":
			return say(m.jr_s_client_restore({ object }, l));
		case "client_delete":
			return say(m.jr_s_client_delete({ object }, l));
		case "package_create":
			return say(m.jr_s_package_create({ object }, l));
		case "package_edit":
			return say(m.jr_s_package_edit({ object }, l));
		case "reminder_send":
			return say(m.jr_s_reminder_send({ object }, l));
		case "request_handled":
			return say(m.jr_s_request_handled({ object }, l));
		case "role_edit":
			return say(m.jr_s_role_edit({ object }, l));
		case "view_as_start":
			return m.jr_s_view_as_start({ object }, l);
		case "view_as_stop":
			return m.jr_s_view_as_stop({}, l);
		default:
			return say(m.jr_s_generic({ what: actionLabel(e.action, locale), object }, l));
	}
}

/** Where the object lives in the console, when it has a page of its own that this person may open. */
export function objectHref(
	o: AuditObject,
	lookup: AuditLookup,
	can: { has(key: string): boolean },
): string | null {
	switch (o.type) {
		case "appointment":
			return lookup.appointments.has(o.id) && can.has("calendars_view")
				? `/calendar/appointment/${encodeURIComponent(o.id)}`
				: null;
		case "client":
			return lookup.clients.has(o.id) && can.has("clients_view")
				? `/clients/${encodeURIComponent(o.id)}`
				: null;
		case "request":
			return can.has("web_requests_view") ? "/requests" : null;
		case "role":
			return can.has("roles_view") ? "/settings/roles" : null;
		default:
			return null;
	}
}
