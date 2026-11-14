import { at, type Locale } from "../lib/i18n";
import { relationWords } from "../pages/member-summary";
import { m } from "../paraglide/messages.js";
import { splitRelation } from "../port/role-map";
import type { AuditEvent } from "../port/schema";
import type { AuditLookup } from "./lookup";

/** The value of a member's field the service kept, before or after: the people and roles named, never their ids. */
export function memberValue(
	field: string,
	value: string,
	lookup: AuditLookup,
	locale: Locale,
): string | null {
	const ids = value === "" ? [] : value.split(",");
	switch (field) {
		case "roles":
			return ids.length === 0
				? m.jr_no_role({}, at(locale))
				: ids.map((id) => lookup.roles.get(id) ?? id).join(" + ");
		case "grants":
		case "denies":
			return ids.map((r) => relationWords(r, locale)).join("; ");
		case "coordinates":
			return ids.map((id) => lookup.columns.get(id)?.name ?? "—").join(", ");
		default:
			return null;
	}
}

const change = (e: AuditEvent, field: string) => e.changes?.find((c) => c.field === field);
const count = (v: string | null | undefined): number =>
	v === null || v === undefined || v === "" ? 0 : v.split(",").length;

/** How many permissions a list of relations is about: one withdrawn at every scope is one. */
const kinds = (v: string | null | undefined): number =>
	v === null || v === undefined || v === ""
		? 0
		: new Set(
				v.split(",").map((r) => {
					const { key, group } = splitRelation(r);
					return group === null ? key : `${key}_${group}`;
				}),
			).size;

/** A member's name in the journal: the team's, else the one the service kept when they were removed. */
export function memberName(e: AuditEvent, lookup: AuditLookup, id: string): string | undefined {
	const kept = change(e, "displayName");
	return (
		lookup.people.get(id)?.name ??
		[kept?.before, kept?.after].find((n): n is string => n !== null && n !== undefined && n !== "")
	);
}

/**
 * The sentence of a change to the team: who was added with which roles, whose roles became what, how many permissions
 * someone holds individually, who was removed. A store that keeps no detail still gets a whole sentence.
 */
export function memberSentence(
	e: AuditEvent,
	object: string,
	lookup: AuditLookup,
	locale: Locale,
): string {
	const l = at(locale);
	const action = e.action.replace(/^assistant\./, "");
	if (action === "member.remove") return m.jr_s_member_remove({ object }, l);
	if (action === "member.overrides") {
		const grants = change(e, "grants");
		const denies = change(e, "denies");
		return grants === undefined && denies === undefined
			? m.jr_s_member_edit({ object }, l)
			: m.jr_s_member_overrides(
					{ object, extra: kinds(grants?.after), withdrawn: kinds(denies?.after) },
					l,
				);
	}
	const roles = change(e, "roles");
	const name = change(e, "displayName");
	// A member is new when the service kept a name that was empty before.
	const added = name !== undefined && count(name.before) === 0;
	const named = memberValue("roles", roles?.after ?? "", lookup, locale) ?? "";
	if (added) return m.jr_s_member_add({ object, roles: named }, l);
	return roles === undefined
		? m.jr_s_member_edit({ object }, l)
		: m.jr_s_member_roles({ object, roles: named }, l);
}
