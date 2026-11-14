import type { EventId } from "./apps";
import * as m from "./paraglide/messages.js";
import type { Locale, Params } from "./words";

type Payload = Readonly<Record<string, unknown>>;

function str(payload: Payload, key: string): string {
	const v = payload[key];
	return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** A date and a time as the reader writes them, in the app's zone. */
export function formatInstant(
	instant: string,
	locale: Locale,
	timeZone: string,
): { date: string; time: string } {
	const tag = locale === "ro" ? "ro-RO" : "en-GB";
	const at = new Date(instant);
	return {
		date: new Intl.DateTimeFormat(tag, {
			timeZone,
			weekday: "long",
			day: "numeric",
			month: "long",
		}).format(at),
		time: new Intl.DateTimeFormat(tag, {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).format(at),
	};
}

/** A calendar day (`2026-12-01`) written for the reader. */
export function formatDay(value: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		timeZone: "UTC",
		day: "numeric",
		month: "long",
	}).format(new Date(`${value}T12:00:00Z`));
}

const SEVERITY = {
	warn: m.word_severity_warn,
	block_online: m.word_severity_block_online,
	block_all: m.word_severity_block_all,
} as const;
const CHANNEL = {
	web: m.word_channel_web,
	callback: m.word_channel_callback,
	assistant: m.word_channel_assistant,
} as const;
const CONFLICT = {
	practitioner: m.word_conflict_practitioner,
	room: m.word_conflict_room,
	device: m.word_conflict_device,
	roster: m.word_conflict_roster,
} as const;
const SCHEDULE = {
	day_off: m.word_sched_day_off,
	hours: m.word_sched_hours,
	leave: m.word_sched_leave,
	block: m.word_sched_block,
} as const;
const ACTION = {
	delete: m.word_action_delete,
	roles: m.word_action_roles,
	members: m.word_action_members,
	settings: m.word_action_settings,
} as const;
const REASON = {
	no_contact: m.word_reason_no_contact,
	gave_up: m.word_reason_gave_up,
} as const;

function word(
	table: Readonly<Record<string, (p: Record<string, never>, o: { locale: Locale }) => string>>,
	value: string,
	locale: Locale,
): string {
	return table[value]?.({}, { locale }) ?? "";
}

/** The one place a payload's facts become the words a message prints. Nothing here reads a field a payload may not carry. */
export function paramsOf(
	event: EventId,
	payload: Payload,
	locale: Locale,
	timeZone: string,
): Params {
	const when =
		str(payload, "startsAt") === ""
			? { date: "", time: "" }
			: formatInstant(str(payload, "startsAt"), locale, timeZone);
	const opt = { locale } as const;
	const day = (key: string): string =>
		str(payload, key) === "" ? "" : formatDay(str(payload, key), locale);
	const changedBy = str(payload, "changedBy");
	const source = str(payload, "source");
	const byline =
		changedBy !== ""
			? m.by_line({ name: changedBy }, opt)
			: source === "client"
				? m.by_client({}, opt)
				: source === "assistant"
					? m.by_assistant({}, opt)
					: source === "system"
						? m.by_system({}, opt)
						: "";
	const forClient = str(payload, "forClient");
	const expires =
		str(payload, "expiresAt") === ""
			? ""
			: new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
					timeZone,
					day: "numeric",
					month: "long",
					hour: "2-digit",
					minute: "2-digit",
					hourCycle: "h23",
				}).format(new Date(str(payload, "expiresAt")));
	const revenue = str(payload, "revenue");
	const what =
		event === "appointment.conflict"
			? word(CONFLICT, str(payload, "what"), locale)
			: event === "schedule.changed"
				? word(SCHEDULE, str(payload, "what"), locale)
				: str(payload, "failedEvent");
	const target = str(payload, "target");
	// A digest's date is the day it is about; an appointment's is read from its start.
	const date = str(payload, "date") === "" ? when.date : day("date");
	return {
		name: str(payload, "name"),
		kind: str(payload, "kind"),
		service: str(payload, "serviceName"),
		date,
		time: when.time,
		client: str(payload, "clientName"),
		remaining: str(payload, "remaining"),
		person: str(payload, "personName"),
		from: day("from"),
		to: day("to"),
		amount: str(payload, "amount"),
		summary: str(payload, "summary"),
		behalf: forClient === "" ? "" : m.invite_for({ name: forClient }, opt),
		expires,
		byline,
		count: str(payload, "total") || str(payload, "appointments") || str(payload, "attempts"),
		attended: str(payload, "attended"),
		cancelled: str(payload, "cancelled"),
		noShows: str(payload, "noShows"),
		percent: str(payload, "occupancyPercent"),
		revenueLine: revenue === "" ? "" : m.revenue_line({ revenue }, opt),
		revenue,
		severity: word(SEVERITY, str(payload, "severity"), locale),
		channel: word(CHANNEL, str(payload, "channel"), locale),
		what,
		action: word(ACTION, str(payload, "action"), locale),
		reason: word(REASON, str(payload, "reason"), locale),
		by: str(payload, "by"),
		target: target === "" ? "" : ` (${target})`,
		rating: str(payload, "rating"),
	};
}
