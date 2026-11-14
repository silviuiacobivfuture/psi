import { nameKey, type RoomsSeed } from "@psi/scheduling/clinic";
import { OrgProfile, type OrgProfileType } from "@psi/scheduling-sdk/contract";
import { z } from "zod";

const Name = z.string().min(1).max(80);
const SeedRoomId = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

/**
 * What a clinic is beyond its rooms, as the owner set it up: the organisation's name, its devices and the room each
 * stands in, the groups that run there, and the services it gives. The services come as drafts (inactive, no price):
 * the old system kept no catalogue and the site publishes no fixed price, so the owner completes and opens each one.
 */
export const orgSeedSchema = z.object({
	app: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
	name: Name,
	devices: z
		.array(
			z.object({
				name: Name,
				formerly: z.array(Name).default([]),
				/** The rooms seed's id of the room it stands in. */
				room: SeedRoomId,
				deviceType: z.enum(["nfb", "qeeg", "other"]),
			}),
		)
		.max(50),
	groups: z
		.array(
			z.object({
				name: Name,
				formerly: z.array(Name).default([]),
				kind: z.enum(["group", "atelier"]),
			}),
		)
		.max(50),
	services: z
		.array(
			z.object({
				slug: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
				name: z.object({ ro: z.string().min(1).max(200), en: z.string().min(1).max(200) }),
				/** The room category it is filed under and needs. */
				category: z.enum(["therapy", "neuro"]),
				rooms: z.array(SeedRoomId).max(20),
				/** Device names, of this seed's devices. */
				devices: z.array(Name).max(20),
			}),
		)
		.max(100),
	/** What a draft service starts with: the length is the old system's most frequent appointment, to be confirmed. */
	serviceDraft: z.object({
		durationMinutes: z.number().int().min(5).max(480),
		modes: z.array(z.enum(["onsite", "online"])).min(1),
	}),
	/**
	 * The contact profile as the clinic's own site publishes it (only what the site states; the rest is the owners' to
	 * fill in): checked against the service's contract, so a seed it would refuse is refused here.
	 */
	profile: z
		.custom<OrgProfileType>((v) => OrgProfile.safeParse(v).success, {
			message: "the profile is not one the service keeps",
		})
		.optional(),
});
export type OrgSeed = z.infer<typeof orgSeedSchema>;

/** Parses the org seed and checks it against the rooms seed: every room and device it names exists, no name twice. */
export function parseOrgSeed(input: unknown, rooms: RoomsSeed): OrgSeed {
	const seed = orgSeedSchema.parse(input);
	const roomIds = new Set(rooms.floors.flatMap((f) => f.rooms.map((r) => r.id)));
	const deviceNames = new Set(seed.devices.map((d) => nameKey(d.name)));
	const problems: string[] = [];
	if (seed.app !== rooms.app)
		problems.push(`the org seed is ${seed.app}, the rooms seed ${rooms.app}`);
	for (const d of seed.devices)
		if (!roomIds.has(d.room)) problems.push(`device ${d.name}: unknown room ${d.room}`);
	for (const s of seed.services) {
		for (const r of s.rooms)
			if (!roomIds.has(r)) problems.push(`service ${s.slug}: unknown room ${r}`);
		for (const d of s.devices)
			if (!deviceNames.has(nameKey(d))) problems.push(`service ${s.slug}: unknown device ${d}`);
	}
	const twice = (names: string[]): string[] =>
		names.filter((n, i) => names.findIndex((m) => nameKey(m) === nameKey(n)) !== i);
	for (const n of twice(seed.devices.flatMap((d) => [d.name, ...d.formerly])))
		problems.push(`device name given twice: ${n}`);
	for (const n of twice(seed.groups.flatMap((g) => [g.name, ...g.formerly])))
		problems.push(`group name given twice: ${n}`);
	for (const n of twice(seed.services.map((s) => s.slug)))
		problems.push(`service slug given twice: ${n}`);
	if (problems.length > 0) throw new Error(`the org seed: ${problems.join("; ")}`);
	return seed;
}
