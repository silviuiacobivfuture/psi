import { BUILT_IN_CEILINGS } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSdkPort } from "../port/sdk";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

let world: SdkConsole;
beforeAll(async () => {
	world = await startSdkConsole();
});
afterAll(async () => {
	await world.close();
});

const form = (fields: Record<string, string>): [URLSearchParams, Record<string, string>] => [
	// Edited from revision 0 unless the case says otherwise (the form carries the revision it was edited from).
	new URLSearchParams({ revision: "0", ...fields }),
	{ "content-type": "application/x-www-form-urlencoded" },
];

describe("the assistant's settings over the real service, as the signed-in person", () => {
	it("the Owner saves the organisation's tier from the screen; the service keeps it and journals who did", async () => {
		const olga = await world.as("olga");
		expect((await olga.get("/settings/assistant")).status).toBe(200);
		const saved = await olga.post(
			"/settings/assistant",
			...form({ "staff.maxToolCalls": "4", "visitor.messages.perDay": "15" }),
		);
		expect(saved.status).toBe(200);
		expect(await saved.text()).toContain("Setările asistentului au fost salvate.");
		const held = await world.api.world.call("olga", "GET", "/v1/apps/psizone/assistant/config");
		expect(held.json.revision).toBe(1);
		const journal = await world.api.world.call(
			"olga",
			"GET",
			"/v1/apps/psizone/audit?action=assistant.config.put",
		);
		expect((journal.json.items as unknown[]).length).toBe(1);
		// Every member's next turn runs on it.
		const rita = await world.api.world.call("rita", "GET", "/v1/apps/psizone/assistant/effective");
		expect(rita.json.settings).toMatchObject({ maxToolCalls: 4 });
	});
	it("a value the estate's ceiling refuses comes back as words; the service keeps what it had", async () => {
		const olga = await world.as("olga");
		const res = await olga.post(
			"/settings/assistant",
			...form({ revision: "1", "staff.maxToolCalls": "20" }),
		);
		expect(await res.text()).toContain("Nu s-a salvat nimic.");
		expect(
			(await world.api.world.call("olga", "GET", "/v1/apps/psizone/assistant/config")).json
				.revision,
		).toBe(1);
	});
	it("Reception cannot open or save it; the service keeps what it had", async () => {
		const rita = await world.as("rita");
		expect((await rita.get("/settings/assistant")).status).toBe(403);
		expect(
			(await rita.post("/settings/assistant", ...form({ "staff.maxToolCalls": "2" }))).status,
		).toBe(403);
		expect(
			(await world.api.world.call("olga", "GET", "/v1/apps/psizone/assistant/config")).json
				.revision,
		).toBe(1);
	});
	it("the estate's administrator saves the platform tier through the console's port; an Owner who is not is refused", async () => {
		const port = (who: string) =>
			createSdkPort({ baseUrl: world.api.url, bearer: () => world.api.tokenFor(who) });
		const olga = await world.as("olga");
		expect((await olga.get("/platform/assistant")).status).toBe(403);
		const doc = {
			revision: 0,
			defaults: { staff: { tone: "neutral" as const }, visitor: {} },
			ceilings: BUILT_IN_CEILINGS,
		};
		await expect(port("olga").saveAssistantPlatform(doc)).rejects.toMatchObject({
			code: "forbidden",
		});
		expect((await port("root").saveAssistantPlatform(doc)).revision).toBe(1);
		const rita = await world.api.world.call("rita", "GET", "/v1/apps/psizone/assistant/effective");
		expect(rita.json.settings).toMatchObject({ tone: "neutral" });
	});
});
