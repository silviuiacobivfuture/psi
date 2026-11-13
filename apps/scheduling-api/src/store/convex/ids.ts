import { Id } from "@psi/scheduling-sdk/contract";

/**
 * Convex ids <-> API ids, in ONE module. A Convex document id is 31-32 URL-safe characters, so it is already a valid API
 * `Id` and is passed through, checked: nothing else is ever sent to a wrapper as an id. Where the API has ONE collection
 * over SEVERAL Convex tables (people = practitioners + staff members), the API id carries the table in a one-letter
 * prefix, here and nowhere else. Where the API id is derived (a roster day is `<person>_<date>`), the derivation lives
 * here too.
 */
export class BadId extends Error {
	override readonly name = "BadId";
}

/** A Convex id as the API's id (checked against the contract's `Id`). */
export function toApiId(convexId: string): string {
	const parsed = Id.safeParse(convexId);
	if (!parsed.success) throw new BadId("the store handed out an id the contract cannot carry");
	return parsed.data;
}

/**
 * An API id as Convex's. A malformed one is `undefined`: the caller answers "not found" (a wrapper would too, but this
 * never sends it garbage).
 */
export function toConvexId(apiId: string): string | undefined {
	return Id.safeParse(apiId).success ? apiId : undefined;
}

/** Tables the API merges into one collection: the prefix says which one. */
export function withTable<T extends string>(table: T, convexId: string): string {
	return `${table}${toApiId(convexId)}`;
}

export function splitTable<T extends string>(
	tables: readonly T[],
	apiId: string,
): { table: T; id: string } | undefined {
	const table = tables.find((t) => apiId.startsWith(t) && apiId.length > t.length);
	return table === undefined ? undefined : { table, id: apiId.slice(table.length) };
}

/** People are two Convex tables: `p` + a practitioner's id, `s` + a staff member's id. */
export type PersonKind = "practitioner" | "staff";
const PERSON_PREFIX: Record<PersonKind, string> = { practitioner: "p", staff: "s" };

export function personApiId(kind: PersonKind, convexId: string): string {
	return withTable(PERSON_PREFIX[kind], convexId);
}

export function personRef(apiId: string): { kind: PersonKind; id: string } | undefined {
	const split = splitTable(["p", "s"] as const, apiId);
	if (split === undefined || toConvexId(split.id) === undefined) return undefined;
	return { kind: split.table === "p" ? "practitioner" : "staff", id: split.id };
}

/** A roster day's API id: `<personId>_<date>`. A person id never contains `_`, so the split is exact. */
export function rosterApiId(personId: string, date: string): string {
	return `${personId}_${date}`;
}

export function splitRosterId(apiId: string): { personId: string; date: string } | undefined {
	const at = apiId.indexOf("_");
	if (at < 0) return undefined;
	const date = apiId.slice(at + 1);
	return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { personId: apiId.slice(0, at), date } : undefined;
}
