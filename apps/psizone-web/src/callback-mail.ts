import { at } from "./i18n";
import { m } from "./paraglide/messages.js";

/** A callback request as the team reads it. */
export interface CallbackRequest {
	name: string;
	email: string;
	phone: string;
	forWhom: "child" | "teen" | "adult";
	when: "morning" | "afternoon" | "any";
	/** A slot the visitor chose that could not be held (UTC ms). */
	preferredStart?: number;
	service?: string;
	locale: "ro" | "en";
	channel: "form" | "guide";
	/** The page the form was on: "/contact". */
	page: string;
}

const TEAM = at("ro");

const FOR = {
	child: () => m.form_for_child({}, TEAM),
	teen: () => m.form_for_teen({}, TEAM),
	adult: () => m.form_for_adult({}, TEAM),
} as const;
const WHEN = {
	morning: () => m.form_when_morning({}, TEAM),
	afternoon: () => m.form_when_afternoon({}, TEAM),
	any: () => m.form_when_any({}, TEAM),
} as const;

function stamp(ms: number, zone: string): string {
	return new Intl.DateTimeFormat("ro-RO", {
		timeZone: zone,
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(ms);
}

/** One line of a plain-text message: a header cannot be forged with a line break in a typed name. */
function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * The team's e-mail for one request: plain text, Romanian whatever language the visitor used. It
 * says whether the request was also saved, because when it was not this message is the only copy.
 */
export function callbackMail(input: {
	request: CallbackRequest;
	site: string;
	zone: string;
	received: number;
	stored: boolean;
	/** The CMS page listing the requests, when the CMS is known. */
	listUrl: string | undefined;
}): { subject: string; text: string } {
	const { request: r } = input;
	const line = (label: string, value: string): string => `${label}: ${oneLine(value)}`;
	const lines = [
		m.callback_mail_intro({ site: input.site }, TEAM),
		"",
		line(m.callback_mail_name({}, TEAM), r.name),
		...(r.phone === "" ? [] : [line(m.callback_mail_phone({}, TEAM), r.phone)]),
		...(r.email === "" ? [] : [line(m.callback_mail_email({}, TEAM), r.email)]),
		line(m.callback_mail_for({}, TEAM), FOR[r.forWhom]()),
		line(m.callback_mail_when({}, TEAM), WHEN[r.when]()),
		...(r.preferredStart === undefined
			? []
			: [line(m.callback_mail_slot({}, TEAM), stamp(r.preferredStart, input.zone))]),
		...(r.service === undefined ? [] : [line(m.callback_mail_service({}, TEAM), r.service)]),
		line(m.callback_mail_locale({}, TEAM), r.locale),
		line(m.callback_mail_page({}, TEAM), `${r.page} (${r.channel})`),
		line(m.callback_mail_received({}, TEAM), stamp(input.received, input.zone)),
		line(
			m.callback_mail_stored({}, TEAM),
			input.stored ? m.callback_mail_stored_yes({}, TEAM) : m.callback_mail_stored_no({}, TEAM),
		),
		m.callback_mail_consent({}, TEAM),
		...(input.listUrl === undefined
			? []
			: ["", `${m.callback_mail_link({}, TEAM)}: ${input.listUrl}`]),
	];
	return {
		subject: oneLine(m.callback_mail_subject({ name: r.name }, TEAM)),
		text: `${lines.join("\n")}\n`,
	};
}
