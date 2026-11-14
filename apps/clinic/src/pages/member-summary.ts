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
 * The grants and denials to store after the picker was sent, permission by permission:
 * - what the picker cannot show (a finer permission set another way) is kept as it was;
 * - an extra permission left at the scope it already had keeps every scope it had (the picker shows one);
 * - a withdrawal left ticked keeps the scopes it had; newly ticked, it withdraws every scope; unticked, none.
 * `invalid` when the form names a permission the picker does not offer: nothing is dropped silently.
 */
export function overridesFromForm(
	matrix: ReadonlyArray<PermissionRow>,
	current: { grant: ReadonlyArray<string>; deny: ReadonlyArray<string> },
	form: { grant: ReadonlyArray<string>; deny: ReadonlyArray<string> },
): { grant: string[]; deny: string[] } | "invalid" {
	const choices = overrideChoices(matrix);
	const scopesOf = (c: OverrideChoice): string[] => c.row.scopes.map((s) => relationOf(c.row, s));
	const shown = new Set(choices.flatMap(scopesOf));
	const keys = new Set(choices.map((c) => c.row.key));
	if (!form.grant.every((g) => shown.has(g)) || !form.deny.every((d) => keys.has(d)))
		return "invalid";
	const grant = current.grant.filter((g) => !shown.has(g));
	const deny = current.deny.filter((d) => !shown.has(d));
	for (const c of choices) {
		const relations = scopesOf(c);
		const had = current.grant.filter((g) => relations.includes(g));
		const sent = form.grant.filter((g) => relations.includes(g));
		grant.push(...(sent.length > 0 && sent.every((g) => had.includes(g)) ? had : sent));
		const withdrawn = current.deny.filter((d) => relations.includes(d));
		if (form.deny.includes(c.row.key)) deny.push(...(withdrawn.length > 0 ? withdrawn : relations));
	}
	return { grant: [...new Set(grant)].sort(), deny: [...new Set(deny)].sort() };
}
