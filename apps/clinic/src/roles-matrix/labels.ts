import type { Action, BaseFieldGroup, Resource } from "@psi/scheduling/permissions";
import { at, type Locale } from "../lib/i18n";
import { actionLabel, fieldGroupLabel } from "../pages/role-labels";
import { m } from "../paraglide/messages.js";
import { ACTIONS as EDITOR_ACTIONS, FIELD_GROUPS as EDITOR_GROUPS } from "../port/schema";
import type { Area, Row } from "./model";

type EditorAction = Exclude<(typeof EDITOR_ACTIONS)[number], "cancel">;
type EditorGroup = (typeof EDITOR_GROUPS)[number];

/** The role editor's own words, where the catalogue's action means the same (its "cancel" also covers delete). */
const isEditorAction = (a: Action): a is Action & EditorAction =>
	a !== "cancel" && (EDITOR_ACTIONS as ReadonlyArray<string>).includes(a);
const isEditorGroup = (g: string): g is BaseFieldGroup & EditorGroup =>
	(EDITOR_GROUPS as ReadonlyArray<string>).includes(g);

export const areaLabel = (area: Area, locale: Locale): string =>
	m[`rm_area_${area}` as const]({}, at(locale));

export const resourceText = (resource: Resource, locale: Locale): string =>
	m[`rm_res_${resource}` as const]({}, at(locale));

export function actionText(action: Action, locale: Locale): string {
	return isEditorAction(action)
		? actionLabel(action, locale)
		: m[`rm_act_${action}` as const]({}, at(locale));
}

function groupText(group: string, locale: Locale): string {
	if (isEditorGroup(group)) return fieldGroupLabel(group, locale);
	return group === "core" ? m.rm_fg_core({}, at(locale)) : group;
}

/** A row as people read it: "Vezi", or "Vezi: câmpurile „Clinic”". */
export function rowText(row: Row, locale: Locale): string {
	const action = actionText(row.action, locale);
	return row.group === undefined
		? action
		: m.rm_group_row({ action, group: groupText(row.group, locale) }, at(locale));
}
