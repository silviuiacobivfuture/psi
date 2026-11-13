import { z } from "zod";
import { MinuteSchema, RoomCategorySchema } from "./schema";

/**
 * What the team sets up: people, rooms, devices, services. One schema per kind, the same one the form, the action and
 * the port use. Empty optional text is "none", never "".
 */

const name = z.string().trim().min(1).max(120);
const text = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => (v === undefined || v === "" ? undefined : v));
const ids = z.array(z.string().min(1).max(100)).max(200).default([]);
const flag = z.boolean().default(true);

const WeekdaySchema = z
	.object({ from: MinuteSchema, to: MinuteSchema })
	.refine((h) => h.from < h.to, "from before to");
/** Monday first; null is a day off. */
export const HoursSchema = z.array(WeekdaySchema.nullable()).length(7);

export const PersonInputSchema = z.object({
	name,
	email: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => (v === undefined || v === "" ? undefined : v))
		.pipe(z.string().email().optional()),
	roles: z.array(z.string().min(1).max(100)).max(20).default([]),
	/** A practitioner has a calendar column of their own. */
	practitioner: z.boolean().default(false),
	colour: z.number().int().min(1).max(6).default(1),
	specialty: text(120),
	hours: HoursSchema.default([null, null, null, null, null, null, null]),
	roomIds: ids,
	serviceIds: ids,
	active: flag,
});
export type PersonInput = z.input<typeof PersonInputSchema>;

export const RoomInputSchema = z.object({
	name,
	floor: text(40),
	category: RoomCategorySchema,
	capacity: z.number().int().min(1).max(200).default(1),
	bookable: flag,
	homeOf: z.string().min(1).max(100).nullable().default(null),
	purpose: text(120),
});
export type RoomInput = z.input<typeof RoomInputSchema>;

export const DEVICE_TYPES = ["nfb", "qeeg", "other"] as const;
export const DeviceInputSchema = z.object({
	name,
	type: z.enum(DEVICE_TYPES).default("other"),
	roomId: z.string().min(1).max(100).nullable().default(null),
	bookable: flag,
});
export type DeviceInput = z.input<typeof DeviceInputSchema>;

export const ServiceInputSchema = z.object({
	name,
	durationMin: z.number().int().min(5).max(480),
	priceBani: z.number().int().min(0).max(100_000_000).nullable().default(null),
	category: text(60),
	roomCategory: RoomCategorySchema.nullable().default(null),
	bufferMin: z.number().int().min(0).max(240).default(0),
	online: flag,
	practitionerIds: ids,
	roomIds: ids,
	deviceIds: ids,
	active: flag,
});
export type ServiceInput = z.input<typeof ServiceInputSchema>;

export const NewRoleSchema = z.object({
	name,
	description: text(500),
	/** Start from another role's permissions. */
	copyFrom: z.string().min(1).max(100).nullable().default(null),
});
export type NewRole = z.input<typeof NewRoleSchema>;

export const CATALOG_KINDS = ["person", "room", "device", "service"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];
