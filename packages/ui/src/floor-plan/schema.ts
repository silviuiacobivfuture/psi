import { z } from "zod";

import {
	DEVICE_TYPES,
	MAX_FLOORS,
	MAX_LABEL,
	MAX_POLYGON_POINTS,
	MAX_SHAPES_PER_FLOOR,
	SPACE_TYPES,
	UNIT_CM,
} from "./limits";

export {
	DEVICE_TYPES,
	MAX_FLOORS,
	MAX_LABEL,
	MAX_POLYGON_POINTS,
	MAX_SHAPES_PER_FLOOR,
	SPACE_TYPES,
	UNIT_CM,
};

const COORD = 100_000;
const Coord = z.number().int().min(-COORD).max(COORD);

export const IdSchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "an id is 1-64 letters, digits, - or _");
const LabelSchema = z.string().max(MAX_LABEL).default("");

export const PointSchema = z.object({ x: Coord, y: Coord }).strict();
export type Point = z.infer<typeof PointSchema>;

export const RotationSchema = z.union([
	z.literal(0),
	z.literal(90),
	z.literal(180),
	z.literal(270),
]);
export type Rotation = z.infer<typeof RotationSchema>;

/** The outline of a room or space: an axis-aligned rectangle, or a closed polygon (3 to 64 corners). */
export const GeometrySchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("rect"),
			x: Coord,
			y: Coord,
			w: z.number().int().min(1).max(COORD),
			h: z.number().int().min(1).max(COORD),
		})
		.strict(),
	z
		.object({
			type: z.literal("polygon"),
			points: z.array(PointSchema).min(3).max(MAX_POLYGON_POINTS),
		})
		.strict(),
]);
export type Geometry = z.infer<typeof GeometrySchema>;
export type RectGeometry = Extract<Geometry, { type: "rect" }>;

export const SpaceTypeSchema = z.enum(SPACE_TYPES);
export type SpaceType = z.infer<typeof SpaceTypeSchema>;

export const DeviceTypeSchema = z.enum(DEVICE_TYPES);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

const RoomShape = z
	.object({
		id: IdSchema,
		kind: z.literal("room"),
		label: LabelSchema,
		geometry: GeometrySchema,
		/** The store's room this outline stands for; checked against the room list, not by the schema. */
		roomId: IdSchema.optional(),
		/** The category the room belongs to (one of the plan's `categories`): the plan colours it and the legend names it. */
		category: z.string().min(1).max(40).optional(),
	})
	.strict();
const SpaceShape = z
	.object({
		id: IdSchema,
		kind: z.literal("space"),
		label: LabelSchema,
		geometry: GeometrySchema,
		spaceType: SpaceTypeSchema,
	})
	.strict();
const DoorShape = z
	.object({
		id: IdSchema,
		kind: z.literal("door"),
		label: LabelSchema,
		at: PointSchema,
		length: z.number().int().min(5).max(30),
		rotation: RotationSchema,
		swing: z.enum(["left", "right"]),
	})
	.strict();
const WindowShape = z
	.object({
		id: IdSchema,
		kind: z.literal("window"),
		label: LabelSchema,
		at: PointSchema,
		length: z.number().int().min(5).max(60),
		rotation: RotationSchema,
	})
	.strict();
const DeviceShape = z
	.object({
		id: IdSchema,
		kind: z.literal("device"),
		label: LabelSchema,
		at: PointSchema,
		rotation: RotationSchema,
		deviceType: DeviceTypeSchema,
		/** The store's device this icon stands for (LIVE shows it in use or free). */
		deviceId: IdSchema.optional(),
	})
	.strict();

export const ShapeSchema = z.discriminatedUnion("kind", [
	RoomShape,
	SpaceShape,
	DoorShape,
	WindowShape,
	DeviceShape,
]);
export type Shape = z.infer<typeof ShapeSchema>;
export type ShapeKind = Shape["kind"];
export type AreaShape = Extract<Shape, { kind: "room" | "space" }>;
export type PointShape = Extract<Shape, { kind: "door" | "window" | "device" }>;

export const FloorSchema = z
	.object({
		id: IdSchema,
		name: z.string().min(1).max(40),
		shapes: z.array(ShapeSchema).max(MAX_SHAPES_PER_FLOOR),
	})
	.strict();
export type Floor = z.infer<typeof FloorSchema>;

/** The version a plan is written at; a document with another version is refused until a migration exists. */
export const PLAN_VERSION = 1;

export const FloorPlanDocSchema = z
	.object({
		version: z.literal(PLAN_VERSION),
		/** Counted up by the port on every save: a save against an older revision is refused. */
		revision: z.number().int().min(0),
		/** The drawing area in units (the plan is drawn inside it). */
		width: z.number().int().min(50).max(5_000),
		height: z.number().int().min(50).max(5_000),
		/** Degrees clockwise the north arrow points from straight up. */
		northDeg: z.number().int().min(0).max(359),
		/** The room categories the legend names, in both languages. */
		categories: z
			.array(
				z
					.object({
						id: z.string().min(1).max(40),
						label: z.object({ ro: z.string().min(1).max(120), en: z.string().min(1).max(120) }),
					})
					.strict(),
			)
			.max(8)
			.optional(),
		floors: z.array(FloorSchema).min(1).max(MAX_FLOORS),
	})
	.strict()
	.superRefine((doc, ctx) => {
		const seen = new Set<string>();
		for (const [fi, floor] of doc.floors.entries()) {
			for (const id of [floor.id, ...floor.shapes.map((s) => s.id)]) {
				if (seen.has(id)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `duplicate id ${id}`,
						path: ["floors", fi],
					});
				}
				seen.add(id);
			}
		}
	});
export type FloorPlanDoc = z.infer<typeof FloorPlanDocSchema>;

/** Parses a document from outside (a store, a request): the one door every plan goes through. */
export function parsePlan(input: unknown): z.SafeParseReturnType<unknown, FloorPlanDoc> {
	return FloorPlanDocSchema.safeParse(input);
}

export function emptyPlan(): FloorPlanDoc {
	return {
		version: PLAN_VERSION,
		revision: 0,
		width: 300,
		height: 200,
		northDeg: 0,
		floors: [{ id: "f1", name: "Parter", shapes: [] }],
	};
}

/** What a plan says wrong against the store's room list, found apart from the schema (the list changes, the plan does not). */
export interface PlanIssue {
	code: "unknown-room" | "overlap";
	shapeId: string;
	/** An error stops a save; a warning is shown and allowed. */
	severity: "error" | "warning";
	other?: string;
}
