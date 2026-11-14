import type { FileSource } from "../import-old/files";
import type { Mapping } from "../import-old/mapping";
import { formatReport, type Report } from "../import-old/report";
import { diffImport, type KindDiff, runImport, type Target } from "../import-old/run";
import type { OldExport } from "./old-app";

export interface SyncInput {
	exported: OldExport;
	files: FileSource;
	mapping: Mapping;
	allowSkips: boolean;
	ignoreTables: ReadonlyArray<string>;
	dryRun: boolean;
	/** Opens the target for reading only; `undefined` when nothing has ever been imported there. */
	openReadOnly: () => Promise<Target | undefined>;
	/** Opens the target for writing (makes the app and its data key on the first run). */
	openWrite: () => Promise<Target>;
}

export interface SyncResult {
	mode: "dry-run" | "real";
	/** Why nothing was compared or written, when the export itself blocks it. */
	refused: boolean;
	/** The importer's own account: table counts, anomalies, and (real run) what was written. */
	report: Report;
	/** What the sync would change (dry run) or did change (real run), by kind. Empty when `emptyTarget` or refused. */
	kinds: KindDiff[];
	emptyTarget: boolean;
}

/**
 * One pass of the sync: compare the old app's rows with the target (read only), and unless it is a dry run, write
 * the new and changed ones through the importer. The importer is idempotent by old id, so a second pass with the old
 * app unchanged writes nothing. A row the old app no longer has is REPORTED (`kinds[].absent`), never deleted:
 * nothing here has a delete.
 */
export async function runSync(input: SyncInput): Promise<SyncResult> {
	const common = {
		exported: input.exported,
		mapping: input.mapping,
		ignoreTables: input.ignoreTables,
		allowSkips: input.allowSkips,
		files: input.files,
	};
	const diff = await diffImport({ ...common, connect: input.openReadOnly });
	if ("refusal" in diff)
		return {
			mode: input.dryRun ? "dry-run" : "real",
			refused: true,
			report: diff.refusal,
			kinds: [],
			emptyTarget: false,
		};
	if (input.dryRun)
		return {
			mode: "dry-run",
			refused: false,
			report: diff.report,
			kinds: diff.kinds,
			emptyTarget: diff.emptyTarget,
		};
	const report = await runImport({ ...common, connect: input.openWrite });
	return {
		mode: "real",
		refused: report.refusal !== undefined || report.fatal !== undefined,
		report,
		kinds: diff.kinds,
		emptyTarget: diff.emptyTarget,
	};
}

/**
 * Real data goes only where the owner said (production). Anonymized data may go anywhere; a dry run writes nothing.
 * The production CronJob is the one place SYNC_ALLOW_REAL=1 is set.
 */
export function realDataAllowed(run: {
	anonymize: boolean;
	dryRun: boolean;
	env: Readonly<Record<string, string | undefined>>;
}): boolean {
	return run.anonymize || run.dryRun || run.env.SYNC_ALLOW_REAL === "1";
}

const SHOWN_IDS = 20;

/**
 * The summary a person reads. `ids` false (the dry run): counts only. True: old ids too, which name no person, so
 * the owner can find what the old app dropped.
 */
export function formatSync(result: SyncResult, ids: boolean): string {
	const lines: string[] = [`sync ${result.mode}`];
	if (result.emptyTarget) lines.push("the target holds no data yet: every row below is new");
	if (result.kinds.length > 0) {
		lines.push("", "compared with the target (new / changed / unchanged / gone from the old app)");
		for (const k of result.kinds)
			lines.push(
				`  ${k.kind.padEnd(14)} ${k.created} / ${k.changed} / ${k.unchanged} / ${k.absent.length}`,
			);
	}
	const gone = result.kinds.filter((k) => k.absent.length > 0);
	if (gone.length > 0) {
		lines.push("", "gone from the old app (reported, never deleted here)");
		for (const k of gone) {
			const shown = ids
				? `  ${k.absent.slice(0, SHOWN_IDS).join(" ")}${k.absent.length > SHOWN_IDS ? ` … +${k.absent.length - SHOWN_IDS}` : ""}`
				: "";
			lines.push(`  ${k.kind}: ${k.absent.length}${shown}`);
		}
	}
	lines.push("", ids ? formatReport(result.report) : formatReport(withoutIds(result.report)));
	return lines.join("\n");
}

/** The importer's report with the old ids taken out of the anomalies: codes and counts only. */
function withoutIds(report: Report): Report {
	return { ...report, anomalies: report.anomalies.map((a) => ({ ...a, ids: [] })) };
}
