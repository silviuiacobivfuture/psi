import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER, { today: "2026-11-16" }, undefined, { assistant: true });
	await c.signIn();
});
afterEach(() => c.close());

const count = (html: string, needle: string): number => html.split(needle).length - 1;
const page = async (path = "/calendar"): Promise<string> => await (await c.get(path)).text();

describe("how the assistant shows: the conversation bar by default", () => {
	it("a person who never chose gets the glowing bar, page-aware, and no side panel", async () => {
		const html = await page("/clients/c1");
		expect(html).toContain("pz-compass pz-compass--admin");
		expect(html).toContain('id="pz-staff-sheet"');
		expect(html).toContain("Întreabă despre acest client sau programează-l…");
		expect(html).not.toContain('id="staff-assistant"');
		expect(count(html, 'id="staff-log"')).toBe(1);
	});

	it("the bar and the panel are two faces of one conversation: the same route, the same log", async () => {
		const bar = await page();
		await c.post("/assistant/mode", new URLSearchParams({ mode: "panel" }));
		const panel = await page();
		for (const html of [bar, panel]) {
			expect(html).toContain("/assistant/chat");
			expect(html).toContain('id="staff-log"');
			expect(html).toContain("$staff.message");
		}
	});

	it("the account menu offers the choice, the bar pressed", async () => {
		const html = await page();
		expect(html).toContain("Asistent");
		expect(html).toMatch(/name="mode" value="bar" aria-pressed="true"[^>]*>Bară de conversație/);
		expect(html).toMatch(/name="mode" value="panel" aria-pressed="false"[^>]*>Panou lateral/);
		expect(html).toContain('action="/assistant/mode"');
	});

	it("choosing the panel is saved through the port, comes back as the panel, and the bar is gone", async () => {
		const res = await c.post("/assistant/mode", new URLSearchParams({ mode: "panel" }));
		expect(res.status).toBe(200);
		expect(await c.port.assistantMode("mock-ana-7f3c")).toBe("panel");
		const html = await page();
		expect(html).toContain('id="staff-assistant"');
		expect(html).not.toContain("pz-compass--admin");
		expect(count(html, 'id="staff-log"')).toBe(1);
		expect(html).toMatch(/name="mode" value="panel" aria-pressed="true"/);
	});

	it("choosing the bar again undoes it", async () => {
		await c.post("/assistant/mode", new URLSearchParams({ mode: "panel" }));
		await c.post("/assistant/mode", new URLSearchParams({ mode: "bar" }));
		expect(await c.port.assistantMode("mock-ana-7f3c")).toBe("bar");
		expect(await page()).toContain("pz-compass--admin");
	});

	it("anything but the two modes is refused quietly: nothing is saved", async () => {
		await c.post("/assistant/mode", new URLSearchParams({ mode: "floating" }));
		await c.post("/assistant/mode", new URLSearchParams({}));
		expect(await c.port.assistantMode("mock-ana-7f3c")).toBeNull();
		expect(await page()).toContain("pz-compass--admin");
	});

	it("the choice follows the person to another browser through the port, not only the device", async () => {
		await c.port.saveAssistantMode("mock-ana-7f3c", "panel");
		expect(await page()).toContain('id="staff-assistant"');
	});

	it("a write from another site is refused and changes nothing", async () => {
		const res = await c.raw("/assistant/mode", {
			method: "POST",
			headers: { origin: "http://evil.test", "sec-fetch-site": "cross-site" },
			body: new URLSearchParams({ mode: "panel" }),
		});
		expect(res.status).toBe(403);
		expect(await c.port.assistantMode("mock-ana-7f3c")).toBeNull();
	});
});

describe("without the assistant there is nothing to choose", () => {
	it("no bar, no panel, no choice in the menu", async () => {
		const plain = await startConsole(MEMBER, { today: "2026-11-16" });
		try {
			await plain.signIn();
			const html = await (await plain.get("/calendar")).text();
			expect(html).not.toContain("pz-compass");
			expect(html).not.toContain('id="staff-assistant"');
			expect(html).not.toContain("/assistant/mode");
		} finally {
			await plain.close();
		}
	});
});
