import { type EventId, EventIdSchema } from "../apps";
import { CLIENT_ENTRIES } from "./entries-client";
import { OWNER_ENTRIES } from "./entries-owner";
import { PERSONAL_ENTRIES, PRACTITIONER_ENTRIES, RECEPTION_ENTRIES } from "./entries-staff";
import type { Entry } from "./entry";
import { type Audience, CHANNELS, type Channel, type NotifyKind } from "./kinds";

export { CLIENT_ENTRIES } from "./entries-client";
export { OWNER_ENTRIES } from "./entries-owner";
export { PERSONAL_ENTRIES, PRACTITIONER_ENTRIES, RECEPTION_ENTRIES } from "./entries-staff";
export type { Entry } from "./entry";
export {
	AUDIENCES,
	type Audience,
	AudienceSchema,
	CHANNELS,
	type Channel,
	NOTIFY_KINDS,
	type NotifyKind,
	NotifyKindSchema,
	PUSH_KINDS,
	type PushKind,
} from "./kinds";
export { DOMAIN_FIELDS, PAYLOADS, type PayloadOf } from "./payloads";

/** Every workflow, grouped by who it is for. */
export const CATALOGUE: ReadonlyArray<Entry> = [
	...CLIENT_ENTRIES,
	...RECEPTION_ENTRIES,
	...PRACTITIONER_ENTRIES,
	...PERSONAL_ENTRIES,
	...OWNER_ENTRIES,
];

/** Novu's workflow id: unique per app, event and audience (`psizone-appointment-confirmed-client`). */
export function workflowId(app: string, event: EventId, audience: Audience): string {
	return `${app}-${event.replace(/[._]/g, "-")}-${audience}`;
}

export function entriesFor(event: EventId): ReadonlyArray<Entry> {
	return CATALOGUE.filter((e) => e.event === event);
}

export function entryFor(event: EventId, audience: Audience): Entry | undefined {
	return CATALOGUE.find((e) => e.event === event && e.audience === audience);
}

/** The i18n message-key stem of an entry: `appointment_confirmed_client`. */
export function messageStem(e: Pick<Entry, "event" | "audience">): string {
	return `${e.event.replace(/\./g, "_")}_${e.audience}`;
}

/** The channels on for a person who has chosen nothing. */
export function defaultChannels(e: Entry): ReadonlyArray<Channel> {
	return e.defaults ?? e.channels;
}

/** The audiences whose entries a person of a side can switch: a client's page lists the client kinds, a member's the rest. */
export function kindsOf(side: "client" | "staff"): ReadonlyArray<NotifyKind> {
	const kinds = new Set<NotifyKind>();
	for (const e of CATALOGUE)
		if ((e.audience === "client") === (side === "client")) kinds.add(e.kind);
	return [...kinds];
}

/** What a kind offers one side: the union of its entries' channels, defaults and locks (a lock holds only if every entry has it). */
export function kindInfo(
	side: "client" | "staff",
	kind: NotifyKind,
): { offered: Channel[]; defaults: Channel[]; locked: Channel[] } {
	const entries = CATALOGUE.filter(
		(e) => e.kind === kind && (e.audience === "client") === (side === "client"),
	);
	const offered = CHANNELS.filter((c) => entries.some((e) => e.channels.includes(c)));
	const defaults = offered.filter((c) => entries.some((e) => defaultChannels(e).includes(c)));
	const locked = offered.filter(
		(c) =>
			entries.length > 0 &&
			entries.filter((e) => e.channels.includes(c)).every((e) => e.locked?.includes(c)),
	);
	return { offered, defaults, locked };
}

export { EventIdSchema };
