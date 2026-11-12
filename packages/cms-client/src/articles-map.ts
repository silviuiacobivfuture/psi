import { Article, type Block, type Cover, type Faq, Seo, Slug } from "@psi/content";
import { z } from "zod";

/**
 * The CMS's articles as Payload's REST API answers them (`locale=all`, `depth=1`), mapped onto
 * this package's `Article`. The zod schema below is deliberately loose (Payload's shape); the
 * contract is `Article` itself: whatever does not parse as an `Article` is dropped, with a reason,
 * and never reaches a page.
 */

const Text = z.string().nullish();
/** A localised field under `locale=all`: one key per locale that has a value. */
const Loc = z.object({ ro: Text, en: Text }).partial().nullish();

const Person = z.object({ name: z.string(), credentials: Loc });
const Media = z.object({
	url: z.string().nullish(),
	alt: Loc,
	width: z.number().nullish(),
	height: z.number().nullish(),
});

const PayloadBlock = z.discriminatedUnion("blockType", [
	z.object({ blockType: z.literal("p"), text: Loc }),
	z.object({ blockType: z.literal("h2"), text: Loc }),
	z.object({ blockType: z.literal("quote"), text: Loc }),
	z.object({
		blockType: z.literal("list"),
		items: z.array(z.object({ text: Loc })).nullish(),
	}),
]);

const Keywords = z
	.object({
		ro: z.array(z.object({ keyword: Text })).nullish(),
		en: z.array(z.object({ keyword: Text })).nullish(),
	})
	.partial()
	.nullish();

export const PayloadArticle = z.object({
	id: z.union([z.number(), z.string()]),
	slug: z.string(),
	brand: z.string(),
	topic: z.string(),
	kind: z.enum(["health", "editorial"]).nullish(),
	backlogNo: z.number().nullish(),
	aiDrafted: z.boolean().nullish(),
	provenance: z.array(z.object({ entry: z.string().nullish() })).nullish(),
	title: Loc,
	standfirst: Loc,
	body: z.array(PayloadBlock).nullish(),
	sources: z.array(z.object({ label: Loc, href: z.string().nullish() })).nullish(),
	seo: z.object({ title: Loc, description: Loc, keywords: Keywords }).nullish(),
	faq: z.array(z.object({ q: Loc, a: Loc })).nullish(),
	related: z.array(z.object({ slug: Text })).nullish(),
	cover: z.union([Media, z.number(), z.string()]).nullish(),
	authorTeam: Loc,
	author: z.union([Person, z.number(), z.string()]).nullish(),
	reviewer: z.union([Person, z.number(), z.string()]).nullish(),
	reviewedAt: z.string().nullish(),
	publishedAt: z.string().nullish(),
	createdAt: z.string(),
	_status: z.enum(["draft", "published"]).nullish(),
});
export type PayloadArticle = z.infer<typeof PayloadArticle>;

/** `{ro, en}` when both locales are written; otherwise undefined (the article is dropped). */
function both(l: z.infer<typeof Loc>): { ro: string; en: string } | undefined {
	const ro = l?.ro?.trim();
	const en = l?.en?.trim();
	return ro && en ? { ro, en } : undefined;
}

/** "2026-11-12" from Payload's ISO timestamp. */
function day(iso: string | null | undefined): string | undefined {
	return iso === null || iso === undefined ? undefined : iso.slice(0, 10);
}

function block(b: z.infer<typeof PayloadBlock>): Block | undefined {
	if (b.blockType === "list") {
		const items = (b.items ?? []).map((i) => both(i.text));
		return items.length > 0 && items.every((i) => i !== undefined)
			? { type: "list", items: items.filter((i) => i !== undefined) }
			: undefined;
	}
	const text = both(b.text);
	return text === undefined ? undefined : { type: b.blockType, text };
}

function keywords(k: z.infer<typeof Keywords>, l: "ro" | "en"): string[] {
	return (k?.[l] ?? []).flatMap((x) => (x.keyword?.trim() ? [x.keyword.trim()] : []));
}

/** The SEO block when it is complete and within the blog's limits; otherwise none (the article stays). */
function seo(s: PayloadArticle["seo"]): Seo | null {
	if (s === null || s === undefined) return null;
	const parsed = Seo.safeParse({
		title: both(s.title),
		description: both(s.description),
		keywords: { ro: keywords(s.keywords, "ro"), en: keywords(s.keywords, "en") },
	});
	return parsed.success ? parsed.data : null;
}

/** The questions with both locales written, at most the blog's ten. */
function faq(rows: PayloadArticle["faq"]): Faq[] {
	return (rows ?? [])
		.flatMap((r) => {
			const q = both(r.q);
			const a = both(r.a);
			return q && a ? [{ q, a }] : [];
		})
		.slice(0, 10);
}

/** Valid slugs only, once each, at most the blog's eight. */
function related(rows: PayloadArticle["related"]): string[] {
	const slugs = (rows ?? []).flatMap((r) => {
		const p = Slug.safeParse(r.slug?.trim());
		return p.success ? [p.data] : [];
	});
	return [...new Set(slugs)].slice(0, 8);
}

function person(p: PayloadArticle["author"]): { name: string; credentials: unknown } | null {
	return typeof p === "object" && p !== null
		? { name: p.name, credentials: both(p.credentials) }
		: null;
}

function absolute(url: string, cmsUrl: string): string {
	return url.startsWith("http://") || url.startsWith("https://") ? url : `${cmsUrl}${url}`;
}

function cover(c: PayloadArticle["cover"], cmsUrl: string): Cover | null {
	if (typeof c !== "object" || c === null || !c.url) return null;
	const alt = both(c.alt);
	if (alt === undefined) return null;
	return { src: absolute(c.url, cmsUrl), alt, width: c.width ?? null, height: c.height ?? null };
}

/**
 * What the CMS document becomes for the blog. Unpublished documents become `draft` (written) or
 * `in-review` (a title only): the CMS's own workflow stages (in review, approved) are editorial
 * states, and on the blog every unpublished text is a draft, shown only where drafts may be.
 */
export function toArticleInput(doc: PayloadArticle, cmsUrl: string): unknown {
	const base = {
		slug: doc.slug,
		brand: doc.brand,
		topic: doc.topic,
		title: both(doc.title),
		backlogNo: doc.backlogNo ?? null,
		aiDrafted: doc.aiDrafted ?? false,
	};
	const blocks = (doc.body ?? []).map(block);
	const body = blocks.every((b) => b !== undefined) ? blocks : [];
	const sources = (doc.sources ?? []).map((s) => ({ label: both(s.label), href: s.href }));
	const readable = {
		standfirst: both(doc.standfirst),
		body,
		sources,
		cover: cover(doc.cover, cmsUrl),
		seo: seo(doc.seo),
		faq: faq(doc.faq),
		related: related(doc.related),
	};
	if (doc._status === "published") {
		const kind = doc.kind ?? "health";
		const team = both(doc.authorTeam);
		return {
			...base,
			...readable,
			status: "published",
			kind,
			publishedAt: day(doc.publishedAt),
			author: kind === "editorial" ? (team === undefined ? null : { team }) : person(doc.author),
			reviewer:
				kind === "editorial" ? null : { ...person(doc.reviewer), reviewedAt: day(doc.reviewedAt) },
		};
	}
	if (body.length === 0) return { ...base, status: "in-review", author: null, reviewer: null };
	return {
		...base,
		...readable,
		status: "draft",
		kind: doc.kind ?? "health",
		draftedAt: day(doc.createdAt),
		provenance: (doc.provenance ?? []).flatMap((p) => (p.entry?.trim() ? [p.entry.trim()] : [])),
		author: null,
		reviewer: null,
	};
}

export type Mapped = { ok: true; article: Article } | { ok: false; id: string; reason: string };

/** One raw REST document to an `Article`, or the reason it cannot be shown. */
export function articleFromPayload(raw: unknown, cmsUrl: string): Mapped {
	const doc = PayloadArticle.safeParse(raw);
	const id = z.object({ id: z.unknown() }).safeParse(raw);
	const label = String(id.success ? id.data.id : "?");
	if (!doc.success) return { ok: false, id: label, reason: summarize(doc.error) };
	const article = Article.safeParse(toArticleInput(doc.data, cmsUrl));
	return article.success
		? { ok: true, article: article.data }
		: { ok: false, id: label, reason: summarize(article.error) };
}

/**
 * A zod error in one line, field paths only: never the content itself. For the article union, the
 * branch that matched the document's status and kind is the one that explains the failure.
 */
function issuesOf(e: z.ZodError): z.ZodIssue[] {
	return e.issues.flatMap((i) => {
		if (i.code !== "invalid_union") return [i];
		const branches = i.unionErrors.map((u) => issuesOf(u));
		const matching = branches.filter((b) =>
			b.every(
				(x) => !(x.code === "invalid_literal" && ["status", "kind"].includes(String(x.path[0]))),
			),
		);
		return (matching.length > 0 ? matching : branches).flat();
	});
}

function summarize(e: z.ZodError): string {
	const paths = [...new Set(issuesOf(e).map((i) => i.path.join(".") || i.message))];
	return paths.slice(0, 6).join(", ");
}
