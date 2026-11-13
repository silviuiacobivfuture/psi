import { z } from "zod";

/**
 * A clinic's rooms as the owner drew them: floors, bookable rooms, what each is for, the category it belongs to, the
 * practitioner whose room it is (when it is one person's) and where it sits on the floor plan. The seed lives in
 * `seed/<app>-rooms.json`; the console's demo and the real setup read the same file.
 */
export const ROOM_CATEGORIES = ["therapy", "neuro"] as const;
export const roomCategorySchema = z.enum(ROOM_CATEGORIES);
export type RoomCategory = z.infer<typeof roomCategorySchema>;

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);
const label = z.object({ ro: z.string().min(1).max(120), en: z.string().min(1).max(120) });

const seedRoomSchema = z.object({
	id: slug,
	name: z.string().min(1).max(80),
	purpose: z.string().min(1).max(120),
	category: roomCategorySchema,
	/** The practitioner this room is known by, when it is one person's room. */
	homePractitioner: z.string().min(1).max(80).nullable(),
	/** Where it sits on the floor, in plan units. */
	geometry: z.object({
		x: z.number().int().min(0),
		y: z.number().int().min(0),
		w: z.number().int().min(10),
		h: z.number().int().min(10),
	}),
});

export const roomsSeedSchema = z
	.object({
		app: slug,
		categories: z.array(z.object({ id: roomCategorySchema, label })).min(1),
		floors: z
			.array(
				z.object({
					id: slug,
					name: z.string().min(1).max(40),
					order: z.number().int().min(0),
					rooms: z.array(seedRoomSchema).min(1),
				}),
			)
			.min(1),
	})
	.superRefine((seed, ctx) => {
		const ids = seed.floors.flatMap((f) => f.rooms.map((r) => r.id));
		if (new Set(ids).size !== ids.length)
			ctx.addIssue({ code: "custom", message: "duplicate room id", path: ["floors"] });
		const known = new Set(seed.categories.map((c) => c.id));
		for (const f of seed.floors)
			for (const r of f.rooms)
				if (!known.has(r.category))
					ctx.addIssue({
						code: "custom",
						message: `unknown category ${r.category}`,
						path: ["floors"],
					});
	});
export type RoomsSeed = z.infer<typeof roomsSeedSchema>;

/** Reads a seed file's content; throws with the reason when it is not a valid one. */
export function parseRoomsSeed(input: unknown): RoomsSeed {
	return roomsSeedSchema.parse(input);
}
