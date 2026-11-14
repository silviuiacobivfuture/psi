import { PauseMessage, PauseScope } from "@psi/scheduling-sdk/contract";
import { z } from "zod/v4";
import { m } from "../paraglide/messages.js";
import type { StorePort } from "../store/types";

/**
 * The pauses of online booking, kept in the app's keyed store (namespace `pause`, one entry per pause, its id the key).
 * Whether a pause is in force is decided at each request against the service's clock: `from` (absent: since it was
 * made) to `until` (absent: until it is lifted). Nothing here is an "active" flag that could go stale.
 */
const Stored = z.object({
	scope: PauseScope,
	from: z.number().int().nonnegative().optional(),
	until: z.number().int().nonnegative().optional(),
	message: PauseMessage.optional(),
	callbacksOpen: z.boolean(),
	blockStaff: z.boolean(),
	createdAt: z.number().int(),
	createdBy: z.string(),
	updatedAt: z.number().int(),
});
export type StoredPause = z.infer<typeof Stored>;
export type PauseScopeValue = StoredPause["scope"];

export interface LoadedPause extends StoredPause {
	id: string;
	revision: number;
}

/** The most pauses an app keeps (ended ones included, until they are removed). */
export const MAX_PAUSES = 50;

/** Every pause of the app, newest first. A body that no longer parses is skipped (and said in the log by the caller). */
export async function loadPauses(store: StorePort, app: string): Promise<LoadedPause[]> {
	const entries = await store.keyed.list(app, "pause", { limit: MAX_PAUSES + 1 });
	const out: LoadedPause[] = [];
	for (const entry of entries) {
		const parsed = Stored.safeParse(safeJson(entry.body));
		if (parsed.success) out.push({ ...parsed.data, id: entry.key, revision: entry.revision });
	}
	return out.sort((a, b) => b.createdAt - a.createdAt);
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export const bodyOf = (p: StoredPause): string => JSON.stringify(Stored.parse(p));

export type PauseStateName = "scheduled" | "active" | "ended";

export function stateOf(p: Pick<StoredPause, "from" | "until">, now: number): PauseStateName {
	if (p.from !== undefined && p.from > now) return "scheduled";
	if (p.until !== undefined && p.until <= now) return "ended";
	return "active";
}

/** The words visitors read when the pause has none of its own: one asks them to call or leave a callback request. */
export function defaultMessage(callbacksOpen: boolean): { ro: string; en: string } {
	const key = callbacksOpen ? "pause_message_callbacks" : "pause_message_call";
	return { ro: m[key]({}, { locale: "ro" }), en: m[key]({}, { locale: "en" }) };
}

export const messageOf = (p: StoredPause): { ro: string; en: string } =>
	p.message ?? defaultMessage(p.callbacksOpen);

/** What a booking asks about: the site (a service key's caller), the service, the practitioner (people id), staff. */
export interface PauseQuestion {
	site?: string | undefined;
	service?: string | undefined;
	/** The practitioner as the people collection names them. */
	practitioner?: string | undefined;
	/** A staff booking from the console: only pauses that block staff too count. */
	staff?: boolean;
}

const RANK: Readonly<Record<PauseScopeValue["level"], number>> = {
	organisation: 0,
	site: 1,
	service: 2,
	practitioner: 3,
};

function covers(scope: PauseScopeValue, q: PauseQuestion): boolean {
	switch (scope.level) {
		case "organisation":
			return true;
		case "site":
			return q.site !== undefined && q.site === scope.site;
		case "service":
			return q.service !== undefined && q.service === scope.service;
		case "practitioner":
			return q.practitioner !== undefined && q.practitioner === scope.practitionerId;
		default: {
			const never: never = scope;
			return never;
		}
	}
}

/** Every pause in force now that covers the question, the widest first (organisation, site, service, practitioner). */
export function pausesFor(
	pauses: ReadonlyArray<LoadedPause>,
	now: number,
	q: PauseQuestion,
): LoadedPause[] {
	return pauses
		.filter((p) => stateOf(p, now) === "active" && covers(p.scope, q))
		.filter((p) => q.staff !== true || p.blockStaff)
		.sort((a, b) => RANK[a.scope.level] - RANK[b.scope.level] || b.createdAt - a.createdAt);
}

/** What the visitor is told about a pause. */
export function noticeOf(p: LoadedPause): {
	level: PauseScopeValue["level"];
	message: { ro: string; en: string };
	callbacksOpen: boolean;
	until?: number;
} {
	return {
		level: p.scope.level,
		message: messageOf(p),
		callbacksOpen: p.callbacksOpen,
		...(p.until === undefined ? {} : { until: p.until }),
	};
}

/** The people ids of the practitioners paused on their own right now. */
export function pausedPractitioners(pauses: ReadonlyArray<LoadedPause>, now: number): Set<string> {
	return new Set(
		pauses.flatMap((p) =>
			stateOf(p, now) === "active" && p.scope.level === "practitioner"
				? [p.scope.practitionerId]
				: [],
		),
	);
}
