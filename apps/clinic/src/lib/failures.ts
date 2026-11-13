import type { Context } from "hono";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { at, type Locale } from "./i18n";

const seen = new WeakMap<Request, PortError[]>();

/** The service refused something while this request was being answered (the port tells, the page decides how to look). */
export function noteFailure(request: Request, error: PortError): void {
	const list = seen.get(request) ?? [];
	list.push(error);
	seen.set(request, list);
}

export function failuresOf(c: Context): ReadonlyArray<PortError> {
	return seen.get(c.req.raw) ?? [];
}

/** The most telling refusal of this request: sign-in gone, then no access, then not built yet. */
export function worstFailure(c: Context): PortError | null {
	const list = failuresOf(c);
	for (const code of [
		"unauthenticated",
		"forbidden",
		"not-available-yet",
		"rate-limited",
	] as const) {
		const found = list.find((e) => e.code === code);
		if (found !== undefined) return found;
	}
	return null;
}

/** What a toast says when the service refused for a reason the person can act on or wait for; null for any other failure. */
export function refusalText(error: unknown, locale: Locale): string | null {
	if (!(error instanceof PortError)) return null;
	const o = at(locale);
	if (error.code === "not-available-yet") return m.soon_title({}, o);
	if (error.code === "forbidden") return m.forbidden_title({}, o);
	if (error.code === "rate-limited") return m.rate_title({}, o);
	return null;
}
