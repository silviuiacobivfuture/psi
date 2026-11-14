import { z } from "zod";
import { IsoDay } from "../lib/dates";
import type { AuditEvent } from "../port/schema";
import { actionKey, OBJECT_TYPES } from "./labels";
import { objectOf } from "./lookup";
import type { Row } from "./rows";

/** An empty form field is "not chosen", never an invalid value. */
const blank = (v: unknown): unknown => (v === "" ? undefined : v);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blank, schema.optional());

/** The journal's filters, from the URL: every one optional, every one checked at the boundary. */
export const AuditQuerySchema = z.object({
	person: optional(z.string().max(200)),
	action: optional(z.string().max(60)),
	type: optional(z.enum(OBJECT_TYPES)),
	from: optional(IsoDay),
	to: optional(IsoDay),
	q: optional(z.string().trim().max(100)),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

/** Lower case without accents, so "recepție" is found by "receptie". */
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

const haystack = (r: Row): string =>
	fold([r.who, r.action, r.sentence, r.typeText, r.objectText, r.source].join(" "));

/** The events that match the structured filters (person, action, type, days); `from`/`to` are whole days, both included. */
export function byFilters(
	events: ReadonlyArray<AuditEvent>,
	q: AuditQuery,
): ReadonlyArray<AuditEvent> {
	return events.filter((e) => {
		const day = e.at.slice(0, 10);
		return (
			(q.person === undefined || e.actor === q.person) &&
			(q.action === undefined || actionKey(e.action) === q.action) &&
			(q.type === undefined || objectOf(e).type === q.type) &&
			(q.from === undefined || day >= q.from) &&
			(q.to === undefined || day <= q.to)
		);
	});
}

/** The rows whose words (who, what, the object's name, the source) contain what was typed, accents and case aside. */
export function bySearch(rows: ReadonlyArray<Row>, q: AuditQuery): ReadonlyArray<Row> {
	if (q.q === undefined || q.q === "") return rows;
	const needle = fold(q.q);
	return rows.filter((r) => haystack(r).includes(needle));
}

/** Only what was chosen, as URL parameters (for "show more", the export and a link back). */
export function paramsOf(q: AuditQuery): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") out[k] = String(v);
	return out;
}

/** The query as a URL's search part. */
export function searchOf(q: AuditQuery): string {
	const s = new URLSearchParams(paramsOf(q)).toString();
	return s === "" ? "" : `?${s}`;
}
