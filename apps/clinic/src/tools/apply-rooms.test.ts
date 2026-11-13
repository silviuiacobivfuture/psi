import { parseRoomsSeed } from "@psi/scheduling/clinic";
import psizoneRooms from "@psi/scheduling/seed/psizone-rooms.json";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { createSchedulingClient, type SchedulingClient } from "@psi/scheduling-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drain } from "../port/sdk/map";
import { applyRooms } from "./apply-rooms";

let running: RunningApi;
let api: SchedulingClient;
beforeAll(async () => {
	running = await startApi();
	const token = await running.tokenFor("olga");
	api = createSchedulingClient({ baseUrl: running.url, auth: { bearer: async () => token } });
});
afterAll(async () => {
	await running.close();
});

const seed = parseRoomsSeed(psizoneRooms);
const rooms = () =>
	drain((cursor) =>
		api.rooms.list({ app: "psizone", limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
	);

describe("applying the Psizone rooms seed to the service", () => {
	it("a dry run reports what it would do and writes nothing", async () => {
		const before = (await rooms()).length;
		const stored = await api.floorPlan.get({ app: "psizone" });
		const report = await applyRooms(api, "psizone", seed, true);
		expect(report.created.length + report.kept.length + report.updated.length).toBe(11);
		expect((await rooms()).length).toBe(before);
		expect((await api.floorPlan.get({ app: "psizone" })).revision).toBe(stored.revision);
	});
	it("creates the eleven rooms with their category and saves the plan linked to their stored ids", async () => {
		const report = await applyRooms(api, "psizone", seed);
		expect(report.created.length + report.kept.length).toBe(11);
		const stored = await rooms();
		const byName = new Map(stored.map((r) => [r.name, r]));
		for (const room of seed.floors.flatMap((f) => f.rooms)) {
			expect(byName.get(room.name)?.kind, room.name).toBe(room.category);
		}
		const plan = await api.floorPlan.get({ app: "psizone" });
		expect(plan.doc?.floors.map((f) => f.name)).toEqual(["Parter", "Etajul 1", "Etajul 2"]);
		const linked = (plan.doc?.floors ?? []).flatMap((f) =>
			f.shapes.map((s) => (typeof s.roomId === "string" ? s.roomId : "")),
		);
		expect(linked.sort()).toEqual(
			seed.floors
				.flatMap((f) => f.rooms)
				.map((r) => byName.get(r.name)?.id ?? "x")
				.sort(),
		);
	});
	it("runs again and changes nothing: no room created, the plan not saved again", async () => {
		const before = (await rooms()).length;
		const revision = (await api.floorPlan.get({ app: "psizone" })).revision;
		const report = await applyRooms(api, "psizone", seed);
		expect(report.created).toEqual([]);
		expect(report.planSaved).toBe(false);
		expect((await rooms()).length).toBe(before);
		expect((await api.floorPlan.get({ app: "psizone" })).revision).toBe(revision);
	});
	it("puts a room of the wrong category right, and only that", async () => {
		const target = (await rooms()).find((r) => r.name === "Mapping cerebral");
		await api.rooms.update({ app: "psizone", id: target?.id ?? "", kind: "therapy" });
		const report = await applyRooms(api, "psizone", seed);
		expect(report.updated).toEqual(["Mapping cerebral"]);
		expect((await rooms()).find((r) => r.name === "Mapping cerebral")?.kind).toBe("neuro");
	});
});
