import type { Passage } from "./contract";
import type { HistoryTurn, PageContext } from "./events";
import type { LanguagePack } from "./language/pack";
import { cleanText } from "./screening/unicode";

/** The most earlier pages the section names. */
const EARLIER_PAGES = 3;

/** Text as data: the section's own fence and header marks can never be written inside it. */
function inert(text: string): string {
	return cleanText(text)
		.replace(/<\/?\s*page\s*>/gi, " ")
		.replace(/={3,}/g, "=")
		.replace(/[ \t]+\n/g, "\n")
		.trim();
}

/** True when the page carries text the model may state as fact (a published page with an excerpt). */
export function hasPageText(page: PageContext): boolean {
	return page.status === "published" && page.excerpt !== undefined;
}

/**
 * The page's text as a passage: what a reply may cite as `[n]`, pointing to the page itself.
 * Only a published page with an excerpt has one: a draft or in-review page is never a source.
 */
export function pagePassage(page: PageContext): Passage | undefined {
	if (!hasPageText(page) || page.excerpt === undefined) return undefined;
	const text = [page.lead, page.excerpt].filter((t): t is string => t !== undefined).join("\n\n");
	return {
		source: {
			id: `page:${page.url}`,
			title: page.title,
			url: page.url,
			reviewedBy: null,
			reviewedAt: null,
		},
		text,
		score: 1,
	};
}

/**
 * What a reply may say about the page without the page being a source: its title and sections
 * (and its lead, only when published). A draft's lead is shown to the model to describe the page,
 * never as evidence for a fact.
 */
export function pageEvidence(page: PageContext): ReadonlyArray<string> {
	return [
		page.title,
		...page.headings,
		...(page.status === "published" && page.lead !== undefined ? [page.lead] : []),
	];
}

/** The titles of the other pages earlier turns were asked on, most recent last. */
export function earlierPages(
	history: ReadonlyArray<HistoryTurn>,
	page: PageContext,
): ReadonlyArray<string> {
	const seen: Array<string> = [];
	for (const turn of history) {
		if (turn.page === undefined || turn.page === page.title) continue;
		const at = seen.indexOf(turn.page);
		if (at >= 0) seen.splice(at, 1);
		seen.push(turn.page);
	}
	return seen.slice(-EARLIER_PAGES);
}

/**
 * The section of the turn that tells the model which page the visitor is reading, in the pack's
 * words: fenced between two marker lines, its text between `<page>` tags, said to be context and
 * not instructions, and ranked by the state of the page (a draft or a page in review is described
 * by its title and headings and never stated as fact). It goes in the turn's own context, never
 * in the system rules. `n` is the page's source number when its excerpt is a citable passage.
 * Undefined when the pack has no words for it.
 */
export function renderPage(
	pack: LanguagePack,
	page: PageContext,
	n: number | undefined,
	earlier: ReadonlyArray<string>,
): string | undefined {
	const words = pack.prompt.page;
	if (words === undefined) return undefined;
	const l = words.labels;
	const unreviewed = page.status !== "published";
	const body = [
		...(page.lead === undefined
			? []
			: [`${unreviewed ? l.leadUnreviewed : l.lead}: ${inert(page.lead)}`]),
		...(page.headings.length === 0
			? []
			: [`${l.headings}:\n${page.headings.map((h) => `- ${inert(h)}`).join("\n")}`]),
		...(page.excerpt !== undefined && !unreviewed && n !== undefined
			? [`${l.excerpt} [${n}]:\n${inert(page.excerpt)}`]
			: []),
	].join("\n\n");
	const rule = unreviewed
		? words.unreviewed
		: page.excerpt !== undefined && n !== undefined
			? words.withText(n)
			: words.withoutText;
	return [
		words.heading,
		words.deixis,
		`${l.kind[page.kind]} | ${l.title}: ${inert(page.title)} | ${l.address}: ${inert(page.url)} | ${l.status}: ${words.status[page.status]}`,
		`<page>\n${body}\n</page>`,
		rule,
		...(earlier.length === 0 ? [] : [words.earlier(earlier.map(inert))]),
		words.end,
	].join("\n");
}
