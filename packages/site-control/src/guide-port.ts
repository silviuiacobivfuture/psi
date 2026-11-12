import type {
	AgentInfo,
	ControlPorts,
	CopyDefaults,
	IngestResult,
	LastIngest,
	Site,
	TestAnswerLine,
	TestQuestion,
} from "@psi/cms-client";
import { articleEntries, type Guide, type GuideEvent } from "@psi/guide";
import { SEED } from "@psi/knowledge";
import { type GuideCountReporter, mayCountNow } from "./guide-counts";

/**
 * The guide's side of the control plane. The rebuild hands the CMS's published entries (and, when
 * asked, this brand's repository seed and its blog articles) to the engine's `ingestKnowledge` workflow; the test
 * question is answered by the same guide visitors use, but is never counted and never kept.
 */
export interface GuideCounters {
	/** Today (UTC) in this process: questions asked and refused for lack of content. */
	today(): { asked: number; unanswered: number };
	/** The same guide, not counting: the control plane's test question goes here. */
	readonly uncounted: Guide;
}

const SUMMARY_LINES = 8;

/**
 * The site's guide, counting what it answers today (a number per day, nothing about a question).
 * The site serves this one to visitors; the control plane's test question uses the raw guide.
 */
export function countingGuide(
	guide: Guide,
	options: { reporter?: GuideCountReporter | null; now?: () => number } = {},
): Guide & GuideCounters {
	const now = options.now ?? Date.now;
	const reporter = options.reporter ?? null;
	let day = "";
	let asked = 0;
	let unanswered = 0;
	const roll = (): void => {
		const d = new Date(now()).toISOString().slice(0, 10);
		if (d !== day) {
			day = d;
			asked = 0;
			unanswered = 0;
		}
	};
	return {
		brand: guide.brand,
		model: guide.model,
		...(guide.operations === undefined ? {} : { operations: guide.operations }),
		uncounted: guide,
		async *ask(input, control) {
			roll();
			asked++;
			// The CMS's counters: only a countable visitor (no DNT/GPC, no crawler), never the question.
			const report = reporter !== null && mayCountNow();
			if (report) reporter.count("guide_asked", input.locale);
			for await (const e of guide.ask(input, control)) {
				if (e.type === "refusal" && e.reason === "no_content") {
					roll();
					unanswered++;
					if (report) reporter.count("guide_unanswered", input.locale);
				}
				yield e;
			}
		},
		today() {
			roll();
			return { asked, unanswered };
		},
	};
}

function summary(instructions: string): string {
	return instructions
		.split("\n")
		.filter((l) => l.trim() !== "")
		.slice(0, SUMMARY_LINES)
		.join("\n");
}

export interface GuidePortOptions {
	brand: Site;
	guide: Guide & Partial<GuideCounters>;
	screeningLevel: () => Promise<"standard" | "strict">;
	/** The site's built-in guide copy per locale, for the studio's placeholders. */
	copyDefaults?: (locale: "ro" | "en") => CopyDefaults;
	now?: () => number;
}

export interface GuidePort {
	port: NonNullable<ControlPorts["guide"]>;
	lastIngest(): LastIngest | null;
}

/**
 * The guide's events as the control plane's lines: the text as it streams and every `replace`
 * (a regenerated or corrected reply resets it), what the guide is busy with, the sources, a
 * refusal; opened by `meta` (the draft was applied, the model) and closed by `timing`, measured
 * here around this one answer.
 */
async function* testAnswer(
	events: AsyncIterable<GuideEvent>,
	meta: { draftApplied: boolean; model: string },
	now: () => number,
): AsyncIterable<TestAnswerLine> {
	const start = now();
	let firstText: number | null = null;
	yield { type: "meta", ...meta };
	for await (const e of events) {
		if (e.type === "text") {
			firstText ??= now() - start;
			yield { type: "text", text: e.delta };
		} else if (e.type === "replace") {
			firstText ??= now() - start;
			yield { type: "replace", text: e.text };
		} else if (e.type === "thinking") yield { type: "stage", stage: e.stage ?? "thinking" };
		else if (e.type === "sources") {
			yield { type: "sources", sources: e.sources.map((s) => ({ title: s.title, url: s.url })) };
		} else if (e.type === "refusal") yield { type: "refusal", reason: e.reason };
	}
	yield { type: "timing", firstTextMs: firstText, totalMs: now() - start };
}

/** The model a draft names (an allow-listed slug), else the guide's own. */
function draftModel(draft: TestQuestion["draft"], fallback: string): string {
	const behaviour = draft?.behaviour;
	if (typeof behaviour !== "object" || behaviour === null || !("model" in behaviour))
		return fallback;
	return typeof behaviour.model === "string" && behaviour.model !== "" ? behaviour.model : fallback;
}

export function guidePort(o: GuidePortOptions): GuidePort {
	const now = o.now ?? Date.now;
	let last: LastIngest | null = null;
	const ops = o.guide.operations;
	return {
		lastIngest: () => last,
		port: {
			async agent(): Promise<AgentInfo> {
				if (ops === undefined) throw new Error("this guide has no operations");
				const a = await ops.agent();
				return {
					id: a.id,
					name: a.name,
					model: a.model,
					hasKey: a.hasKey,
					instructionsSummary: summary(a.instructions),
					instructionsLength: a.instructions.length,
					tools: [...a.tools],
					locales: [...a.locales],
					screeningLevel: await o.screeningLevel(),
					scheduling: a.scheduling,
					workflows: [...a.workflows],
					...(o.copyDefaults === undefined
						? {}
						: { copyDefaults: { ro: o.copyDefaults("ro"), en: o.copyDefaults("en") } }),
				};
			},
			async ingest(request, actor): Promise<IngestResult> {
				if (ops === undefined || ops.knowledge === null) {
					return { ok: false, reason: "no knowledge store" };
				}
				const own = request.entries.filter((e) => e.brand === o.brand);
				const seed = request.includeSeed
					? [...SEED, ...articleEntries()].filter((e) => e.brand === o.brand)
					: [];
				const entries = [...seed, ...own];
				if (entries.length === 0 && request.remove.length === 0) {
					return { ok: false, reason: "nothing to ingest" };
				}
				// What is no longer published leaves the index first; then the rest is re-ingested.
				if (request.remove.length > 0) await ops.knowledge.remove(request.remove);
				if (entries.length === 0) {
					return {
						ok: true,
						workflow: "remove",
						runId: "-",
						indexed: 0,
						removed: request.remove.length,
						skipped: 0,
						chunks: 0,
						embedder: ops.knowledge.embedder.model,
						store: ops.knowledge.store,
					};
				}
				const out = await ops.ingest(entries);
				if (!out.ok) return out;
				const r = out.report;
				last = {
					at: new Date(now()).toISOString(),
					entries: r.indexed.length,
					chunks: r.chunks,
					skipped: r.skipped.length,
					embedder: r.embedder,
					actor,
				};
				return {
					ok: true,
					workflow: "ingestKnowledge",
					runId: out.runId,
					indexed: r.indexed.length,
					removed: request.remove.length,
					skipped: r.skipped.length,
					chunks: r.chunks,
					embedder: r.embedder,
					store: r.store,
				};
			},
			// Never counted, never kept: the visitors' counter is not the staff's. No visitor keys
			// (no exchange limit), no thread (nothing stored); the draft applies to this answer only.
			ask: (q) => {
				const guide = o.guide.uncounted ?? o.guide;
				return testAnswer(
					guide.ask(
						{
							question: q.question,
							locale: q.locale,
							...(q.history === undefined ? {} : { history: q.history }),
						},
						q.draft === undefined ? {} : { settings: q.draft },
					),
					{ draftApplied: q.draft !== undefined, model: draftModel(q.draft, guide.model) },
					now,
				);
			},
		},
	};
}
