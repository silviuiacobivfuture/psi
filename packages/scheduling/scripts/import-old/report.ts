import type { ValidationReport } from "../../src/clinic/validate";
import type { DetectStats } from "./detect";
import type { Anomaly } from "./log";

/** The import's account of itself: counts, anomalies and ids. Never a name, phone, note or value. */
export interface TableCount {
	table: string;
	/** Rows in the export. */
	source: number;
	/** Rows that parsed. */
	parsed: number;
	/** Rows that map to something to write. */
	planned: number;
}

export interface Written {
	kind: string;
	created: number;
	updated: number;
	unchanged: number;
	orphan: number;
}

export interface Report {
	mode: "dry-run" | "real";
	fatal?: string;
	tables: TableCount[];
	anomalies: Anomaly[];
	stats?: DetectStats;
	/** The data check on what the import writes: codes, counts, old ids. Changes nothing. */
	validation?: ValidationReport;
	/** Files whose bytes were found and read. */
	filesChecked: number;
	written: Written[];
	/** Why a real run wrote nothing. */
	refusal?: "blocking" | "skipped";
}

const SHOWN_IDS = 20;

/** The data check as report lines: codes, counts and old ids only. */
export function formatValidation(v: ValidationReport): string[] {
	const lines: string[] = ["", "data check (code, count, old ids)"];
	if (v.findings.length === 0) lines.push("  nothing found");
	for (const f of v.findings) {
		const shown = f.labels.slice(0, SHOWN_IDS).join(" ");
		const more = f.count > SHOWN_IDS ? ` … +${f.count - SHOWN_IDS}` : "";
		const groups = f.groups === undefined ? "" : ` (${f.groups} groups)`;
		lines.push(`  ${f.code}: ${f.count}${groups}  ${shown}${more}`);
	}
	if (v.visitsWithoutRoster > 0) {
		lines.push(`  visits of people with no roster at all, not checked: ${v.visitsWithoutRoster}`);
	}
	return lines;
}

export function formatReport(report: Report): string {
	const lines: string[] = [`import ${report.mode}`];
	if (report.fatal !== undefined) return [...lines, `FATAL: ${report.fatal}`].join("\n");
	lines.push("", "tables (source / parsed / to write)");
	for (const t of report.tables) {
		lines.push(
			`  ${t.table.padEnd(24)} ${String(t.source).padStart(6)} ${String(t.parsed).padStart(6)} ${String(t.planned).padStart(6)}`,
		);
	}
	if (report.filesChecked > 0) lines.push(`  files read from disk: ${report.filesChecked}`);
	const s = report.stats;
	if (s !== undefined) {
		lines.push(
			"",
			"checks",
			`  weekly series found:                 ${s.series}`,
			`  practitioner changes in a series:    ${s.seriesChanges}`,
			`  overlapping visits (pairs):          ${s.overlaps}`,
			`  package usage mismatches:            ${s.packageMismatches.length}`,
			`  duplicate client names (groups):     ${s.duplicateNameGroups}`,
			`  clients in duplicate name groups:    ${s.duplicateNameClients}`,
		);
		for (const m of s.packageMismatches.slice(0, SHOWN_IDS)) {
			lines.push(
				`    client_subscriptions:${m.id} stored ${m.storedBase}+${m.storedBonus} derived ${m.derivedBase}+${m.derivedBonus}`,
			);
		}
	}
	if (report.validation !== undefined) lines.push(...formatValidation(report.validation));
	lines.push("", "anomalies (code, count, old ids)");
	if (report.anomalies.length === 0) lines.push("  none");
	for (const a of report.anomalies) {
		const shown = a.ids.slice(0, SHOWN_IDS).join(" ");
		const more = a.count > SHOWN_IDS ? ` … +${a.count - SHOWN_IDS}` : "";
		lines.push(`  [${a.severity}] ${a.code}: ${a.count}  ${shown}${more}`);
	}
	if (report.written.length > 0) {
		lines.push("", "written (created / updated / unchanged / orphan)");
		for (const w of report.written) {
			lines.push(
				`  ${w.kind.padEnd(14)} ${w.created} / ${w.updated} / ${w.unchanged} / ${w.orphan}`,
			);
		}
	}
	if (report.refusal !== undefined) {
		lines.push(
			"",
			report.refusal === "blocking"
				? "REFUSED: blocking anomalies; nothing was written."
				: "REFUSED: rows would be skipped; nothing was written (pass --allow-skips to write the rest).",
		);
	}
	return lines.join("\n");
}
