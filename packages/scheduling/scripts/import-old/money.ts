import { money } from "./clients";
import type { PackageRow, PaymentRow } from "./rows";
import type { Row } from "./source";
import {
	type Ctx,
	clean,
	cleanNote,
	day,
	fingerprintOf,
	reportExtraColumns,
	timestamp,
} from "./support";

const COLUMNS = new Set([
	"id",
	"client_id",
	"session_type",
	"total_sessions",
	"bonus_sessions",
	"sessions_used",
	"bonus_used",
	"price",
	"start_date",
	"notes",
	"created_at",
	"amount_paid",
]);

export interface PackagesOut {
	packages: PackageRow[];
	payments: PaymentRow[];
	ids: Set<number>;
	/** What the old app stored as used, for the stored-vs-derived report. */
	stored: Map<number, { used: number; bonusUsed: number; total: number; bonus: number }>;
}

/** Packages ("abonamente") and the payment each one has received. Used sessions are not carried over: they derive from visits. */
export async function planPackages(
	ctx: Ctx,
	subscriptions: ReadonlyArray<Row<"client_subscriptions">>,
	clientIds: ReadonlySet<number>,
): Promise<PackagesOut> {
	const out: PackagesOut = { packages: [], payments: [], ids: new Set(), stored: new Map() };
	for (const s of subscriptions) {
		const ref = `client_subscriptions:${s.id}`;
		reportExtraColumns(ctx, "client_subscriptions", s.id, s, COLUMNS);
		if (s.client_id === null || s.client_id === undefined || !clientIds.has(s.client_id)) {
			ctx.log.add("orphan_subscription_client", "skipped", ref);
			continue;
		}
		const priceMinor = money(ctx, s.price, ref);
		const total = Math.max(0, Math.round(s.total_sessions ?? 0));
		const bonus = Math.max(0, Math.round(s.bonus_sessions ?? 0));
		const createdAt = timestamp(s.created_at) ?? ctx.exportedAt;
		const clientLegacy = `clients:${s.client_id}`;
		out.packages.push({
			legacyId: ref,
			fingerprint: await fingerprintOf(ctx, "client_subscriptions", s),
			clientLegacy,
			sessionType: clean(s.session_type) ?? "unspecified",
			totalSessions: total,
			bonusSessions: bonus,
			priceMinor: priceMinor ?? 0,
			startDate: day(s.start_date),
			notes: cleanNote(s.notes),
			createdAt,
		});
		out.ids.add(s.id);
		out.stored.set(s.id, {
			used: Math.round(s.sessions_used ?? 0),
			bonusUsed: Math.round(s.bonus_used ?? 0),
			total,
			bonus,
		});
		const paid = money(ctx, s.amount_paid, ref);
		if (paid !== undefined && paid > 0) {
			out.payments.push({
				legacyId: `${ref}:paid`,
				fingerprint: await fingerprintOf(ctx, "client_subscriptions.paid", {
					id: s.id,
					amount_paid: s.amount_paid,
					created_at: s.created_at,
				}),
				clientLegacy,
				packageLegacy: ref,
				amountMinor: paid,
				at: createdAt,
			});
		}
	}
	return out;
}
