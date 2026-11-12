/**
 * What extraction hands to chunking: the document's text as sections, each with the title, the
 * anchor and (for a PDF) the page a citation points at. No external service is ever called.
 */
export interface Section {
	/** The heading (or "p. 3" for a PDF page); empty for text before the first heading. */
	title: string;
	/** A citation anchor: a heading slug, or `page=3` for a PDF. */
	anchor: string;
	/** The 1-based PDF page, when the section is one. */
	page?: number;
	/** Normalised text (markdown-ish: headings below the section's own, lists, paragraphs). */
	text: string;
}

export interface Extracted {
	sections: Section[];
	/** Characters of text over all sections. */
	chars: number;
}

/** The formats a source can be: an upload's, or a fetched page (`html`). */
export const FORMATS = ["pdf", "docx", "markdown", "text", "html", "csv"] as const;
export type Format = (typeof FORMATS)[number];

/** Hard limits: a file over MAX_BYTES or text over MAX_CHARS is refused with a clear error. */
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_CHARS = 500_000;

export type ExtractProblem = "too_large" | "too_long" | "unsupported" | "empty" | "unreadable";

/** Why a source could not be extracted; `message` names the limit or the cause, never content. */
export class ExtractError extends Error {
	readonly problem: ExtractProblem;
	constructor(problem: ExtractProblem, message: string) {
		super(message);
		this.name = "ExtractError";
		this.problem = problem;
	}
}
