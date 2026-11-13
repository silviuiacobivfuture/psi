import { type UsageMismatch, usageMismatch, usageOf } from "../../src/clinic/packages";
import { findOverlaps } from "../../src/clinic/visits";
import { weekdayOf } from "../../src/domain/time";
import type { AnomalyLog } from "./log";
import type { VisitFacts } from "./visits";

/** The anomaly detectors: pure functions over what was parsed, reporting old ids only. */

const DAY_MS = 86_400_000;
const SERIES_MIN = 3;

export interface DetectStats {
	/** Weekly recurring series found (same client, type, weekday and time, week after week). */
	series: number;
	seriesChanges: number;
	overlaps: number;
	packageMismatches: Array<{ id: number } & UsageMismatch>;
	duplicateNameGroups: number;
	duplicateNameClients: number;
}

/**
 * Practitioner changes inside a weekly recurring series: the old app's "moved by itself" bug.
 * A series is at least three confirmed visits of one client, type, weekday and time, a week apart
 * (one skipped week is allowed). Each visit whose column differs from the one before it is reported.
 */
function seriesChanges(
	facts: ReadonlyArray<VisitFacts>,
	log: AnomalyLog,
): Pick<DetectStats, "series" | "seriesChanges"> {
	const groups = new Map<string, VisitFacts[]>();
	for (const f of facts) {
		if (f.status !== "confirmed" || f.clientId === undefined) continue;
		const key = `${f.clientId}|${f.sessionType}|${weekdayOf(f.date)}|${f.clock}`;
		groups.set(key, [...(groups.get(key) ?? []), f]);
	}
	let series = 0;
	let changes = 0;
	for (const list of groups.values()) {
		const sorted = [...list].sort((a, b) =>
			a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id,
		);
		let chain: VisitFacts[] = [];
		const close = (): void => {
			if (chain.length < SERIES_MIN) return;
			series += 1;
			for (let i = 1; i < chain.length; i += 1) {
				const before = chain[i - 1];
				const here = chain[i];
				if (before !== undefined && here !== undefined && before.column !== here.column) {
					changes += 1;
					log.add("series_practitioner_change", "note", `appointments:${here.id}`);
				}
			}
		};
		for (const f of sorted) {
			const last = chain[chain.length - 1];
			const gap =
				last === undefined
					? 0
					: Math.round(
							(Date.parse(`${f.date}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / DAY_MS,
						);
			if (last !== undefined && gap !== 7 && gap !== 14) {
				close();
				chain = [];
			}
			chain.push(f);
		}
		close();
	}
	return { series, seriesChanges: changes };
}

export function detect(
	facts: ReadonlyArray<VisitFacts>,
	stored: ReadonlyMap<number, { used: number; bonusUsed: number }>,
	names: ReadonlyArray<{ id: number; key: string }>,
	exportedAt: number,
	log: AnomalyLog,
): DetectStats {
	const overlaps = findOverlaps(
		facts.map((f) => f.span),
		exportedAt,
	);
	for (const o of overlaps) log.add(`overlap:${o.resource}`, "note", `${o.a}~${o.b}`);

	const mismatches: DetectStats["packageMismatches"] = [];
	for (const [id, counters] of stored) {
		const linked = facts
			.filter((f) => f.subscriptionId === id)
			.map((f) => ({
				status: f.status,
				attendance: f.attendance,
				creditType: f.creditType ?? ("base" as const),
				start: f.span.start,
			}));
		const mismatch = usageMismatch(counters, usageOf(linked, exportedAt));
		if (mismatch !== undefined) {
			mismatches.push({ id, ...mismatch });
			log.add("package_usage_mismatch", "note", `client_subscriptions:${id}`);
		}
	}

	const byName = new Map<string, number[]>();
	for (const n of names) byName.set(n.key, [...(byName.get(n.key) ?? []), n.id]);
	let groups = 0;
	let clients = 0;
	for (const ids of byName.values()) {
		if (ids.length < 2) continue;
		groups += 1;
		clients += ids.length;
		for (const id of ids) log.add("duplicate_client_name", "note", `clients:${id}`);
	}
	return {
		...seriesChanges(facts, log),
		overlaps: overlaps.length,
		packageMismatches: mismatches,
		duplicateNameGroups: groups,
		duplicateNameClients: clients,
	};
}
