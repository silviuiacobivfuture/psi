import type { Can } from "../lib/can";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { changeRows, visibleChanges } from "./changes";
import type { AuditLookup } from "./lookup";
import type { Row } from "./rows";

/**
 * One CSV cell. A cell that a spreadsheet would read as a formula (`=`, `+`, `-`, `@`, tab, return) is prefixed with an
 * apostrophe, so what a person typed into a note can never run when the export is opened.
 */
export function cell(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The rows as a CSV the person may open anywhere (UTF-8 with a byte-order mark, comma-separated, one event a line). */
export function auditCsv(
	rows: ReadonlyArray<Row>,
	lookup: AuditLookup,
	locale: Locale,
	can: Can,
): string {
	const l = at(locale);
	const head = [
		m.jr_csv_when({}, l),
		m.jr_csv_who({}, l),
		m.jr_csv_role({}, l),
		m.jr_csv_as({}, l),
		m.jr_csv_what({}, l),
		m.jr_csv_summary({}, l),
		m.jr_csv_object({}, l),
		m.jr_csv_changes({}, l),
		m.jr_csv_source({}, l),
		m.jr_csv_request({}, l),
		m.jr_csv_ip({}, l),
		m.jr_csv_device({}, l),
	];
	const lines = rows.map((r) => {
		const e = r.event;
		const changes = changeRows(visibleChanges(e, can), lookup, locale)
			.map((c) => `${c.label}: ${c.before} → ${c.after}`)
			.join(" | ");
		return [
			e.at,
			r.who,
			r.roles.join(" + "),
			e.asWhom ?? "",
			r.action,
			r.sentence,
			`${r.typeText}: ${r.objectText}`,
			changes,
			r.source,
			e.requestId ?? "",
			e.ip ?? "",
			e.device ?? "",
		]
			.map(cell)
			.join(",");
	});
	return `﻿${[head.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}
