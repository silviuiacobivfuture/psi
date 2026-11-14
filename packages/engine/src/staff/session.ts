import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { StaffConfig } from "./assistant-config";
import type { StaffCopy, ToolKey } from "./copy";
import type { StaffCard, StaffPage } from "./events";
import type { Principal } from "./model";
import type { RouteLike } from "./parity/routes";
import type { AuditEntry, IssuesPort, PortRefusal, StaffPort } from "./port";
import type { ProposalStore } from "./proposals";
import type { ReadCache } from "./read-cache";
import { STAFF_TOOLS } from "./tool-ids";

/** The request-context key a turn holds its session under. */
export const SESSION_KEY = "staff.session";

/** Where the console's pages live, so a card can link to a record (none: no links). */
export interface StaffLinks {
	client(id: string): string;
	appointment(id: string, date: string): string;
	request?(id: string): string;
	audit?(): string;
	issues?(): string;
}

/**
 * Everything one staff turn runs on: the person's own port (already behind the boundary), who they
 * are, and the sinks the turn drains. A session exists only for a verified principal; it is made
 * per turn and never shared.
 */
export interface StaffSession {
	readonly port: StaffPort;
	readonly principal: Principal;
	readonly copy: StaffCopy;
	readonly timeZone: string;
	readonly now: () => number;
	readonly proposals: ProposalStore;
	readonly links: StaffLinks | undefined;
	/** The scheduling service's route table: each route the person may use is a tool. */
	readonly routes: ReadonlyArray<RouteLike>;
	/** Visitor-facing trouble on the sites (the console server holds the log store's token). */
	readonly issues: IssuesPort | undefined;
	readonly page: StaffPage | undefined;
	readonly threadId: string | undefined;
	/** Cards the tools produced, drained by the turn after each tool result. */
	readonly cards: Array<StaffCard>;
	/** Tools a port refused for permission this turn: they are not called again. */
	readonly blocked: Set<string>;
	/** How many times each tool was called with the same input this turn: the third identical call is refused. */
	readonly calls: Map<string, number>;
	/** Changes asked for again this turn that already had an open card: they count as prepared, with no second card. */
	readonly reused: { count: number };
	/** What this turn has read that strangers wrote (website requests): while set, no change is prepared but marking those requests handled. */
	readonly taint: { stranger: boolean };
	/** What the person may do here, loaded once per turn; undefined when the service could not say. */
	caps: ReadonlySet<string> | undefined;
	/** What governs this turn (the service's merged configuration); the built-in one until the turn reads it. */
	config: StaffConfig;
	/** The tools a skill that applies limits this turn to; undefined: every tool the person holds. */
	allow: ReadonlySet<string> | undefined;
	/** This person's recent reads (short-lived, never shared, forgotten on any change of theirs). */
	readonly reads: ReadCache;
}

const AmbiguousSchema = z.object({
	status: z.literal("ambiguous"),
	what: z.string().optional(),
	candidates: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const RefusedOutputSchema = z.object({
	status: z.literal("refused"),
	reason: z.enum([
		"forbidden",
		"not_found",
		"conflict",
		"invalid",
		"unavailable",
		"not_allowed",
		"repeat",
		"tainted",
	]),
	explanation: z.string(),
});
export type RefusedOutput = z.infer<typeof RefusedOutputSchema>;

/** What a tool's work came to: its output and what to record, or a refusal. */
export type ToolRun<O> =
	| {
			ok: true;
			output: O;
			subjects: ReadonlyArray<string>;
			cards?: ReadonlyArray<StaffCard>;
			proposalId?: string;
	  }
	| {
			ok: false;
			reason: PortRefusal | "not_allowed" | "tainted";
			subjects?: ReadonlyArray<string>;
	  };

/** The same tool with the same input more often than this in one turn is a loop, not progress. */
const MAX_SAME_CALLS = 2;

function repeated(session: StaffSession, id: string, input: unknown): number {
	const key = `${id}:${JSON.stringify(input)}`;
	const n = (session.calls.get(key) ?? 0) + 1;
	session.calls.set(key, n);
	return n;
}

/** A refusal that stops this tool for the rest of the turn: asking again cannot change the answer. */
const FINAL: ReadonlySet<string> = new Set(["forbidden", "not_allowed"]);

interface Spec<I, O> {
	key: ToolKey;
	description: string;
	phase: "read" | "propose";
	inputSchema: z.ZodType<I, z.ZodTypeDef, unknown>;
	outputSchema: z.ZodType<O, z.ZodTypeDef, unknown>;
	run(input: I, session: StaffSession): Promise<ToolRun<O>>;
}

async function record(session: StaffSession, entry: AuditEntry): Promise<void> {
	// A read or a proposal changes nothing, so a failing log does not stop it; an execution does (see execute.ts).
	await session.port.audit(entry);
}

/**
 * Runs one tool call under the session's guards. Every call goes through here: it is audited
 * exactly once (ids and counts only), a refusal for permission blocks the tool for the rest of
 * the turn so the model cannot retry around it, cards reach the turn's sink, and a failure inside
 * is a refusal, never a throw to the model.
 */
export async function guardedRun<O>(
	session: StaffSession,
	id: string,
	phase: "read" | "propose",
	work: () => Promise<ToolRun<O>>,
	input?: unknown,
	/** What a final refusal blocks for the rest of the turn: the tool, or (a discovery call) the one thing it named. */
	blockAs: string = id,
): Promise<O | RefusedOutput> {
	const refuse = (reason: PortRefusal | "not_allowed" | "repeat" | "tainted"): RefusedOutput => ({
		status: "refused",
		reason,
		explanation: session.copy.refusal[reason],
	});
	const again = input === undefined ? 0 : repeated(session, id, input);
	if (session.blocked.has(blockAs) || again > MAX_SAME_CALLS) {
		await record(session, {
			tool: id,
			phase: "refused",
			outcome: "refused",
			subjects: [],
			reason: "repeat",
		});
		return refuse("repeat");
	}
	let run: ToolRun<O>;
	try {
		run = await work();
	} catch {
		await record(session, { tool: id, phase, outcome: "error", subjects: [] });
		return refuse("unavailable");
	}
	if (!run.ok) {
		if (FINAL.has(run.reason)) session.blocked.add(blockAs);
		await record(session, {
			tool: id,
			phase: "refused",
			outcome: "refused",
			subjects: [...(run.subjects ?? [])].slice(0, 50),
			reason: run.reason,
		});
		return refuse(run.reason);
	}
	session.cards.push(...(run.cards ?? []));
	const ambiguous = AmbiguousSchema.safeParse(run.output);
	if (ambiguous.success) {
		session.cards.push({
			kind: "choices",
			title:
				ambiguous.data.what === undefined
					? session.copy.refusal.ambiguous
					: session.copy.card.choose(ambiguous.data.what.toLowerCase()),
			options: ambiguous.data.candidates.map((c) => ({
				label: c.name,
				ask: `${c.name} [${c.id}]`,
			})),
		});
	}
	await record(session, {
		tool: id,
		phase,
		outcome: "ok",
		subjects: [...run.subjects].slice(0, 50),
		...(run.proposalId === undefined ? {} : { proposalId: run.proposalId }),
	});
	return run.output;
}

/** One Mastra tool bound to a session, run under `guardedRun`. */
export function staffTool<I, O>(session: StaffSession, spec: Spec<I, O>) {
	const id = STAFF_TOOLS[spec.key];
	return createTool({
		id,
		description: spec.description,
		inputSchema: spec.inputSchema,
		outputSchema: z.union([spec.outputSchema, RefusedOutputSchema]),
		execute: async (input: I): Promise<O | RefusedOutput> =>
			guardedRun(session, id, spec.phase, () => spec.run(input, session), input),
	});
}
