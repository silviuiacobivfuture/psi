import type { Passage, Source } from "./contract";

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

/**
 * Every source the model was shown during one `ask`, numbered in the order it first appeared
 * (passages of the same source share a number), and the order in which the answer cited them.
 * Citations are renumbered to first-citation order, so `[k]` in the emitted text is `sources[k-1]`.
 */
export class SourceLedger {
	readonly #byId = new Map<string, Entry>();
	readonly #byNumber = new Map<number, Entry>();
	readonly #cited: Array<Entry> = [];
	readonly #texts: Array<string> = [];

	/** Registers passages and returns them numbered for the model. */
	register(passages: ReadonlyArray<Passage>): ReadonlyArray<NumberedPassage> {
		return passages.map((passage) => {
			let entry = this.#byId.get(passage.source.id);
			if (entry === undefined) {
				entry = { n: this.#byId.size + 1, source: passage.source };
				this.#byId.set(passage.source.id, entry);
				this.#byNumber.set(entry.n, entry);
			}
			this.#texts.push(passage.text);
			return { n: entry.n, title: passage.source.title, text: passage.text };
		});
	}

	/** How many distinct sources the model has seen. */
	get size(): number {
		return this.#byId.size;
	}

	/** Every passage text shown to the model, for checking that figures come from the content. */
	get corpus(): string {
		return this.#texts.join("\n");
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
