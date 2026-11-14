import type { Locale } from "../lib/i18n";
import { ENTRIES, type Entry, entryOf, splitRelation } from "../port/role-map";
import { FIELD_GROUPS, RESOURCES, type ScopeName } from "../port/schema";
import { type PermissionRow, relationOf } from "../port/schema-members";
import { actionLabel, fieldGroupLabel, groupLabel, resourceLabel, scopeLabel } from "./role-labels";

/** One resource of the summary: "Clienți (contact): Vezi, Creează (Doar ale lui)". */
export interface SummaryLine {
	resource: string;
	actions: ReadonlyArray<string>;
}

export interface SummaryGroup {
	label: string;
	lines: ReadonlyArray<SummaryLine>;
}

export interface Summary {
	groups: ReadonlyArray<SummaryGroup>;
	/** The client field groups seen (Contact, Bani…). */
	fields: ReadonlyArray<string>;
	/** Held permissions the console has no words for (the service's finer ones): counted, never hidden silently. */
	more: number;
}

const scopesText = (held: ReadonlyArray<ScopeName>, locale: Locale): string =>
	held.includes("all") ? "" : ` (${held.map((s) => scopeLabel(s, locale)).join(", ")})`;

/**
 * What a member may do in the end, in words: the effective rows (every role, grant and denial counted, as the
 * service answers them) grouped by the role editor's groups and resources. Nothing is computed here that the service
 * did not say.
 */
export function summaryOf(matrix: ReadonlyArray<PermissionRow>, locale: Locale): Summary {
	const held = matrix.filter((r) => r.held.length > 0);
	const byResource = new Map<string, string[]>();
	const fields: string[] = [];
	let more = 0;
	for (const row of held) {
		if (row.fieldGroup !== undefined) {
			const g = FIELD_GROUPS.find((x) => x === row.fieldGroup);
			if (row.key === `clients_view_${row.fieldGroup}` && g !== undefined)
				fields.push(fieldGroupLabel(g, locale));
			else more++;
			continue;
		}
		const entry = entryOf(row.key);
		if (entry === undefined) {
			more++;
			continue;
		}
		const list = byResource.get(entry.resource.key) ?? [];
		list.push(`${actionLabel(entry.action, locale)}${scopesText(row.held, locale)}`);
		byResource.set(entry.resource.key, list);
	}
	const groups: SummaryGroup[] = [];
	for (const r of RESOURCES) {
		const actions = byResource.get(r.key);
		if (actions === undefined) continue;
		const label = groupLabel(r.group, locale);
		const line = { resource: resourceLabel(r.key, locale), actions };
		const group = groups.find((g) => g.label === label);
		if (group === undefined) groups.push({ label, lines: [line] });
		else groups[groups.indexOf(group)] = { label, lines: [...group.lines, line] };
	}
	return { groups, fields, more };
}

/** A stored relation in words ("Clienți (contact) · Vezi (Doar ale lui)"); one the console cannot name stays as it is. */
export function relationWords(relation: string, locale: Locale): string {
	const { key, scope, group } = splitRelation(relation);
	const entry = group === null ? entryOf(key) : undefined;
	if (entry === undefined || scope === null) return relation;
	return `${resourceLabel(entry.resource.key, locale)} · ${actionLabel(entry.action, locale)}${scopesText([scope], locale)}`;
}

/** One choice of the per-person picker: a permission the console has words for, and the scopes the service offers. */
export interface OverrideChoice {
	entry: Entry;
	row: PermissionRow;
}

/** The permissions the per-person picker offers, in the role editor's order: those the console can name. */
export function overrideChoices(
	matrix: ReadonlyArray<PermissionRow>,
): ReadonlyArray<OverrideChoice> {
	const rows = new Map(matrix.filter((r) => r.fieldGroup === undefined).map((r) => [r.key, r]));
	return ENTRIES.flatMap((entry) => {
		const row = rows.get(entry.key);
		return row === undefined ? [] : [{ entry, row }];
	});
}

/**
 * The grants and denials to store after the picker was sent: what the picker shows is replaced, what it cannot show
 * (a finer permission granted another way) is kept as it was. A withdrawn permission is withdrawn at every scope.
 */
export function overridesFromForm(
	matrix: ReadonlyArray<PermissionRow>,
	current: { grant: ReadonlyArray<string>; deny: ReadonlyArray<string> },
	form: { grant: ReadonlyArray<string>; deny: ReadonlyArray<string> },
): { grant: string[]; deny: string[] } {
	const choices = overrideChoices(matrix);
	const shown = new Set(choices.flatMap((c) => c.row.scopes.map((s) => relationOf(c.row, s))));
	const offered = (relation: string): boolean => shown.has(relation);
	const denied = new Set(form.deny);
	const deny = choices
		.filter((c) => denied.has(c.row.key))
		.flatMap((c) => c.row.scopes.map((s) => relationOf(c.row, s)));
	return {
		grant: [
			...new Set([...current.grant.filter((g) => !offered(g)), ...form.grant.filter(offered)]),
		].sort(),
		deny: [...new Set([...current.deny.filter((d) => !offered(d)), ...deny])].sort(),
	};
}
