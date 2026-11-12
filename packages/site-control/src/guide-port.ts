import type {
	AgentInfo,
	ControlPorts,
	IngestResult,
	LastIngest,
	Site,
	TestAnswerLine,
} from "@psi/cms-client";
import type { Guide, GuideEvent } from "@psi/guide";
import { SEED } from "@psi/knowledge";
import { type GuideCountReporter, mayCountNow } from "./guide-counts";

/**
 * The guide's side of the control plane. The rebuild hands the CMS's published entries (and, when
 * asked, this brand's repository seed) to the engine's `ingestKnowledge` workflow; the test
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
	now?: () => number;
}

export interface GuidePort {
	port: NonNullable<ControlPorts["guide"]>;
	lastIngest(): LastIngest | null;
}

async function* testAnswer(events: AsyncIterable<GuideEvent>): AsyncIterable<TestAnswerLine> {
	for await (const e of events) {
		if (e.type === "text") yield { type: "text", text: e.delta };
		else if (e.type === "sources") {
			yield { type: "sources", sources: e.sources.map((s) => ({ title: s.title, url: s.url })) };
		} else if (e.type === "refusal") yield { type: "refusal", reason: e.reason };
	}
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
				};
			},
			async ingest(request, actor): Promise<IngestResult> {
				if (ops === undefined || ops.knowledge === null) {
					return { ok: false, reason: "no knowledge store" };
				}
				const own = request.entries.filter((e) => e.brand === o.brand);
				const seed = request.includeSeed ? SEED.filter((e) => e.brand === o.brand) : [];
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
			// Never counted, never kept: the visitors' counter is not the staff's.
			ask: (q) =>
				testAnswer((o.guide.uncounted ?? o.guide).ask({ question: q.question, locale: q.locale })),
		},
	};
}
