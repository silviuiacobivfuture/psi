import {
	AssistantEffective,
	AssistantOrgConfig,
	AssistantUsage,
	BUILT_IN_CEILINGS,
	BUILT_IN_SETTINGS,
} from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orgAt, platformAt, turnUse } from "./happy-assistant";
import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };
const A = "/v1/apps/psizone/assistant";
const VIEW_AS = { headers: { "x-psi-view-as": "role:owner" } };

describe.each(factories)("the assistants' configuration, on the $name store", (factory) => {
	let w: Populated;
	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});
	/** A refusal answers what it should and leaves everything the service holds exactly as it was. */
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const eff = async (who: string) =>
		AssistantEffective.parse((await w.call(who, "GET", `${A}/effective`)).json);
	const use = async () => AssistantUsage.parse((await w.call("olga", "GET", `${A}/usage`)).json);
	const revisionOf = async (path: string, who = "olga"): Promise<number> =>
		Number((await w.call(who, "GET", path)).json.revision);

	describe("nothing configured", () => {
		it("the organisation reads revision 0, the built-in settings and the built-in ceilings", async () => {
			const r = await w.call("olga", "GET", `${A}/config`);
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json.revision).toBe(0);
			expect(r.json.doc).toBeUndefined();
			expect(r.json.effective).toEqual(BUILT_IN_SETTINGS);
			expect(r.json.ceilings).toEqual(BUILT_IN_CEILINGS);
		});
		it("every member's next turn runs on the built-in staff settings, nothing used, nothing stopping it", async () => {
			for (const who of ["olga", "rita", "dora", "ana", "vera"]) {
				const r = await w.call(who, "GET", `${A}/effective`);
				expect(r.status, who).toBe(200);
				expect(r.json.settings, who).toEqual(BUILT_IN_SETTINGS.staff);
				expect(r.json.skills).toEqual([]);
				expect(r.json.stop).toBeUndefined();
			}
		});
		it("the estate reads revision 0", async () => {
			expect((await w.call("root", "GET", "/v1/assistant/platform")).json).toEqual({ revision: 0 });
		});
	});

	describe("the platform tier is the estate administrator's alone", () => {
		it("anybody else is refused, and nothing is written", async () => {
			for (const who of ["olga", "nina", "rita", "mallory"]) {
				await refused(() => w.call(who, "GET", "/v1/assistant/platform"), 403, "forbidden");
				await refused(
					() => w.call(who, "PUT", "/v1/assistant/platform", platformAt(0)),
					403,
					"forbidden",
				);
			}
			await refused(() => w.call(null, "PUT", "/v1/assistant/platform", platformAt(0)), 401);
		});
		it("defaults past the platform's own ceilings are refused, naming the value", async () => {
			const r = await refused(
				() =>
					w.call(
						"root",
						"PUT",
						"/v1/assistant/platform",
						platformAt(0, { defaults: { staff: { maxToolCalls: 13 }, visitor: {} } }),
					),
				400,
				"invalid",
			);
			expect(err(r).detail?.fields).toEqual(["staff.maxToolCalls"]);
		});
		it("saves from revision 0, then a save from a stale revision is refused", async () => {
			const saved = await w.call("root", "PUT", "/v1/assistant/platform", platformAt(0));
			expect(saved.status, JSON.stringify(saved.json)).toBe(200);
			expect(saved.json).toMatchObject({ revision: 1, updatedBy: "root" });
			const r = await refused(
				() => w.call("root", "PUT", "/v1/assistant/platform", platformAt(0)),
				409,
				"conflict",
			);
			expect(err(r).detail).toMatchObject({ reason: "stale", revision: 1 });
		});
		it("the platform's defaults reach every organisation that did not choose", async () => {
			expect((await eff("rita")).settings.tone).toBe("neutral");
		});
	});

	describe("the organisation tier is its Owner's and Admin's", () => {
		it("the Owner saves; the journal records who and the revision", async () => {
			const saved = await w.call(
				"olga",
				"PUT",
				`${A}/config`,
				orgAt(await revisionOf(`${A}/config`)),
			);
			expect(saved.status, JSON.stringify(saved.json)).toBe(200);
			expect(saved.json.revision).toBe(1);
			expect(AssistantOrgConfig.parse(saved.json).effective.staff.maxToolCalls).toBe(6);
			expect(AssistantOrgConfig.parse(saved.json).effective.visitor.tone).toBe("formal");
			const audit = await w.call(
				"olga",
				"GET",
				"/v1/apps/psizone/audit?action=assistant.config.put",
			);
			expect(audit.status).toBe(200);
			const items = audit.json.items as Array<{
				actor: { subject: string };
				target: { id: string };
			}>;
			expect(items.length).toBe(1);
			expect(items[0]?.actor.subject).toBe("olga");
			expect(items[0]?.target.id).toBe("assistant-config");
		});
		it("the Admin saves too", async () => {
			const saved = await w.call(
				"nina",
				"PUT",
				`${A}/config`,
				orgAt(await revisionOf(`${A}/config`)),
			);
			expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		});
		it("Reception, Therapist, Coordinator, Accountant and Volunteer can neither read nor save it", async () => {
			const revision = await revisionOf(`${A}/config`);
			for (const who of ["rita", "dora", "cora", "ana", "vera"]) {
				await refused(() => w.call(who, "GET", `${A}/config`), 403, "forbidden");
				await refused(() => w.call(who, "PUT", `${A}/config`, orgAt(revision)), 403, "forbidden");
				await refused(() => w.call(who, "GET", `${A}/usage`), 403, "forbidden");
			}
		});
		it("a stranger is told the app is not there; no sign-in is refused", async () => {
			await refused(() => w.call("mallory", "PUT", `${A}/config`, orgAt(0)), 404, "not_found");
			await refused(() => w.call("mallory", "GET", `${A}/effective`), 404, "not_found");
			await refused(() => w.call(null, "GET", `${A}/effective`), 401, "unauthenticated");
		});
		it("looking at the app as someone else cannot save, nor record usage", async () => {
			const revision = await revisionOf(`${A}/config`);
			await refused(
				() => w.call("olga", "PUT", `${A}/config`, orgAt(revision), VIEW_AS),
				403,
				"forbidden",
			);
			await refused(() => w.call("olga", "POST", `${A}/usage`, turnUse, VIEW_AS), 403, "forbidden");
		});
		it("values past the estate's ceilings are refused, each named, nothing stored", async () => {
			const revision = await revisionOf(`${A}/config`);
			const r = await refused(
				() =>
					w.call(
						"olga",
						"PUT",
						`${A}/config`,
						orgAt(revision, {
							staff: { maxToolCalls: 13, model: { primary: "unknown/model" } },
							roles: { [w.ids.roles.owner ?? "owner"]: { messagesPerDay: 9_999 } },
						}),
					),
				400,
				"invalid",
			);
			expect((err(r).detail?.fields as string[]).sort()).toEqual([
				`roles.${w.ids.roles.owner}.messagesPerDay`,
				"staff.maxToolCalls",
				"staff.model",
			]);
		});
		it("a setting that is not configuration (the booking form's mandatory fields) is refused", async () => {
			const revision = await revisionOf(`${A}/config`);
			await refused(
				() =>
					w.call(
						"olga",
						"PUT",
						`${A}/config`,
						orgAt(revision, { visitor: { requiredFields: [] } }),
					),
				400,
				"invalid",
			);
		});
		it("a stale save is refused with the revision now held", async () => {
			const r = await refused(
				() => w.call("olga", "PUT", `${A}/config`, orgAt(0)),
				409,
				"conflict",
			);
			expect(err(r).detail).toMatchObject({ reason: "stale" });
		});
		it("each organisation has its own: another app's save changes nothing here", async () => {
			const before = (await w.call("olga", "GET", `${A}/config`)).json;
			const saved = await w.call(
				"hugo",
				"PUT",
				"/v1/apps/hemisync/assistant/config",
				orgAt(0, { staff: { maxToolCalls: 2 } }),
			);
			expect(saved.status, JSON.stringify(saved.json)).toBe(200);
			expect((await w.call("olga", "GET", `${A}/config`)).json).toEqual(before);
			await refused(
				() => w.call("olga", "GET", "/v1/apps/hemisync/assistant/config"),
				404,
				"not_found",
			);
		});
	});

	describe("what governs one person's turn", () => {
		it("a role's override applies to its holders, the organisation's to the rest", async () => {
			const revision = await revisionOf(`${A}/config`);
			const roles = { [w.ids.roles.reception ?? "reception"]: { maxToolCalls: 4 } };
			expect((await w.call("olga", "PUT", `${A}/config`, orgAt(revision, { roles }))).status).toBe(
				200,
			);
			expect((await eff("rita")).settings.maxToolCalls).toBe(4);
			expect((await eff("olga")).settings.maxToolCalls).toBe(6);
			const skills = (await eff("dora")).skills as Array<{ id: string }>;
			expect(skills.map((s) => s.id)).toEqual(["intake"]);
		});
		it("a person switched off, and a lowered platform ceiling, hold at once", async () => {
			const revision = await revisionOf(`${A}/config`);
			const saved = await w.call(
				"olga",
				"PUT",
				`${A}/config`,
				orgAt(revision, { people: { vera: { enabled: false } } }),
			);
			expect(saved.status, JSON.stringify(saved.json)).toBe(200);
			expect((await eff("vera")).stop).toBe("disabled");
			expect((await eff("dora")).stop).toBeUndefined();
			const low = { ...BUILT_IN_CEILINGS, staff: { ...BUILT_IN_CEILINGS.staff, maxToolCalls: 3 } };
			const p = await revisionOf("/v1/assistant/platform", "root");
			expect(
				(await w.call("root", "PUT", "/v1/assistant/platform", platformAt(p, { ceilings: low })))
					.status,
			).toBe(200);
			expect((await eff("olga")).settings.maxToolCalls).toBe(3);
		});
		it("the version changes when a tier is saved", async () => {
			const before = (await eff("rita")).version;
			const revision = await revisionOf(`${A}/config`);
			// Within the lowered ceiling (3 tool calls): the staff part asks for nothing past it.
			const saved = await w.call(
				"olga",
				"PUT",
				`${A}/config`,
				orgAt(revision, { staff: {}, roles: {} }),
			);
			expect(saved.status, JSON.stringify(saved.json)).toBe(200);
			expect((await eff("rita")).version).not.toBe(before);
		});
	});

	describe("the meters", () => {
		it("a turn's use adds to the organisation's month and day and to the person's own day", async () => {
			const before = await use();
			const r = await w.call("dora", "POST", `${A}/usage`, turnUse);
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			const after = await use();
			expect(after.staff.month.messages).toBe(before.staff.month.messages + 1);
			expect(after.staff.day.inputTokens).toBe(before.staff.day.inputTokens + 1_200);
			expect(after.staff.month.costMicroUsd).toBe(before.staff.month.costMicroUsd + 450);
			expect(after.visitor).toEqual(before.visitor);
			const mine = (await eff("dora")).usage.mine;
			expect(mine?.messages).toBe(1);
			expect((await eff("rita")).usage.mine?.messages).toBe(0);
		});
		it("a limit hit is counted", async () => {
			const before = (await use()).staff.day.limitHits;
			await w.call("dora", "POST", `${A}/usage`, { ...turnUse, limitHit: true });
			expect((await use()).staff.day.limitHits).toBe(before + 1);
		});
		it("a negative, fractional or oversized use is refused and counts nothing", async () => {
			for (const bad of [
				{ inputTokens: -1 },
				{ outputTokens: 1.5 },
				{ costMicroUsd: 50_000_001 },
				{ surface: "visitor" },
			])
				await refused(
					() => w.call("dora", "POST", `${A}/usage`, { ...turnUse, ...bad }),
					400,
					"invalid",
				);
			await refused(() => w.call("mallory", "POST", `${A}/usage`, turnUse), 404, "not_found");
		});
		it("the budget stops the next turn once spent, and the person's own messages for the day stop theirs", async () => {
			const revision = await revisionOf(`${A}/config`);
			await w.call(
				"olga",
				"PUT",
				`${A}/config`,
				orgAt(revision, {
					staff: {},
					roles: { [w.ids.roles.therapist ?? "therapist"]: { messagesPerDay: 3 } },
				}),
			);
			const used = (await eff("dora")).usage.mine?.messages ?? 0;
			for (let i = used; i < 3; i += 1) await w.call("dora", "POST", `${A}/usage`, turnUse);
			expect((await eff("dora")).stop).toBe("messages_day");
			expect((await eff("rita")).stop).toBeUndefined();
			const spent = (await use()).staff.month.costMicroUsd;
			const r2 = await revisionOf(`${A}/config`);
			await w.call(
				"olga",
				"PUT",
				`${A}/config`,
				orgAt(r2, { staff: { budget: { monthlyMicroUsd: spent } }, roles: {} }),
			);
			expect((await eff("rita")).stop).toBe("budget");
			const answer = await w.call("rita", "POST", `${A}/usage`, turnUse);
			expect(answer.json.stop).toBe("budget");
		});
	});
});
