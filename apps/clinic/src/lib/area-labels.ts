import { m } from "../paraglide/messages.js";
import type { AreaGroup, OrgAreaId } from "./areas";
import { at, type Locale } from "./i18n";

/** The words of an organisation-settings area (a bundle of messages named by its id) and of its group. */
export function areaText(id: OrgAreaId, locale: Locale): { title: string; hint: string } {
	const o = at(locale);
	return {
		title: m[`st_area_${id}` as const]({}, o),
		hint: m[`st_area_${id}_hint` as const]({}, o),
	};
}

export const groupText = (g: AreaGroup, locale: Locale): string =>
	m[`st_group_${g}` as const]({}, at(locale));
