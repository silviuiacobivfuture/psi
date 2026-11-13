import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { ACTIONS, FIELD_GROUPS, RESOURCES, SCOPES } from "../port/schema";

type Resource = (typeof RESOURCES)[number];

export function resourceLabel(key: Resource["key"], locale: Locale): string {
	return m[`resource_${key}` as const]({}, at(locale));
}
export function groupLabel(key: Resource["group"], locale: Locale): string {
	return m[`group_${key}` as const]({}, at(locale));
}
export function actionLabel(key: (typeof ACTIONS)[number], locale: Locale): string {
	return m[`action_${key}` as const]({}, at(locale));
}
export function scopeLabel(key: (typeof SCOPES)[number], locale: Locale): string {
	return m[`scope_${key}` as const]({}, at(locale));
}
export function fieldGroupLabel(key: (typeof FIELD_GROUPS)[number], locale: Locale): string {
	return m[`fieldgroup_${key}` as const]({}, at(locale));
}
