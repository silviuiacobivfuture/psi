import { DEFAULT_SETTINGS, MySettings, MySettingsOut } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string } => r.json.error as { code: string };

describe.each(factories)("a person's own settings, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, body?: unknown, app = "psizone") =>
		w.call(who, method, `/v1/apps/${app}/me/settings`, body);
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<void> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
	}
	const trail = async () =>
		(
			(await w.call("olga", "GET", `${A}/audit?action=settings.update`)).json.items as {
				actor: { subject: string };
				target: { id: string };
				detail?: Record<string, unknown>;
			}[]
		).filter(Boolean);

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	it("answers the defaults, not stored, while the person saved none", async () => {
		const out = MySettingsOut.parse(ok(await as("vera", "GET"), "read"));
		expect(out).toEqual({ ...DEFAULT_SETTINGS, stored: false });
	});

	it("saves the whole set, answers it stored, and reads it back on the next call", async () => {
		const wanted = {
			locale: "en",
			theme: "dark",
			calendarView: "week",
		};
		const saved = MySettingsOut.parse(ok(await as("dora", "PUT", wanted), "save"));
		expect(saved).toMatchObject({ ...wanted, stored: true });
		expect(saved.updatedAt).toBeTypeOf("number");
		expect(MySettingsOut.parse(ok(await as("dora", "GET"), "read"))).toMatchObject(wanted);
	});

	it("is the person's own: another member, and the same person in another app, still see the defaults", async () => {
		ok(await as("elena", "PUT", { ...DEFAULT_SETTINGS, theme: "light" }), "save");
		expect(MySettingsOut.parse(ok(await as("rita", "GET"), "rita")).theme).toBe("system");
		expect(MySettingsOut.parse(ok(await as("elena", "GET"), "elena")).theme).toBe("light");
		// Olga belongs to psizone only; Hugo owns hemisync: his settings there are his alone.
		ok(await as("hugo", "PUT", { ...DEFAULT_SETTINGS, locale: "en" }, "hemisync"), "hugo");
		expect(MySettingsOut.parse(ok(await as("olga", "GET"), "olga")).locale).toBe("ro");
	});

	it("journals a save by its author, naming the settings that moved and none of their values", async () => {
		ok(await as("cora", "PUT", { ...DEFAULT_SETTINGS, calendarView: "month" }), "save");
		const mine = (await trail()).filter((e) => e.target.id === "cora");
		expect(mine).toHaveLength(1);
		expect(mine[0]?.actor.subject).toBe("cora");
		expect(mine[0]?.detail).toEqual({ calendarView: true });
	});

	it("the same set again changes nothing and records nothing", async () => {
		ok(await as("ana", "PUT", { ...DEFAULT_SETTINGS, theme: "dark" }), "first");
		const before = await w.fingerprint();
		const again = await as("ana", "PUT", { ...DEFAULT_SETTINGS, theme: "dark" });
		expect(again.status).toBe(200);
		expect(await w.fingerprint()).toBe(before);
	});

	it.each([
		["an unknown language", { ...DEFAULT_SETTINGS, locale: "fr" }],
		["an unknown theme", { ...DEFAULT_SETTINGS, theme: "blue" }],
		["an unknown calendar view", { ...DEFAULT_SETTINGS, calendarView: "year" }],
		["a language that is not a choice", { ...DEFAULT_SETTINGS, locale: 1 }],
		["no body at all", {}],
	])("refuses %s, writing nothing", async (_label, body) => {
		await refused(() => as("nina", "PUT", body), 400, "invalid");
		expect(MySettingsOut.parse(ok(await as("nina", "GET"), "read")).stored).toBe(false);
	});

	it("refuses no sign-in, a stranger, and saving while looking at the app as someone else", async () => {
		await refused(() => as(null, "PUT", DEFAULT_SETTINGS), 401);
		await refused(() => as("mallory", "PUT", DEFAULT_SETTINGS), 404, "not_found");
		await refused(
			() =>
				w.call("olga", "PUT", `${A}/me/settings`, DEFAULT_SETTINGS, {
					headers: { "x-psi-view-as": "rita" },
				}),
			403,
			"forbidden",
		);
	});

	it("keeps no notification choices: a body carrying them stores only what this route owns", async () => {
		const out = MySettingsOut.parse(
			ok(
				await as("dora", "PUT", {
					...DEFAULT_SETTINGS,
					quietHours: { start: "22:00", end: "07:00" },
				}),
				"save",
			),
		);
		expect(Object.keys(out).sort()).toEqual([
			"calendarView",
			"locale",
			"stored",
			"theme",
			"updatedAt",
		]);
		expect(MySettings.safeParse({ ...DEFAULT_SETTINGS, theme: "dim" }).success).toBe(false);
	});
});
