import { z } from "zod";
import { EmailThemeSchema, EventIdSchema } from "./apps";
import { type Audience, AudienceSchema, type Entry, messageStem } from "./catalogue";
import { renderEmailHtml, renderEmailText } from "./email-html";
import { paletteOf } from "./palette";
import * as m from "./paraglide/messages.js";
import { formatInstant, paramsOf } from "./render-params";
import { type Locale, WORDS } from "./words";

/** What the trigger client adds beside an event's payload: the effective channels and the app's looks. */
export const MetaSchema = z
	.object({
		event: EventIdSchema,
		audience: AudienceSchema,
		/** Channels this delivery may use after settings, quiet hours, preferences and the catalogue. */
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

function str(payload: Readonly<Record<string, unknown>>, key: string): string {
	const v = payload[key];
	return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** The link the main button leads to: the message's own (a confirm link, an invitation) or the entry's page. */
const OWN_LINKS = ["inviteUrl", "signInUrl", "feedbackUrl", "accountUrl", "receiptUrl"] as const;
function actionLink(
	entry: Entry,
	payload: Readonly<Record<string, unknown>>,
	fallback: string,
): string {
	if (entry.event === "reminder.day_before") return str(payload, "confirmUrl");
	for (const key of OWN_LINKS) if (str(payload, key) !== "") return str(payload, key);
	return fallback;
}

/** The texts, link and e-mail of one catalogue entry for one recipient locale. */
export function render(
	entry: Entry,
	payload: Readonly<Record<string, unknown>>,
	locale: Locale,
	meta: Meta,
): Rendered {
	const words = WORDS[messageStem(entry) as keyof typeof WORDS];
	const params = paramsOf(entry.event, payload, locale, meta.timeZone);
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
	const lines = Array.isArray(payload.lines) ? payload.lines : [];
	const facts = [
		...(isAppointment
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
			: []),
		// A digest's lines: a time and a short text each (never more than the payload's own bound).
		...lines.flatMap((line: unknown) => {
			if (typeof line !== "object" || line === null) return [];
			const at = Reflect.get(line, "at");
			const text = Reflect.get(line, "text");
			return typeof at === "string" && typeof text === "string"
				? [{ label: formatInstant(at, locale, meta.timeZone).time, value: text }]
				: [];
		}),
	];
	const links: Array<{ label: string; href: string }> = [];
	if (CLIENT_SIDE.has(entry.audience) && isAppointment)
		links.push({ label: m.email_map_link({}, opt), href: meta.place.mapUrl });
	if (str(payload, "icsUrl") !== "" && entry.event !== "appointment.cancelled")
		links.push({ label: m.email_ics_link({}, opt), href: str(payload, "icsUrl") });
	const reminder = entry.event === "reminder.day_before";
	if (reminder) links.push({ label: m.email_decline({}, opt), href: str(payload, "cancelUrl") });
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
		action: { label: cta, href: actionLink(entry, payload, url) },
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
