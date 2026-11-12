import { describe, expect, it } from "vitest";
import { app } from "./server";
import { THEMES } from "./themes";

/** The gallery as a visitor reaches it: health, both languages, every theme, its own script. */
describe("design gallery", () => {
	it("answers its health check", async () => {
		const res = await app.request("/healthz");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("lists the eight themes", () => {
		expect(THEMES).toHaveLength(8);
		expect(new Set(THEMES.map((t) => t.id)).size).toBe(8);
	});

	for (const [path, lang] of [
		["/", "ro"],
		["/en", "en"],
	] as const) {
		it(`renders every theme, with a jump link to each, at ${path} (${lang})`, async () => {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain(`<html lang="${lang}"`);
			for (const t of THEMES) {
				expect(html).toContain(`href="#${t.id}"`);
				expect(html).toContain(`id="${t.id}"`);
			}
		});
	}

	it("serves its self-hosted Datastar bundle", async () => {
		const res = await app.request("/assets/datastar.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type") ?? "").toContain("javascript");
		expect((await res.text()).length).toBeGreaterThan(1000);
	});

	it("answers an unknown page with 404", async () => {
		expect((await app.request("/nowhere")).status).toBe(404);
	});
});
