import type { Stores } from "../stores/types";
import type { Journey } from "./routes";

/**
 * Everything the estate keeps about one person, as one JSON document (GDPR art. 15 and 20): the account,
 * the profile, every consent with its history, saved articles, remembered conversations word for word,
 * and their reservations. Nothing about anyone else, and nothing derived.
 */
export async function exportOf(
	j: Journey,
	stores: Stores,
	subject: string,
): Promise<Record<string, unknown>> {
	const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
	const [account, profile, consents, saved, conversations] = await Promise.all([
		stores.accounts.get(subject),
		stores.profiles.get(subject),
		stores.consents.list(subject),
		stores.savedArticles.list(subject),
		stores.conversations.list(subject),
	]);
	const threads = await Promise.all(
		conversations.map(async (c) => ({
			site: c.site,
			startedAt: iso(c.startedAt),
			turns: (await stores.conversations.turns(c.id, 10_000)).map((t) => ({
				at: iso(t.at),
				question: t.question,
				answer: t.answer,
			})),
		})),
	);
	let reservations: unknown = [];
	try {
		reservations = ((await j.o.reservations?.requests(subject)) ?? []).map((r) => ({
			reference: r.reference,
			status: r.status,
			mode: r.mode,
			start: iso(r.start),
			end: iso(r.end),
			practitioner: r.practitionerName,
			submittedAt: iso(r.submittedAt),
		}));
	} catch {
		reservations = "unavailable";
	}
	return {
		exportedAt: new Date().toISOString(),
		account:
			account === null
				? null
				: {
						subject: account.subject,
						email: account.email,
						name: account.name,
						createdAt: iso(account.createdAt),
						lastSeenAt: iso(account.lastSeenAt),
					},
		profile:
			profile === null
				? null
				: {
						displayName: profile.displayName,
						phone: profile.phone,
						preferredContact: profile.preferredContact,
						language: profile.language,
						updatedAt: iso(profile.updatedAt),
					},
		consents: consents.map((r) => ({
			purpose: r.purpose,
			wordingVersion: r.wordingVersion,
			grantedAt: iso(r.grantedAt),
			withdrawnAt: iso(r.withdrawnAt),
		})),
		savedArticles: saved.map((s) => ({
			slug: s.slug,
			savedAt: iso(s.savedAt),
		})),
		conversations: threads,
		reservations,
	};
}
