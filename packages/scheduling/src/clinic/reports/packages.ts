import { remainingSessions, usageOf } from "../packages";
import { bucketOf, bucketsOf } from "./buckets";
import type { Granularity, Range, ReportAppointment, ReportPackage } from "./types";

/**
 * Packages sold, used and remaining, in sessions (no money here: prices are in the revenue report).
 *   sold       packages created in the range, with their base and bonus sessions;
 *   used       sessions used by visits starting in the range (the package rule: a confirmed visit that
 *              has started and was not marked absent);
 *   remaining  as of `now`, over EVERY package of the app that has sessions left, with the ones
 *              used past what was bought (`overdrawn`) counted, never clamped away.
 */
export interface PackagesReport {
	sold: {
		packages: number;
		baseSessions: number;
		bonusSessions: number;
		byType: Readonly<Record<string, number>>;
	};
	used: {
		base: number;
		bonus: number;
		buckets: ReadonlyArray<{ bucket: string; base: number; bonus: number }>;
	};
	remaining: {
		packages: number;
		sessions: number;
		overdrawnPackages: number;
		overdrawnSessions: number;
	};
}

export function packagesReport(
	packages: ReadonlyArray<ReportPackage>,
	visits: ReadonlyArray<ReportAppointment>,
	range: Range,
	granularity: Granularity,
	now: number,
): PackagesReport {
	const sold = packages.filter((p) => p.createdAt >= range.from && p.createdAt < range.to);
	const byType: Record<string, number> = {};
	for (const p of sold) byType[p.sessionType] = (byType[p.sessionType] ?? 0) + 1;

	const linked = visits.filter((v) => v.package !== undefined && v.source === "visit");
	const buckets = new Map(bucketsOf(range, granularity).map((b) => [b, { base: 0, bonus: 0 }]));
	let base = 0;
	let bonus = 0;
	for (const v of linked) {
		if (v.start < range.from || v.start >= range.to) continue;
		const u = usageOf(
			[
				{
					status: v.status,
					attendance: v.attendance ?? "pending",
					creditType: v.creditType ?? "base",
					start: v.start,
				},
			],
			now,
		);
		const b = buckets.get(bucketOf(v.start, range.zone, granularity));
		base += u.baseUsed;
		bonus += u.bonusUsed;
		if (b !== undefined) {
			b.base += u.baseUsed;
			b.bonus += u.bonusUsed;
		}
	}

	const byPackage = new Map<string, ReportAppointment[]>();
	for (const v of linked)
		byPackage.set(v.package ?? "", [...(byPackage.get(v.package ?? "") ?? []), v]);
	let withSessions = 0;
	let sessions = 0;
	let overdrawnPackages = 0;
	let overdrawnSessions = 0;
	for (const p of packages) {
		const left = remainingSessions(
			p,
			usageOf(
				(byPackage.get(p.id) ?? []).map((v) => ({
					status: v.status,
					attendance: v.attendance ?? "pending",
					creditType: v.creditType ?? "base",
					start: v.start,
				})),
				now,
			),
		);
		if (left.remaining > 0) {
			withSessions += 1;
			sessions += left.remaining;
		}
		if (left.overdrawn > 0) {
			overdrawnPackages += 1;
			overdrawnSessions += left.overdrawn;
		}
	}
	return {
		sold: {
			packages: sold.length,
			baseSessions: sold.reduce((n, p) => n + p.totalSessions, 0),
			bonusSessions: sold.reduce((n, p) => n + p.bonusSessions, 0),
			byType: Object.fromEntries(Object.entries(byType).sort(([a], [b]) => (a < b ? -1 : 1))),
		},
		used: { base, bonus, buckets: [...buckets].map(([bucket, v]) => ({ bucket, ...v })) },
		remaining: { packages: withSessions, sessions, overdrawnPackages, overdrawnSessions },
	};
}
