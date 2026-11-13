import { type FakeOpenRouter, type FakeReply, startFakeOpenRouter } from "../../testing";
import { createStaffEngine, type StaffEngine } from "../engine";
import type { StaffEvent } from "../events";
import { FAKE_NOW, FakeStaffPort, OWNER_PERMISSIONS } from "../testing";

export interface Harness {
	engine: StaffEngine;
	fake: FakeOpenRouter;
	failures: Array<string>;
	close(): Promise<void>;
}

/** The real staff engine over a scripted provider: what the model "says" is the script. */
export async function startEngine(
	script: ReadonlyArray<FakeReply>,
	extra: Partial<Parameters<typeof createStaffEngine>[0]> = {},
): Promise<Harness> {
	const fake = await startFakeOpenRouter(script, {}, { autoSearch: false });
	const failures: Array<string> = [];
	const engine = createStaffEngine({
		model: { id: "fake/model", apiKey: "test-key", baseURL: fake.baseURL },
		now: () => FAKE_NOW,
		onFailure: (f) => failures.push(`${f.stage}: ${f.error}`),
		...extra,
	});
	return { engine, fake, failures, close: () => fake.close() };
}

export async function collect(events: AsyncIterable<StaffEvent>): Promise<Array<StaffEvent>> {
	const out: Array<StaffEvent> = [];
	for await (const event of events) out.push(event);
	return out;
}

/** A Romanian-speaking owner on the fake clinic: every tool offered. */
export function romanianOwner(): FakeStaffPort {
	const port = new FakeStaffPort();
	port.signIn({ locale: "ro" });
	port.permissions = OWNER_PERMISSIONS;
	return port;
}

/** What the person finally reads: the text events folded the way the page folds them. */
export function textOf(events: ReadonlyArray<StaffEvent>): string {
	let text = "";
	for (const e of events) {
		if (e.type === "text") text += e.delta;
		else if (e.type === "replace") text = e.text;
	}
	return text;
}
