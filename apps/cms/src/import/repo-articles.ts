import { type Article, type Block, isReadable, type Locale } from "@psi/content";
import { z } from "zod";

/**
 * The repository's articles (@psi/content) as CMS drafts: the editorial policy, the AI drafts and
 * the backlog's titles. Every imported article is a DRAFT (it goes through review like any other;
 * none is public until written, reviewed and published) and keeps where its facts come from in
 * `provenance`: the drafts their sources, the policy the file it came from, a backlog title the
 * content strategy.
 */
export const REPO_FILE = "packages/content/src/articles";
export const BACKLOG_PROVENANCE = "backlog, content-strategy.md";

/** Which repository articles the CMS takes over: all of them. */
export function toImport(articles: ReadonlyArray<Article>): Article[] {
	return [...articles];
}

type PayloadBlock =
	| { blockType: "p" | "h2" | "quote"; text: string }
	| { blockType: "list"; items: Array<{ text: string }> };

function block(b: Block, l: Locale): PayloadBlock {
	return b.type === "list"
		? { blockType: "list", items: b.items.map((i) => ({ text: i[l] })) }
		: { blockType: b.type, text: b.text[l] };
}

/** The Romanian document that creates the draft (shared fields and the `ro` texts). */
export function createData(a: Article): Record<string, unknown> {
	if (!isReadable(a)) {
		// A backlog title: no text yet. A clinical topic, so it is reviewed as health when written.
		return {
			slug: a.slug,
			brand: a.brand,
			topic: a.topic,
			kind: "health",
			backlogNo: a.backlogNo,
			aiDrafted: false,
			provenance: [{ entry: BACKLOG_PROVENANCE }],
			title: a.title.ro,
		};
	}
	const provenance =
		a.status === "draft" && a.provenance.length > 0
			? a.provenance
			: [`${REPO_FILE} (${a.slug}): imported from the repository`];
	return {
		slug: a.slug,
		brand: a.brand,
		topic: a.topic,
		kind: a.kind,
		backlogNo: a.backlogNo,
		aiDrafted: a.aiDrafted,
		provenance: provenance.map((entry) => ({ entry })),
		title: a.title.ro,
		standfirst: a.standfirst.ro,
		body: a.body.map((b) => block(b, "ro")),
		sources: a.sources.map((s) => ({ label: s.label.ro, href: s.href })),
		...(a.status === "published" && a.kind === "editorial" ? { authorTeam: a.author.team.ro } : {}),
	};
}

const Created = z.object({
	body: z
		.array(
			z.object({
				id: z.string(),
				items: z.array(z.object({ id: z.string() })).nullish(),
			}),
		)
		.nullish(),
	sources: z.array(z.object({ id: z.string() })).nullish(),
});

/**
 * The English texts, written onto the rows the Romanian create made: blocks, list items and
 * sources are shared rows with a text per locale, so each English text goes to the same row id.
 */
export function englishData(a: Article, created: unknown): Record<string, unknown> {
	if (!isReadable(a)) return { title: a.title.en };
	const c = Created.parse(created);
	const body = a.body.map((b, i) => {
		const row = c.body?.[i];
		if (row === undefined) throw new Error(`import ${a.slug}: block ${i} missing after create`);
		return b.type === "list"
			? {
					id: row.id,
					blockType: "list",
					items: b.items.map((it, k) => ({ id: row.items?.[k]?.id, text: it.en })),
				}
			: { id: row.id, blockType: b.type, text: b.text.en };
	});
	return {
		title: a.title.en,
		standfirst: a.standfirst.en,
		body,
		sources: a.sources.map((s, i) => ({ id: c.sources?.[i]?.id, label: s.label.en, href: s.href })),
		...(a.status === "published" && a.kind === "editorial" ? { authorTeam: a.author.team.en } : {}),
	};
}
