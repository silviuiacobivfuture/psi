import { normalizeText } from "./normalize";

/** RFC 4180 rows: quoted fields, doubled quotes, commas, semicolons or tabs as separators. */
export function parseCsv(input: string): string[][] {
	const text = input.replace(/^﻿/, "");
	const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
	const sep = [",", ";", "\t"].reduce(
		(best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best),
		",",
	);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"' && field === "") quoted = true;
		else if (c === sep) {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * A table as text the guide can quote: one line per row, each cell named by its header
 * ("Zi: luni; Program: 9–17"). A one-row file is its own header.
 */
export function csvText(input: string): string {
	const [header, ...rows] = parseCsv(input);
	if (header === undefined) return "";
	const names = header.map((h, i) => h.trim() || `#${i + 1}`);
	if (rows.length === 0) return normalizeText(names.join("; "));
	return normalizeText(
		rows
			.map((r) =>
				r
					.map((cell, i) => [names[i] ?? `#${i + 1}`, cell.trim()] as const)
					.filter(([, v]) => v !== "")
					.map(([k, v]) => `${k}: ${v}`)
					.join("; "),
			)
			.join("\n"),
	);
}
