/**
 * What the import notices, by kind and OLD id only. Never a name, phone or note: an anomaly is a
 * code and the ids of the rows it concerns (`table:id`).
 *
 * - `blocking`: the export cannot be imported faithfully until someone decides (a clinical value
 *   nothing maps, a column the importer does not know). A real run refuses.
 * - `skipped`: this row cannot be placed (no such column, an impossible time). A real run refuses
 *   unless told `--allow-skips`; the row is simply not written.
 * - `note`: imported, with something worth a look (a duplicate name, an unknown reference dropped).
 */
export type Severity = "blocking" | "skipped" | "note";

export interface Anomaly {
	code: string;
	severity: Severity;
	count: number;
	/** The first ids, `table:id`; `count` says how many in all. */
	ids: string[];
}

const KEPT_IDS = 200;

export class AnomalyLog {
	private readonly byKey = new Map<string, Anomaly>();

	add(code: string, severity: Severity, id: string): void {
		const key = `${severity}|${code}`;
		const found = this.byKey.get(key);
		if (found === undefined) {
			this.byKey.set(key, { code, severity, count: 1, ids: [id] });
			return;
		}
		found.count += 1;
		if (found.ids.length < KEPT_IDS) found.ids.push(id);
	}

	list(): Anomaly[] {
		return [...this.byKey.values()].sort(
			(a, b) => a.severity.localeCompare(b.severity) || a.code.localeCompare(b.code),
		);
	}

	has(severity: Severity): boolean {
		return this.list().some((a) => a.severity === severity);
	}
}
