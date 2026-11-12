/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createAccount } from "../account";
import type { Say } from "./labels";
import { registerJourney } from "./routes";

/** Production with no account settings: the site boots, and every account path says "coming soon". */
describe("accounts off in production", () => {
	it("answers /cont/* and /auth/* with coming soon, and says so once at start", async () => {
		const warnings: string[] = [];
		const account = createAccount({
			site: {
				slug: "blog-web",
				key: "blog",
				origin: "https://blog.psizone.ro",
			},
			env: { NODE_ENV: "production" },
			onWarn: (m) => warnings.push(m),
		});
		expect(account.enabled).toBe(false);
		expect(warnings).toEqual([
			'accounts are off for blog-web: no account settings in production; /cont answers "coming soon"',
		]);
		const say: Say = (key) => key;
		const app = new Hono();
		account.mount(app);
		for (const base of ["", "/en"]) {
			registerJourney(app, {
				account,
				locale: base === "" ? "ro" : "en",
				base,
				site: "blog",
				say,
				siteNames: {},
				render: (c, page) => c.html(<main>{page.body}</main>),
			});
		}
		app.get("/", (c) => c.text("home"));
		const at = (path: string, init?: RequestInit) =>
			app.fetch(new Request(`https://blog.psizone.ro${path}`, init));
		for (const path of [
			"/cont",
			"/cont/programari",
			"/en/cont/date",
			"/cont/salvate/nou",
		]) {
			const res = await at(path);
			expect(res.status).toBe(200);
			expect(await res.text()).toContain('data-account="coming-soon"');
		}
		expect((await at("/cont/profil", { method: "POST" })).status).toBe(200);
		const signIn = await at("/auth/sign-in?return=%2F");
		expect(signIn.status).toBe(302);
		expect(signIn.headers.get("location")).toBe("/cont");
		expect(
			(await at("/auth/backchannel-logout", { method: "POST" })).status,
		).toBe(302);
		expect(await (await at("/")).text()).toBe("home");
	});
});
