import { afterEach, describe, expect, it } from "vitest";
import { listActions, runAction } from "../actions/engine";
import { ACTIONS } from "../actions/registry";
import type { ActionCtx } from "../actions/types";
import { canOf } from "../lib/can";
import { createFakePort } from "../port/fake";
import { DEFAULT_SETTINGS } from "../port/schema-settings";
import { type Console, MEMBER, ORIGIN, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const open = async (roles: string[] = ["owner"]): Promise<void> => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{
			[MEMBER.sub]: [{ app: "psizone", roles }],
		},
	);
	await c.signIn();
};
const form = { "content-type": "application/x-www-form-urlencoded" };
const post = (path: string, values: Record<string, string>): Promise<Response> =>
	c.post(path, new URLSearchParams(values), form);
const mine = () => c.port.mySettings("psizone", MEMBER.sub);

describe("Setările mele: the page", () => {
	it("is reachable by every role and shows the preferences, the notification matrix, quiet hours and devices", async () => {
		for (const role of ["owner", "reception", "therapist", "accountant"]) {
			await open([role]);
			const res = await c.get("/me/settings");
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain('data-action="me.settings"');
			expect(html).toContain('data-action="me.notifications"');
			for (const name of ["locale", "theme", "calendarView", "quiet", "quietStart", "quietEnd"])
				expect(html, name).toContain(`name="${name}"`);
			for (const kind of ["requests", "appointments", "reminders"])
				for (const channel of ["email", "push"])
					expect(html).toContain(`name="n.${kind}.${channel}"`);
			expect(html).toContain("Ore de liniște");
			await c.close();
		}
	});

	it("starts from the defaults: Romanian, the device's theme, the day view, every channel ticked, no quiet hours", async () => {
		await open();
		const html = await (await c.get("/me/settings")).text();
		expect(html).toMatch(/<option value="ro" selected/);
		expect(html).toMatch(/<option value="system" selected/);
		expect(html).toMatch(/<option value="day" selected/);
		expect(html.match(/name="n\.[a-z]+\.(email|push)" checked/g)).toHaveLength(6);
		expect(html).not.toMatch(/name="quiet" checked/);
	});
});

describe("Setările mele: saving", () => {
	it("saves language, theme and view for the person, and the device follows at once", async () => {
		await open();
		const res = await post("/me/settings", { locale: "en", theme: "dark", calendarView: "week" });
		expect(res.status).toBe(200);
		expect(await mine()).toMatchObject({
			locale: "en",
			theme: "dark",
			calendarView: "week",
			stored: true,
		});
		const cookies = c.browser.cookies(ORIGIN);
		expect(cookies.get("lang")).toBe("en");
		expect(cookies.get("theme")).toBe("dark");
		expect(await res.text()).toContain("My settings");
	});

	it("the calendar opens on the chosen view when the address names none, and keeps an asked one", async () => {
		await open();
		await post("/me/settings", { locale: "ro", theme: "system", calendarView: "week" });
		expect(await (await c.get("/calendar")).text()).toMatch(
			/aria-current="(page|true)"[^>]*>\s*Săptămână/,
		);
		expect(await (await c.get("/calendar?view=day")).text()).toMatch(
			/aria-current="(page|true)"[^>]*>\s*Zi/,
		);
	});

	it("a new device (no language or theme kept) shows the person's own and then remembers them", async () => {
		await open();
		await post("/me/settings", { locale: "en", theme: "light", calendarView: "day" });
		const cookies = c.browser.cookies(ORIGIN);
		cookies.delete("lang");
		cookies.delete("theme");
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain('lang="en"');
		expect(cookies.get("lang")).toBe("en");
		expect(cookies.get("theme")).toBe("light");
	});

	it("a device that chose its own language keeps it", async () => {
		await open();
		await post("/me/settings", { locale: "en", theme: "dark", calendarView: "day" });
		c.browser.cookies(ORIGIN).set("lang", "ro");
		expect(await (await c.get("/calendar")).text()).toContain('lang="ro"');
	});

	it("saves the matrix per kind and channel, only what is ticked, with quiet hours", async () => {
		await open();
		const res = await post("/me/settings/notifications", {
			"n.requests.push": "on",
			"n.appointments.email": "on",
			"n.appointments.push": "on",
			quiet: "on",
			quietStart: "22:00",
			quietEnd: "07:00",
		});
		expect(res.status).toBe(200);
		expect(await mine()).toMatchObject({
			quietHours: { start: "22:00", end: "07:00" },
			notifications: {
				requests: { email: false, push: true },
				appointments: { email: true, push: true },
				reminders: { email: false, push: false },
			},
		});
		const html = await res.text();
		expect(html).toMatch(/name="quiet" checked/);
		expect(html).toContain('value="22:00"');
	});

	it("unticking quiet hours clears them; the other settings stay", async () => {
		await open();
		await post("/me/settings", { locale: "ro", theme: "dark", calendarView: "month" });
		await post("/me/settings/notifications", {
			quiet: "on",
			quietStart: "21:00",
			quietEnd: "06:00",
		});
		await post("/me/settings/notifications", { quietStart: "21:00", quietEnd: "06:00" });
		expect(await mine()).toMatchObject({ quietHours: null, theme: "dark", calendarView: "month" });
	});

	it.each([
		[
			"quiet hours that start where they end",
			{ quiet: "on", quietStart: "08:00", quietEnd: "08:00" },
		],
		["quiet hours with no end", { quiet: "on", quietStart: "08:00" }],
		["a time that is not a time", { quiet: "on", quietStart: "8", quietEnd: "09:00" }],
	])("refuses %s: the page says nothing was saved, nothing is stored", async (_l, values) => {
		await open();
		const res = await post("/me/settings/notifications", values);
		expect(await res.text()).toContain("Nu s-a salvat nimic");
		expect((await mine()).stored).toBe(false);
	});

	it("refuses an unknown language or view, storing nothing", async () => {
		await open();
		for (const values of [{ locale: "fr" }, { calendarView: "year" }, { theme: "blue" }] as Record<
			string,
			string
		>[]) {
			const res = await post("/me/settings", values);
			expect(await res.text()).toContain("Nu s-a salvat nimic");
		}
		expect((await mine()).stored).toBe(false);
	});
});

describe("Setările mele in the action registry", () => {
	const ctxFor = async (): Promise<ActionCtx> => {
		const port = createFakePort({
			today: "2026-11-16",
			members: { s1: [{ app: "psizone", roles: ["reception"] }] },
		});
		return {
			port,
			app: "psizone",
			can: canOf(await port.capabilities("s1", "psizone"), false),
			actor: { subject: "s1", name: "Ana Test" },
			locale: "ro",
			today: "2026-11-16",
		};
	};

	it("both actions are registered, for everyone, in the palette, with their routes", async () => {
		for (const [id, path] of [
			["me.settings", "/me/settings"],
			["me.notifications", "/me/settings/notifications"],
		] as const) {
			const a = ACTIONS.find((x) => x.id === id);
			expect(a?.route).toEqual({ method: "POST", path });
			expect(a?.needs).toEqual({});
		}
		const listed = listActions(await ctxFor(), { screen: "global" }).map((a) => a.id);
		expect(listed).toEqual(expect.arrayContaining(["me.settings", "me.notifications"]));
	});

	it("the assistant changes one setting and leaves the rest as they were", async () => {
		const ctx = await ctxFor();
		const out = await runAction(ctx, "me.settings", { calendarView: "month" }, { confirmed: true });
		expect(out).toMatchObject({
			status: "ok",
			data: { ...DEFAULT_SETTINGS, calendarView: "month" },
		});
		expect(await ctx.port.mySettings("psizone", "s1")).toEqual({
			...DEFAULT_SETTINGS,
			calendarView: "month",
			stored: true,
		});
	});

	it("an invalid value is refused as invalid and nothing is stored", async () => {
		const ctx = await ctxFor();
		expect(await runAction(ctx, "me.settings", { locale: "de" }, { confirmed: true })).toEqual({
			status: "refused",
			code: "invalid",
		});
		expect((await ctx.port.mySettings("psizone", "s1")).stored).toBe(false);
	});
});
