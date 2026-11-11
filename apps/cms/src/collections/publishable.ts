/** The parts of an article the publishing rule reads. */
export interface ArticleDraft {
	status?: "in-review" | "published" | null;
	kind?: "editorial" | "health" | null;
	standfirst?: string | null;
	publishedAt?: string | null;
	body?: ReadonlyArray<unknown> | null;
	sources?: ReadonlyArray<unknown> | null;
	authorTeam?: string | null;
	author?: unknown;
	reviewer?: unknown;
	reviewedAt?: string | null;
}

const present = (v: unknown): boolean =>
	v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

/**
 * What a draft still lacks before it may be published (the blog's rule): every published article
 * has a standfirst, a date and a body; a health article also a named author, a clinical reviewer
 * with the review's date, and at least one source; an editorial one is signed by the team.
 * An article in review may lack all of it. Returns the missing fields' names; empty = publishable.
 */
export function missingForPublish(a: ArticleDraft): string[] {
	if (a.status !== "published") return [];
	const out: string[] = [];
	if (!present(a.kind)) out.push("kind");
	if (!present(a.standfirst)) out.push("standfirst");
	if (!present(a.publishedAt)) out.push("publishedAt");
	if (!a.body || a.body.length === 0) out.push("body");
	if (a.kind === "health") {
		if (!present(a.author)) out.push("author");
		if (!present(a.reviewer)) out.push("reviewer");
		if (!present(a.reviewedAt)) out.push("reviewedAt");
		if (!a.sources || a.sources.length === 0) out.push("sources");
	}
	if (a.kind === "editorial" && !present(a.authorTeam)) out.push("authorTeam");
	return out;
}
