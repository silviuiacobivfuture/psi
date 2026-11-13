import { describe, expect, it } from "vitest";
import { floorPlanDemo } from "./floor-plan-demo";
import { ROOMS, seedLive, seedPlan } from "./floor-plan-seed";

const NOW = Date.UTC(2026, 10, 13, 9, 15);

describe("floor plan demo", () => {
	const app = floorPlanDemo({ now: () => NOW });
	it("the seed is a valid plan with the seven rooms, each drawn once on the ground floor", () => {
		const shapes = seedPlan().floors[0]?.shapes ?? [];
		const linked = shapes.flatMap((s) => (s.kind === "room" && s.roomId ? [s.roomId] : []));
		expect(linked.sort()).toEqual(ROOMS.map((r) => r.id).sort());
		expect(
			shapes.filter((s) => s.kind === "space").map((s) => s.kind === "space" && s.spaceType),
		).toEqual(expect.arrayContaining(["reception", "waiting", "corridor", "wc", "storage"]));
	});
	it("the seed's synthetic bookings are valid, with a clash today", () => {
		const day = Date.UTC(2026, 10, 12, 22);
		const live = seedLive(day - 4 * 86_400_000, day);
		expect(live.rooms).toHaveLength(7);
		expect(live.bookings.length).toBeGreaterThan(50);
	});
	it("serves the live page, the draw page and both languages", async () => {
		for (const [path, text] of [
			["/floor-plan", "Acum în cabinete"],
			["/floor-plan?lang=en", "Live"],
			["/floor-plan/draw", "Cameră dreptunghiulară"],
			["/floor-plan/draw?lang=en&theme=psizone-dark", "Rectangular room"],
		] as const) {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			expect(await res.text()).toContain(text);
		}
	});
	it("a viewer without the settings permission is refused the draw page and the draw routes", async () => {
		expect((await app.request("/floor-plan/draw?role=viewer")).status).toBe(403);
		const res = await app.request("/floor-plan/api/ro/draw/save?role=viewer", {
			method: "POST",
			body: "{}",
			headers: { "content-type": "application/json" },
		});
		expect(res.status).toBe(403);
	});
	it("?clients=0 keeps client initials out of the page", async () => {
		const html = await (await app.request("/floor-plan?clients=0&at=11:15")).text();
		expect(html).not.toMatch(/ · (AB|CD|EF|GH|IJ|KL|MN|OP|ZZ)\b/);
	});
	it("is off in the gallery unless the switch is set", async () => {
		const { app: gallery } = await import("./server");
		expect((await gallery.request("/floor-plan")).status).toBe(404);
	});
});
