import { z } from "zod";
import { type AuditRow, type Collection, StoreRefused } from "../types";
import { apiActionOf, mappingOf, typeOfEntity } from "./audit-map";
import type { Caller } from "./call";
import { matches } from "./filter";
import { personApiId } from "./ids";

/**
 * `audit`: append-only. `insert` writes the API's event as a Convex event unless a wrapper already wrote one for the
 * same change (audit-map.ts); `list` reads the log newest first, page by page, and names every event in the API's
 * vocabulary. An event is field names and a count, never values: `detail` keeps its KEYS (as field names) and a numeric
 * `count`; the values, and any free text, are not stored on Convex. The one exception is a team change: the member
 * wrappers keep its before and after themselves (names, role ids, calendars, permission keys; packages/scheduling's
 * src/clinic/audit-changes.ts says which), read back here as the memory store's `detail.changes`.
 */
const Event = z.object({
	id: z.string(),
	at: z.number(),
	actor: z.string(),
	action: z.string(),
	entity: z.string(),
	entityId: z.string(),
	summary: z.string(),
	/** Absent on every event but a team change's, and on a backend whose functions predate it. */
	changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })).optional(),
});
type Event = z.infer<typeof Event>;

/** A kept value in the API's ids: the calendars a member coordinates are practitioners (`p` + the Convex id). */
function apiValue(field: string, value: string): string {
	if (field !== "coordinates" || value === "") return value;
	return value
		.split(",")
		.map((id) => personApiId("practitioner", id))
		.sort()
		.join(",");
}

/** The `{ field: { from, to } }` the memory store keeps in `detail.changes`, from what the wrapper kept. */
const changesOf = (e: Event): Record<string, { from: string; to: string }> | undefined =>
	e.changes === undefined || e.changes.length === 0
		? undefined
		: Object.fromEntries(
				e.changes.map((c) => [
					c.field,
					{ from: apiValue(c.field, c.from), to: apiValue(c.field, c.to) },
				]),
			);

const FIELD = /^[A-Za-z][A-Za-z0-9_.]{0,47}$/;
const MAX_FIELDS = 40;
const PAGE = 200;
/** A bound on one read of the log: the console pages; nothing here reads without a limit. */
const MAX_EVENTS = 10_000;

/** `<action>; fields: a, b; count: n` (what `makeAuditEvent` writes) taken apart. */
function parseSummary(summary: string): { fields: string[]; count?: number } {
	let fields: string[] = [];
	let count: number | undefined;
	for (const part of summary.split("; ").slice(1)) {
		if (part.startsWith("fields: ")) fields = part.slice("fields: ".length).split(", ");
		else if (part.startsWith("count: ")) count = Number(part.slice("count: ".length));
	}
	return { fields, ...(count === undefined || Number.isNaN(count) ? {} : { count }) };
}

function toRow(app: string, e: Event): AuditRow {
	const { fields, count } = parseSummary(e.summary);
	const marked = (prefix: string): string | undefined =>
		fields.find((f) => f.startsWith(prefix))?.slice(prefix.length);
	const action = marked("api.") ?? apiActionOf(e.action, e.entity, fields);
	const detailKeys = fields.filter((f) => !/^(api|type|by)\./.test(f) && f !== "deleted");
	const changes = changesOf(e);
	const detail: Record<string, unknown> = {
		...Object.fromEntries(detailKeys.map((k) => [k, true])),
		...(count === undefined ? {} : { count }),
		...(changes === undefined ? {} : { changes }),
	};
	return {
		id: e.id,
		app,
		at: e.at,
		actor: {
			subject: e.actor,
			kind: fields.includes("by.service") || e.actor.startsWith("service:") ? "service" : "person",
		},
		action,
		target: { type: marked("type.") ?? typeOfEntity(e.entity), id: e.entityId },
		...(Object.keys(detail).length === 0 ? {} : { detail }),
	};
}

export function auditCollection(call: Caller): Collection<AuditRow> {
	const page = (app: string, before: number | undefined) =>
		call.query(
			"apiAudit:list",
			{ tenant: app, limit: PAGE, ...(before === undefined ? {} : { before }) },
			{ events: z.array(Event) },
		);
	/**
	 * Newest first, whole pages until the log or the bound ends. The next page starts AT the last instant seen (events
	 * can share a millisecond), so events are de-duplicated by id and a page with nothing new ends the read.
	 */
	async function* events(app: string): AsyncGenerator<Event> {
		const seen = new Set<string>();
		let before: number | undefined;
		for (;;) {
			const { events: batch } = await page(app, before);
			const fresh = batch.filter((e) => !seen.has(e.id));
			for (const e of fresh) {
				seen.add(e.id);
				yield e;
			}
			const last = batch.at(-1);
			if (
				batch.length < PAGE ||
				last === undefined ||
				fresh.length === 0 ||
				seen.size >= MAX_EVENTS
			)
				return;
			before = last.at + 1;
		}
	}
	return {
		async get(app, id) {
			for await (const e of events(app)) if (e.id === id) return toRow(app, e);
			return undefined;
		},
		async list(app, query) {
			const out: AuditRow[] = [];
			for await (const e of events(app)) {
				const row = toRow(app, e);
				if (matches(row, query)) out.push(row);
			}
			return out;
		},
		async insert(row) {
			const mapping = mappingOf(row.action, row.target);
			if (mapping.recorded) return row;
			const detail = row.detail ?? {};
			const keys = Object.keys(detail).filter((k) => FIELD.test(k));
			const count = detail.count;
			const fields = [
				`api.${row.action}`,
				`type.${row.target.type}`,
				...(row.actor.kind === "service" ? ["by.service"] : []),
				...keys,
			]
				.filter((f) => FIELD.test(f))
				.slice(0, MAX_FIELDS);
			const out = await call.mutate(
				"apiAudit:append",
				{
					tenant: row.app,
					actor: { subject: row.actor.subject },
					action: mapping.action,
					entity: mapping.entity,
					entityId: row.target.id,
					fields,
					...(typeof count === "number" && Number.isInteger(count) && count >= 0 ? { count } : {}),
				},
				{ id: z.string() },
			);
			return { ...row, id: out.id };
		},
		replace: () => Promise.reject(new StoreRefused("not_allowed")),
		remove: () => Promise.reject(new StoreRefused("not_allowed")),
	};
}
