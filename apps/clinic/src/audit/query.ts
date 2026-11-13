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
	page: z.preprocess(blank, z.coerce.number().int().min(1).max(1000).catch(1).default(1)),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const PAGE_SIZE = 50;

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

export interface Paged<T> {
	items: ReadonlyArray<T>;
	page: number;
	pages: number;
	total: number;
}

export function paged<T>(all: ReadonlyArray<T>, page: number): Paged<T> {
	const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
	const at = Math.min(page, pages);
	return {
		items: all.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE),
		page: at,
		pages,
		total: all.length,
	};
}

/** The query as a URL's search part, only what was chosen (for the pager, the export and a link back). */
export function searchOf(q: AuditQuery, extra: Partial<AuditQuery> = {}): string {
	const merged = { ...q, ...extra };
	const p = new URLSearchParams();
	for (const [k, v] of Object.entries(merged)) {
		if (v === undefined || v === "" || (k === "page" && v === 1)) continue;
		p.set(k, String(v));
	}
	const s = p.toString();
	return s === "" ? "" : `?${s}`;
}
