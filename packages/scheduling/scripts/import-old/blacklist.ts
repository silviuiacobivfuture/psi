import { z } from "zod";
import {
	BLACKLIST_CATEGORIES,
	BLACKLIST_SEVERITIES,
	MAX_ACTIVE_ENTRIES,
	REASON_MAX,
} from "../../src/clinic/blacklist";
import { normalizeEmail, normalizePhone } from "../../src/clinic/identifiers";
import { wallToInstant } from "../../src/clinic/visits";
import type { BlacklistRow } from "./rows";
import type { Ctx } from "./support";

/**
 * Blacklist entries seeded from a JSON file at import (`--blacklist <file>`). The file is an array;
 * each entry has a stable `key` (a re-run finds it by that), names a client of the export
 * (`clientLegacy`, `clients:<old id>`) and/or a phone and/or an e-mail, and carries the reason, the
 * category, the severity and an optional last day (`expires`, `YYYY-MM-DD`, to 23:59 local).
 * Identifiers are normalised here. An entry that is wrong is reported by key and index, never by
 * content, and blocks a real run; the file is never echoed.
 */
const entrySchema = z.object({
	key: z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/),
	clientLegacy: z
		.string()
		.regex(/^clients:\d{1,12}$/)
		.optional(),
	phone: z.string().trim().min(1).optional(),
	email: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(120).optional(),
	reason: z.string().trim().min(1).max(REASON_MAX),
	category: z.enum(BLACKLIST_CATEGORIES),
	severity: z.enum(BLACKLIST_SEVERITIES),
	expires: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export const blacklistFileSchema = z.array(z.unknown()).max(MAX_ACTIVE_ENTRIES);

export interface BlacklistPlan {
	rows: BlacklistRow[];
	/** Entries in the file, valid or not. */
	entries: number;
}

export function planBlacklist(
	ctx: Ctx,
	raw: unknown,
	clientIds: ReadonlySet<number>,
): BlacklistPlan {
	const file = blacklistFileSchema.safeParse(raw);
	if (!file.success) {
		ctx.log.add("blacklist_file_invalid", "blocking", "blacklist:*");
		return { rows: [], entries: 0 };
	}
	const rows: BlacklistRow[] = [];
	const seen = new Set<string>();
	file.data.forEach((item, index) => {
		const where = `blacklist:#${index + 1}`;
		const parsed = entrySchema.safeParse(item);
		if (!parsed.success) {
			ctx.log.add("blacklist_entry_invalid", "blocking", where);
			return;
		}
		const e = parsed.data;
		const ref = `blacklist:${e.key}`;
		const phone = e.phone === undefined ? undefined : normalizePhone(e.phone);
		const email = e.email === undefined ? undefined : normalizeEmail(e.email);
		if (e.phone !== undefined && phone === undefined)
			ctx.log.add("blacklist_phone_invalid", "blocking", ref);
		if (e.email !== undefined && email === undefined)
			ctx.log.add("blacklist_email_invalid", "blocking", ref);
		if (e.phone !== undefined && phone === undefined) return;
		if (e.email !== undefined && email === undefined) return;
		if (e.clientLegacy === undefined && phone === undefined && email === undefined) {
			ctx.log.add("blacklist_entry_without_identifier", "blocking", ref);
			return;
		}
		if (seen.has(e.key)) {
			ctx.log.add("blacklist_duplicate_key", "blocking", ref);
			return;
		}
		seen.add(e.key);
		let expiresAt: number | undefined;
		if (e.expires !== undefined) {
			const last = wallToInstant(e.expires, "23:59", ctx.zone);
			if (!last.ok) {
				ctx.log.add("blacklist_expiry_invalid", "blocking", ref);
				return;
			}
			expiresAt = last.instant;
		}
		if (
			e.clientLegacy !== undefined &&
			!clientIds.has(Number(e.clientLegacy.slice("clients:".length)))
		) {
			ctx.log.add("blacklist_unknown_client", "skipped", ref);
			return;
		}
		rows.push({
			legacyId: e.key,
			...(e.clientLegacy === undefined ? {} : { clientLegacy: e.clientLegacy }),
			...(phone === undefined ? {} : { phone }),
			...(email === undefined ? {} : { email }),
			...(e.name === undefined ? {} : { name: e.name }),
			reason: e.reason,
			category: e.category,
			severity: e.severity,
			...(expiresAt === undefined ? {} : { expiresAt }),
		});
	});
	return { rows, entries: file.data.length };
}
