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
				name: z.object({ ro: z.string(), en: z.string() }).optional(),
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
				updatedBy: z.string().optional(),
				updatedAt: z.number().optional(),
				external: z.boolean().optional(),
				rooms: z.array(z.string()).optional(),
				abAnchor: z.string().optional(),
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
				name: z.object({ ro: z.string(), en: z.string() }).optional(),
				roomKind: z.string().optional(),
				roomEquipment: z.array(z.string()).optional(),
				roomAudiences: z.array(AudienceSchema).optional(),
				updatedBy: z.string().optional(),
				updatedAt: z.number().optional(),
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
				week: z.enum(["A", "B"]).optional(),
				override: z.boolean().optional(),
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

export const RawCreatePractitionerSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), id: z.string().min(1), created: z.boolean() }),
	z.object({ ok: z.literal(false), reason: z.enum(["invalid", "exists"]) }),
]);

export const RawUpdatePractitionerSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), upcoming: z.number().int().nonnegative() }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawCreateServiceSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), id: z.string().min(1), created: z.boolean() }),
	z.object({ ok: z.literal(false), reason: z.enum(["invalid", "exists"]) }),
]);

export const RawSetDayRulesSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), added: z.number().int(), removed: z.number().int() }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawDaysOffSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), added: z.number().int().nonnegative() }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawCreateRoomSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), id: z.string().min(1), created: z.boolean() }),
	z.object({ ok: z.literal(false), reason: z.enum(["invalid", "exists"]) }),
]);

export const RawRoomsSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		rooms: z.array(
			z.object({
				id: z.string().min(1),
				slug: z.string(),
				name: z.string(),
				kind: z.string(),
				capacity: z.number().int().positive(),
				suits: z.array(AudienceSchema),
				equipment: z.array(z.string()),
				active: z.boolean(),
				closures: z.array(
					z.object({
						id: z.string().min(1),
						date: LocalDateSchema,
						start: Minutes.optional(),
						end: Minutes.optional(),
					}),
				),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);

export const RawClosureSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), added: z.number().int().nonnegative() }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawPeriodSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), added: z.number().int(), removed: z.number().int() }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawChangedSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "invalid"]) }),
]);

export const RawRemovedSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), removed: z.number().int() }),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);

/** The staff calendar for a few days: real hours, days off, what is booked, rooms' closures. */
export const RawBoardSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string(),
		today: LocalDateSchema,
		hours: z.array(
			z.object({
				practitionerId: z.string(),
				date: LocalDateSchema,
				start: Minutes,
				end: Minutes,
			}),
		),
		off: z.array(z.object({ practitionerId: z.string(), date: LocalDateSchema })),
		appointments: z.array(
			z.object({
				reference: z.string(),
				status: StatusSchema,
				start: Instant,
				end: Instant,
				blockedUntil: Instant,
				mode: ModeSchema,
				practitionerId: z.string(),
				serviceSlug: z.string(),
				roomId: z.string().optional(),
				contactName: z.string().optional(),
			}),
		),
		closures: z.array(
			z.object({
				id: z.string(),
				roomId: z.string(),
				date: LocalDateSchema,
				start: Minutes.optional(),
				end: Minutes.optional(),
			}),
		),
	}),
	z.object({ ok: z.literal(false), reason: z.enum(["unknown_tenant", "invalid"]) }),
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

const DuplicateSchema = z.object({
	line: z.number().int(),
	with: z.enum(["file", "store"]),
	by: z.enum(["phone", "email", "guardian"]),
	otherLine: z.number().int().optional(),
});

/** What an import did, or with `committed: false` would do (nothing is written then). */
export const RawImportSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		committed: z.boolean(),
		total: z.number().int(),
		created: z.number().int(),
		duplicates: z.array(DuplicateSchema),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);

export const RawCreateClientSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), id: z.string().min(1) }),
	z.object({ ok: z.literal(false), reason: z.enum(["invalid", "duplicate"]) }),
]);

export const RawClientsSchema = z.object({
	ok: z.literal(true),
	clients: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string(),
			kind: AudienceSchema,
			phone: z.string().optional(),
			email: z.string().optional(),
			guardian: z
				.object({ name: z.string(), phone: z.string().optional(), email: z.string().optional() })
				.optional(),
			staffNotes: z.string().optional(),
			consent: z.object({ contact: z.boolean(), reminders: z.boolean() }),
		}),
	),
});

export const RawEraseClientSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), unlinked: z.number().int().nonnegative() }),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);
