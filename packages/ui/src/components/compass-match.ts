export interface CompassItem {
	label: string;
	href: string;
	hint?: string;
	/** Extra words the destination answers to, besides the words of its label. */
	keywords?: ReadonlyArray<string>;
}

export interface CompassGroup {
	label: string;
	items: ReadonlyArray<CompassItem>;
}

/*
 * How the compass's field finds destinations: every typed word (two characters or more, folded)
 * must start a word of the destination's label or keywords. The same rule ships twice, as
 * TypeScript (tests, apps) and as the Datastar expressions the browser runs; a test evaluates the
 * expressions against the functions.
 */

/** What "Administrare" answers to: nothing else ever lists it. */
export const STAFF_KEYWORDS: ReadonlyArray<string> = [
	"admin",
	"administrare",
	"panou",
	"control",
];

/** Folds case and Romanian diacritics, so "integrare" finds "Integrare senzorială" and "adulti" finds "Adulți". */
export function fold(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The shortest query word that counts: "a", "o", "e" never pick a destination. */
const MIN_WORD = 2;

/** The query's words, folded: letters and digits only, each at least two characters. */
export function queryWords(query: string): ReadonlyArray<string> {
	return fold(query)
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= MIN_WORD);
}

/** The words a destination answers to: its label's and its keywords', folded. */
export function destinationWords(
	item: Pick<CompassItem, "label" | "keywords">,
): ReadonlyArray<string> {
	const words = [item.label, ...(item.keywords ?? [])].flatMap((t) =>
		fold(t).split(/[^a-z0-9]+/),
	);
	return [...new Set(words.filter((w) => w.length > 0))];
}

/**
 * Whether a typed query lists a destination: every query word must start a word of the
 * destination (so "ce zici" never finds "Administrare"). An empty field lists everything; a field
 * with no word of two characters lists nothing.
 */
export function matchesDestination(
	query: string,
	words: ReadonlyArray<string>,
): boolean {
	const q = queryWords(query);
	if (q.length === 0) return query.trim() === "";
	return q.every((w) => words.some((k) => k.startsWith(w)));
}

/** `queryWords`, as a Datastar expression over the typed field (the same folding and split). */
const QUERY_WORDS = `$compassQuery.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim().split(/[^a-z0-9]+/).filter((w) => w.length >= ${MIN_WORD})`;

/** `matchesDestination`, as a Datastar expression (kept in step by a test that evaluates it). */
export function matchExpression(words: ReadonlyArray<string>): string {
	return `((q) => q.length === 0 ? $compassQuery.trim() === '' : q.every((w) => ${JSON.stringify(words)}.some((k) => k.startsWith(w))))(${QUERY_WORDS})`;
}

export function matches(item: CompassItem): string {
	return matchExpression(destinationWords(item));
}

/**
 * The staff group arrives later, as plain HTML (a `@get` once the sheet opens), so Datastar has no
 * expression on it: this filters it with the same rule, against `STAFF_KEYWORDS` only, whenever the
 * query changes or the group lands.
 */
export function staffFilter(keywords: ReadonlyArray<string>): string {
	return [
		`el.psiFilter = () => { const raw = el.closest('.pz-compass')?.querySelector('.pz-compass__input')?.value ?? ''; const q = raw.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim().split(/[^a-z0-9]+/).filter((w) => w.length >= ${MIN_WORD}); const ok = q.length === 0 ? raw.trim() === '' : q.every((w) => ${JSON.stringify(keywords)}.some((k) => k.startsWith(w))); el.querySelectorAll('.pz-compass__item, .pz-compass__group').forEach((n) => { n.style.display = ok ? '' : 'none' }) }`,
		"new MutationObserver((records) => { if (records.some((r) => r.type === 'childList')) el.psiFilter() }).observe(el, { childList: true, subtree: true })",
		"el.psiFilter()",
	].join("; ");
}
