import { formatMoney } from "../domain/money";
import type { Can } from "../lib/can";
import { hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import { type AuditChange, type AuditEvent, StatusSchema } from "../port/schema";
import { fieldLabel } from "./labels";
import { type AuditLookup, objectOf } from "./lookup";
import { memberValue } from "./member-sentence";

export interface ChangeRow {
	label: string;
	before: string;
	after: string;
}

/**
 * The changes this person may see: a price only with the money group, the content of a clinical record only with the
 * clinical group. What they may not see is left out, not blanked, so the table never hints at it.
 */
export function visibleChanges(e: AuditEvent, can: Can): ReadonlyArray<AuditChange> {
	const changes = e.changes ?? [];
	if (objectOf(e).type === "record" && !can.group("clinical")) return [];
	return changes.filter((c) => c.field !== "priceBani" || can.group("money"));
}

function valueText(
	field: string,
	value: string | null,
	lookup: AuditLookup,
	locale: Locale,
): string {
	const l = at(locale);
	if (value === null || value === "") return m.jr_d_empty({}, l);
	switch (field) {
		case "status": {
			const s = StatusSchema.safeParse(value);
			return s.success ? statusLabel(s.data, locale) : value;
		}
		case "startMin":
			return Number.isFinite(Number(value)) ? hhmm(Number(value)) : value;
		case "durationMin":
			return m.jr_minutes({ n: value }, l);
		case "columnId":
			return lookup.columns.get(value)?.name ?? "—";
		case "resourceIds":
			return value
				.split(",")
				.map((id) => lookup.columns.get(id)?.name ?? "—")
				.join(", ");
		case "clientId":
			return lookup.clients.get(value)?.name ?? "—";
		case "serviceId":
			return lookup.services.get(value)?.name ?? "—";
		case "priceBani":
			return Number.isFinite(Number(value)) ? formatMoney(Number(value), locale) : value;
		case "remind":
			return value === "true" ? m.jr_yes({}, l) : m.jr_no({}, l);
		default:
			return memberValue(field, value, lookup, locale) ?? value;
	}
}

export function changeRows(
	changes: ReadonlyArray<AuditChange>,
	lookup: AuditLookup,
	locale: Locale,
): ReadonlyArray<ChangeRow> {
	return changes.map((c) => ({
		label: fieldLabel(c.field, locale),
		before: valueText(c.field, c.before, lookup, locale),
		after: valueText(c.field, c.after, lookup, locale),
	}));
}
