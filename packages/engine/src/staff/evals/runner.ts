import { startFakeOpenRouter } from "../../testing";
import type { ToolKey } from "../copy";
import { createStaffEngine } from "../engine";
import type { StaffCard, StaffEvent } from "../events";
import { FAKE_NOW, FakeIssuesPort, FakeStaffPort, OWNER_PERMISSIONS } from "../testing";
import { STAFF_TOOLS, toolKeyOf } from "../tool-ids";
import type { Scenario, Wanted } from "./scenarios";

export type EvalMode =
	| { kind: "replay" }
	| { kind: "live"; apiKey: string; model: string; baseURL?: string };

export interface Outcome {
	port: FakeStaffPort;
	/** Tools in the order they started. */
	tools: Array<ToolKey>;
	refused: Array<ToolKey>;
	cards: Array<StaffCard>;
	proposalIds: Array<string>;
	/** How each proposal ended when the person confirmed them in turn. */
	confirmations: Array<string>;
	text: string;
	refusal: string | undefined;
}

/**
 * Runs one scenario through the real engine, tools, guards and fake clinic. Replay answers with the
 * scripted trajectory through the fake provider (CI-safe); live asks a real model. Afterwards every
 * proposal is confirmed in order, so the state the person would see can be judged.
 */
export async function runScenario(sc: Scenario, mode: EvalMode): Promise<Outcome> {
	const fake =
		mode.kind === "replay"
			? await startFakeOpenRouter(
					[
						...sc.script.map((m) => ({
							kind: "tool" as const,
							query: "",
							tool: STAFF_TOOLS[m.tool],
							input: m.input,
						})),
						{ kind: "text" as const, chunks: ["Gata."] },
					],
					{},
					{ autoSearch: false },
				)
			: undefined;
	try {
		const engine = createStaffEngine({
			model:
				mode.kind === "replay" && fake !== undefined
					? { id: "fake/model", apiKey: "replay", baseURL: fake.baseURL }
					: mode.kind === "live"
						? {
								id: mode.model,
								apiKey: mode.apiKey,
								...(mode.baseURL === undefined ? {} : { baseURL: mode.baseURL }),
							}
						: { id: "fake/model" },
			now: () => FAKE_NOW,
			issues: new FakeIssuesPort(),
			timeouts: { idleMs: 60_000, totalMs: 180_000 },
		});
		const port = new FakeStaffPort();
		port.signIn({ locale: sc.lang });
		if (sc.by !== "reception") port.permissions = OWNER_PERMISSIONS;
		sc.setup?.(port);
		const events: Array<StaffEvent> = [];
		for await (const e of engine.chat(port, {
			message: sc.user,
			...(sc.page === undefined ? {} : { page: sc.page }),
		})) {
			events.push(e);
		}
		const tools: Array<ToolKey> = [];
		const refused: Array<ToolKey> = [];
		const cards: Array<StaffCard> = [];
		let text = "";
		let refusal: string | undefined;
		for (const e of events) {
			if (e.type === "tool") {
				const key = toolKeyOf(e.tool);
				if (key === undefined) continue;
				if (e.phase === "running") tools.push(key);
				if (e.phase === "refused") refused.push(key);
			} else if (e.type === "card") cards.push(e.card);
			else if (e.type === "text") text += e.delta;
			else if (e.type === "replace") text = e.text;
			else if (e.type === "refusal") refusal = e.reason;
		}
		const proposalIds = cards.flatMap((c) => (c.kind === "proposal" ? [c.proposalId] : []));
		const confirmations: Array<string> = [];
		for (const id of proposalIds) confirmations.push((await engine.confirm(port, id)).status);
		return { port, tools, refused, cards, proposalIds, confirmations, text, refusal };
	} finally {
		await fake?.close();
	}
}

function inOrder(called: ReadonlyArray<string>, wanted: ReadonlyArray<Wanted>): boolean {
	let at = 0;
	for (const tool of called) {
		const want = wanted[at];
		if (want !== undefined && (Array.isArray(want) ? want.includes(tool) : tool === want)) at += 1;
	}
	return at === wanted.length;
}

/** What went wrong in a run, in words; empty when it passed. */
export function judge(sc: Scenario, run: Outcome, live: boolean): Array<string> {
	const bad: Array<string> = [];
	if (run.refusal !== undefined) bad.push(`the turn was refused: ${run.refusal}`);
	if (!inOrder(run.tools, sc.mustCall))
		bad.push(
			`expected ${sc.mustCall.join(" → ")} in order, got ${run.tools.join(" → ") || "no tools"}`,
		);
	for (const tool of sc.mustNotCall ?? [])
		if (run.tools.includes(tool)) bad.push(`must not call ${tool}`);
	if (run.proposalIds.length !== sc.expect.proposals)
		bad.push(`expected ${sc.expect.proposals} proposals, got ${run.proposalIds.length}`);
	for (const kind of sc.expect.cards ?? [])
		if (!run.cards.some((c) => c.kind === kind)) bad.push(`no ${kind} card`);
	for (const tool of sc.expect.refused ?? [])
		if (!run.refused.includes(tool)) bad.push(`${tool} should have been refused`);
	if (run.confirmations.some((s) => s !== "done"))
		bad.push(`a confirmation did not complete: ${run.confirmations.join(",")}`);
	if (sc.expect.after !== undefined && !sc.expect.after(run.port))
		bad.push("the clinic did not end in the expected state");
	if (live)
		for (const re of sc.expect.say ?? [])
			if (!re.test(run.text)) bad.push(`the answer does not say ${re}`);
	return bad;
}
