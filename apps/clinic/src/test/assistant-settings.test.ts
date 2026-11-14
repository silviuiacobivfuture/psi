import { afterEach, describe, expect, it } from "vitest";
import { runAction } from "../actions/engine";
import { canOf } from "../lib/can";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console | undefined;
afterEach(async () => {
	await c?.close();
	c = undefined;
});

const as = async (role: string, platformAdmin = false): Promise<Console> => {
	c = await startConsole(MEMBER, platformAdmin ? { platformAdmins: new Set([MEMBER.sub]) } : {}, {
		[MEMBER.sub]: [{ app: "psizone", roles: [role] }],
	});
	await c.signIn();
	return c;
};
const form = (fields: Record<string, string>): [URLSearchParams, Record<string, string>] => [
	// Edited from revision 0 unless the case says otherwise (the form carries the revision it was edited from).
	new URLSearchParams({ revision: "0", ...fields }),
	{ "content-type": "application/x-www-form-urlencoded" },
];

describe("Setări → Asistent: the organisation's tier", () => {
	it("is listed among the organisation's settings and opens for the Owner with both surfaces, the meters and Save", async () => {
		const owner = await as("owner");
		expect(await (await owner.get("/settings")).text()).toContain('href="/settings/assistant"');
		const res = await owner.get("/settings/assistant");
		expect(res.status).toBe(200);
		const html = await res.text();
		for (const marker of [
			'data-surface="staff"',
			'data-surface="visitor"',
			'data-usage="staff"',
			'data-skill="new"',
			'data-action="assistant.save"',
			"<meter",
		])
			expect(html, marker).toContain(marker);
		// Nothing configured: every field is empty and says what it inherits.
		expect(html).toContain('name="staff.maxToolCalls"');
		expect(html).toContain('placeholder="8"');
	});
	it("each surface shows only what governs it: the visitor's content is the CMS's, paging and reads are staff only", async () => {
		const html = await (await (await as("owner")).get("/settings/assistant")).text();
		for (const name of ["prompt.override", "prompt.append", "tone", "language", "pageSize"]) {
			expect(html, name).toContain(`name="staff.${name}"`);
			expect(html, name).not.toContain(`name="visitor.${name}"`);
		}
		expect(html).not.toContain('name="visitor.cacheTtlSeconds"');
		expect(html).not.toContain('name="staff.booking.horizonDays"');
		expect(html).toContain('name="visitor.booking.horizonDays"');
		expect(html).toContain('name="visitor.model.summary"');
		expect(html).toContain('data-note="visitor-content"');
		expect(html).toContain("se editează în CMS");
	});
	it("saves what is filled in, leaves the rest inherited, and shows it saved", async () => {
		const owner = await as("owner");
		const res = await owner.post(
			"/settings/assistant",
			...form({
				"staff.maxToolCalls": "5",
				"staff.budget.monthlyMicroUsd": "12.5",
				"visitor.booking.horizonDays": "10",
				// The visitor's tone is the site's content (the CMS): a value sent for it is not taken.
				"visitor.tone": "formal",
				"skill.0.name": "Primire client nou",
				"skill.0.instructions": "Întreabă de vârstă.",
				"skill.0.surface.staff": "on",
				"skill.0.enabled": "on",
			}),
		);
		expect(res.status).toBe(200);
		const view = await owner.port.assistantConfig("psizone");
		expect(view.revision).toBe(1);
		expect(view.doc?.staff).toEqual({ maxToolCalls: 5, budget: { monthlyMicroUsd: 12_500_000 } });
		expect(view.doc?.visitor).toEqual({ booking: { horizonDays: 10 } });
		expect(view.doc?.skills.map((s) => s.id)).toEqual(["primire-client-nou"]);
		expect(view.effective.staff.maxToolCalls).toBe(5);
		const html = await (await owner.get("/settings/assistant?saved=1")).text();
		expect(html).toContain("Setările asistentului au fost salvate.");
		expect(html).toContain('value="5"');
		expect(html).toContain('data-skill="primire-client-nou"');
	});
	it("a value past the platform's ceiling is refused with words, and nothing is saved", async () => {
		const owner = await as("owner");
		const res = await owner.post("/settings/assistant", ...form({ "staff.maxToolCalls": "99" }));
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Nu s-a salvat nimic.");
		expect((await owner.port.assistantConfig("psizone")).revision).toBe(0);
	});
	it("a value that is not a number is refused the same way", async () => {
		const owner = await as("owner");
		await owner.post("/settings/assistant", ...form({ "staff.temperature": "fierbinte" }));
		expect((await owner.port.assistantConfig("psizone")).revision).toBe(0);
	});
	it("removing a skill removes it and keeps the others", async () => {
		const owner = await as("owner");
		await owner.post(
			"/settings/assistant",
			...form({
				"skill.0.name": "Unu",
				"skill.0.instructions": "a",
				"skill.1.name": "Doi",
				"skill.1.instructions": "b",
			}),
		);
		await owner.post(
			"/settings/assistant",
			...form({
				revision: "1",
				"skill.0.id": "unu",
				"skill.0.name": "Unu",
				"skill.0.instructions": "a",
				"skill.0.remove": "on",
				"skill.1.id": "doi",
				"skill.1.name": "Doi",
				"skill.1.instructions": "b",
			}),
		);
		expect((await owner.port.assistantConfig("psizone")).doc?.skills.map((s) => s.id)).toEqual([
			"doi",
		]);
	});
	it("a save from a revision someone else already saved over is refused as such, and changes nothing", async () => {
		const owner = await as("owner");
		await owner.post("/settings/assistant", ...form({ "staff.maxToolCalls": "5" }));
		const late = await owner.post("/settings/assistant", ...form({ "staff.maxToolCalls": "2" }));
		expect(await late.text()).toContain("Altcineva a salvat între timp.");
		const view = await owner.port.assistantConfig("psizone");
		expect([view.revision, view.doc?.staff.maxToolCalls]).toEqual([1, 5]);
	});
	it("a save without the revision it was edited from (an empty call, from anywhere) is refused and erases nothing", async () => {
		const owner = await as("owner");
		await owner.post("/settings/assistant", ...form({ "staff.maxToolCalls": "5" }));
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
			await runAction(ctx, "assistant.save", {}, { confirmed: true, via: "assistant" }),
		).toEqual({ status: "refused", code: "invalid" });
		const view = await owner.port.assistantConfig("psizone");
		expect([view.revision, view.doc?.staff.maxToolCalls]).toEqual([1, 5]);
	});
	it("Reception can neither open nor save it, and nothing is written", async () => {
		const reception = await as("reception");
		expect((await reception.get("/settings/assistant")).status).toBe(403);
		const res = await reception.post("/settings/assistant", ...form({ "staff.maxToolCalls": "5" }));
		expect(res.status).toBe(403);
		expect((await reception.port.assistantConfig("psizone")).revision).toBe(0);
		expect(await (await reception.get("/settings")).text()).not.toContain(
			'href="/settings/assistant"',
		);
	});
});

describe("Administrare → Asistent: the platform's tier", () => {
	it("opens for the platform administrator only, from the Administrare page", async () => {
		const admin = await as("owner", true);
		expect(await (await admin.get("/platform")).text()).toContain('href="/platform/assistant"');
		const html = await (await admin.get("/platform/assistant")).text();
		expect(html).toContain('data-ceilings="staff"');
		expect(html).toContain('data-action="assistant.platform.save"');
		await c?.close();
		const owner = await as("owner");
		expect((await owner.get("/platform/assistant")).status).toBe(403);
		expect((await owner.post("/platform/assistant", ...form({}))).status).toBe(403);
		expect((await owner.port.assistantPlatform()).revision).toBe(0);
	});
	it("a lowered ceiling holds for the organisation at once", async () => {
		const admin = await as("owner", true);
		const html = await (await admin.get("/platform/assistant")).text();
		const fields = Object.fromEntries(
			[...html.matchAll(/name="(ceilings\.[a-z]+\.[A-Za-z]+)"[^>]*value="([^"]*)"/g)].map((x) => [
				x[1] ?? "",
				x[2] ?? "",
			]),
		);
		fields["ceilings.staff.forceRedaction"] = "on";
		fields["ceilings.visitor.forceRedaction"] = "on";
		fields["ceilings.staff.maxToolCalls"] = "3";
		expect((await admin.post("/platform/assistant", ...form(fields))).status).toBe(200);
		expect((await admin.port.assistantPlatform()).revision).toBe(1);
		expect((await admin.port.assistantConfig("psizone")).effective.staff.maxToolCalls).toBe(3);
	});
});
