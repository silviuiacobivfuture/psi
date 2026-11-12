import { z } from "zod";

/**
 * What the Convex functions answer, parsed on the way in: the network is a boundary, and a
 * deployment running other code must fail loudly here rather than leak a wrong shape into an app.
 */

export const ModeSchema = z.enum(["onsite", "online"]);
export const AudienceSchema = z.enum(["child", "teen", "adult"]);
export const StatusSchema = z.enum([
	"held",
	"requested",
	"confirmed",
	"cancelled",
	"declined",
	"expired",
]);
export const LocaleSchema = z.enum(["ro", "en"]);

const Instant = z.number().int().nonnegative();

export const RawSlotSchema = z.object({
	practitioner: z.string().min(1),
	practitionerName: z.string(),
	start: Instant,
	end: Instant,
	modes: z.array(ModeSchema),
});

export const RawSlotsSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		service: z.object({
			slug: z.string(),
			durationMinutes: z.number().int().positive(),
			modes: z.array(ModeSchema),
			holdMinutes: z.number().int().positive(),
		}),
		slots: z.array(RawSlotSchema),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("unknown_service") }),
]);

export const RawHoldSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		reference: z.string(),
		start: Instant,
		end: Instant,
		mode: ModeSchema,
		expiresAt: Instant,
		practitionerName: z.string(),
		timeZone: z.string(),
	}),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["invalid", "unknown_service", "slot_taken", "not_offered", "retry"]),
	}),
]);

export const RawSubmitSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		reference: z.string(),
		status: StatusSchema,
		start: Instant,
		end: Instant,
		mode: ModeSchema,
		timeZone: z.string(),
	}),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["invalid", "not_found", "hold_expired", "not_allowed"]),
	}),
]);

export const RawReleaseSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), status: StatusSchema }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "hold_expired", "not_allowed"]) }),
]);

export const RawCancelSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), status: StatusSchema, start: Instant }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "hold_expired", "not_allowed"]) }),
]);

export const RawServicesSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		services: z.array(
			z.object({
				slug: z.string(),
				durationMinutes: z.number().int().positive(),
				modes: z.array(ModeSchema),
				location: z.string().optional(),
				practitioners: z.array(z.object({ id: z.string(), name: z.string() })),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("unknown_tenant") }),
]);

export const RawCalendarSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		appointments: z.array(
			z.object({
				reference: z.string(),
				status: StatusSchema,
				start: Instant,
				end: Instant,
				mode: ModeSchema,
				contact: z
					.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional() })
					.optional(),
				audience: AudienceSchema.optional(),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);

export const RawDecideSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), status: StatusSchema }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "hold_expired", "not_allowed"]) }),
]);

export const RawRescheduleSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), reference: z.string(), start: Instant, end: Instant }),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["not_found", "hold_expired", "not_allowed", "slot_taken", "retry"]),
	}),
]);

export const RawExceptionSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);
