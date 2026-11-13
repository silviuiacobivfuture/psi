import { describe, expect, it } from "vitest";
import { data, doc, H, labels, rooms, TZ, t0 } from "./demo-fixture";
import { FloorPlan } from "./floor-plan";
import { memoryPort } from "./port";
import { floorPlanRoutes, type LiveSource, type Need } from "./routes";

const NOW = t0 + 9 * H;

function setup(allow: ReadonlyArray<Need> = ["settings", "calendar", "clients"]) {
	const port = memoryPort(doc);
	const listeners = new Set<() => void>();
	const source: LiveSource = {
		load: async () => data,
		subscribe: (l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
	const app = floorPlanRoutes({
		port,
		rooms: async () => rooms,
		live: source,
		authorize: (_c, need) => allow.includes(need),
		labels,
		locale: "ro",
		timeZone: TZ,
		now: () => NOW,
		endpoint: "/floor",
		id: "plan",
		newBookingHref: (r, at) => `/new?room=${r}&at=${at}`,
	});
	return { app, port, listeners };
}
const post = (app: ReturnType<typeof setup>["app"], path: string, body: unknown) =>
	app.request(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
const draw = (d: unknown, sel = "") => ({ fpDoc: JSON.stringify(d), fpSel: sel, fpFloor: "f1" });
const live = (over: Record<string, unknown> = {}) => ({
	fpAt: t0 + 10.75 * H,
	fpHeat: false,
	fpRoom: "",
	fpFloor: "f1",
	fpShift: 0,
	fpJump: false,
	...over,
});

describe("draw routes", () => {
	it("render patches the layers, the inspector, the list and the status", async () => {
		const { app } = setup();
		const res = await post(app, "/draw/render", draw(doc, "a"));
		const text = await res.text();
		expect(res.status).toBe(200);
		for (const id of [
			'id="fp-shapes"',
			'id="fp-overlay"',
			'id="plan-inspector"',
			'id="plan-list"',
			'id="plan-status"',
		])
			expect(text).toContain(id);
		expect(text).toContain("data-handle");
		// The SVG layers are parsed in the SVG namespace, or the browser makes them unknown HTML elements.
		expect(
			text
				.split("\n\n")
				.filter((e) => e.includes('id="fp-shapes"') || e.includes('id="fp-overlay"'))
				.every((e) => e.includes("data: namespace svg")),
		).toBe(true);
	});
	it("an invalid plan is answered with the status, and nothing else", async () => {
		const { app } = setup();
		const text = await (await post(app, "/draw/render", draw({ ...doc, version: 7 }))).text();
		expect(text).toContain(labels.saveInvalid);
		expect(text).not.toContain('id="fp-shapes"');
	});
	it("saves through the port and counts the revision", async () => {
		const { app, port } = setup();
		const text = await (await post(app, "/draw/save", draw(doc))).text();
		expect(text).toContain('data-fp-rev="1"');
		expect(port.saves()).toBe(1);
	});
	it.each([
		["a stale revision", { ...doc, revision: 5 }, "saveStale"],
		[
			"an unknown room",
			{
				...doc,
				floors: [
					{
						...doc.floors[0],
						shapes: [
							{
								id: "z",
								kind: "room",
								label: "",
								roomId: "ghost",
								geometry: { type: "rect", x: 0, y: 0, w: 10, h: 10 },
							},
						],
					},
				],
			},
			"saveUnknownRoom",
		],
		["an invalid plan", { ...doc, floors: [] }, "saveInvalid"],
	] as const)("refuses %s and writes nothing", async (_n, plan, key) => {
		const { app, port } = setup();
		const text = await (await post(app, "/draw/save", draw(plan))).text();
		expect(text).toContain(labels[key]);
		expect(port.saves()).toBe(0);
	});
	it("a malformed body saves nothing", async () => {
		const { app, port } = setup();
		const text = await (await post(app, "/draw/save", { nope: 1 })).text();
		expect(text).toContain(labels.saveInvalid);
		expect(port.saves()).toBe(0);
	});
	it.each([
		"/draw/render",
		"/draw/save",
	])("%s is refused 403 without the settings permission, and writes nothing", async (path) => {
		const { app, port } = setup(["calendar", "clients"]);
		const res = await post(app, path, draw(doc));
		expect(res.status).toBe(403);
		expect(await res.text()).not.toContain("fp-");
		expect(port.saves()).toBe(0);
	});
});

describe("live routes", () => {
	it("render shows each room's state and who, with initials for a viewer who may see clients", async () => {
		const { app } = setup();
		const text = await (await post(app, "/live/render", live({ fpRoom: "psih-1" }))).text();
		expect(text).toContain('data: namespace svg\ndata: elements <g id="fp-shapes"');
		expect(text).toContain("Suprapunere");
		expect(text).toContain("AP · ZQ");
		expect(text).toContain("WX");
		expect(text).toContain("/new?room=psih-1");
	});
	it("never sends a client's initials to a viewer without the clients permission: not in markup, labels, sheet or signals", async () => {
		const { app } = setup(["calendar"]);
		const text = await (
			await post(app, "/live/render", live({ fpRoom: "psih-1", fpJump: true }))
		).text();
		for (const initials of ["ZQ", "WX", "YY"]) expect(text).not.toContain(initials);
		expect(text).toContain("AP");
		expect(text).toContain("Psihoterapie");
	});
	it("refuses 403 without calendar access, for render and stream", async () => {
		const { app } = setup(["settings"]);
		expect((await post(app, "/live/render", live())).status).toBe(403);
		expect((await app.request("/live/stream")).status).toBe(403);
	});
	it("refuses bad signals with 400", async () => {
		const { app } = setup();
		expect((await post(app, "/live/render", { fpAt: "x" })).status).toBe(400);
	});
	it("a jump re-sends the scrubber for the new day and sets the signal; a drag does not", async () => {
		const { app } = setup();
		const jump = await (await post(app, "/live/render", live({ fpJump: true, fpShift: 1 }))).text();
		expect(jump).toContain('id="plan-scrub"');
		expect(jump).toContain("datastar-patch-signals");
		const drag = await (await post(app, "/live/render", live())).text();
		expect(drag).not.toContain('id="plan-scrub"');
	});
	it("the DST day 2026-10-25 has a 25-hour scrubber", async () => {
		const { app } = setup();
		const dst = Date.UTC(2026, 9, 25, 10);
		const text = await (await post(app, "/live/render", live({ fpAt: dst, fpJump: true }))).text();
		const min = Number(/min="(\d+)"/.exec(text)?.[1]);
		const max = Number(/max="(\d+)"/.exec(text)?.[1]);
		expect((max - min) / 300_000 + 1).toBe(300);
	});
	it("the stream tells the page when the source changes, and stops listening when the page goes", async () => {
		const { app, listeners } = setup();
		const res = await app.request("/live/stream");
		const reader = res.body?.getReader();
		expect(listeners.size).toBe(1);
		for (const l of listeners) l();
		const chunk = await reader?.read();
		expect(new TextDecoder().decode(chunk?.value)).toContain('"fpTick":1');
		await reader?.cancel();
		await new Promise((r) => setTimeout(r, 50));
		expect(listeners.size).toBe(0);
	});
});

describe("the component", () => {
	const base = { id: "plan", doc, labels, locale: "ro" as const, rooms, endpoint: "/floor" };
	const liveProps = (seeClients: boolean) => ({
		data,
		at: t0 + 10.75 * H,
		now: NOW,
		viewer: { seeClients },
		heat: false,
		timeZone: TZ,
		newBookingHref: () => "/new",
	});
	it("draw mode renders the toolbar, tabs, canvas, inspector and the phone note", async () => {
		const html = String(await FloorPlan({ ...base, mode: "draw" }));
		for (const s of [
			'role="toolbar"',
			'role="tablist"',
			"data-fp-svg",
			labels.phoneDraw,
			labels.toolRect,
			labels.undo,
			labels.save,
		])
			expect(html).toContain(s);
		expect(html).toContain('data-bind="fpDoc"');
	});
	it("live mode renders rooms as buttons with state in the name, a list equivalent and the scrubber", async () => {
		const html = String(await FloorPlan({ ...base, mode: "live", live: liveProps(true) }));
		expect(html).toContain('role="button"');
		expect(html).toContain("NFB 1, Ocupat · până la 11:00, AP · ZQ");
		expect(html).toContain('type="range"');
		expect(html).toContain('data-fp-room="nfb-1"');
	});
	it("live mode without the clients permission has no initials anywhere in the page", async () => {
		const html = String(
			await FloorPlan({
				...base,
				mode: "live",
				live: { ...liveProps(false), openRoomId: "psih-1" },
			}),
		);
		for (const s of ["ZQ", "WX", "YY"]) expect(html).not.toContain(s);
	});
});
