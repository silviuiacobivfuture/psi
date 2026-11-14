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

/**
 * How two names of a room, a person or a group are told to be the same: case, diacritics, spacing and punctuation
 * ignored ("Năfureanu Nicoleta" is "Nafureanu Nicoleta", "Race Me Up" is "RaceMeUp").
 */
export function nameKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLocaleLowerCase("ro")
		.replace(/[^\p{L}\p{N}]+/gu, "");
}
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
	/**
	 * The names this same physical room had in the clinic's old system, so a room that came in through the import is the
	 * one renamed (its id, and the appointments booked in it, kept) instead of a second room beside it.
	 */
	formerly: z.array(z.string().min(1).max(80)).max(5).default([]),
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
		/**
		 * Rooms of the old system that are none of the owner's rooms: kept for the appointments booked in them, but taken
		 * off the plan and out of booking (inactive, not bookable) until the owner says which room each one was.
		 */
		legacy: z.array(z.string().min(1).max(80)).max(20).default([]),
	})
	.superRefine((seed, ctx) => {
		const ids = seed.floors.flatMap((f) => f.rooms.map((r) => r.id));
		if (new Set(ids).size !== ids.length)
			ctx.addIssue({ code: "custom", message: "duplicate room id", path: ["floors"] });
		const names = [
			...seed.floors.flatMap((f) => f.rooms.flatMap((r) => [r.name, ...r.formerly])),
			...seed.legacy,
		].map(nameKey);
		if (new Set(names).size !== names.length)
			ctx.addIssue({
				code: "custom",
				message: "a name is given to two rooms (a room's, a former or a legacy one)",
				path: ["floors"],
			});
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
