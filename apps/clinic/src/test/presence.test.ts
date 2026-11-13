import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Console, MEMBER, OUTSIDER, startConsole } from "./harness";

/** Every page the console serves, as a member sees it. */
const PAGES = [
	"/calendar",
	"/calendar?view=week",
	"/calendar?view=month",
	"/calendar?new=1",
	"/clients",
	"/clients?filter=archived",
	"/clients/c1",
	"/clients/c1/appointments",
	"/clients/c1/packages",
	"/clients/c1/records",
	"/clients/c1/files",
	"/requests",
	"/requests?show=handled",
	"/reminders",
	"/roster",
	"/settings/people",
	"/settings/rooms",
	"/settings/devices",
	"/settings/services",
	"/settings/roles",
	"/me/settings",
	"/settings",
	"/settings/profile",
	"/settings/blacklist",
	"/settings/builder",
	"/settings/audit",
	"/more",
	"/search?q=Exemplu",
] as const;

describe("a signed-in member", () => {
	let member: Console;
	beforeAll(async () => {
		member = await startConsole(MEMBER);
		await member.signIn();
	});
	afterAll(() => member.close());

	it.each(PAGES)("sees %s", async (path) => {
		const res = await member.get(path);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(await res.text()).toContain("<html");
	});

	it("lands on the calendar from the root and from sign-in", async () => {
		const { trail } = await member.browser.go(`${member.origin}/`);
		expect(trail.at(-1)).toBe(`${member.origin}/calendar`);
	});

	it("answers 404 inside the shell for an unknown page and an unknown client", async () => {
		expect((await member.get("/nope")).status).toBe(404);
		expect((await member.get("/clients/zz")).status).toBe(404);
	});

	it("serves the PWA: manifest, worker and offline page, signed in or not", async () => {
		const manifest = await member.get("/manifest.webmanifest");
		expect(manifest.status).toBe(200);
		expect(await manifest.json()).toMatchObject({
			short_name: "Programări",
			display: "standalone",
		});
		expect((await member.get("/sw.js")).status).toBe(200);
		expect((await member.get("/offline")).status).toBe(200);
		expect((await member.get("/healthz")).status).toBe(200);
	});

	it("serves the stylesheet and Datastar at the paths the worker caches", async () => {
		expect((await member.get("/assets/app.css")).status).toBe(200);
		expect((await member.get("/assets/datastar.js")).headers.get("content-type")).toContain(
			"javascript",
		);
	});
});

describe("someone not signed in", () => {
	let anon: Console;
	beforeAll(async () => {
		anon = await startConsole(MEMBER);
	});
	afterAll(() => anon.close());

	it.each(PAGES)("is sent to sign in from %s, never shown the page", async (path) => {
		const res = await anon.raw(path);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`/auth/sign-in?return=${encodeURIComponent(path)}`);
		expect(await res.text()).not.toContain("Exemplu");
	});

	it("is refused a write with no session: nothing changes", async () => {
		const before = await anon.port.clients("psizone", "current", "");
		for (const path of [
			"/clients/c1/delete",
			"/clients/c1/archive",
			"/requests/w1/handled",
			"/calendar/new",
			"/settings/roles/owner",
		]) {
			const res = await anon.raw(path, {
				method: "POST",
				headers: { origin: anon.origin, "sec-fetch-site": "same-origin" },
			});
			expect(res.status, path).toBe(302);
		}
		expect((await anon.port.clients("psizone", "current", "")).length).toBe(before.length);
		expect((await anon.port.requests("psizone")).find((r) => r.id === "w1")?.handled).toBe(false);
	});

	it("signs in through the estate's issuer and lands back on the page it asked for", async () => {
		const { trail, res } = await anon.browser.go(`${anon.origin}/requests`);
		expect(trail[1]).toBe("/auth/sign-in?return=%2Frequests".replace(/^/, `${anon.origin}`));
		expect(trail[2]).toContain("/application/o/authorize/");
		expect(trail.at(-1)).toBe(`${anon.origin}/requests`);
		expect(res.status).toBe(200);
	});
});

describe("someone signed in who belongs to no app", () => {
	let outsider: Console;
	beforeAll(async () => {
		outsider = await startConsole(OUTSIDER, {}, {});
		await outsider.signIn();
	});
	afterAll(() => outsider.close());

	it.each([
		"/calendar",
		"/clients",
		"/settings/roles",
		"/audit",
	])("gets the clear no-access page at %s, not the data", async (path) => {
		const res = await outsider.get(path);
		expect(res.status).toBe(403);
		const html = await res.text();
		expect(html).toContain("Nu ai încă acces");
		expect(html).toContain("Bogdan Test");
		expect(html).not.toContain("Exemplu");
	});

	it("can still sign out from it", async () => {
		const html = await (await outsider.get("/calendar")).text();
		expect(html).toContain('action="/auth/sign-out"');
	});
});

describe("signing out", () => {
	it("ends the server-side session: the cookie that was valid no longer opens a page", async () => {
		const c = await startConsole(MEMBER);
		await c.signIn();
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain('action="/auth/sign-out"');
		const cookie = [...c.browser.cookies(c.origin)].map(([k, v]) => `${k}=${v}`).join("; ");
		expect((await c.raw("/calendar", { headers: { cookie } })).status).toBe(200);
		await c.post("/auth/sign-out");
		const after = await c.raw("/calendar", { headers: { cookie } });
		expect(after.status).toBe(302);
		expect(after.headers.get("location")).toContain("/auth/sign-in");
		await c.close();
	});
});

describe("writes from another origin", () => {
	let member: Console;
	beforeAll(async () => {
		member = await startConsole(MEMBER);
		await member.signIn();
	});
	afterAll(() => member.close());

	it("are refused and change nothing", async () => {
		const res = await member.post("/clients/c1/archive", undefined, {
			origin: "https://evil.example",
		});
		expect(res.status).toBe(403);
		expect((await member.port.client("psizone", "c1"))?.status).toBe("current");
	});
});
