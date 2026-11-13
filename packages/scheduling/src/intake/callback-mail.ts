/** A callback request as the team reads it. */
export interface CallbackRequest {
	name: string;
	email: string;
	phone: string;
	/** Whole years. */
	age?: number;
	/** What is going on, in the person's words. */
	details?: string;
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

/**
 * The words of the team's e-mail, in the team's language (Romanian, whatever language the visitor
 * used). Each site supplies its own from its own messages; nothing here is a site's wording.
 */
export interface CallbackMailCopy {
	intro: (site: string) => string;
	subject: (name: string) => string;
	name: string;
	phone: string;
	email: string;
	age: string;
	details: string;
	forWhom: string;
	when: string;
	slot: string;
	service: string;
	locale: string;
	page: string;
	received: string;
	stored: string;
	storedYes: string;
	storedNo: string;
	consent: string;
	link: string;
	audience: Readonly<Partial<Record<CallbackRequest["forWhom"], string>>>;
	period: Readonly<Record<CallbackRequest["when"], string>>;
}

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
	copy: CallbackMailCopy;
	request: CallbackRequest;
	site: string;
	zone: string;
	received: number;
	stored: boolean;
	/** The CMS page listing the requests, when the CMS is known. */
	listUrl: string | undefined;
}): { subject: string; text: string } {
	const { request: r, copy: c } = input;
	const line = (label: string, value: string): string => `${label}: ${oneLine(value)}`;
	const lines = [
		c.intro(input.site),
		"",
		line(c.name, r.name),
		...(r.phone === "" ? [] : [line(c.phone, r.phone)]),
		...(r.email === "" ? [] : [line(c.email, r.email)]),
		...(r.age === undefined ? [] : [line(c.age, String(r.age))]),
		line(c.forWhom, c.audience[r.forWhom] ?? r.forWhom),
		line(c.when, c.period[r.when]),
		...(r.preferredStart === undefined ? [] : [line(c.slot, stamp(r.preferredStart, input.zone))]),
		...(r.service === undefined ? [] : [line(c.service, r.service)]),
		line(c.locale, r.locale),
		line(c.page, `${r.page} (${r.channel})`),
		line(c.received, stamp(input.received, input.zone)),
		line(c.stored, input.stored ? c.storedYes : c.storedNo),
		c.consent,
		...(r.details === undefined ? [] : ["", `${c.details}:`, r.details.trim()]),
		...(input.listUrl === undefined ? [] : ["", `${c.link}: ${input.listUrl}`]),
	];
	return {
		subject: oneLine(c.subject(r.name)),
		text: `${lines.join("\n")}\n`,
	};
}
