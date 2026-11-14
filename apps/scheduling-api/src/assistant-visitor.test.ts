import { AssistantEffective, AssistantUsage } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orgAt, visitorTurnUse } from "./happy-assistant";
import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const factories = await worldFactories();
const A = "/v1/apps/psizone";
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe.each(
	factories,
)("a site's visitor assistant, over the service, on the $name store", (factory) => {
	let w: Populated;
	beforeAll(async () => {
		w = await factory.create();
	}, 120_000);
	afterAll(async () => {
		await factory.cleanup();
	}, 120_000);
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const read = async (site = "psizone-web" as const, app = "psizone") =>
		w.callKey(site, "GET", `/v1/apps/${app}/book/assistant`);
	const meters = async () =>
		AssistantUsage.parse((await w.call("olga", "GET", `${A}/assistant/usage`)).json).visitor;
	const revision = async (): Promise<number> =>
		Number((await w.call("olga", "GET", `${A}/assistant/config`)).json.revision);

	it("with nothing configured: the built-in visitor settings, no stop, the meters at zero", async () => {
		const reply = await read();
		expect(reply.status, JSON.stringify(reply.json)).toBe(200);
		const got = AssistantEffective.parse(reply.json);
		expect(got.surface).toBe("visitor");
		expect(got.stop).toBeUndefined();
		expect(got.usage.day.messages).toBe(0);
	});

	it("the organisation's settings for the site's surface, merged by the service, are what the site reads", async () => {
		const saved = await w.call(
			"olga",
			"PUT",
			`${A}/assistant/config`,
			orgAt(await revision(), {
				visitor: { booking: { horizonDays: 9, offerCallback: false }, messages: { perDay: 3 } },
			}),
		);
		expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		const got = AssistantEffective.parse((await read()).json);
		expect(got.settings.booking).toEqual({ horizonDays: 9, offerCallback: false });
		expect(got.settings.messages.perDay).toBe(3);
		// The staff surface's settings are not the site's: its tool-call limit is not read here.
		expect(got.settings.maxToolCalls).not.toBe(6);
	});

	it("a turn's use adds to the visitor meters of the month and the day, nothing to the staff's", async () => {
		const before = await meters();
		const staffBefore = AssistantUsage.parse(
			(await w.call("olga", "GET", `${A}/assistant/usage`)).json,
		).staff;
		const r = await w.callKey("psizone-web", "POST", `${A}/book/assistant/usage`, visitorTurnUse);
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		const after = await meters();
		expect(after.day.messages).toBe(before.day.messages + 1);
		expect(after.month.inputTokens).toBe(before.month.inputTokens + visitorTurnUse.inputTokens);
		expect(after.day.costMicroUsd).toBe(before.day.costMicroUsd + visitorTurnUse.costMicroUsd);
		expect(
			AssistantUsage.parse((await w.call("olga", "GET", `${A}/assistant/usage`)).json).staff,
		).toEqual(staffBefore);
		const got = AssistantEffective.parse((await read()).json);
		expect(got.usage.day.messages).toBe(after.day.messages);
	});

	it("a refused turn is a limit met, not a message; the limit it reaches is answered as the stop", async () => {
		const before = await meters();
		const hit = {
			...visitorTurnUse,
			messages: 0,
			inputTokens: 0,
			outputTokens: 0,
			costMicroUsd: 0,
			limitHits: 1,
		};
		const r = await w.callKey("psizone-web", "POST", `${A}/book/assistant/usage`, hit);
		expect(r.status).toBe(200);
		const after = await meters();
		expect(after.day.limitHits).toBe(before.day.limitHits + 1);
		expect(after.day.messages).toBe(before.day.messages);
		// The organisation's monthly tokens at their floor (10 000), then a turn that reaches them: the site is told to stop.
		const saved = await w.call(
			"olga",
			"PUT",
			`${A}/assistant/config`,
			orgAt(await revision(), { visitor: { tokens: { perMonth: 10_000 } } }),
		);
		expect(saved.status, JSON.stringify(saved.json)).toBe(200);
		const next = await w.callKey("psizone-web", "POST", `${A}/book/assistant/usage`, {
			...visitorTurnUse,
			inputTokens: 10_000,
		});
		expect(next.json.stop).toBe("tokens_month");
		expect(AssistantEffective.parse((await read()).json).stop).toBe("tokens_month");
	});

	it("a signed-in visitor (a person's token) reaches neither, and nothing is written", async () => {
		const a = await refused(() => w.call("rita", "GET", `${A}/book/assistant`), 403, "forbidden");
		expect(err(a).detail).toMatchObject({ reason: "site_only" });
		await refused(
			() => w.call("rita", "POST", `${A}/book/assistant/usage`, visitorTurnUse),
			403,
			"forbidden",
		);
	});

	it("another site's key is refused for this app, and nothing is written", async () => {
		await refused(() => read("hemisync-web" as "psizone-web", "psizone"), 403, "forbidden");
		await refused(
			() => w.callKey("hemisync-web", "POST", `${A}/book/assistant/usage`, visitorTurnUse),
			403,
			"forbidden",
		);
	});

	it.each([
		["more than one message", { ...visitorTurnUse, messages: 2 }],
		["a negative token count", { ...visitorTurnUse, inputTokens: -1 }],
		["a cost past the bound", { ...visitorTurnUse, costMicroUsd: 5_000_001 }],
		["a field missing", { messages: 1 }],
	])("a report with %s is refused, nothing written", async (_what, body) => {
		await refused(
			() => w.callKey("psizone-web", "POST", `${A}/book/assistant/usage`, body),
			400,
			"invalid",
		);
	});
});
