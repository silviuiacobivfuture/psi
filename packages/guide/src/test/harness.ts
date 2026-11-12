import {
	type FakeOpenRouter,
	type FakeReply,
	type ScreenScript,
	startFakeOpenRouter,
} from "@psi/engine/testing";
import type { Brand } from "../contract";
import {
	createGuide,
	type Guide,
	type GuideFailure,
	type GuideOptions,
	type GuideScore,
} from "../guide";
import {
	ABA,
	EVALUATION,
	FakeKnowledge,
	passage,
	QEEG,
	type SearchBehaviour,
} from "./fake-knowledge";

/** Reviewed passages for the hardening tests, in Romanian. */
export const FOUND_RO: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(EVALUATION, "Evaluarea durează două ore și include o discuție cu părinții."),
		passage(ABA, "Terapia ABA se lucrează individual, în ședințe de 50 de minute."),
		passage(QEEG, "Harta QEEG arată activitatea electrică a creierului."),
	],
};

/** The same content in English. */
export const FOUND_EN: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(EVALUATION, "The evaluation takes two hours and includes a talk with the parents."),
	],
};

export interface Harness {
	guide: Guide;
	knowledge: FakeKnowledge;
	server: FakeOpenRouter;
	failures: Array<GuideFailure>;
	scores: Array<GuideScore>;
}

export interface HarnessOptions {
	replies?: ReadonlyArray<FakeReply>;
	searches?: ReadonlyArray<SearchBehaviour>;
	screen?: ScreenScript;
	brand?: Brand;
	/** False: the fake model never searches on its own before a text reply (small talk). */
	autoSearch?: boolean;
	options?: Partial<Omit<GuideOptions, "brand" | "knowledge" | "baseURL">>;
}

const open: Array<FakeOpenRouter> = [];

/** A guide on the fake OpenRouter and an in-memory knowledge base, recording its hooks. */
export async function startGuide(opts: HarnessOptions = {}): Promise<Harness> {
	const server = await startFakeOpenRouter(
		opts.replies ?? [{ kind: "text", chunks: ["Evaluarea durează două ore [1]."] }],
		opts.screen,
		{ autoSearch: opts.autoSearch !== false },
	);
	open.push(server);
	const knowledge = new FakeKnowledge(opts.searches ?? [FOUND_RO]);
	const failures: Array<GuideFailure> = [];
	const scores: Array<GuideScore> = [];
	const guide = createGuide({
		brand: opts.brand ?? "psizone",
		knowledge,
		apiKey: "test-key",
		baseURL: server.baseURL,
		timeouts: { retrievalMs: 300, screeningMs: 400, idleMs: 500, totalMs: 3_000 },
		onFailure: (failure) => failures.push(failure),
		onScore: (score) => scores.push(score),
		...opts.options,
	});
	return { guide, knowledge, server, failures, scores };
}

/** Closes every fake started by `startGuide`; call it in `afterEach`. */
export async function closeAll(): Promise<void> {
	await Promise.all(open.splice(0).map((server) => server.close()));
}
