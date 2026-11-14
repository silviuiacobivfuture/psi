import { parseMoney } from "../domain/money";

export type Body = Readonly<Record<string, string | File | ReadonlyArray<string | File>>>;

/** Every text value a form sent under one name (a checkbox list, a multi-select). */
export const all = (b: Body, k: string): string[] => {
	const v = b[k];
	if (v === undefined) return [];
	return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
};
/** The first text value under one name, trimmed; empty when absent. */
export const one = (b: Body, k: string): string => all(b, k)[0]?.trim() ?? "";
const checked = (b: Body, k: string): boolean => all(b, k).length > 0;
/** A whole number as typed: empty is absent (the schema's default or its "required"), nonsense is NaN, which the schema refuses. */
const whole = (b: Body, k: string): number | undefined => {
	const t = one(b, k);
	if (t === "") return undefined;
	return /^\d{1,6}$/.test(t) ? Number(t) : Number.NaN;
};
const orNull = (b: Body, k: string): string | null => (one(b, k) === "" ? null : one(b, k));

/** "09:30" as minutes after midnight, or undefined. */
export function minutesOf(t: string): number | undefined {
	const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
	if (m === null) return undefined;
	const h = Number(m[1]);
	const min = Number(m[2]);
	return h < 24 && min < 60 ? h * 60 + min : undefined;
}

/** The week's hours from `h0_from … h6_to`: a day with either end empty is a day off. */
export function hoursFrom(b: Body): Array<{ from: number; to: number } | null> {
	return Array.from({ length: 7 }, (_v, d) => {
		const from = minutesOf(one(b, `h${d}_from`));
		const to = minutesOf(one(b, `h${d}_to`));
		return from === undefined || to === undefined ? null : { from, to };
	});
}

export const personFrom = (b: Body): Record<string, unknown> => ({
	name: one(b, "name"),
	email: one(b, "email"),
	roles: all(b, "roles"),
	practitioner: checked(b, "practitioner"),
	colour: whole(b, "colour") ?? 1,
	specialty: one(b, "specialty"),
	hours: hoursFrom(b),
	roomIds: all(b, "roomIds"),
	serviceIds: all(b, "serviceIds"),
	active: checked(b, "active"),
});

export const roomFrom = (b: Body): Record<string, unknown> => ({
	name: one(b, "name"),
	floor: one(b, "floor"),
	category: one(b, "category"),
	capacity: whole(b, "capacity"),
	bookable: checked(b, "bookable"),
	homeOf: orNull(b, "homeOf"),
	purpose: one(b, "purpose"),
});

export const deviceFrom = (b: Body): Record<string, unknown> => ({
	name: one(b, "name"),
	type: one(b, "type") === "" ? undefined : one(b, "type"),
	roomId: orNull(b, "roomId"),
	bookable: checked(b, "bookable"),
});

export const serviceFrom = (b: Body): Record<string, unknown> => ({
	name: one(b, "name"),
	durationMin: whole(b, "durationMin"),
	priceBani: one(b, "price") === "" ? null : (parseMoney(one(b, "price")) ?? undefined),
	category: one(b, "category"),
	roomCategory: orNull(b, "roomCategory"),
	bufferMin: whole(b, "bufferMin") ?? 0,
	online: checked(b, "online"),
	practitionerIds: all(b, "practitionerIds"),
	roomIds: all(b, "roomIds"),
	deviceIds: all(b, "deviceIds"),
	active: checked(b, "active"),
});

export const roleFrom = (b: Body): Record<string, unknown> => ({
	name: one(b, "name"),
	description: one(b, "description"),
	copyFrom: orNull(b, "copyFrom"),
});
