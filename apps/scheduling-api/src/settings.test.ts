import { DEFAULT_SETTINGS, MySettings, MySettingsOut } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNovuNotify } from "./ports/novu-notify";
import { createWorld, ok, type Populated } from "./testing/populate";
import { NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string } => r.json.error as { code: string };
const quiet = (start: string, end: string) => ({ ...DEFAULT_SETTINGS, quietHours: { start, end } });

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
			quietHours: { start: "22:00", end: "07:30" },
			notifications: {
				requests: { email: false, push: true },
				appointments: { email: true, push: false },
				reminders: { email: false, push: false },
			},
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
		expect(mine[0]?.detail).toEqual({ fields: ["calendarView"] });
	});

	it("the same set again changes nothing and records nothing", async () => {
		ok(await as("ana", "PUT", { ...DEFAULT_SETTINGS, theme: "dark" }), "first");
		const before = await w.fingerprint();
		const again = await as("ana", "PUT", { ...DEFAULT_SETTINGS, theme: "dark" });
		expect(again.status).toBe(200);
		expect(await w.fingerprint()).toBe(before);
	});

	it.each([
		["a quiet hour that starts where it ends", quiet("22:00", "22:00")],
		["a quiet hour past the clock", quiet("24:00", "07:00")],
		["a quiet hour without minutes", quiet("7", "08:00")],
		["an unknown language", { ...DEFAULT_SETTINGS, locale: "fr" }],
		["an unknown theme", { ...DEFAULT_SETTINGS, theme: "blue" }],
		["an unknown calendar view", { ...DEFAULT_SETTINGS, calendarView: "year" }],
		[
			"a kind with no e-mail choice",
			{
				...DEFAULT_SETTINGS,
				notifications: { ...DEFAULT_SETTINGS.notifications, requests: { push: true } },
			},
		],
		[
			"a missing kind",
			{
				...DEFAULT_SETTINGS,
				notifications: { requests: { email: true, push: true } },
			},
		],
		[
			"a choice that is not a yes or no",
			{
				...DEFAULT_SETTINGS,
				notifications: {
					...DEFAULT_SETTINGS.notifications,
					reminders: { email: "on", push: true },
				},
			},
		],
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

	it("the contract bounds quiet hours to HH:MM and refuses a start equal to its end", () => {
		expect(MySettings.safeParse(quiet("00:00", "23:59")).success).toBe(true);
		for (const [s, e] of [
			["23:60", "01:00"],
			["9:00", "10:00"],
			["10:00", "10:00"],
		])
			expect(MySettings.safeParse(quiet(String(s), String(e))).success, `${s}-${e}`).toBe(false);
	});
});

describe("what a person switched off holds for their notifications", () => {
	let w: Populated;
	let calls: { event: string; to: Record<string, unknown>[] }[];
	const notifier = () =>
		createNovuNotify({
			store: w.store,
			clock: () => NOW,
			log: () => undefined,
			notifier: {
				notify(_app, event, _payload, to) {
					calls.push({ event, to: to.map((r) => ({ ...r })) });
					return Promise.resolve({ status: "queued", jobs: to.length });
				},
				drain: () => Promise.resolve(0),
				start: () => () => undefined,
				upsertSubscriber: () => Promise.resolve(),
				setTeam: () => Promise.resolve(),
				pending: () => Promise.resolve(0),
			},
		});
	beforeAll(async () => {
		w = await createWorld();
	});

	it("a practitioner who switched off appointment pushes is named with that choice and their quiet hours", async () => {
		calls = [];
		ok(
			await w.call("dora", "PUT", `${A}/me/settings`, {
				...DEFAULT_SETTINGS,
				quietHours: { start: "20:00", end: "07:00" },
				notifications: {
					...DEFAULT_SETTINGS.notifications,
					appointments: { email: true, push: false },
				},
			}),
			"save",
		);
		await notifier().notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { appointmentId: w.ids.a1 },
			to: { kind: "client", clientId: w.ids.c1 },
			idempotencyKey: "k-choice",
		});
		const dora = calls[0]?.to.find((r) => r.audience === "practitioner");
		expect(dora).toMatchObject({
			subject: "dora",
			choices: {
				off: [{ kind: "appointments", channel: "push" }],
				quietHours: { start: "20:00", end: "07:00", timeZone: "Europe/Bucharest" },
			},
		});
	});

	it("a team message names each member of the team with their own choices instead of the topic", async () => {
		calls = [];
		ok(
			await w.call("rita", "PUT", `${A}/me/settings`, {
				...DEFAULT_SETTINGS,
				notifications: {
					...DEFAULT_SETTINGS.notifications,
					requests: { email: false, push: true },
				},
			}),
			"save",
		);
		await notifier().notify({
			app: "psizone",
			event: "request.created",
			payload: { reference: "ABCD-EFGH" },
			to: { kind: "team", permission: "web_requests_view" },
			idempotencyKey: "k-team",
		});
		const team = calls[0]?.to[0] as {
			audience: string;
			members: { subject: string; choices: unknown }[];
		};
		expect(team.audience).toBe("team");
		const subjects = team.members.map((m) => m.subject);
		expect(subjects).toEqual(expect.arrayContaining(["olga", "rita", "dora"]));
		expect(team.members.find((m) => m.subject === "rita")?.choices).toEqual({
			off: [{ kind: "requests", channel: "email" }],
			quietHours: null,
		});
		expect(team.members.find((m) => m.subject === "olga")?.choices).toEqual({
			off: [],
			quietHours: null,
		});
	});
});
