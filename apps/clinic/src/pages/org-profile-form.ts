import { z } from "zod";
import { type OrgProfile, WEEKDAYS, type Weekday } from "../port/org-port";

/** How many phone rows the form offers, and how many stretches of a day (a break at noon makes two). */
export const PHONE_ROWS = 3;
export const SPANS = 2;

/** The form's fields, by name: every value is text, an empty one is "unset". */
export type FormValues = Readonly<Record<string, string>>;

export const phoneField = (row: number, part: "number" | "label"): string => `phone${row}_${part}`;
export const hourField = (day: Weekday, span: number, edge: "open" | "close"): string =>
	`${day}_${edge}${span}`;

/** A posted form, parsed at the boundary: text fields only, each bounded (the service bounds each field again). */
export const PostedForm = z
	.record(z.string(), z.union([z.string(), z.array(z.string())]))
	.transform((r) =>
		Object.fromEntries(
			Object.entries(r).flatMap(([k, v]) => {
				const text = Array.isArray(v) ? v[0] : v;
				return text === undefined ? [] : [[k, text.trim().slice(0, 1000)]];
			}),
		),
	);

/** The form's values for a stored profile: what the page shows to be edited. */
export function formValues(p: OrgProfile): FormValues {
	const out: Record<string, string> = {
		legalName: p.legalName ?? "",
		cui: p.cui ?? "",
		street: p.address?.street ?? "",
		city: p.address?.city ?? "",
		county: p.address?.county ?? "",
		postalCode: p.address?.postalCode ?? "",
		email: p.email ?? "",
		website: p.website ?? "",
		mapUrl: p.mapUrl ?? "",
		logoUrl: p.logoUrl ?? "",
		hoursNote: p.hoursNote ?? "",
	};
	p.phones.forEach((ph, i) => {
		out[phoneField(i + 1, "number")] = ph.number;
		out[phoneField(i + 1, "label")] = ph.label ?? "";
	});
	for (const d of p.hours)
		d.spans.forEach((s, i) => {
			out[hourField(d.day, i + 1, "open")] = s.open;
			out[hourField(d.day, i + 1, "close")] = s.close;
		});
	return out;
}

/**
 * The profile a form describes, NOT yet validated (the service decides): an empty field is left out, a phone row with
 * no number is no phone, a day with no times is closed, a stretch with one time only is kept so the service refuses it.
 */
export function profileFromForm(v: FormValues): unknown {
	const get = (k: string): string | undefined => {
		const s = v[k];
		return s === undefined || s === "" ? undefined : s;
	};
	const set = <K extends string>(keys: ReadonlyArray<K>, name: (k: K) => string) =>
		Object.fromEntries(
			keys.flatMap((k) => {
				const s = get(name(k));
				return s === undefined ? [] : [[k, s]];
			}),
		);
	const address = set(["street", "city", "county", "postalCode"] as const, (k) => k);
	const phones = Array.from({ length: PHONE_ROWS }, (_, i) => i + 1).flatMap((row) => {
		const number = get(phoneField(row, "number"));
		const label = get(phoneField(row, "label"));
		return number === undefined ? [] : [{ number, ...(label === undefined ? {} : { label }) }];
	});
	const hours = WEEKDAYS.flatMap((day) => {
		const spans = Array.from({ length: SPANS }, (_, i) => i + 1).flatMap((span) => {
			const open = get(hourField(day, span, "open"));
			const close = get(hourField(day, span, "close"));
			return open === undefined && close === undefined ? [] : [{ open, close }];
		});
		return spans.length === 0 ? [] : [{ day, spans }];
	});
	return {
		...set(
			["legalName", "cui", "email", "website", "mapUrl", "logoUrl", "hoursNote"] as const,
			(k) => k,
		),
		...(Object.keys(address).length === 0 ? {} : { address }),
		phones,
		hours,
	};
}
