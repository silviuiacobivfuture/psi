import type { Passage, Source } from "../contract";

/** A passage as the model sees it: numbered by its source, so `[n]` cites the source. */
export interface NumberedPassage {
	n: number;
	title: string;
	text: string;
}

interface Entry {
	n: number;
	source: Source;
}

const CITATION = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;

/** The source numbers a piece of text cites, in order, as the model wrote them. */
export function citedNumbers(text: string): Array<number> {
	const numbers: Array<number> = [];
	for (const match of text.matchAll(CITATION)) {
		for (const raw of (match[1] ?? "").split(/[,;]/)) numbers.push(Number.parseInt(raw.trim(), 10));
	}
	return numbers;
}

/** Text with its citations removed. */
export function withoutCitations(text: string): string {
	return text.replace(CITATION, " ");
}

/**
 * Every source the model was shown during one answer, numbered in the order it first appeared
 * (passages of the same source share a number), and the order in which the answer cited them.
 * Citations are renumbered to first-citation order, so `[k]` in the emitted text is `sources[k-1]`.
 */
export class SourceLedger {
	readonly #byId = new Map<string, Entry>();
	readonly #byNumber = new Map<number, Entry>();
	readonly #cited: Array<Entry> = [];
	readonly #texts = new Map<number, Array<string>>();

	/** Registers passages and returns them numbered for the model. */
	register(passages: ReadonlyArray<Passage>): ReadonlyArray<NumberedPassage> {
		return passages.map((passage) => {
			let entry = this.#byId.get(passage.source.id);
			if (entry === undefined) {
				entry = { n: this.#byId.size + 1, source: passage.source };
				this.#byId.set(passage.source.id, entry);
				this.#byNumber.set(entry.n, entry);
			}
			const texts = this.#texts.get(entry.n) ?? [];
			texts.push(passage.text);
			this.#texts.set(entry.n, texts);
			return { n: entry.n, title: passage.source.title, text: passage.text };
		});
	}

	/** How many distinct sources the model has seen. */
	get size(): number {
		return this.#byId.size;
	}

	/** Everything the model was shown for source `n`, or undefined when `n` is not a source. */
	passageText(n: number): string | undefined {
		return this.#texts.get(n)?.join("\n");
	}

	/** Every source's passage text by number, for the faithfulness scorer. */
	passageTexts(): Readonly<Record<string, string>> {
		const out: Record<string, string> = {};
		for (const [n, texts] of this.#texts) out[String(n)] = texts.join("\n");
		return out;
	}

	/**
	 * Rewrites the citations in a piece of answer text: known sources become `[k]` in first-citation
	 * order, unknown numbers are dropped.
	 */
	rewriteCitations(text: string): string {
		return text.replace(CITATION, (_match, list: string) =>
			list
				.split(/[,;]/)
				.map((raw) => this.#cite(Number.parseInt(raw.trim(), 10)))
				.filter((k): k is number => k !== undefined)
				.map((k) => `[${k}]`)
				.join(""),
		);
	}

	#cite(n: number): number | undefined {
		const entry = this.#byNumber.get(n);
		if (entry === undefined) return undefined;
		const at = this.#cited.indexOf(entry);
		if (at >= 0) return at + 1;
		this.#cited.push(entry);
		return this.#cited.length;
	}

	/** The sources the answer cited, in citation order (empty when it cited none). */
	citedSources(): ReadonlyArray<Source> {
		return this.#cited.map((entry) => entry.source);
	}
}

/** Renders numbered passages for the model, wrapped so it reads them as data, not instructions. */
export function renderPassages(passages: ReadonlyArray<NumberedPassage>): string {
	const body = passages
		.map((p) => `[${p.n}] ${p.title}\n${p.text.replace(/<\/?passages>/gi, "")}`)
		.join("\n\n");
	return `<passages>\n${body}\n</passages>`;
}
