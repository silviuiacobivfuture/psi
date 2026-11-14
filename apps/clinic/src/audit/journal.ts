import type { Ctx } from "../lib/context";
import type { AuditEvent } from "../port/schema";
import { type AuditLookup, actorName, loadLookup } from "./lookup";
import { type AuditQuery, byFilters, bySearch } from "./query";
import { describe, type Row } from "./rows";

/** How many events the journal shows at a time. */
export const JOURNAL_PAGE = 50;
/** A narrowed journal (person, action, type, words) reads the log in bigger pages: few of an unnarrowed page may match. */
const SCAN_PAGE = 200;
/** At most this many reads of the log for one page of matches: an older match is one "show more" away. */
const SCAN_READS = 5;
/** The export: at most this many events of the log, filtered as the screen is. */
const EXPORT_READS = 5;

/** The days the log is read for (either open). */
export interface JournalWindow {
	from?: string;
	to?: string;
}

/**
 * A row, and where it was read: the cursor of the log's page (null: the first) and the days of the read — how its
 * drawer finds it again, whatever page and filter it came from.
 */
export interface JournalRow {
	row: Row;
	cursor: string | null;
	window: JournalWindow;
}

export interface JournalPage {
	rows: ReadonlyArray<JournalRow>;
	lookup: AuditLookup;
	/** Where the next page of the log starts; null: the journal has nothing older. */
	nextCursor: string | null;
}

/** The days the service narrows the log to; the person, action, type and words are matched here. */
export const windowOf = (q: Pick<AuditQuery, "from" | "to">): JournalWindow => ({
	...(q.from === undefined ? {} : { from: q.from }),
	...(q.to === undefined ? {} : { to: q.to }),
});

const narrowed = (q: AuditQuery): boolean =>
	q.person !== undefined || q.action !== undefined || q.type !== undefined || (q.q ?? "") !== "";

/**
 * One page of the journal after `cursor`: the log is read page by page (whole pages, so the next cursor is exact) until
 * a page's worth of events matches or the reads run out; only the events shown are named.
 */
export async function journalPage(
	ctx: Ctx,
	q: AuditQuery,
	cursor: string | null,
): Promise<JournalPage> {
	const limit = narrowed(q) ? SCAN_PAGE : JOURNAL_PAGE;
	const window = windowOf(q);
	const found: { event: AuditEvent; cursor: string | null }[] = [];
	let next = cursor;
	for (let read = 0; read < SCAN_READS; read++) {
		const at: string | null = next;
		const page = await ctx.port.auditPage(ctx.app, window, at, limit);
		for (const event of byFilters(page.events, q)) found.push({ event, cursor: at });
		next = page.nextCursor;
		if (next === null || found.length >= JOURNAL_PAGE) break;
	}
	const lookup = await loadLookup(
		ctx,
		found.map((f) => f.event),
	);
	const rows = found.map((f) => ({
		row: describe(f.event, lookup, ctx.locale, ctx.can),
		cursor: f.cursor,
		window,
	}));
	const kept = new Set(
		bySearch(
			rows.map((r) => r.row),
			q,
		),
	);
	return { rows: rows.filter((r) => kept.has(r.row)), lookup, nextCursor: next };
}

/** What the export holds: the newest events of the log (a bounded number), filtered as the screen is, in words. */
export async function journalExport(
	ctx: Ctx,
	q: AuditQuery,
): Promise<{ rows: ReadonlyArray<Row>; lookup: AuditLookup }> {
	const events: AuditEvent[] = [];
	let cursor: string | null = null;
	for (let read = 0; read < EXPORT_READS; read++) {
		const page = await ctx.port.auditPage(ctx.app, windowOf(q), cursor, SCAN_PAGE);
		events.push(...byFilters(page.events, q));
		cursor = page.nextCursor;
		if (cursor === null) break;
	}
	const lookup = await loadLookup(ctx, events);
	return {
		rows: bySearch(
			events.map((e) => describe(e, lookup, ctx.locale, ctx.can)),
			q,
		),
		lookup,
	};
}

/** One event again, from the log's page its row was read from, with the same days (the drawer of a row of any page). */
export async function journalEvent(
	ctx: Ctx,
	id: string,
	cursor: string | null,
	window: JournalWindow,
): Promise<AuditEvent | undefined> {
	const page = await ctx.port.auditPage(ctx.app, window, cursor, SCAN_PAGE);
	return page.events.find((e) => e.id === id);
}

/** The people to filter by: the team, and whoever else acted in the rows shown (an import, a key), by name. */
export function peopleOf(
	ctx: Ctx,
	page: JournalPage,
	chosen: string | undefined,
): ReadonlyArray<{ value: string; label: string }> {
	const values = new Set([
		...page.lookup.people.keys(),
		...page.rows.map((r) => r.row.event.actor),
		...(chosen === undefined ? [] : [chosen]),
	]);
	return [...values]
		.map((value) => ({ value, label: actorName(page.lookup, value) }))
		.sort((a, b) => a.label.localeCompare(b.label, ctx.locale));
}
