import { z } from "zod/v4";
import { Id } from "./primitives";

/**
 * What the team says about its people, rooms, devices and services beyond the name: the facts a calendar and a booking
 * choose by. Every field is optional on the wire (absent: not said); the service keeps them whole and checks only what
 * it can (a day's hours run forward, a reference names something of the same app).
 */

const Minute = z.number().int().min(0).max(1440);
/** One day's working hours; null is a day off. */
const DayHours = z.object({ from: Minute, to: Minute }).refine((h) => h.from < h.to, {
	message: "from_before_to",
});
/** Monday first. */
export const WeekHours = z.array(DayHours.nullable()).length(7);

const Short = z.string().trim().min(1).max(120);

export const PersonFacts = {
	email: z.string().trim().max(200).optional(),
	specialty: Short.optional(),
	hours: WeekHours.optional(),
	/** The rooms they work in and the services they give. */
	roomIds: z.array(Id).max(100).optional(),
	serviceIds: z.array(Id).max(100).optional(),
};

/** What a room is for and where it is. `kind` (on the room) is its category. */
export const RoomFacts = {
	floor: z.string().trim().min(1).max(40).optional(),
	purpose: Short.optional(),
	/** May a booking use it. Absent: yes. */
	bookable: z.boolean().optional(),
	/** The person whose room it is ("cabinetul Irinei"). */
	homePractitionerId: Id.optional(),
};

export const DEVICE_TYPES = ["nfb", "qeeg", "other"] as const;
export const DeviceFacts = {
	deviceType: z.enum(DEVICE_TYPES).optional(),
	bookable: z.boolean().optional(),
};

/** How a service is filed and where it may be given; online is already `modes`. */
export const ServiceFacts = {
	category: Short.optional(),
	/** The room category it needs (neurofeedback and QEEG need a neuro room). */
	roomCategory: Short.optional(),
	roomIds: z.array(Id).max(100).optional(),
	deviceIds: z.array(Id).max(100).optional(),
};
