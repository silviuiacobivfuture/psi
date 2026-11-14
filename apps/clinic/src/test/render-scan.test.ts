import { afterEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

const SCREENS = [
	"/calendar?date=2026-11-16",
	"/calendar?view=week&date=2026-11-16",
	"/calendar?view=month&date=2026-11-16",
	"/clients",
	"/clients?filter=archived",
	"/clients/c1",
	"/clients/c1/appointments",
	"/clients/c1/packages",
	"/clients/c1/packages?new=invalid",
	"/clients/c1/packages?made=k1",
	"/clients/c2/packages",
	"/clients/c3/packages",
	"/clients/c4/packages",
	"/clients/c8/packages",
	"/clients/c1/records",
	"/clients/c1/files",
	"/requests",
	"/reminders?date=2026-11-16",
	"/roster",
	"/settings/roles?role=reception",
	"/me/settings",
	"/settings",
	"/settings/profile",
	"/settings/blacklist",
	"/settings/builder",
	"/settings/audit",
	"/more",
] as const;

/** What a person reads: no markup, no scripts, no styles. */
const visibleText = (html: string): string =>
	html
		.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ");

let c: Console | undefined;
afterEach(async () => {
	await c?.close();
	c = undefined;
});

const BAD_TEXT = /\b(NaN|undefined|Infinity|null)\b/;
const BAD_MARKUP = /\b(NaN|undefined|Infinity)\b/;

describe("no screen ever shows NaN, undefined, Infinity or null", () => {
	for (const [state, fake] of [
		["with data", {}],
		["empty clinic", { empty: true }],
	] as const) {
		it(`every screen, ${state}`, async () => {
			c = await startConsole(MEMBER, { today: "2026-11-16", ...fake });
			await c.signIn();
			const bad: string[] = [];
			for (const path of SCREENS) {
				const res = await c.get(path);
				const html = await res.text();
				const text = BAD_TEXT.exec(visibleText(html));
				if (text !== null) bad.push(`${path}: text has ${text[0]}`);
				const markup = BAD_MARKUP.exec(html.replace(/<script[\s\S]*?<\/script>/g, ""));
				if (markup !== null) bad.push(`${path}: markup has ${markup[0]}`);
			}
			expect(bad).toEqual([]);
		});
	}

	it("a package with nothing in it (no sessions, no price, bonus only, over-used) renders clean", async () => {
		c = await startConsole(MEMBER, { today: "2026-11-16" });
		await c.signIn();
		const json = {
			"content-type": "application/json",
			"datastar-request": "true",
		};
		const edit = (f: string, v: string) =>
			c?.post(
				`/clients/c2/packages/k2/field/${f}`,
				JSON.stringify({ ie: { [`k2_${f}`]: { o: true, v } } }),
				json,
			);
		await edit("total", "");
		await edit("bonus", "3");
		await edit("note", "");
		const html = await (await c.get("/clients/c2/packages")).text();
		expect(BAD_TEXT.exec(visibleText(html))).toBeNull();
		expect(BAD_MARKUP.exec(html.replace(/<script[\s\S]*?<\/script>/g, ""))).toBeNull();
	});
});
