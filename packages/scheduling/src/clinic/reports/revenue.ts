import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportPackage, ReportPayment, ReportVisitMoney } from "./types";

/**
 * Revenue, in whole bani. MONEY: reading it needs the `money` key (`reports_view_all_money`); this
 * module is the only report that holds prices or amounts.
 *
 * Paid money comes from two places, never both for one thing:
 *   - the payments ledger (`payments`: positive is money in, negative a refund), by its own date;
 *   - the amount paid on a visit that belongs to NO package (a single session paid on the day),
 *     counted on the visit's date, since the visit records no payment date. A package's visits are
 *     paid through its ledger, so their `amountPaid` is not counted again.
 * Outstanding is as of `now`: a package created in the range is owed its price less its ledger
 * (all of it, whenever paid); a visit of the range that has started, is confirmed, is in no
 * package and was priced is owed its price less what was paid.
 */
export type Method = "cash" | "card" | "transfer" | "unknown";

export interface Money {
	paidMinor: number;
	refundedMinor: number;
	netMinor: number;
}

export interface RevenueReport {
	total: Money;
	byMethod: Readonly<Record<Method, Money>>;
	sources: { ledger: Money; visits: Money };
	buckets: ReadonlyArray<{ bucket: string } & Money>;
	outstanding: {
		packages: { count: number; minor: number };
		visits: { count: number; minor: number };
		minor: number;
	};
}

const zero = (): Money => ({ paidMinor: 0, refundedMinor: 0, netMinor: 0 });
function add(m: Money, amount: number): void {
	if (amount >= 0) m.paidMinor += amount;
	else m.refundedMinor += -amount;
	m.netMinor += amount;
}

export function revenueReport(
	payments: ReadonlyArray<ReportPayment>,
	packages: ReadonlyArray<ReportPackage>,
	visits: ReadonlyArray<ReportVisitMoney>,
	range: Range,
	granularity: Granularity,
	now: number,
): RevenueReport {
	const total = zero();
	const ledger = zero();
	const single = zero();
	const methods: Record<Method, Money> = {
		cash: zero(),
		card: zero(),
		transfer: zero(),
		unknown: zero(),
	};
	const buckets = new Map(bucketsOf(range, granularity).map((b) => [b, zero()]));
	const take = (m: Money, at: number, amount: number, method: Method): void => {
		add(total, amount);
		add(m, amount);
		add(methods[method], amount);
		const b = buckets.get(bucketOf(at, range.zone, granularity));
		if (b !== undefined) add(b, amount);
	};
	for (const p of payments) {
		if (p.at >= range.from && p.at < range.to)
			take(ledger, p.at, p.amountMinor, p.method ?? "unknown");
	}
	for (const v of visits) {
		if (
			v.package !== undefined ||
			v.status === "cancelled" ||
			v.start < range.from ||
			v.start >= range.to
		)
			continue;
		if ((v.amountPaidMinor ?? 0) !== 0)
			take(single, v.start, v.amountPaidMinor ?? 0, v.paymentMethod ?? "unknown");
	}
	const paidTo = new Map<string, number>();
	for (const p of payments) {
		if (p.package !== undefined)
			paidTo.set(p.package, (paidTo.get(p.package) ?? 0) + p.amountMinor);
	}
	let packageCount = 0;
	let packageMinor = 0;
	for (const p of packages) {
		if (p.createdAt < range.from || p.createdAt >= range.to) continue;
		const owed = p.priceMinor - (paidTo.get(p.id) ?? 0);
		if (owed > 0) {
			packageCount += 1;
			packageMinor += owed;
		}
	}
	let visitCount = 0;
	let visitMinor = 0;
	for (const v of visits) {
		if (
			v.package !== undefined ||
			v.status !== "confirmed" ||
			v.start < range.from ||
			v.start >= range.to ||
			v.start > now
		)
			continue;
		const owed = (v.priceMinor ?? 0) - (v.amountPaidMinor ?? 0);
		if (owed > 0) {
			visitCount += 1;
			visitMinor += owed;
		}
	}
	return {
		total,
		byMethod: methods,
		sources: { ledger, visits: single },
		buckets: [...buckets].map(([bucket, m]) => ({ bucket, ...m })),
		outstanding: {
			packages: { count: packageCount, minor: packageMinor },
			visits: { count: visitCount, minor: visitMinor },
			minor: packageMinor + visitMinor,
		},
	};
}
