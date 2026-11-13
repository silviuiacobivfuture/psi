import type { Context } from "hono";
import type { PortError } from "../port/port";

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
