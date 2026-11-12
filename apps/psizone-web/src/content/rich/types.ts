import type { Localised } from "../localised";

/** What a section of a rich page is for; tests and the page rely on `not-for` being present. */
export type RichKind =
	| "what"
	| "session"
	| "measured"
	| "for"
	| "not-for"
	| "duration"
	| "where"
	| "more";

/** A photograph from the old psizone.ro (public/images/old-site), shown under a section's text. */
export interface RichPhoto {
	/** Site path, e.g. `/images/old-site/qeeg-room-cap.webp`. */
	src: string;
	/** The file's exact size, so the box is reserved before it loads. */
	width: number;
	height: number;
	alt: Localised;
}

export interface RichSection {
	kind: RichKind;
	/** Anchor id, Romanian-ASCII, unique on the page. */
	id: string;
	/** The h2; question-phrased where natural. */
	h2: Localised;
	/** Plain-text paragraphs (2–5 sentences each). No HTML, no markdown. */
	paras: ReadonlyArray<Localised>;
	/** Optional bullet or numbered list after the paragraphs. */
	list?: ReadonlyArray<Localised>;
	/** `ol` for steps in order; default `ul`. */
	ordered?: boolean;
	/** Optional photograph after the text. */
	photo?: RichPhoto;
}

export interface RichFaq {
	q: Localised;
	/** Plain text, one to four sentences; also used verbatim in the FAQPage JSON-LD. */
	a: Localised;
}

/**
 * DRAFT — a method or hub page written by an AI from the old psizone.ro pages (read 2026-11-12)
 * and the repo's brand docs; clinical review pending (shown by the review badge). Each content file
 * states its sources in a header comment.
 */
export interface RichPage {
	/** `<title>` without the " — Psizone" suffix; <= 52 characters; "Galați" where natural. */
	seoTitle: Localised;
	/** Meta description, 120–160 characters. */
	seoDescription: Localised;
	/** The sub-heading under the h1: answers the page's question in one or two sentences. */
	lead: Localised;
	/** In reading order; must include one `not-for` section. */
	sections: ReadonlyArray<RichSection>;
	/** 5–8 questions. Do not use the word "cost" or prices. */
	faq: ReadonlyArray<RichFaq>;
	/** Internal links shown under "Citește mai departe" (methods, hubs, articles). */
	links: ReadonlyArray<{ label: Localised; href: string }>;
	/** The single next step, sentence before the booking button. */
	nextStep: Localised;
	/** schema.org type of the described thing: a procedure, or nothing (wellness tool, hub). */
	procedure?: { type: "DiagnosticProcedure" | "TherapeuticProcedure" | "PsychologicalTreatment" };
}
