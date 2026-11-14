import { afterEach, describe, expect, it } from "vitest";
import { runAction } from "../actions/engine";
import type { ActionCtx } from "../actions/types";
import { canOf } from "../lib/can";
import type { ClinicPort } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * `assistant.save` as the assistant calls it: a few fields, usually without the revision. The change is laid over the
 * tier as it is now and saved from the revision just read; a real conflict is still refused with nothing written.
 */
let c: Console | undefined;
afterEach(async () => {
	await c?.close();
	c = undefined;
});

const owner = async (): Promise<Console> => {
	c = await startConsole(
		MEMBER,
		{},
		{
			[MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }],
		},
	);
	await c.signIn();
	return c;
};

const screenSave = (con: Console, fields: Record<string, string>) =>
	con.post("/settings/assistant", new URLSearchParams({ revision: "0", whole: "1", ...fields }), {
		"content-type": "application/x-www-form-urlencoded",
	});

async function ctxOf(con: Console, port: ClinicPort = con.port): Promise<ActionCtx> {
	const caps = await con.port.capabilities(MEMBER.sub, "psizone");
	return {
		port,
		app: "psizone",
		can: canOf(caps, false),
		actor: { subject: MEMBER.sub, name: "Ana" },
		locale: "ro",
		today: "2026-11-16",
	};
}

const save = async (ctx: ActionCtx, fields: Record<string, string>) =>
	runAction(ctx, "assistant.save", fields, { confirmed: true, via: "assistant" });

/** A tier with something in every part: staff limits, a visitor setting, a skill. */
async function seeded(con: Console): Promise<void> {
	const res = await screenSave(con, {
		"staff.maxToolCalls": "5",
		"staff.budget.monthlyMicroUsd": "12.5",
		"visitor.booking.horizonDays": "10",
		"skill.0.name": "Primire",
		"skill.0.instructions": "Întreabă de vârstă.",
		"skill.0.surface.staff": "on",
		"skill.0.enabled": "on",
	});
	expect(res.status).toBe(200);
}

describe("assistant.save from the assistant", () => {
	it("without a revision: saved from the current one, only the named field changes, the rest stays", async () => {
		const con = await owner();
		await seeded(con);
		expect(await save(await ctxOf(con), { "staff.maxToolCalls": "3" })).toEqual({
			status: "ok",
			to: "/settings/assistant?saved=1",
		});
		const view = await con.port.assistantConfig("psizone");
		expect(view.revision).toBe(2);
		expect(view.doc?.staff).toEqual({ maxToolCalls: 3, budget: { monthlyMicroUsd: 12_500_000 } });
		expect(view.doc?.visitor).toEqual({ booking: { horizonDays: 10 } });
		expect(view.doc?.skills.map((s) => [s.id, s.enabled, s.surfaces])).toEqual([
			["primire", true, ["staff"]],
		]);
	});
	it("on a tier nobody saved: saved from revision 0", async () => {
		const con = await owner();
		expect((await save(await ctxOf(con), { "visitor.ratePerMinute": "4" })).status).toBe("ok");
		const view = await con.port.assistantConfig("psizone");
		expect([view.revision, view.doc?.visitor]).toEqual([1, { ratePerMinute: 4 }]);
	});
	it("an emptied field goes back to inherited; a skill switched off stays otherwise whole", async () => {
		const con = await owner();
		await seeded(con);
		await save(await ctxOf(con), { "staff.budget.monthlyMicroUsd": "", "skill.0.enabled": "off" });
		const view = await con.port.assistantConfig("psizone");
		expect(view.doc?.staff).toEqual({ maxToolCalls: 5 });
		expect(view.doc?.skills[0]).toMatchObject({ id: "primire", enabled: false, name: "Primire" });
	});
	it("with the current revision it saves the same way", async () => {
		const con = await owner();
		await seeded(con);
		expect(
			(await save(await ctxOf(con), { revision: "1", "staff.ratePerMinute": "9" })).status,
		).toBe("ok");
		expect((await con.port.assistantConfig("psizone")).doc?.staff.ratePerMinute).toBe(9);
	});
	it("with a revision someone else's save overtook: refused as a conflict, nothing written", async () => {
		const con = await owner();
		await seeded(con);
		await screenSave(con, { revision: "1", "staff.maxToolCalls": "6" });
		expect(await save(await ctxOf(con), { revision: "1", "staff.maxToolCalls": "2" })).toEqual({
			status: "refused",
			code: "conflict",
		});
		const view = await con.port.assistantConfig("psizone");
		expect([view.revision, view.doc?.staff.maxToolCalls]).toEqual([2, 6]);
	});
	it("a save that lands between its read and its write is a conflict, and the other save stands", async () => {
		const con = await owner();
		await seeded(con);
		// Someone else saves the moment after this save has read the tier.
		const racing = new Proxy(con.port, {
			get(target, property, receiver) {
				if (property !== "assistantConfig") return Reflect.get(target, property, receiver);
				return async (app: "psizone") => {
					const read = await target.assistantConfig(app);
					if (read.doc !== undefined)
						await target.saveAssistantConfig(app, {
							...read.doc,
							staff: { ...read.doc.staff, maxToolCalls: 7 },
						});
					return read;
				};
			},
		});
		expect(await save(await ctxOf(con, racing), { "staff.maxToolCalls": "2" })).toEqual({
			status: "refused",
			code: "conflict",
		});
		const view = await con.port.assistantConfig("psizone");
		expect([view.revision, view.doc?.staff.maxToolCalls]).toEqual([2, 7]);
	});
	it("a change that names nothing, or a malformed revision, is refused and writes nothing", async () => {
		const con = await owner();
		await seeded(con);
		const ctx = await ctxOf(con);
		const calls: ReadonlyArray<Record<string, string>> = [
			{},
			{ revision: "1" },
			{ revision: "x", "staff.maxToolCalls": "2" },
		];
		for (const fields of calls)
			expect(await save(ctx, fields), JSON.stringify(fields)).toEqual({
				status: "refused",
				code: "invalid",
			});
		expect((await con.port.assistantConfig("psizone")).revision).toBe(1);
	});
	it("a value past a ceiling or not a number is refused, nothing written", async () => {
		const con = await owner();
		await seeded(con);
		const ctx = await ctxOf(con);
		const calls: ReadonlyArray<Record<string, string>> = [
			{ "staff.maxToolCalls": "99" },
			{ "staff.temperature": "fierbinte" },
		];
		for (const fields of calls)
			expect((await save(ctx, fields)).status, JSON.stringify(fields)).toBe("refused");
		const view = await con.port.assistantConfig("psizone");
		expect([view.revision, view.doc?.staff.maxToolCalls]).toEqual([1, 5]);
	});
	it("the screen's whole form without its revision is refused, nothing written", async () => {
		const con = await owner();
		await seeded(con);
		expect(await save(await ctxOf(con), { whole: "1", "staff.maxToolCalls": "2" })).toEqual({
			status: "refused",
			code: "invalid",
		});
		expect((await con.port.assistantConfig("psizone")).revision).toBe(1);
	});
});
