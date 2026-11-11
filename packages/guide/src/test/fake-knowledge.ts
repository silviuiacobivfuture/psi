import type { Brand, Knowledge, Locale, Passage, Source } from "../contract";

/**
 * An in-memory `Knowledge` (the contract `@psi/knowledge` implements), returning scripted passages
 * and recording every search.
 */
export interface SearchCall {
	query: string;
	brand: Brand;
	locale: Locale;
	topK: number | undefined;
}

export type SearchBehaviour =
	| { kind: "passages"; passages: ReadonlyArray<Passage> }
	| { kind: "throw" }
	| { kind: "hang" };

export class FakeKnowledge implements Knowledge {
	readonly calls: Array<SearchCall> = [];
	readonly #script: ReadonlyArray<SearchBehaviour>;

	constructor(script: ReadonlyArray<SearchBehaviour>) {
		this.#script = script;
	}

	search(q: {
		query: string;
		brand: Brand;
		locale: Locale;
		topK?: number;
	}): Promise<ReadonlyArray<Passage>> {
		this.calls.push({ query: q.query, brand: q.brand, locale: q.locale, topK: q.topK });
		const step = this.#script[Math.min(this.calls.length, this.#script.length) - 1];
		if (step === undefined || step.kind === "throw") {
			return Promise.reject(new Error("index unavailable"));
		}
		if (step.kind === "hang") return new Promise<ReadonlyArray<Passage>>(() => undefined);
		return Promise.resolve(step.passages);
	}
}

export function source(id: string, title: string): Source {
	return {
		id,
		title,
		url: `https://psizone.ro/${id}`,
		reviewedBy: "Dr. Ana Popescu",
		reviewedAt: "2026-05-04",
	};
}

export function passage(src: Source, text: string, score = 0.8): Passage {
	return { source: src, text, score };
}

export const EVALUATION = source("evaluare", "Cum decurge o evaluare");
export const ABA = source("aba", "Terapia ABA");
export const QEEG = source("qeeg", "Harta cerebrală QEEG");
