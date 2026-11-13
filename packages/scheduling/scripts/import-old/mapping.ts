import { z } from "zod";
import { ROOM_KINDS } from "../../src/domain/rooms";

/**
 * The facts the export alone does not hold, supplied as a file (`--mapping`), never hard-coded:
 * which old ids are devices or rooms rather than people, which appointment columns are group
 * activities, and the roster-only staff. `mapping.example.json` has the clinic's own values.
 */
const idKey = z.string().regex(/^\d+$/);

const resource = z.object({
	slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
	name: z.string().min(1),
	kind: z.enum(["device", "room"]),
	/** For a room: one of the store's room kinds. */
	roomKind: z.enum(ROOM_KINDS).optional(),
	capacity: z.number().int().positive().optional(),
});

export const mappingSchema = z
	.object({
		/** The app the import writes into, with the name, kind and address it is created with. */
		app: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
		appName: z.string().min(1),
		appKind: z.enum(["clinic", "club"]),
		address: z.string().min(1).optional(),
		resources: z.array(resource),
		/** Old `rooms.id` (as appointments.room_id) to a resource slug. */
		roomIds: z.record(idKey, z.string()),
		/** Old `nfb_device_id` to a resource slug; defaults to `roomIds`. */
		deviceIds: z.record(idKey, z.string()).optional(),
		/** Old therapist ids that are really devices or rooms, to a resource slug. */
		therapistResources: z.record(idKey, z.string()),
		/** `appointments.therapist_id` values that are group activities (their `group_activities.id`). */
		groupActivityColumns: z.array(z.number().int()),
		/** People on the roster who are not practitioners. */
		staff: z.array(
			z.object({
				legacyId: z.number().int(),
				name: z.string().min(1),
				kind: z.enum(["reception", "other"]),
			}),
		),
	})
	.superRefine((m, ctx) => {
		const slugs = new Set(m.resources.map((r) => r.slug));
		if (slugs.size !== m.resources.length) {
			ctx.addIssue({ code: "custom", path: ["resources"], message: "duplicate_slug" });
		}
		const refs: Array<[string, Record<string, string>]> = [
			["roomIds", m.roomIds],
			["deviceIds", m.deviceIds ?? {}],
			["therapistResources", m.therapistResources],
		];
		for (const [where, record] of refs) {
			for (const [id, slug] of Object.entries(record)) {
				if (!slugs.has(slug))
					ctx.addIssue({ code: "custom", path: [where, id], message: "unknown_slug" });
			}
		}
	});
export type Mapping = z.infer<typeof mappingSchema>;
export type Resource = Mapping["resources"][number];

export function resourceBySlug(m: Mapping, slug: string): Resource | undefined {
	return m.resources.find((r) => r.slug === slug);
}

export type ColumnPlace =
	| { kind: "practitioner"; legacyId: string }
	| { kind: "device"; legacyId: string }
	| { kind: "room"; legacyId: string }
	| { kind: "group"; legacyId: string };

export const practitionerLegacy = (id: number): string => `therapists:${id}`;
export const resourceLegacy = (slug: string): string => `resource:${slug}`;
export const groupLegacy = (id: number): string => `group_activities:${id}`;

/**
 * Where an `appointments.therapist_id` points, given the practitioners the export holds:
 * a group activity, a device or room, a practitioner, or nothing known (undefined).
 */
export function columnFor(
	m: Mapping,
	practitionerIds: ReadonlySet<number>,
	groupIds: ReadonlySet<number>,
	therapistId: number,
): ColumnPlace | undefined {
	if (m.groupActivityColumns.includes(therapistId) && groupIds.has(therapistId)) {
		return { kind: "group", legacyId: groupLegacy(therapistId) };
	}
	const slug = m.therapistResources[String(therapistId)];
	if (slug !== undefined) {
		const found = resourceBySlug(m, slug);
		return found === undefined ? undefined : { kind: found.kind, legacyId: resourceLegacy(slug) };
	}
	return practitionerIds.has(therapistId)
		? { kind: "practitioner", legacyId: practitionerLegacy(therapistId) }
		: undefined;
}

/** A device or room a room id or device id points to. */
export function resourceFor(
	m: Mapping,
	via: "room" | "device",
	id: number,
): { kind: "device" | "room"; legacyId: string } | undefined {
	const slug = via === "device" ? (m.deviceIds ?? m.roomIds)[String(id)] : m.roomIds[String(id)];
	if (slug === undefined) return undefined;
	const found = resourceBySlug(m, slug);
	return found === undefined ? undefined : { kind: found.kind, legacyId: resourceLegacy(slug) };
}
