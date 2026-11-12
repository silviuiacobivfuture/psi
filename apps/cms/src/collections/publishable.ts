import { z } from "zod";

/** The parts of an article (one locale) the publishing rule reads. */
export interface ArticleDraft {
	kind?: "editorial" | "health" | null;
	standfirst?: string | null;
	body?: ReadonlyArray<unknown> | null;
	sources?: ReadonlyArray<unknown> | null;
	authorTeam?: string | null;
	author?: unknown;
	reviewer?: unknown;
	reviewedAt?: string | null;
	aiDrafted?: boolean | null;
	provenance?: ReadonlyArray<unknown> | null;
}

const present = (v: unknown): boolean =>
	v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

/**
 * What an article still lacks before it may be published (the blog's rule, @psi/content's
 * schema): every published article has a standfirst and a body; a health article also a named
 * author, a clinical reviewer with the review's date (both set by the reviewer's approval, never
 * typed in) and at least one source; an editorial one is signed by the team; an AI-drafted one
 * names its provenance. Returns the missing fields' names; empty = publishable. The publication
 * date is stamped on first publication.
 */
export function missingForPublish(a: ArticleDraft): string[] {
	const out: string[] = [];
	if (!present(a.kind)) out.push("kind");
	if (!present(a.standfirst)) out.push("standfirst");
	if (!a.body || a.body.length === 0) out.push("body");
	if (a.kind === "health") {
		if (!present(a.author)) out.push("author");
		if (!present(a.reviewer)) out.push("reviewer");
		if (!present(a.reviewedAt)) out.push("reviewedAt");
		if (!a.sources || a.sources.length === 0) out.push("sources");
	}
	if (a.kind === "editorial" && !present(a.authorTeam)) out.push("authorTeam");
	if (a.aiDrafted === true && (!a.provenance || a.provenance.length === 0)) out.push("provenance");
	return out;
}

const Draft = z
	.object({
		kind: z.enum(["editorial", "health"]).nullish(),
		standfirst: z.string().nullish(),
		body: z.array(z.unknown()).nullish(),
		sources: z.array(z.unknown()).nullish(),
		authorTeam: z.string().nullish(),
		author: z.unknown(),
		reviewer: z.unknown(),
		reviewedAt: z.string().nullish(),
		aiDrafted: z.boolean().nullish(),
		provenance: z.array(z.unknown()).nullish(),
	})
	.passthrough();

/** A stored single-locale document as the rule reads it; anything malformed lacks everything. */
export function asArticleDraft(doc: unknown): ArticleDraft {
	const r = Draft.safeParse(doc);
	return r.success ? r.data : {};
}
