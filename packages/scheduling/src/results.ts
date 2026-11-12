import { z } from "zod";
import { DECISION_REASONS } from "./domain/lifecycle";

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
export const ChannelSchema = z.enum(["form", "guide", "staff"]);
export const DecisionReasonSchema = z.enum(DECISION_REASONS);

const Instant = z.number().int().nonnegative();
const Minutes = z.number().int().nonnegative();
const ContactSchema = z.object({
	name: z.string(),
	email: z.string().optional(),
	phone: z.string().optional(),
});

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
	z.object({
		ok: z.literal(false),
		reason: z.enum(["not_found", "hold_expired", "not_allowed"]),
	}),
]);

export const RawCancelSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), status: StatusSchema, start: Instant }),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["not_found", "hold_expired", "not_allowed"]),
	}),
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
				contact: ContactSchema.optional(),
				audience: AudienceSchema.optional(),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);

export const RawDecideSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		status: StatusSchema,
		reference: z.string(),
		start: Instant,
		/** Set when a signed-in person made the request: the account to notify. */
		accountHash: z.string().optional(),
	}),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["not_found", "hold_expired", "not_allowed"]),
	}),
]);

export const RawRescheduleSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		reference: z.string(),
		start: Instant,
		end: Instant,
	}),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["not_found", "hold_expired", "not_allowed", "slot_taken", "retry"]),
	}),
]);

export const RawExceptionSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);

/** The tenant's whole catalog as staff see it, inactive rows included. */
export const RawStaffCatalogSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		practitioners: z.array(
			z.object({
				id: z.string().min(1),
				slug: z.string(),
				displayName: z.string(),
				active: z.boolean(),
			}),
		),
		services: z.array(
			z.object({
				id: z.string().min(1),
				slug: z.string(),
				durationMinutes: z.number().int().positive(),
				bufferMinutes: Minutes,
				stepMinutes: z.number().int().positive(),
				minNoticeMinutes: Minutes,
				horizonDays: z.number().int().positive(),
				holdMinutes: z.number().int().positive(),
				modes: z.array(ModeSchema),
				location: z.string().optional(),
				practitioners: z.array(z.string().min(1)),
				active: z.boolean(),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("unknown_tenant") }),
]);

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One practitioner's weekly rules and their exceptions from a date on. */
export const RawStaffAvailabilitySchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		rules: z.array(
			z.object({
				id: z.string().min(1),
				weekday: z.number().int().min(1).max(7),
				start: Minutes,
				end: Minutes,
				modes: z.array(ModeSchema),
				validFrom: LocalDateSchema.optional(),
				validUntil: LocalDateSchema.optional(),
			}),
		),
		exceptions: z.array(
			z.object({
				id: z.string().min(1),
				date: LocalDateSchema,
				kind: z.enum(["closed", "open"]),
				start: Minutes.optional(),
				end: Minutes.optional(),
				modes: z.array(ModeSchema).optional(),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawUpdateServiceSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawAddRuleSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), id: z.string().min(1) }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawRemoveSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);

/** One row of the tenant-wide request list; never the account hash, only whether one is linked. */
export const StaffRequestSchema = z.object({
	reference: z.string(),
	status: StatusSchema,
	start: Instant,
	end: Instant,
	mode: ModeSchema,
	serviceSlug: z.string(),
	practitionerId: z.string().min(1),
	practitionerName: z.string(),
	channel: ChannelSchema,
	submittedAt: Instant.optional(),
	contact: ContactSchema.optional(),
	audience: AudienceSchema.optional(),
	decidedBy: z.string().optional(),
	decisionReason: DecisionReasonSchema.optional(),
	linkedAccount: z.boolean(),
});

export const RawStaffRequestsSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		requests: z.array(StaffRequestSchema),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("unknown_tenant") }),
]);
