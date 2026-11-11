import { z } from "zod";
import { Article, type ArticleInput, PublishedEditorial } from "../schema";
import { BACKLOG } from "./backlog";
import { EDITORIAL_POLICY_SOURCE } from "./editorial-policy";
import { EQSYNC_21_ZILE } from "./eqsync-21-zile";
import { EQSYNC_CASTI } from "./eqsync-casti";
import { EQSYNC_CE_ESTE } from "./eqsync-ce-este";
import { HEMISYNC_EXERCITII } from "./hemisync-exercitii";
import { HEMISYNC_FOCUS } from "./hemisync-focus";
import { PSIZONE_CUM_LUCRAM } from "./psizone-cum-lucram";
import { PSIZONE_PRIMUL_PAS } from "./psizone-primul-pas";

/** Every article the estate has, in any state. Order is irrelevant: queries sort. */
const SOURCE: ReadonlyArray<ArticleInput> = [
	EDITORIAL_POLICY_SOURCE,
	...BACKLOG,
	PSIZONE_CUM_LUCRAM,
	PSIZONE_PRIMUL_PAS,
	EQSYNC_CASTI,
	EQSYNC_21_ZILE,
	EQSYNC_CE_ESTE,
	HEMISYNC_FOCUS,
	HEMISYNC_EXERCITII,
];

/** Parses a catalogue at boot: bad content or a reused slug fails the build, not the visitor. */
export function parseCatalogue(source: ReadonlyArray<unknown>): ReadonlyArray<Article> {
	const articles = z.array(Article).parse(source);
	const seen = new Set<string>();
	for (const a of articles) {
		if (seen.has(a.slug)) throw new Error(`@psi/content: duplicate article slug "${a.slug}"`);
		seen.add(a.slug);
	}
	return articles;
}

export const ARTICLES: ReadonlyArray<Article> = parseCatalogue(SOURCE);

/** How we write and review: the editorial page every site links to. */
export const EDITORIAL_POLICY: z.infer<typeof PublishedEditorial> =
	PublishedEditorial.parse(EDITORIAL_POLICY_SOURCE);
