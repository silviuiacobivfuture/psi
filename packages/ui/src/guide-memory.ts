import { type ConversationTurn, DISPLAY_TURNS } from "@psi/guide";
import type { Context } from "hono";

/** A person's remembered conversation with the guide on one site (consent `guide_memory`). */
export interface GuideMemory {
	/** The kept exchanges, oldest first, as turns (at most the last ten). */
	turns(): Promise<ReadonlyArray<ConversationTurn>>;
	/** Deletes the site's kept conversation (also gone from the account's conversation page). */
	forget(): Promise<void>;
}

/**
 * The part of the estate account (`@psi/account`'s `Account`) this needs, described here because
 * the account package depends on this one: any `Account` fits.
 */
export interface MemoryAccount {
	person(c: Context): Promise<{ subject: string } | null>;
	stores(): Promise<{
		consents: {
			current(subject: string, purpose: "guide_memory"): Promise<boolean>;
		};
		conversations: {
			forSite(subject: string, site: string): Promise<{ id: string } | null>;
			turns(
				id: string,
				limit: number,
			): Promise<ReadonlyArray<{ question: string; answer: string }>>;
			remove(id: string): Promise<void>;
		};
	}>;
}

/**
 * The remembered conversation for this request: only for a signed-in person who granted
 * `guide_memory` (the same rule as the account's remembering guide); `null` for everyone else, and
 * when the account cannot be read (a store that is down never breaks the chat).
 */
export async function accountMemory(
	account: MemoryAccount,
	c: Context,
	site: string,
): Promise<GuideMemory | null> {
	try {
		const person = await account.person(c);
		if (person === null) return null;
		const stores = await account.stores();
		if (!(await stores.consents.current(person.subject, "guide_memory")))
			return null;
		const { conversations } = stores;
		return {
			async turns() {
				const kept = await conversations.forSite(person.subject, site);
				if (kept === null) return [];
				const exchanges = await conversations.turns(kept.id, DISPLAY_TURNS / 2);
				return exchanges.flatMap((t): ConversationTurn[] => [
					{ role: "user", text: t.question },
					{ role: "guide", text: t.answer },
				]);
			},
			async forget() {
				const kept = await conversations.forSite(person.subject, site);
				if (kept !== null) await conversations.remove(kept.id);
			},
		};
	} catch {
		return null;
	}
}
