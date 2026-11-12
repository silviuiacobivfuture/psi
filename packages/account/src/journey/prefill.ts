import type { Guide } from "@psi/guide";
import type { Context } from "hono";
import type { Account } from "../account";
import { rememberingGuide } from "./remember";

/** What a signed-in person's forms start with (editable before sending). Nothing for an anonymous visitor. */
export interface Prefill {
	name: string;
	email: string;
	phone: string;
}

export async function prefillFor(
	account: Account,
	c: Context,
): Promise<Prefill | null> {
	const person = await account.person(c);
	if (person === null) return null;
	const profile = await (await account.stores()).profiles.get(person.subject);
	return {
		name: profile?.displayName ?? person.name ?? "",
		email: person.email ?? "",
		phone: profile?.phone ?? "",
	};
}

/**
 * The guide for this request: the remembering guide only for a signed-in person who granted
 * `guide_memory`; everyone else gets the guide as it is, and nothing they ask is kept.
 */
export async function guideFor(
	account: Account,
	c: Context,
	guide: Guide,
	site: string,
): Promise<Guide> {
	const person = await account.person(c);
	if (person === null) return guide;
	const stores = await account.stores();
	if (!(await stores.consents.current(person.subject, "guide_memory")))
		return guide;
	return rememberingGuide(guide, {
		conversations: stores.conversations,
		subject: person.subject,
		site,
	});
}
