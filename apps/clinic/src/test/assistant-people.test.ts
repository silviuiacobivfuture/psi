import { afterEach, describe, expect, it } from "vitest";
import { runAction } from "../actions/engine";
import { canOf } from "../lib/can";
import { type Console, MEMBER, OUTSIDER, startConsole } from "./harness";

/** Setări → Asistent → per persoană: each team member's own overrides of the staff assistant. */
let c: Console | undefined;
afterEach(async () => {
	await c?.close();
	c = undefined;
});

const COLLEAGUE = OUTSIDER.sub;
const as = async (role: string): Promise<Console> => {
	c = await startConsole(
		MEMBER,
		{ names: { [MEMBER.sub]: "Ana Test", [COLLEAGUE]: "Bogdan Test" } },
		{
			[MEMBER.sub]: [{ app: "psizone", roles: [role] }],
			[COLLEAGUE]: [{ app: "psizone", roles: ["reception"] }],
		},
	);
	await c.signIn();
	return c;
};
const form = (fields: Record<string, string>): [URLSearchParams, Record<string, string>] => [
	new URLSearchParams({ revision: "0", whole: "1", ...fields }),
	{ "content-type": "application/x-www-form-urlencoded" },
];
const people = (con: Console) => con.port.assistantConfig("psizone");

describe("Setări → Asistent → per persoană", () => {
	it("is reached from the assistant's settings and lists every member with their override fields", async () => {
		const owner = await as("owner");
		const settings = await (await owner.get("/settings/assistant")).text();
		expect(settings).toContain('href="/settings/assistant/people"');
		const res = await owner.get("/settings/assistant/people");
		expect(res.status).toBe(200);
		const html = await res.text();
		for (const subject of [MEMBER.sub, COLLEAGUE]) {
			expect(html).toContain(`data-person="${subject}"`);
			for (const field of [
				"enabled",
				"model",
				"maxToolCalls",
				"messagesPerDay",
				"tokensPerRequest",
			])
				expect(html).toContain(`name="person.${subject}.${field}"`);
		}
		expect(html).toContain("Bogdan Test");
		expect(html).toContain('data-action="assistant.people.save"');
		// What a person inherits is shown as the placeholder: the organisation's staff setting.
		expect(html).toContain('placeholder="8"');
	});
	it("saves one person's limits, keeps everything else of the tier, and shows it saved", async () => {
		const owner = await as("owner");
		await owner.post(
			"/settings/assistant",
			...form({
				"staff.maxToolCalls": "5",
				"skill.0.name": "Primire",
				"skill.0.instructions": "x",
			}),
		);
		const res = await owner.post(
			"/settings/assistant/people",
			...form({
				revision: "1",
				[`person.${COLLEAGUE}.messagesPerDay`]: "40",
				[`person.${COLLEAGUE}.enabled`]: "off",
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Setările asistentului au fost salvate.");
		const view = await people(owner);
		expect(view.revision).toBe(2);
		expect(view.doc?.people).toEqual({ [COLLEAGUE]: { messagesPerDay: 40, enabled: false } });
		expect(view.doc?.staff).toEqual({ maxToolCalls: 5 });
		expect(view.doc?.skills.map((s) => s.name)).toEqual(["Primire"]);
	});
	it("an emptied row is no override any more; someone no longer on the team keeps theirs", async () => {
		const owner = await as("owner");
		const held = await people(owner);
		await owner.port.saveAssistantConfig("psizone", {
			revision: held.revision,
			staff: {},
			visitor: {},
			skills: [],
			roles: {},
			people: { [COLLEAGUE]: { maxToolCalls: 2 }, "gone-subject": { maxToolCalls: 1 } },
		});
		await owner.post("/settings/assistant/people", ...form({ revision: "1" }));
		expect((await people(owner)).doc?.people).toEqual({ "gone-subject": { maxToolCalls: 1 } });
	});
	it("a value past the platform's ceiling, or not a number, is refused and nothing is written", async () => {
		const owner = await as("owner");
		for (const value of ["99", "multe"]) {
			const res = await owner.post(
				"/settings/assistant/people",
				...form({ [`person.${COLLEAGUE}.maxToolCalls`]: value }),
			);
			expect(await res.text(), value).toContain("Nu s-a salvat nimic.");
		}
		expect((await people(owner)).revision).toBe(0);
	});
	it("a save from a revision someone else already saved over is refused as such", async () => {
		const owner = await as("owner");
		await owner.post(
			"/settings/assistant/people",
			...form({ [`person.${COLLEAGUE}.maxToolCalls`]: "3" }),
		);
		const late = await owner.post(
			"/settings/assistant/people",
			...form({ [`person.${COLLEAGUE}.maxToolCalls`]: "4" }),
		);
		expect(await late.text()).toContain("Altcineva a salvat între timp.");
		expect((await people(owner)).doc?.people[COLLEAGUE]).toEqual({ maxToolCalls: 3 });
	});
	it("the assistant changes one person's field without a revision, and the rest stays", async () => {
		const owner = await as("owner");
		await owner.post(
			"/settings/assistant/people",
			...form({ [`person.${COLLEAGUE}.maxToolCalls`]: "3", [`person.${MEMBER.sub}.model`]: "" }),
		);
		const caps = await owner.port.capabilities(MEMBER.sub, "psizone");
		const ctx = {
			port: owner.port,
			app: "psizone" as const,
			can: canOf(caps, false),
			actor: { subject: MEMBER.sub, name: "Ana" },
			locale: "ro" as const,
			today: "2026-11-16",
		};
		expect(
			(
				await runAction(
					ctx,
					"assistant.people.save",
					{ [`person.${COLLEAGUE}.messagesPerDay`]: "12" },
					{ confirmed: true, via: "assistant" },
				)
			).status,
		).toBe("ok");
		expect((await people(owner)).doc?.people[COLLEAGUE]).toEqual({
			maxToolCalls: 3,
			messagesPerDay: 12,
		});
		expect(
			await runAction(ctx, "assistant.people.save", {}, { confirmed: true, via: "assistant" }),
		).toEqual({ status: "refused", code: "invalid" });
	});
	it("Reception can neither open nor save it, and nothing is written", async () => {
		const reception = await as("reception");
		expect((await reception.get("/settings/assistant/people")).status).toBe(403);
		const res = await reception.post(
			"/settings/assistant/people",
			...form({ [`person.${COLLEAGUE}.maxToolCalls`]: "3" }),
		);
		expect(res.status).toBe(403);
		expect((await reception.port.assistantConfig("psizone")).revision).toBe(0);
	});
});
