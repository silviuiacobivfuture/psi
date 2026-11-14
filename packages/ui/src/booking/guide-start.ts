import { getContext } from "hono/context-storage";
import type { BookingLocale as Locale } from "./types";

/** A service word the hand-over may carry: lowercase letters and hyphens, as the guide writes it. */
const SERVICE = /^[a-z][a-z-]{1,39}$/;

const WORDS: Readonly<Record<Locale, { plain: string; named: (service: string) => string }>> = {
	ro: {
		plain: "Vreau o programare",
		named: (service) => `Vreau o programare pentru ${service}`,
	},
	en: {
		plain: "I'd like to book an appointment",
		named: (service) => `I'd like to book an appointment for ${service}`,
	},
};

/**
 * The message the chat asks on load when another psi site handed a booking over
 * (`?ghid=programare`, optionally `&serviciu=evaluare`): the visitor's own booking request, in the
 * page's language. Only the two known parameters count and the service must be a plain word, so
 * the address can never put free text into the conversation. Undefined outside a request.
 */
export function guideStart(locale: Locale): string | undefined {
	let query: Readonly<Record<string, string>>;
	try {
		query = getContext().req.query();
	} catch {
		return undefined;
	}
	if (query.ghid !== "programare") return undefined;
	const service = query.serviciu;
	const words = WORDS[locale];
	return service !== undefined && SERVICE.test(service)
		? words.named(service.replace(/-/g, " "))
		: words.plain;
}
