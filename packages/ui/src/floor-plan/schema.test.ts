import { describe, expect, it } from "vitest";
import { planOf, room } from "./fixtures";
import { hasBlockingIssue, planIssues } from "./issues";
import { memoryPort } from "./port";
import {
	emptyPlan,
	FloorPlanDocSchema,
	MAX_FLOORS,
	MAX_POLYGON_POINTS,
	MAX_SHAPES_PER_FLOOR,
	parsePlan,
} from "./schema";

const valid = () => planOf(room("a", 0, 0, 40, 30, "nfb-1"));

describe("FloorPlanDoc", () => {
	it("accepts a plan with every shape kind", () => {
		const doc = planOf(
			room("a", 0, 0, 40, 30, "nfb-1"),
			{
				id: "s",
				kind: "space",
				label: "",
				spaceType: "wc",
				geometry: {
					type: "polygon",
					points: [
						{ x: 50, y: 0 },
						{ x: 70, y: 0 },
						{ x: 70, y: 20 },
					],
				},
			},
			{
				id: "d",
				kind: "door",
				label: "",
				at: { x: 10, y: 0 },
				length: 9,
				rotation: 0,
				swing: "left",
			},
			{ id: "w", kind: "window", label: "", at: { x: 20, y: 0 }, length: 12, rotation: 90 },
			{
				id: "v",
				kind: "device",
				label: "",
				at: { x: 5, y: 5 },
				rotation: 270,
				deviceType: "nfb-amplifier",
				deviceId: "dev-1",
			},
		);
		expect(parsePlan(doc).success).toBe(true);
	});

	it("round-trips through JSON", () => {
		expect(FloorPlanDocSchema.parse(JSON.parse(JSON.stringify(valid())))).toEqual(valid());
	});

	it.each([
		["another version", { ...valid(), version: 2 }],
		["no floors", { ...valid(), floors: [] }],
		["a non-integer coordinate", planOf(room("a", 0.5, 0, 40, 30))],
		["a zero-width rectangle", planOf(room("a", 0, 0, 0, 30))],
		[
			"a bad rotation",
			planOf({
				id: "d",
				kind: "door",
				label: "",
				at: { x: 1, y: 1 },
				length: 9,
				rotation: 45,
				swing: "left",
			} as never),
		],
		["an unknown kind", planOf({ id: "d", kind: "wall" } as never)],
		["an unknown key", { ...valid(), extra: 1 }],
		["an id with a space", planOf(room("a b", 0, 0, 5, 5))],
		["a label over 60", planOf({ ...room("a", 0, 0, 5, 5), label: "x".repeat(61) })],
		[
			"a two-corner polygon",
			planOf({
				id: "s",
				kind: "space",
				label: "",
				spaceType: "wc",
				geometry: {
					type: "polygon",
					points: [
						{ x: 0, y: 0 },
						{ x: 1, y: 1 },
					],
				},
			}),
		],
		[
			"a door too short",
			planOf({
				id: "d",
				kind: "door",
				label: "",
				at: { x: 1, y: 1 },
				length: 4,
				rotation: 0,
				swing: "left",
			}),
		],
		["a negative revision", { ...valid(), revision: -1 }],
	])("refuses %s", (_name, doc) => {
		expect(parsePlan(doc).success).toBe(false);
	});

	it("refuses the same id twice, on a floor and across floors", () => {
		expect(parsePlan(planOf(room("a", 0, 0, 5, 5), room("a", 10, 0, 5, 5))).success).toBe(false);
		const doc = {
			...valid(),
			floors: [...valid().floors, { id: "f2", name: "Etaj", shapes: [room("a", 0, 0, 5, 5)] }],
		};
		expect(parsePlan(doc).success).toBe(false);
		expect(
			parsePlan({ ...valid(), floors: [...valid().floors, { id: "f1", name: "Etaj", shapes: [] }] })
				.success,
		).toBe(false);
	});

	it("holds the caps: floors, shapes, polygon corners", () => {
		const floors = (n: number) =>
			Array.from({ length: n }, (_v, i) => ({ id: `f${i}`, name: "F", shapes: [] }));
		expect(parsePlan({ ...valid(), floors: floors(MAX_FLOORS) }).success).toBe(true);
		expect(parsePlan({ ...valid(), floors: floors(MAX_FLOORS + 1) }).success).toBe(false);
		const shapes = (n: number) => Array.from({ length: n }, (_v, i) => room(`r${i}`, 0, 0, 5, 5));
		expect(parsePlan(planOf(...shapes(MAX_SHAPES_PER_FLOOR))).success).toBe(true);
		expect(parsePlan(planOf(...shapes(MAX_SHAPES_PER_FLOOR + 1))).success).toBe(false);
		const poly = (n: number) =>
			planOf({
				id: "s",
				kind: "space",
				label: "",
				spaceType: "wc",
				geometry: {
					type: "polygon",
					points: Array.from({ length: n }, (_v, i) => ({ x: i, y: i * i })),
				},
			});
		expect(parsePlan(poly(MAX_POLYGON_POINTS)).success).toBe(true);
		expect(parsePlan(poly(MAX_POLYGON_POINTS + 1)).success).toBe(false);
	});

	it("accepts unicode labels", () => {
		expect(
			parsePlan(planOf({ ...room("a", 0, 0, 5, 5), label: "Sală Grup / Hemi-Sync — ăîșțâ" }))
				.success,
		).toBe(true);
	});

	it("the empty plan is valid", () => {
		expect(parsePlan(emptyPlan()).success).toBe(true);
	});
});

describe("plan against the store's room list", () => {
	const rooms = [{ id: "nfb-1" }, { id: "nfb-2" }];

	it("flags an unknown room id as an error that blocks a save, and not a known one", () => {
		const issues = planIssues(
			planOf(room("a", 0, 0, 40, 30, "nfb-1"), room("b", 50, 0, 40, 30, "ghost")),
			rooms,
		);
		expect(issues).toEqual([{ code: "unknown-room", shapeId: "b", severity: "error" }]);
		expect(hasBlockingIssue(issues)).toBe(true);
	});

	it("allows a room outline with no room yet, and one room on several outlines", () => {
		const issues = planIssues(
			planOf(
				room("a", 0, 0, 40, 30),
				room("b", 50, 0, 40, 30, "nfb-1"),
				room("c", 50, 40, 40, 30, "nfb-1"),
			),
			rooms,
		);
		expect(issues).toEqual([]);
	});

	it("warns, never blocks, on overlap; walls that only touch are not an overlap", () => {
		const touching = planIssues(planOf(room("a", 0, 0, 40, 30), room("b", 40, 0, 40, 30)), rooms);
		expect(touching).toEqual([]);
		const over = planIssues(planOf(room("a", 0, 0, 40, 30), room("b", 39, 0, 40, 30)), rooms);
		expect(over).toEqual([{ code: "overlap", shapeId: "a", other: "b", severity: "warning" }]);
		expect(hasBlockingIssue(over)).toBe(false);
	});

	it("finds a polygon overlapping a rectangle", () => {
		const poly = {
			id: "p",
			kind: "space" as const,
			label: "",
			spaceType: "corridor" as const,
			geometry: {
				type: "polygon" as const,
				points: [
					{ x: 30, y: 10 },
					{ x: 80, y: 10 },
					{ x: 80, y: 60 },
				],
			},
		};
		expect(planIssues(planOf(room("a", 0, 0, 40, 30), poly), rooms).map((i) => i.code)).toEqual([
			"overlap",
		]);
	});
});

describe("memoryPort", () => {
	it("saves, counts the revision up, and refuses a stale or an invalid document without writing", async () => {
		const port = memoryPort(valid());
		const first = await port.save(valid());
		expect(first).toMatchObject({ ok: true, doc: { revision: 1 } });
		expect(await port.save(valid())).toEqual({ ok: false, reason: "stale" });
		expect(await port.save({ ...valid(), revision: 1, version: 9 } as never)).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(port.saves()).toBe(1);
		expect((await port.load()).revision).toBe(1);
	});
});
