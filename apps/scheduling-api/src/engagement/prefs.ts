import {
	kindInfo,
	kindsOf,
	NO_PREFS,
	type PreferenceSource,
	type Prefs,
	PrefsSchema,
} from "@psi/notify";
import { z } from "zod";
import { fail } from "../http/errors";
import type { KeyedPort } from "../store/ports";
import { hashOfSubject, isStale, json } from "./records";

export type Side = "staff" | "client";

const staffKey = (subject: string): string => `s/${subject}`;
const accountKey = (hash: string): string => `a/${hash}`;
const OfClient = z.object({ accountHash: z.string().length(64) });

async function read(keyed: KeyedPort, app: string, key: string) {
	const held = await keyed.get(app, "prefs", key);
	if (held === undefined) return undefined;
	const parsed = PrefsSchema.safeParse(json(held.body));
	return parsed.success ? { prefs: parsed.data, revision: held.revision } : undefined;
}

/** What each person chose: members of staff by sign-in subject, visitors by their account. */
export function createPreferenceSource(keyed: KeyedPort): PreferenceSource {
	return {
		async resolve(app, owner) {
			if (owner.side === "staff") return (await read(keyed, app, staffKey(owner.subject)))?.prefs;
			const link = await keyed.get(app, "link", `c/${owner.clientId}`);
			const of = link === undefined ? undefined : OfClient.safeParse(json(link.body));
			if (of === undefined || !of.success) return undefined;
			return (await read(keyed, app, accountKey(of.data.accountHash)))?.prefs;
		},
	};
}

/** The page's data: the person's choices and, per kind of their side, what is offered, what starts on and what is locked. */
export function prefsView(side: Side, prefs: Prefs) {
	return {
		prefs,
		kinds: kindsOf(side).map((kind) => ({ kind, ...kindInfo(side, kind) })),
	};
}

export async function loadPrefs(keyed: KeyedPort, app: string, side: Side, who: string) {
	const key = side === "staff" ? staffKey(who) : accountKey(hashOfSubject(who));
	return (await read(keyed, app, key))?.prefs ?? NO_PREFS;
}

function validZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** A choice the catalogue cannot honour is refused whole, naming the kind and channel, and nothing is saved. */
export function checkPrefs(side: Side, prefs: Prefs): void {
	const kinds = new Set<string>(kindsOf(side));
	for (const [kind, switches] of Object.entries(prefs.channels)) {
		if (!kinds.has(kind))
			throw fail("invalid", "unknown kind of notification", { reason: "unknown_kind", kind });
		const info = kindInfo(side, kind as Parameters<typeof kindInfo>[1]);
		for (const [channel, on] of Object.entries(switches)) {
			if (!(info.offered as string[]).includes(channel))
				throw fail("invalid", "this kind does not use that channel", {
					reason: "not_offered",
					kind,
					channel,
				});
			if (on === false && (info.locked as string[]).includes(channel))
				throw fail("invalid", "this channel cannot be switched off", {
					reason: "locked",
					kind,
					channel,
				});
		}
	}
	if (prefs.quietHours !== null && !validZone(prefs.quietHours.timeZone))
		throw fail("invalid", "unknown time zone", { reason: "time_zone" });
}

export async function savePrefs(
	keyed: KeyedPort,
	app: string,
	side: Side,
	who: string,
	prefs: Prefs,
): Promise<void> {
	checkPrefs(side, prefs);
	const key = side === "staff" ? staffKey(who) : accountKey(hashOfSubject(who));
	// The whole set replaces the old one; a save that raced another is retried once against what the other wrote.
	for (let attempt = 0; attempt < 2; attempt++) {
		const held = await keyed.get(app, "prefs", key);
		try {
			await keyed.put(app, "prefs", key, held?.revision ?? 0, JSON.stringify(prefs));
			return;
		} catch (error) {
			if (!isStale(error) || attempt === 1) throw error;
		}
	}
}
