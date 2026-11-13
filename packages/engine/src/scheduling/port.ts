import { z } from "zod";

/**
 * What the engine needs from a scheduling store. The tools find times, check one is still free and
 * cancel with the code a person holds. Booking itself is `hold` then `submit`, and they are the
 * engine's own steps, never a model's: they run only after the visitor confirmed a summary of
 * everything the form asks (see `booking-submit.ts`). A port without them cannot book in the chat;
 * the visitor then finishes in the booking form. `@psi/scheduling`'s client satisfies this port.
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

/** The contact of a request, as the store takes it. Every value has been through the form's rules. */
export const SchedulingContactSchema = z
	.object({
		name: z.string(),
		email: z.string(),
		phone: z.string(),
		age: z.number().int(),
		details: z.string(),
	})
	.strict();
export type SchedulingContact = z.infer<typeof SchedulingContactSchema>;

export const SchedulingHoldSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		reference: z.string().min(1),
		holdToken: z.string().min(1),
		start: z.number().int().nonnegative(),
		practitionerName: z.string(),
		timeZone: z.string(),
	}),
	z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type SchedulingHold = z.infer<typeof SchedulingHoldSchema>;

export const SchedulingSubmitSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		reference: z.string().min(1),
		cancelCode: z.string().min(1),
		start: z.number().int().nonnegative(),
		timeZone: z.string(),
		mode: SchedulingModeSchema,
	}),
	z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type SchedulingSubmit = z.infer<typeof SchedulingSubmitSchema>;

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
	/**
	 * Keeps a free time (named by the `id` `findSlots` gave) for a few minutes, with no personal
	 * data. Called right before `submit`, never earlier.
	 */
	hold?(input: {
		tenant: string;
		service: string;
		slotId: string;
		locale: "ro" | "en";
	}): Promise<SchedulingHold>;
	/** Turns a hold into a request with the contact; the cancel code comes back once. */
	submit?(input: {
		reference: string;
		holdToken: string;
		contact: SchedulingContact;
		audience?: "child" | "teen" | "adult";
	}): Promise<SchedulingSubmit>;
	/** Gives a hold back (a submit that failed after its hold). */
	release?(input: { reference: string; holdToken: string }): Promise<unknown>;
	cancel(input: { reference: string; cancelCode: string }): Promise<SchedulingCancel>;
}

/** The port, checked at `createEngine`: the two functions every store has; hold, submit and release are optional. */
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
	/**
	 * Who the site books for (the site's own audiences). The age tells which one a booking is; a
	 * single-audience site always books that one. Absent: the age decides alone.
	 */
	audiences?: ReadonlyArray<"child" | "teen" | "adult">;
}

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);

export const ProfileSchedulingSchema: z.ZodType<ProfileScheduling> = z
	.object({
		tenant: Slug,
		services: z.array(Slug).readonly(),
		audiences: z
			.array(z.enum(["child", "teen", "adult"]))
			.min(1)
			.readonly()
			.optional(),
	})
	.strict();
