import { z } from "zod";

/**
 * What the engine needs from a scheduling store, and nothing more. There is deliberately no
 * method that holds a slot or books one: the tools can find times and propose one, and cancel
 * with the code a person holds. Creating a request is the app's, from a form the person submits
 * (see `tools.ts`). `@psi/scheduling`'s client satisfies this port.
 */

export const SchedulingModeSchema = z.enum(["onsite", "online"]);
export type SchedulingMode = z.infer<typeof SchedulingModeSchema>;

export interface SchedulingSearch {
	tenant: string;
	service: string;
	/** Earliest start, UTC ms (inclusive). */
	from: number;
	/** Latest start, UTC ms (exclusive). */
	to: number;
	mode?: SchedulingMode;
	limit?: number;
}

export const SchedulingSlotSchema = z.object({
	/** Opaque: what a form or a tool sends back to name this slot. */
	id: z.string().min(1).max(200),
	start: z.number().int().nonnegative(),
	end: z.number().int().nonnegative(),
	practitionerName: z.string(),
	modes: z.array(SchedulingModeSchema).readonly(),
});
export type SchedulingSlot = z.infer<typeof SchedulingSlotSchema>;

export const SchedulingSlotsSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		slots: z.array(SchedulingSlotSchema).readonly(),
	}),
	z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type SchedulingSlots = z.infer<typeof SchedulingSlotsSchema>;

export const SchedulingCancelSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), start: z.number().int().nonnegative() }),
	z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type SchedulingCancel = z.infer<typeof SchedulingCancelSchema>;

/** A service the store offers a tenant today: its key, and its name in both languages when it has one. */
export interface ServiceEntry {
	slug: string;
	name?: { ro: string; en: string };
}

export interface SchedulingPort {
	/**
	 * The tenant's active services right now, read from the store (the app caches it briefly). When
	 * the port has it, the booking dialogue offers exactly these and the profile's own list is only
	 * a fallback; without it the profile's list is the truth.
	 */
	catalogue?(tenant: string): Promise<ReadonlyArray<ServiceEntry>>;
	findSlots(search: SchedulingSearch): Promise<SchedulingSlots>;
	cancel(input: { reference: string; cancelCode: string }): Promise<SchedulingCancel>;
}

/** The port, checked at `createEngine`: two functions, no booking method required or used. */
export const SchedulingPortSchema: z.ZodType<SchedulingPort> = z.custom<SchedulingPort>(
	(value) =>
		typeof value === "object" &&
		value !== null &&
		"findSlots" in value &&
		typeof value.findSlots === "function" &&
		"cancel" in value &&
		typeof value.cancel === "function",
	{ message: "scheduling must have findSlots and cancel functions" },
);

/** What one profile may schedule: its tenant in the store and the services it offers. */
export interface ProfileScheduling {
	tenant: string;
	/** The services the profile offers when the port cannot say (see `SchedulingPort.catalogue`); may be empty. */
	services: ReadonlyArray<string>;
	/** Names per service slug, in both languages, when the live catalogue gave them. */
	names?: Readonly<Record<string, { ro: string; en: string }>>;
}

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);

export const ProfileSchedulingSchema: z.ZodType<ProfileScheduling> = z
	.object({ tenant: Slug, services: z.array(Slug).readonly() })
	.strict();
