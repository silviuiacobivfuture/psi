import { describe, expect, it } from "vitest";
import { post } from "./test-flow";

/**
 * The booking page and the picker's route with no scheduling service at all (scheduling off): the callback form, and
 * no input ever breaks the route. The same page against the real service is booking-page-flow.test.ts.
 */
delete process.env.SCHEDULING_API_URL;
delete process.env.SCHEDULING_SERVICE_KEY;

describe("the picker's route and the booking page, scheduling off", () => {
	it("the booking page renders the callback form, never an error, and never the picker", async () => {
		const { app } = await import("./server");
		for (const path of [
			"/programare",
			"/en/programare",
			"/programare?serviciu=nope",
			"/programare?serviciu=%3Cscript%3E",
		]) {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain('name="consent"');
			expect(html).not.toContain("pz-slots");
			expect(res.headers.get("cache-control")).toBe("private, no-store");
		}
	}, 30_000);

	it("the route answers any input with a form and writes nothing", async () => {
		const { app } = await import("./server");
		const html = await post(app, "/programare/ore", {
			form: 'chat-booking-"><script>',
			service: "../../x",
			week: "2026-13-99",
			day: "x",
			mode: "teleport",
			who: "<b>",
			slot: "z".repeat(500),
			name: "Ana",
		});
		expect(html).toContain('<form id="booking"');
		expect(html).toContain('value="Ana"');
		expect(html).not.toContain('"><script>');
	}, 30_000);
});
