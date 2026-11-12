import type { Stores } from "../stores/types";
import type { TimelineEvent } from "./ports";
import type { Journey } from "./routes";
import { PURPOSE_KEYS } from "./views-manage";

const SHOWN = 20;

/**
 * The home timeline: reservations, consent changes, saved articles and remembered conversations, newest
 * first. Only the person's own rows, from their own stores; a source that is away is left out, never guessed.
 */
export async function timelineOf(
	j: Journey,
	stores: Stores,
	subject: string,
): Promise<TimelineEvent[]> {
	const { o, say, path } = j;
	const events: TimelineEvent[] = [];
	for (const r of await stores.consents.list(subject)) {
		const detail = say(PURPOSE_KEYS[r.purpose][0]);
		events.push({
			at: r.grantedAt,
			kind: "consent_granted",
			detail,
			href: path("consents"),
		});
		if (r.withdrawnAt !== null) {
			events.push({
				at: r.withdrawnAt,
				kind: "consent_withdrawn",
				detail,
				href: path("consents"),
			});
		}
	}
	for (const s of await stores.savedArticles.list(subject)) {
		const article = o.savedArticle?.(s.slug);
		events.push({
			at: s.savedAt,
			kind: "saved",
			detail: article?.title ?? s.slug,
			...(article === undefined ? {} : { href: article.href }),
		});
	}
	for (const c of await stores.conversations.list(subject)) {
		events.push({
			at: c.updatedAt,
			kind: "conversation",
			detail: o.siteNames[c.site] ?? c.site,
			href: path("conversations"),
		});
	}
	if (o.reservations !== undefined) {
		try {
			for (const r of await o.reservations.requests(subject)) {
				events.push({
					at: r.submittedAt,
					kind: "booking",
					detail: r.reference,
					href: path("bookings"),
				});
			}
		} catch {
			// The scheduling store is away: its lines are left out, the rest still shows.
		}
	}
	return events.sort((a, b) => b.at - a.at).slice(0, SHOWN);
}
