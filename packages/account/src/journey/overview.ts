import type { Context } from "hono";
import type { Stores } from "../stores/types";
import type { Journey } from "./routes";
import { ownRequests } from "./routes-history";
import type { Overview } from "./views-overview";

const SAVED_SHOWN = 3;

/**
 * The overview's facts for one person, from their own rows: the next upcoming request (each allowed by OpenFGA,
 * like /cont/programari), the reading list, remembered conversations and the consents this site offers.
 */
export async function overviewOf(
	j: Journey,
	c: Context,
	stores: Stores,
	subject: string,
): Promise<Overview> {
	const { o } = j;
	const now = (o.now ?? Date.now)();
	const purposes = o.purposes ?? ["guide_memory"];
	const [saved, conversations, consented, ...states] = await Promise.all([
		stores.savedArticles.list(subject),
		stores.conversations.list(subject),
		stores.consents.current(subject, "guide_memory"),
		...purposes.map((p) => stores.consents.current(subject, p)),
	]);
	let next: Overview["next"];
	if (o.reservations !== undefined) {
		const rows = await ownRequests(j, c, subject);
		next =
			rows === null
				? "unavailable"
				: ([...rows]
						.filter(
							(r) =>
								r.end > now &&
								(r.status === "requested" || r.status === "confirmed"),
						)
						.sort((a, b) => a.start - b.start)[0] ?? null);
	}
	return {
		next,
		...(o.bookHref === undefined ? {} : { bookHref: o.bookHref }),
		saved: saved.slice(0, SAVED_SHOWN).map((s) => {
			const article = o.savedArticle?.(s.slug);
			return article === undefined
				? { title: s.slug }
				: { title: article.title, href: article.href };
		}),
		savedTotal: saved.length,
		...(o.savedListHref === undefined
			? {}
			: { savedListHref: o.savedListHref }),
		...(o.readingHref === undefined ? {} : { readingHref: o.readingHref }),
		memory: { consented, conversations: conversations.length },
		consents: purposes.map((purpose, i) => ({
			purpose,
			on: states[i] === true,
		})),
	};
}
