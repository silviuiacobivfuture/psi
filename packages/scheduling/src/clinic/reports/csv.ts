import { toLocal } from "../../domain/time";
import type { Range } from "./types";

/**
 * A report as a CSV file. Every report is a tree of counts, rates and money, so the file is the tree flattened to two
 * columns, `field` and `value`: `buckets.2026-06-01.total,12`. A list whose items name themselves (`bucket`, `id`,
 * `client`, `entry`) is keyed by that name, so the path reads; any other list by position. A missing rate is an empty
 * cell, a number is written as is (a refund is negative), and nothing a person typed is ever a formula: a cell a
 * spreadsheet would read as one (it starts with `=`, `+`, `-`, `@`, a tab or a return) is written with a leading `'`
 * unless it is a plain number.
 */
export interface Csv {
	filename: string;
	csv: string;
}

const NAMES = ["bucket", "id", "client", "entry"] as const;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsOf(value: unknown, path: string, out: [string, string][]): void {
	if (Array.isArray(value)) {
		value.forEach((item, i) => {
			const key = isRecord(item)
				? NAMES.map((n) => item[n]).find((v) => typeof v === "string")
				: undefined;
			rowsOf(item, path === "" ? String(key ?? i) : `${path}.${String(key ?? i)}`, out);
		});
		return;
	}
	if (isRecord(value)) {
		for (const [k, v] of Object.entries(value)) {
			if (NAMES.some((n) => n === k) && typeof v === "string") continue;
			rowsOf(v, path === "" ? k : `${path}.${k}`, out);
		}
		return;
	}
	out.push([path, value === null || value === undefined ? "" : String(value)]);
}

/** One cell: quoted when it holds a comma, a quote or a line break, and never a formula. */
export function cell(text: string): string {
	const safe = !PLAIN_NUMBER.test(text) && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function reportCsv(name: string, report: unknown, range: Range): Csv {
	const rows: [string, string][] = [];
	rowsOf(report, "", rows);
	const day = (instant: number): string => toLocal(instant, range.zone).date;
	return {
		filename: `report-${name}-${day(range.from)}_${day(range.to - 1)}.csv`,
		csv: `${["field,value", ...rows.map(([path, value]) => `${cell(path)},${cell(value)}`)].join("\r\n")}\r\n`,
	};
}
