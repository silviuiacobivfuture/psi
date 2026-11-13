import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type LiveConsole, serveConsole } from "./harness";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

let c: LiveConsole;
beforeAll(async () => {
	c = await serveConsole();
});
afterAll(async () => {
	await c.close();
});

const same = (extra: Record<string, string> = {}): Record<string, string> => ({
	origin: c.url,
	"sec-fetch-site": "same-origin",
	...extra,
});
const get = (path: string, cookie = "") =>
	fetch(`${c.url}${path}`, { headers: cookie === "" ? {} : { cookie }, redirect: "manual" });
const sse = (path: string, signals: unknown, cookie = "") =>
	fetch(`${c.url}${path}`, {
		method: "POST",
		headers: same({ "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) }),
		body: JSON.stringify(signals),
	});

describe("the live plan (Plan cabinete)", () => {
	it("is in the menu, drawn, with the clinic's rooms and who is in them", async () => {
		const html = await (await get("/floor")).text();
		expect(html).toContain('href="/floor"');
		expect(html).toContain("pz-fp");
		expect(html).toContain("Cabinet 1");
		expect(html).toContain("Sală terapie grup");
	});
	it("answers a scrub with the plan's pieces patched in", async () => {
		const r = await sse("/floor/api/live/render", {
			fpAt: Date.now(),
			fpHeat: false,
			fpRoom: "",
			fpFloor: "parter",
		});
		expect(r.status).toBe(200);
		const body = await r.text();
		expect(body).toContain("datastar-patch-elements");
		expect(body).toContain("Cabinet 1");
	});
	it("a bad scrub is refused with 400 and nothing is patched", async () => {
		const r = await sse("/floor/api/live/render", { nope: true });
		expect(r.status).toBe(400);
	});
});

describe("drawing the plan (Setări > Plan cabinete)", () => {
	const doc = async () => (await c.port.floorPlan("psizone")).doc;
	const signals = async (edit: (d: Awaited<ReturnType<typeof doc>>) => unknown) => ({
		fpDoc: JSON.stringify(edit(await doc())),
		fpSel: "",
		fpFloor: "parter",
	});
	it("the settings tab offers the drawing to the owner", async () => {
		const html = await (await get("/settings/plan")).text();
		expect(html).toContain('href="/settings/plan"');
		expect(html).toContain("pz-fp");
	});
	it("saves a drawn plan and counts the revision up", async () => {
		const before = (await doc()).revision;
		const r = await sse("/floor/api/draw/save", await signals((d) => ({ ...d, northDeg: 90 })));
		expect(await r.text()).toContain("pz-fp__status--ok");
		const after = await doc();
		expect(after.revision).toBe(before + 1);
		expect(after.northDeg).toBe(90);
	});
	it("a save from an old revision is refused, and the stored plan is untouched", async () => {
		const stale = await signals((d) => ({ ...d, revision: d.revision - 1, northDeg: 10 }));
		const kept = await doc();
		const r = await sse("/floor/api/draw/save", stale);
		expect(await r.text()).toContain("pz-fp__status--error");
		expect(await doc()).toEqual(kept);
	});
	it("an invalid plan is refused, and the stored plan is untouched", async () => {
		const kept = await doc();
		const r = await sse("/floor/api/draw/save", {
			fpDoc: JSON.stringify({ nonsense: true }),
			fpSel: "",
			fpFloor: "parter",
		});
		expect(await r.text()).toContain("pz-fp__status--error");
		expect(await doc()).toEqual(kept);
	});
	it("someone without the settings right cannot draw or save, and nothing is written", async () => {
		const kept = await doc();
		const cookie = "app=hemisync";
		expect((await get("/settings/plan", cookie)).status).toBe(403);
		const r = await sse(
			"/floor/api/draw/save",
			await signals((d) => ({ ...d, northDeg: 45 })),
			cookie,
		);
		expect(r.status).toBe(403);
		expect(await doc()).toEqual(kept);
	});
});

describe("over the scheduling service, which keeps the plan", () => {
	let k: SdkConsole;
	beforeAll(async () => {
		k = await startSdkConsole();
	});
	afterAll(async () => {
		await k.close();
	});
	const save = (s: Awaited<ReturnType<SdkConsole["as"]>>, doc: unknown) =>
		s.post(
			"/floor/api/draw/save",
			JSON.stringify({ fpDoc: JSON.stringify(doc), fpSel: "", fpFloor: "f1" }),
			{ "content-type": "application/json" },
		);
	const stored = async () =>
		(await k.api.world.call("olga", "GET", "/v1/apps/psizone/floor-plan")).json as {
			revision: number;
			doc?: { revision: number; northDeg: number };
		};
	const plan = (revision: number, northDeg: number) => ({
		version: 1,
		revision,
		width: 300,
		height: 200,
		northDeg,
		floors: [{ id: "f1", name: "Parter", shapes: [] }],
	});
	it("the live view says the plan is not drawn, and drawing is offered to the owner", async () => {
		const s = await k.as("olga");
		const live = await (await s.get("/floor")).text();
		expect(live).toContain("Planul cabinetelor nu e desenat încă");
		expect(await (await s.get("/settings/plan")).text()).toContain("pz-fp");
	});
	it("an accountant, who has no calendar, has no plan either", async () => {
		const s = await k.as("ana");
		expect((await s.get("/floor")).status).toBe(403);
	});
	it("a drawn plan is kept by the service, one revision up, and the next save must come from it", async () => {
		const s = await k.as("olga");
		const first = await save(s, plan(0, 20));
		expect(await first.text()).toContain("pz-fp__status--ok");
		expect(await stored()).toMatchObject({ revision: 1, doc: { northDeg: 20 } });
		const stale = await save(s, plan(0, 99));
		expect(await stale.text()).toContain("pz-fp__status--error");
		expect(await stored()).toMatchObject({ revision: 1, doc: { northDeg: 20 } });
	});
	it("a role that may look at the calendar but not draw is refused, and nothing is written", async () => {
		const s = await k.as("rita");
		const before = await k.api.world.fingerprint();
		expect((await save(s, plan(1, 77))).status).toBe(403);
		expect((await s.get("/settings/plan")).status).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
});
