import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createFakePort } from "../port/fake";
import { PortError } from "../port/port";
import { assistantModeOf, chooseAssistantMode, DEFAULT_MODE } from "./mode";

function fixture() {
	const port = createFakePort({ members: {} });
	const app = new Hono();
	app.get("/mode/:subject", async (c) =>
		c.text(await assistantModeOf(c, port, c.req.param("subject"))),
	);
	app.post("/mode/:subject/:mode", async (c) => {
		const mode = c.req.param("mode") === "panel" ? "panel" : "bar";
		await chooseAssistantMode(c, port, c.req.param("subject"), mode);
		return c.text("ok");
	});
	return { port, app };
}

const cookieOf = (res: Response): string => res.headers.get("set-cookie")?.split(";")[0] ?? "";

describe("how a person's assistant shows", () => {
	it("is the bar until they choose", async () => {
		const { app } = fixture();
		expect(DEFAULT_MODE).toBe("bar");
		expect(await (await app.request("/mode/ana")).text()).toBe("bar");
	});

	it("is what they chose, saved through the port and kept on the device", async () => {
		const { app, port } = fixture();
		const chosen = await app.request("/mode/ana/panel", { method: "POST" });
		expect(await port.assistantMode("ana")).toBe("panel");
		const again = await app.request("/mode/ana", { headers: { cookie: cookieOf(chosen) } });
		expect(await again.text()).toBe("panel");
	});

	it("is read from the port on a device that has no cookie, and then kept there", async () => {
		const { app, port } = fixture();
		await port.saveAssistantMode("ana", "panel");
		const first = await app.request("/mode/ana");
		expect(await first.text()).toBe("panel");
		expect(cookieOf(first)).toMatch(/^assistant=panel\./);
	});

	it("never lends one person's choice to another on a shared browser", async () => {
		const { app } = fixture();
		const ana = await app.request("/mode/ana/panel", { method: "POST" });
		const bogdan = await app.request("/mode/bogdan", { headers: { cookie: cookieOf(ana) } });
		expect(await bogdan.text()).toBe("bar");
		const forged = await app.request("/mode/bogdan", {
			headers: { cookie: "assistant=panel.00000000" },
		});
		expect(await forged.text()).toBe("bar");
	});

	it("falls back to the device while the service keeps no such setting, and says nothing else is swallowed", async () => {
		const { app, port } = fixture();
		port.assistantMode = () => Promise.reject(new PortError("not-available-yet", "assistant mode"));
		port.saveAssistantMode = () =>
			Promise.reject(new PortError("not-available-yet", "assistant mode"));
		const chosen = await app.request("/mode/ana/panel", { method: "POST" });
		expect(chosen.status).toBe(200);
		expect(
			await (await app.request("/mode/ana", { headers: { cookie: cookieOf(chosen) } })).text(),
		).toBe("panel");
		expect(await (await app.request("/mode/ana")).text()).toBe("bar");
		port.assistantMode = () => Promise.reject(new PortError("unavailable", "down"));
		const down = await app.request("/mode/ana");
		expect(down.status).toBe(500);
	});
});
