import { z } from "zod";
import { fail } from "../http/errors";
import type { AuditRow, Collection } from "../store/types";

/**
 * Where a journal page ended: the last event's instant, and how many events OF THAT INSTANT were already shown (events
 * of one millisecond come in the order the store wrote them, newest first, so the count is an exact boundary).
 */
const Cursor = z.object({
	at: z.number().int().nonnegative(),
	skip: z.number().int().min(1).max(100_000),
});
export type AuditCursor = z.infer<typeof Cursor>;

export function readAuditCursor(cursor: string): AuditCursor {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
	} catch {
		throw fail("invalid", "bad cursor");
	}
	const out = Cursor.safeParse(parsed);
	if (!out.success) throw fail("invalid", "bad cursor");
	return out.data;
}

const writeCursor = (c: AuditCursor): string =>
	Buffer.from(JSON.stringify(c)).toString("base64url");

/** How many events past the page the store is asked for at first (ties at the cursor's instant, and the one more). */
const SLACK = 20;

/**
 * One page of the journal, newest first, keyset-paged on the instant: the store is asked for the page and a little
 * more, in order, from the cursor's instant down (an indexed read in Convex and in memory), never for the whole log.
 */
export async function auditPage(
	audit: Collection<AuditRow>,
	app: string,
	q: { action?: string; from?: number; to?: number; limit: number; after: AuditCursor | undefined },
): Promise<{ items: AuditRow[]; nextCursor?: string }> {
	const after = q.after;
	const lt = Math.min(
		q.to ?? Number.MAX_SAFE_INTEGER,
		after === undefined ? Number.MAX_SAFE_INTEGER : after.at + 1,
	);
	for (let want = q.limit + 1 + SLACK + (after?.skip ?? 0); ; want *= 4) {
		const read = await audit.list(app, {
			...(q.action === undefined ? {} : { eq: { action: q.action } }),
			range: { field: "at", ...(q.from === undefined ? {} : { gte: q.from }), lt },
			order: { field: "at", dir: "desc", limit: want },
		});
		// A stable sort: events of one instant keep the store's order (the newest written first).
		const ordered = read
			.filter(
				(r) =>
					(q.action === undefined || r.action === q.action) &&
					(q.from === undefined || r.at >= q.from) &&
					r.at < lt,
			)
			.sort((a, b) => b.at - a.at);
		let skipped = 0;
		const rows = ordered.filter((r) => {
			if (after === undefined || r.at !== after.at || skipped >= after.skip) return true;
			skipped++;
			return false;
		});
		// The store answered fewer than asked (nothing older is left), or the page and one more are in hand.
		if (rows.length > q.limit || read.length < want) {
			const items = rows.slice(0, q.limit);
			const last = items.at(-1);
			if (rows.length <= q.limit || last === undefined) return { items };
			const sameInstant = items.filter((r) => r.at === last.at).length;
			const carried = after !== undefined && after.at === last.at ? after.skip : 0;
			return { items, nextCursor: writeCursor({ at: last.at, skip: carried + sameInstant }) };
		}
	}
}
