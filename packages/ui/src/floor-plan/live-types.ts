import { z } from "zod";
import { IdSchema } from "./schema";

const Instant = z.number().int().min(0);

export const LiveClosureSchema = z
	.object({ start: Instant, until: Instant, reason: z.string().max(120).optional() })
	.strict();

export const LiveRoomSchema = z
	.object({
		id: IdSchema,
		name: z.string().min(1).max(80),
		kind: z.string().max(40),
		capacity: z.number().int().min(0).max(500),
		equipment: z.array(z.string().max(40)).max(40).default([]),
		closures: z.array(LiveClosureSchema).max(400).default([]),
	})
	.strict();
export type LiveRoom = z.infer<typeof LiveRoomSchema>;

export const BOOKING_STATUSES = [
	"held",
	"requested",
	"confirmed",
	"cancelled",
	"declined",
	"expired",
] as const;

export const LiveBookingSchema = z
	.object({
		id: IdSchema,
		roomId: IdSchema,
		/** Half-open real time: the booking holds [start, until). */
		start: Instant,
		until: Instant,
		status: z.enum(BOOKING_STATUSES),
		holdExpiresAt: Instant.optional(),
		practitioner: z
			.object({ name: z.string().max(80), monogram: z.string().min(1).max(3) })
			.strict(),
		service: z.string().max(80),
		/** How many people the booking brings into the room. */
		people: z.number().int().min(1).max(500).default(1),
		/** A group activity may share a room with others up to its capacity; anything else owns the room. */
		shared: z.boolean().default(false),
		/** The client's initials: present only when the source may show clients, and removed again for a viewer who may not. */
		clientInitials: z.array(z.string().min(1).max(4)).max(40).optional(),
		deviceIds: z.array(IdSchema).max(20).default([]),
	})
	.strict()
	.refine((b) => b.until > b.start, { message: "a booking ends after it starts" });
export type LiveBooking = z.infer<typeof LiveBookingSchema>;

export const LiveDeviceSchema = z
	.object({ id: IdSchema, name: z.string().max(80), roomId: IdSchema.optional() })
	.strict();
export type LiveDevice = z.infer<typeof LiveDeviceSchema>;

export const LiveDataSchema = z
	.object({
		rooms: z.array(LiveRoomSchema).max(200),
		bookings: z.array(LiveBookingSchema).max(20_000),
		devices: z.array(LiveDeviceSchema).max(200).default([]),
	})
	.strict();
export type LiveData = z.infer<typeof LiveDataSchema>;

/** What the person looking may see. */
export interface Viewer {
	seeClients: boolean;
}
export type LiveClosure = z.infer<typeof LiveClosureSchema>;
