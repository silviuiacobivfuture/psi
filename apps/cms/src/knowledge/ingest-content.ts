import type { KnowledgeEntryInput } from "@psi/knowledge";
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from "payload";
import { z } from "zod";
import type { Brand } from "../authz/types";
import { keepingLocale } from "../review/locale-safe";
import { LOCALES, type Locale } from "../review/spec";
import { IndexNotConfigured, sourceIndex } from "./ingest-store";
import { brandSettings } from "./source-ports";

/**
 * The CMS's own published content in the guide's index, through the same pipeline as uploaded
 * sources (the brand's embedder, the lexical fall-back): an article becomes one entry per locale
 * (its standfirst and body, cited by its blog page, kept in its brand's index and the blog's), an
 * offering one short factual entry per locale (what it is and its price). Publishing indexes;
 * unpublishing or deleting removes. A failure is logged and never blocks the editor's save.
 */
const BLOG_ORIGIN = (process.env.BLOG_PUBLIC_URL ?? "https://blog.psizone.ro").replace(/\/$/, "");

const Loc = z.object({ ro: z.string().nullish(), en: z.string().nullish() }).partial().nullish();
const pick = (l: z.infer<typeof Loc>, locale: Locale): string | undefined => {
	const v = l?.[locale]?.trim();
	return v === undefined || v === "" ? undefined : v;
};
/** The heading the questions sit under in the indexed text. */
const FAQ_HEADING: Readonly<Record<Locale, string>> = {
	ro: "Întrebări frecvente",
	en: "Frequently asked questions",
};
const Person = z.object({ name: z.string() }).passthrough();

const ArticleDoc = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	slug: z.string().nullish(),
	brand: z.enum(["psizone", "eqsync", "hemisync"]),
	topic: z.string().nullish(),
	kind: z.enum(["health", "editorial"]).nullish(),
	title: Loc,
	standfirst: Loc,
	body: z
		.array(
			z
				.object({
					blockType: z.string(),
					text: Loc,
					items: z.array(z.object({ text: Loc })).nullish(),
				})
				.passthrough(),
		)
		.nullish(),
	faq: z.array(z.object({ q: Loc, a: Loc })).nullish(),
	reviewer: z.union([Person, z.number(), z.string()]).nullish(),
	reviewedAt: z.string().nullish(),
	_status: z.enum(["draft", "published"]).nullish(),
});

export function articleIds(id: string): string[] {
	return LOCALES.flatMap((l) => [`cms.ar.${id}.${l}`, `cms.ar.${id}.${l}.blog`]);
}

/** A published article (fetched with `locale: "all"`, depth 1) as entries; drafts give none. */
export function articleEntries(raw: unknown): KnowledgeEntryInput[] {
	const a = ArticleDoc.parse(raw);
	if (a._status !== "published" || !a.slug) return [];
	const reviewer = typeof a.reviewer === "object" && a.reviewer !== null ? a.reviewer.name : null;
	const health = a.kind === "health";
	return LOCALES.flatMap((locale): KnowledgeEntryInput[] => {
		const title = pick(a.title, locale);
		if (title === undefined) return [];
		const lines = [pick(a.standfirst, locale) ?? ""];
		for (const b of a.body ?? []) {
			const t = pick(b.text, locale);
			if (b.blockType === "h2" && t) lines.push(`## ${t}`);
			else if (b.blockType === "quote" && t) lines.push(`> ${t}`);
			else if (b.blockType === "list") {
				lines.push(
					(b.items ?? [])
						.flatMap((i) => (pick(i.text, locale) ? [`- ${pick(i.text, locale)}`] : []))
						.join("\n"),
				);
			} else if (t) lines.push(t);
		}
		const questions = (a.faq ?? []).flatMap((f) => {
			const q = pick(f.q, locale);
			const answer = pick(f.a, locale);
			return q && answer ? [`${q}\n${answer}`] : [];
		});
		if (questions.length > 0) lines.push(`## ${FAQ_HEADING[locale]}`, ...questions);
		const body = lines.filter((l) => l.trim() !== "").join("\n\n");
		if (body === "") return [];
		const url = `${BLOG_ORIGIN}${locale === "ro" ? `/articole/${a.slug}` : `/en/articles/${a.slug}`}`;
		const base = {
			locale,
			kind: health ? ("clinical" as const) : ("editorial" as const),
			title,
			url,
			body,
			status: "published" as const,
			// A health article is published only after its clinical review: its stamp travels along.
			reviewedBy: health ? reviewer : null,
			reviewedAt: health ? (a.reviewedAt ?? null) : null,
			...(a.topic ? { hub: a.topic } : {}),
		};
		return [
			{ ...base, id: `cms.ar.${a.id}.${locale}`, brand: a.brand },
			{ ...base, id: `cms.ar.${a.id}.${locale}.blog`, brand: "blog" },
		];
	});
}

const OfferingDoc = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	brand: z.enum(["psizone", "eqsync", "hemisync", "blog"]),
	kind: z.string().nullish(),
	title: Loc,
	summary: Loc,
	priceNote: Loc,
	price: z
		.object({
			mode: z.string().nullish(),
			amount: z.number().nullish(),
			from: z.number().nullish(),
			to: z.number().nullish(),
			currency: z.string().nullish(),
		})
		.nullish(),
	demo: z.boolean().nullish(),
	_status: z.enum(["draft", "published"]).nullish(),
});

export function offeringIds(id: string): string[] {
	return LOCALES.map((l) => `cms.of.${id}.${l}`);
}

const PRICE_WORDS: Readonly<Record<Locale, { price: string; from: string; onRequest: string }>> = {
	ro: { price: "Preț", from: "de la", onRequest: "la cerere" },
	en: { price: "Price", from: "from", onRequest: "on request" },
};

function priceLine(p: z.infer<typeof OfferingDoc>["price"], locale: Locale): string | null {
	const w = PRICE_WORDS[locale];
	const c = p?.currency ?? "RON";
	if (p?.mode === "fixed" && p.amount) return `${w.price}: ${p.amount} ${c}.`;
	if (p?.mode === "range" && p.from && p.to) return `${w.price}: ${p.from}–${p.to} ${c}.`;
	if (p?.mode === "from" && p.from) return `${w.price}: ${w.from} ${p.from} ${c}.`;
	if (p?.mode === "on_request") return `${w.price}: ${w.onRequest}.`;
	return null;
}

/** A published offering as one short factual entry per locale; demo offerings are never indexed. */
export function offeringEntries(raw: unknown): KnowledgeEntryInput[] {
	const o = OfferingDoc.parse(raw);
	if (o._status !== "published" || o.demo === true) return [];
	return LOCALES.flatMap((locale): KnowledgeEntryInput[] => {
		const title = pick(o.title, locale);
		if (title === undefined) return [];
		const body = [pick(o.summary, locale), priceLine(o.price, locale), pick(o.priceNote, locale)]
			.filter((x): x is string => x !== undefined && x !== null)
			.join(" ");
		if (body === "") return [];
		return [
			{
				id: `cms.of.${o.id}.${locale}`,
				brand: o.brand,
				locale,
				kind: o.kind === "service" ? "operational" : "programme",
				title,
				url: locale === "ro" ? "/contact" : "/en/contact",
				body: `${title}. ${body}`,
				status: "published",
				reviewedBy: null,
				reviewedAt: null,
			},
		];
	});
}

type Collection = "articles" | "offerings";
const PLAN: Readonly<
	Record<
		Collection,
		{ entries: (raw: unknown) => KnowledgeEntryInput[]; ids: (id: string) => string[] }
	>
> = {
	articles: { entries: articleEntries, ids: articleIds },
	offerings: { entries: offeringEntries, ids: offeringIds },
};

const Id = z.object({ id: z.union([z.string(), z.number()]).transform(String) });

/** Removes every id, then indexes what is published, per brand (each with its own settings). */
async function apply(
	req: PayloadRequest,
	ids: string[],
	entries: KnowledgeEntryInput[],
): Promise<void> {
	const brands = new Set<Brand>(entries.map((e) => e.brand));
	const first = entries[0]?.brand ?? "psizone";
	const remover = await sourceIndex(first, await brandSettings(req.payload, first));
	const keep = new Set(entries.map((e) => e.id));
	const gone = ids.filter((i) => !keep.has(i));
	if (gone.length > 0) await remover.remove(gone);
	for (const brand of brands) {
		const index = await sourceIndex(brand, await brandSettings(req.payload, brand));
		const out = await index.ingest(entries.filter((e) => e.brand === brand));
		req.payload.logger.info(
			{
				brand,
				entries: out.report.indexed.length,
				lexical: out.lexical,
				skipped: out.report.skipped,
			},
			"knowledge: content indexed",
		);
	}
}

/** The afterChange hook for `articles` or `offerings`. */
export function indexContent(collection: Collection): CollectionAfterChangeHook {
	return async ({ doc, req }) => {
		const { id } = Id.parse(doc);
		try {
			const found = await keepingLocale(req, () =>
				req.payload.find({
					collection,
					where: { id: { equals: id } },
					locale: "all",
					draft: false,
					depth: 1,
					limit: 1,
					overrideAccess: true,
					req,
				}),
			);
			const entries = found.docs[0] === undefined ? [] : PLAN[collection].entries(found.docs[0]);
			await apply(req, PLAN[collection].ids(id), entries);
		} catch (err) {
			if (err instanceof IndexNotConfigured)
				req.payload.logger.info({ id }, `knowledge: ${err.message}`);
			else req.payload.logger.error({ err, id, collection }, "knowledge: content indexing failed");
		}
		return doc;
	};
}

export function unindexContent(collection: Collection): CollectionAfterDeleteHook {
	return async ({ id, req }) => {
		try {
			await apply(req, PLAN[collection].ids(String(id)), []);
		} catch (err) {
			if (!(err instanceof IndexNotConfigured)) {
				req.payload.logger.error({ err, id, collection }, "knowledge: content removal failed");
			}
		}
	};
}
