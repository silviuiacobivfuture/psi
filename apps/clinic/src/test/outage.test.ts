import { afterEach, describe, expect, it } from "vitest";
import { PortError } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * The service failing before the console knows who asks (the request's context: who they are a member of, their app,
 * what they may do). 2026-11-14 the owner got the bare word "unavailable" on programari.psizone.ro for that.
 */
let c: Console;
afterEach(async () => c.close());

async function failingContext(): Promise<() => void> {
	c = await startConsole(MEMBER);
	await c.signIn();
	const real = c.port.memberships.bind(c.port);
	c.port.memberships = async () => {
		throw new PortError("unavailable", "the store did not answer");
	};
	return () => {
		c.port.memberships = real;
	};
}

describe("a navigation the service could not serve", () => {
	it("is a whole page in Romanian with a way back in to the same address, never the bare code", async () => {
		await failingContext();
		const res = await c.get("/calendar?week=2026-11-16");
		expect(res.status).toBe(503);
		expect(res.headers.get("content-type")).toMatch(/text\/html/);
		expect(res.headers.get("retry-after")).toBe("5");
		const html = await res.text();
		expect(html).toMatch(/^<!DOCTYPE html>/i);
		expect(html).toContain('lang="ro"');
		expect(html).toContain("Nu am putut încărca datele");
		expect(html).toContain("Încearcă din nou");
		expect(html).toContain('href="/calendar?week=2026-11-16"');
		expect(html.trim()).not.toBe("unavailable");
	});

	it("speaks English to someone who chose it", async () => {
		await failingContext();
		// The person chose English (the preferences form works with no context: it is answered before one is built).
		await c.post("/prefs", "lang=en", { "content-type": "application/x-www-form-urlencoded" });
		const html = await (await c.get("/")).text();
		expect(html).toContain('lang="en"');
		expect(html).not.toContain("Nu am putut încărca datele");
	});

	it("a fragment request (Datastar) and a form post keep the short answer: they are not pages", async () => {
		await failingContext();
		const frag = await c.get("/calendar", { headers: { "datastar-request": "true" } });
		expect(frag.status).toBe(503);
		expect(await frag.text()).toBe("unavailable");
		const post = await c.post("/settings/prefs", "theme=admin-dark", {
			"content-type": "application/x-www-form-urlencoded",
		});
		expect(post.status).toBe(503);
		expect(await post.text()).not.toContain("<!DOCTYPE");
	});

	it("once the service answers again, the same address is the console again", async () => {
		const restore = await failingContext();
		expect((await c.get("/calendar")).status).toBe(503);
		restore();
		const back = await c.get("/calendar");
		expect(back.status).toBe(200);
		expect(await back.text()).not.toContain("Nu am putut încărca datele");
	});
});
