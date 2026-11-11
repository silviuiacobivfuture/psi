import type { EngineKnowledge, KnowledgeQuery, Passage, Source } from "../contract";

/** One search the fake received. */
export interface SearchCall {
	query: string;
	scope: string;
	locale: string;
	topK: number | undefined;
}

/** What the fake does on one search: return passages, fail, or never answer. */
export type SearchBehaviour =
	| { kind: "passages"; passages: ReadonlyArray<Passage> }
	| { kind: "throw" }
	| { kind: "hang" };

/**
 * An in-memory `EngineKnowledge`, returning scripted passages (the last step repeats) and
 * recording every search.
 */
export class FakeKnowledge implements EngineKnowledge {
	readonly calls: Array<SearchCall> = [];
	readonly #script: ReadonlyArray<SearchBehaviour>;

	constructor(script: ReadonlyArray<SearchBehaviour>) {
		this.#script = script;
	}

	search(q: KnowledgeQuery): Promise<ReadonlyArray<Passage>> {
		this.calls.push({ query: q.query, scope: q.scope, locale: q.locale, topK: q.topK });
		const step = this.#script[Math.min(this.calls.length, this.#script.length) - 1];
		if (step === undefined || step.kind === "throw") {
			return Promise.reject(new Error("index unavailable"));
		}
		if (step.kind === "hang") return new Promise<ReadonlyArray<Passage>>(() => undefined);
		return Promise.resolve(step.passages);
	}
}

/** A reviewed source at `https://example.test/<id>`. */
export function source(id: string, title: string, origin = "https://example.test"): Source {
	return {
		id,
		title,
		url: `${origin}/${id}`,
		reviewedBy: "A. Reviewer",
		reviewedAt: "2026-05-04",
	};
}

export function passage(src: Source, text: string, score = 0.8): Passage {
	return { source: src, text, score };
}
