/**
 * The admin's field labels and the messages the server returns, in both admin languages (Payload
 * picks one per editor). Content locales (ro/en of an article) are a separate axis.
 * Ported from the stopped CMS slice; the workflow messages are new.
 */
export type Label = { ro: string; en: string };

export const L = {
	reviewEvents: {
		singular: { ro: "Eveniment de revizuire", en: "Review event" },
		plural: { ro: "Jurnal editorial", en: "Editorial log" },
	},
	knowledge: {
		singular: { ro: "Intrare de cunoștințe", en: "Knowledge entry" },
		plural: { ro: "Cunoștințe (ghid)", en: "Knowledge (guide)" },
	},
	analytics: {
		singular: { ro: "Contor zilnic", en: "Daily counter" },
		plural: { ro: "Contoare de lectură", en: "Reading counters" },
	},
	brand: { ro: "Brand", en: "Brand" },
	kind: { ro: "Tip", en: "Kind" },
	title: { ro: "Titlu", en: "Title" },
	slug: { ro: "Adresă (slug)", en: "Slug" },
	standfirst: { ro: "Șapou (max. 60 de cuvinte)", en: "Standfirst (≤ 60 words)" },
	body: { ro: "Conținut", en: "Body" },
	cover: { ro: "Imagine de copertă", en: "Cover image" },
	sources: { ro: "Surse", en: "Sources" },
	question: { ro: "Întrebare", en: "Question" },
	answer: { ro: "Răspuns (80–250 de cuvinte)", en: "Answer (80–250 words)" },
	citePath: { ro: "Pagina citată de ghid", en: "Page the guide cites" },
	aiDrafted: { ro: "Scris cu ajutorul AI", en: "Drafted with AI" },
	provenance: { ro: "Proveniența faptelor", en: "Where the facts come from" },
	provenanceEntry: { ro: "Fișier sau sursă", en: "File or source" },
	review: { ro: "Revizuire (pe limbă)", en: "Review (per language)" },
	workflow: { ro: "Flux editorial", en: "Editorial workflow" },
	stage: { ro: "Etapă", en: "Stage" },
	authorUser: { ro: "Scris de", en: "Written by" },
	reviewerPerson: { ro: "Revizor (semnează articolul)", en: "Reviewer (signs the article)" },
	reviewedAt: { ro: "Revizuit la", en: "Reviewed on" },
	publishedAt: { ro: "Publicat la", en: "Published on" },
	user: { ro: "Contul din CMS", en: "CMS account" },
} satisfies Record<string, Label | { singular: Label; plural: Label }>;

/** Validation and refusal messages returned to the editor, in the admin's language. */
export const V = {
	slug: {
		ro: "doar litere mici, cifre și cratime simple",
		en: "lowercase letters, digits and single hyphens only",
	},
	slugReserved: {
		ro: "acest slug este rezervat de rutele blogului",
		en: "this slug is reserved by the blog's routes",
	},
	standfirst: { ro: "șapoul are cel mult 60 de cuvinte", en: "the standfirst is at most 60 words" },
	answerLength: {
		ro: "un răspuns are între 80 și 250 de cuvinte",
		en: "an answer is 80 to 250 words",
	},
	citePath: {
		ro: "o cale din site, de exemplu /copii/autism",
		en: "a site-relative path such as /copii/autism",
	},
	healthSources: {
		ro: "un articol de sănătate are cel puțin o sursă",
		en: "a health article needs at least one source",
	},
	aiProvenance: {
		ro: "un text scris cu AI spune de unde vin faptele (proveniență)",
		en: "an AI-drafted text names where its facts come from (provenance)",
	},
	oneLocale: {
		ro: "salvați o singură limbă odată (?locale=ro sau ?locale=en)",
		en: "save one locale at a time (?locale=ro or ?locale=en)",
	},
	needsBrand: {
		ro: "o intrare are nevoie de un brand înainte de publicare",
		en: "an entry needs a brand before it is published",
	},
	cannotPublish: { ro: "nu se poate publica", en: "cannot publish" },
	notApproved: { ro: "nu este aprobat", en: "not approved" },
	notApprovedClinical: {
		ro: "nu este aprobat de un revizor clinic",
		en: "not approved by a clinical reviewer",
	},
	changedSinceApproval: {
		ro: "textul s-a schimbat după aprobare",
		en: "the text changed after it was approved",
	},
	noLocale: {
		ro: "nicio limbă nu are titlu: nu există ce publica",
		en: "no locale has a title: nothing to publish",
	},
	bothLocales: {
		ro: "blogul publică doar articole scrise în ambele limbi",
		en: "the blog publishes articles written in both languages only",
	},
	missing: { ro: "lipsește", en: "missing" },
	unknownRoute: { ro: "rută de revizuire necunoscută", en: "unknown review route" },
	notReviewed: { ro: "această colecție nu este revizuită", en: "this collection is not reviewed" },
	signIn: { ro: "autentificați-vă mai întâi", en: "sign in first" },
	notesText: { ro: "notele trebuie să fie text", en: "notes must be text" },
	rejectNeedsNotes: {
		ro: "o respingere are nevoie de note pentru autor",
		en: "a rejection needs notes for the author",
	},
	noClinicalReview: {
		ro: "revizuirea clinică pe acest brand nu v-a fost acordată",
		en: "clinical review on this brand is not granted to you",
	},
	noEditorialReview: {
		ro: "aprobarea editorială (publicare) pe acest brand nu v-a fost acordată",
		en: "editorial approval (publish) on this brand is not granted to you",
	},
	noWrite: {
		ro: "scrierea pe acest brand nu v-a fost acordată",
		en: "writing on this brand is not granted to you",
	},
	noPublish: {
		ro: "publicarea pe acest brand nu v-a fost acordată",
		en: "publishing on this brand is not granted to you",
	},
	authorCannotReview: {
		ro: "autorul nu își poate revizui propriul text",
		en: "the author cannot review their own text",
	},
	reviewerProfile: {
		ro: "contul dvs. nu are o fișă în Persoane (nume, calificări): blogul îl semnează cu ea",
		en: "your account has no People profile (name, credentials): the blog signs the article with it",
	},
	notSubmittable: {
		ro: "doar o ciornă sau un text cu modificări cerute se trimite la revizuire",
		en: "only a draft or a text with changes requested goes to review",
	},
	notInReview: {
		ro: "textul nu este trimis la revizuire",
		en: "the text has not been submitted for review",
	},
} satisfies Record<string, Label>;

export type Problem = keyof typeof V;

/** The message for a problem in the editor's admin language (Romanian unless English). */
export function say(problem: Problem, language: string): string {
	return language === "en" ? V[problem].en : V[problem].ro;
}
