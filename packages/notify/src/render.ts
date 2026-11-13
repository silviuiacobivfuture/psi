import { z } from "zod";
import { EmailThemeSchema, EventIdSchema } from "./apps";
import { type Audience, AudienceSchema, type Entry, messageStem } from "./catalogue";
import { renderEmailHtml, renderEmailText } from "./email-html";
import { paletteOf } from "./palette";
import * as m from "./paraglide/messages.js";
import { type Locale, type Params, WORDS } from "./words";

/** What the trigger client adds beside an event's payload: the effective channels and the app's looks. */
export const MetaSchema = z
	.object({
		event: EventIdSchema,
		audience: AudienceSchema,
		/** Channels this delivery may use after settings, quiet hours and the catalogue. */
		channels: z.object({ in_app: z.boolean(), push: z.boolean(), email: z.boolean() }).strict(),
		brandName: z.string().min(1).max(80),
		theme: EmailThemeSchema,
		timeZone: z.string().min(1).max(64),
		siteUrl: z.string().url(),
		consoleUrl: z.string().url(),
		place: z.object({ name: z.string(), address: z.string(), mapUrl: z.string().url() }).strict(),
	})
	.strict();
export type Meta = z.infer<typeof MetaSchema>;

export function localeOf(raw: string | null | undefined): Locale {
	return raw?.toLowerCase().startsWith("en") ? "en" : "ro";
}

const CLIENT_SIDE: ReadonlySet<Audience> = new Set(["client"]);

export interface Rendered {
	readonly subject: string;
	readonly body: string;
	readonly cta: string;
	/** Absolute deep link: the console for staff, the site for clients. */
	readonly url: string;
	readonly html: string;
	readonly text: string;
}

function format(instant: string, locale: Locale, timeZone: string): { date: string; time: string } {
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

function day(value: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		timeZone: "UTC",
		day: "numeric",
		month: "long",
	}).format(new Date(`${value}T12:00:00Z`));
}

function str(payload: Readonly<Record<string, unknown>>, key: string): string {
	const v = payload[key];
	return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function paramsOf(
	payload: Readonly<Record<string, unknown>>,
	locale: Locale,
	timeZone: string,
): Params {
	const when =
		str(payload, "startsAt") === ""
			? { date: "", time: "" }
			: format(str(payload, "startsAt"), locale, timeZone);
	return {
		name: str(payload, "name"),
		kind: str(payload, "kind"),
		service: str(payload, "serviceName"),
		date: when.date,
		time: when.time,
		client: str(payload, "clientName"),
		remaining: str(payload, "remaining"),
		person: str(payload, "personName"),
		from: str(payload, "from") === "" ? "" : day(str(payload, "from"), locale),
		to: str(payload, "to") === "" ? "" : day(str(payload, "to"), locale),
		amount: str(payload, "amount"),
		summary: str(payload, "summary"),
	};
}

/** The texts, link and e-mail of one catalogue entry for one recipient locale. */
export function render(
	entry: Entry,
	payload: Readonly<Record<string, unknown>>,
	locale: Locale,
	meta: Meta,
): Rendered {
	const words = WORDS[messageStem(entry) as keyof typeof WORDS];
	const params = paramsOf(payload, locale, meta.timeZone);
	const opt = { locale } as const;
	const subject = words.subject(params, opt);
	const body = words.body(params, opt);
	const cta = words.cta(params, opt);
	const base = CLIENT_SIDE.has(entry.audience) ? meta.siteUrl : meta.consoleUrl;
	const url =
		str(payload, "manageUrl") !== "" && CLIENT_SIDE.has(entry.audience)
			? str(payload, "manageUrl")
			: new URL(entry.path(payload), base).toString();
	const isAppointment = str(payload, "startsAt") !== "";
	const facts = isAppointment
		? [
				{ label: m.email_when_label({}, opt), value: `${params.date}, ${params.time}` },
				...(CLIENT_SIDE.has(entry.audience)
					? [
							{
								label: m.email_place_label({}, opt),
								value: `${meta.place.name}, ${meta.place.address}`,
								href: meta.place.mapUrl,
							},
						]
					: []),
			]
		: [];
	const links: Array<{ label: string; href: string }> = [];
	if (CLIENT_SIDE.has(entry.audience) && isAppointment)
		links.push({ label: m.email_map_link({}, opt), href: meta.place.mapUrl });
	if (str(payload, "icsUrl") !== "" && entry.event !== "appointment.cancelled")
		links.push({ label: m.email_ics_link({}, opt), href: str(payload, "icsUrl") });
	const reminder = entry.event === "reminder.day_before";
	if (reminder) links.push({ label: m.email_decline({}, opt), href: str(payload, "cancelUrl") });
	const actionHref = reminder
		? str(payload, "confirmUrl")
		: str(payload, "receiptUrl") !== ""
			? str(payload, "receiptUrl")
			: url;
	const parts = {
		lang: locale,
		palette: paletteOf(meta.theme),
		brand: meta.brandName,
		logoUrl: new URL("/assets/pwa/icon-192.png", meta.siteUrl).toString(),
		preheader: body,
		greeting:
			str(payload, "clientName") !== "" && CLIENT_SIDE.has(entry.audience)
				? m.email_greeting({ name: str(payload, "clientName") }, opt)
				: m.email_greeting_plain({}, opt),
		title: subject,
		body,
		facts,
		action: { label: cta, href: actionHref },
		links,
		note: reminder ? m.email_one_click({}, opt) : m.email_reply_hint({}, opt),
		footer: m.email_sent_by({ brand: meta.brandName }, opt),
	};
	return { subject, body, cta, url, html: renderEmailHtml(parts), text: renderEmailText(parts) };
}

/** The push step's words: only the brand and a fixed sentence — never a name, a time or a reason. */
export function pushWords(brand: string, locale: Locale): { title: string; body: string } {
	return { title: m.push_title({ brand }, { locale }), body: m.push_body({}, { locale }) };
}
