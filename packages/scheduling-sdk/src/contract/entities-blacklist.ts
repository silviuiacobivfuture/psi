import { z } from "zod/v4";
import { Id, Ms, Subject } from "./primitives";

/** Mirrors `@psi/scheduling/clinic` (a test in the service holds the two together): the SDK carries no dependency of its own. */
export const BLACKLIST_CATEGORIES = [
	"no_show_repeated",
	"unpaid",
	"abusive",
	"duplicate",
	"other",
] as const;
export const BLACKLIST_SEVERITIES = ["warn", "block_online", "block_all"] as const;
export const BlacklistCategory = z.enum(BLACKLIST_CATEGORIES);
export const BlacklistSeverity = z.enum(BLACKLIST_SEVERITIES);
const MatchedBy = z.enum(["client", "phone", "email"]);

/** An entry as staff see it: the reason is staff-only text and never leaves a staff route. */
export const BlacklistEntry = z.object({
	id: Id,
	client: Id.optional(),
	phone: z.string().optional(),
	email: z.string().optional(),
	name: z.string().optional(),
	reason: z.string(),
	category: BlacklistCategory,
	severity: BlacklistSeverity,
	active: z.boolean(),
	expiresAt: Ms.optional(),
	createdBy: Subject,
	createdAt: Ms,
	updatedBy: Subject,
	updatedAt: Ms,
	version: z.number().int().min(1),
});
const Identifiers = {
	client: Id.optional(),
	phone: z.string().trim().min(3).max(40).optional(),
	email: z.string().trim().min(3).max(200).optional(),
	name: z.string().trim().min(1).max(120).optional(),
};
/** At least one of client, phone, e-mail (never a name alone); phone and e-mail are normalised by the service. */
export const BlacklistCreate = z.object({
	...Identifiers,
	reason: z.string().trim().min(1).max(2000),
	category: BlacklistCategory,
	severity: BlacklistSeverity,
	expiresAt: Ms.optional(),
});
export const BlacklistPatch = z.object({
	...Identifiers,
	reason: z.string().trim().min(1).max(2000).optional(),
	category: BlacklistCategory.optional(),
	severity: BlacklistSeverity.optional(),
	expiresAt: Ms.optional(),
	active: z.boolean().optional(),
	/** Fields to take off the entry. */
	clear: z
		.array(z.enum(["client", "phone", "email", "name", "expiresAt"]))
		.max(5)
		.optional(),
	/** The version the caller read; another one stored is a 409. */
	expectedVersion: z.number().int().min(1).optional(),
});
export const BlacklistChanged = z.object({
	entry: BlacklistEntry,
	changed: z.boolean(),
});
export const BlacklistCheckQuery = z.object(Identifiers);
export const BlacklistHit = z.object({
	entry: Id,
	severity: BlacklistSeverity,
	category: BlacklistCategory,
	reason: z.string(),
	matchedBy: MatchedBy,
	matched: z.array(MatchedBy),
	nameAgrees: z.boolean(),
});
export const BlacklistEvent = z.object({
	id: Id,
	at: Ms,
	kind: z.enum(["online_refused", "overridden"]),
	entry: z.string(),
	severity: BlacklistSeverity,
	category: BlacklistCategory,
	matchedBy: MatchedBy,
	channel: z.enum(["form", "guide", "callback", "staff"]),
	actor: Subject.optional(),
	authority: z.enum(["ack", "staff", "admin"]).optional(),
	overrideReason: z.string().optional(),
	subject: z.string().optional(),
});
export const BlacklistEventsQuery = z.object({
	entry: Id.optional(),
	before: z.coerce.number().int().nonnegative().optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * Booking a client the blacklist names anyway: the reason is the caller's, the AUTHORITY is the service's (from the
 * caller's own permissions: acknowledge a warning, `blacklist_override`, `blacklist_override_admin`), never the body's.
 */
export const BlacklistOverride = z.object({ reason: z.string().trim().min(1).max(500) });
