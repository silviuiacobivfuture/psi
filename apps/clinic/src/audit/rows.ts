import type { Can } from "../lib/can";
import type { Locale } from "../lib/i18n";
import type { AuditEvent } from "../port/schema";
import { actionLabel, type ObjectType, sourceLabel, typeLabel } from "./labels";
import { type AuditLookup, actorName, objectOf } from "./lookup";
import { objectHref, objectShort, sentenceOf } from "./sentence";

/** One event, said in the viewer's words: everything the table, the drawer and the export show. */
export interface Row {
	event: AuditEvent;
	who: string;
	roles: ReadonlyArray<string>;
	action: string;
	sentence: string;
	type: ObjectType;
	typeText: string;
	objectText: string;
	href: string | null;
	source: string;
}

export function describe(e: AuditEvent, lookup: AuditLookup, locale: Locale, can: Can): Row {
	const o = objectOf(e);
	const person = lookup.people.get(e.actor);
	return {
		event: e,
		who: actorName(lookup, e.actor),
		roles: person?.roles ?? [],
		action: actionLabel(e.action, locale),
		sentence: sentenceOf(e, lookup, locale),
		type: o.type,
		typeText: typeLabel(o.type, locale),
		objectText: objectShort(o, e, lookup, locale),
		href: objectHref(o, lookup, can),
		source: sourceLabel(e.source, locale),
	};
}
