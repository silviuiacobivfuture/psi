import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	audienceValidator,
	channelValidator,
	contactValidator,
	decisionReasonValidator,
	localeValidator,
	modeValidator,
	statusValidator,
} from "./validators";

/**
 * The scheduling store. Every row belongs to one tenant (a brand: psizone, eqsync, hemisync), and
 * every function filters by it. Times are UTC milliseconds; rules and exceptions are wall time
 * (minutes after midnight) in the tenant's zone. No row holds a reason for a visit: an appointment
 * names the service chosen, never why.
 */
export default defineSchema({
	tenants: defineTable({
		slug: v.string(),
		/** IANA zone the tenant's rules are written in: Europe/Bucharest. */
		timeZone: v.string(),
		active: v.boolean(),
	}).index("by_slug", ["slug"]),

	practitioners: defineTable({
		tenant: v.string(),
		slug: v.string(),
		/** The public display name, as the practitioner agreed to be shown. */
		displayName: v.string(),
		active: v.boolean(),
		/** The staff subject who last changed it, and when (UTC ms); absent on seeded rows. */
		updatedBy: v.optional(v.string()),
		updatedAt: v.optional(v.number()),
		/** A contractor, not employed: the team sees it; a visitor never does (only `displayName`). */
		external: v.optional(v.boolean()),
		/** The rooms this person may use; absent or empty means any suitable room. */
		rooms: v.optional(v.array(v.id("rooms"))),
		/** A Monday: the week holding it is week A for this person's alternating rules. */
		abAnchor: v.optional(v.string()),
	}).index("by_tenant_slug", ["tenant", "slug"]),

	rooms: defineTable({
		tenant: v.string(),
		slug: v.string(),
		/** What the team calls it: "Camera multisenzorială". */
		name: v.string(),
		/** One of `ROOM_KINDS`. */
		kind: v.string(),
		capacity: v.number(),
		suits: v.array(audienceValidator),
		/** Short equipment tags a service may require ("eeg", "snoezelen"). */
		equipment: v.array(v.string()),
		active: v.boolean(),
		updatedBy: v.optional(v.string()),
		updatedAt: v.optional(v.number()),
	}).index("by_tenant_slug", ["tenant", "slug"]),

	/** A room out of use: maintenance, a private event. Whole date, or part of it in wall time. */
	roomClosures: defineTable({
		room: v.id("rooms"),
		date: v.string(),
		start: v.optional(v.number()),
		end: v.optional(v.number()),
		createdBy: v.optional(v.string()),
	}).index("by_room_date", ["room", "date"]),

	services: defineTable({
		tenant: v.string(),
		slug: v.string(),
		durationMinutes: v.number(),
		bufferMinutes: v.number(),
		stepMinutes: v.number(),
		minNoticeMinutes: v.number(),
		horizonDays: v.number(),
		holdMinutes: v.number(),
		modes: v.array(modeValidator),
		/** For onsite sessions: the address key the app renders (never free text from a visitor). */
		location: v.optional(v.string()),
		practitioners: v.array(v.id("practitioners")),
		active: v.boolean(),
		/** The name the team gave it, per language; the slug stays its key. Staff-side only. */
		name: v.optional(v.object({ ro: v.string(), en: v.string() })),
		/** An onsite session needs a room of this kind (absent: no room is needed). */
		roomKind: v.optional(v.string()),
		roomEquipment: v.optional(v.array(v.string())),
		/** Who the room must suit; absent asks nothing of it. */
		roomAudiences: v.optional(v.array(audienceValidator)),
		/** The staff subject who last changed it, and when (UTC ms); absent on seeded rows. */
		updatedBy: v.optional(v.string()),
		updatedAt: v.optional(v.number()),
	}).index("by_tenant_slug", ["tenant", "slug"]),

	rules: defineTable({
		practitioner: v.id("practitioners"),
		weekday: v.number(),
		start: v.number(),
		end: v.number(),
		modes: v.array(modeValidator),
		validFrom: v.optional(v.string()),
		validUntil: v.optional(v.string()),
		/** The staff subject who added it; absent on seeded rows. */
		createdBy: v.optional(v.string()),
		week: v.optional(v.union(v.literal("A"), v.literal("B"))),
		override: v.optional(v.boolean()),
	}).index("by_practitioner", ["practitioner"]),

	exceptions: defineTable({
		practitioner: v.id("practitioners"),
		date: v.string(),
		kind: v.union(v.literal("closed"), v.literal("open")),
		start: v.optional(v.number()),
		end: v.optional(v.number()),
		modes: v.optional(v.array(modeValidator)),
		/** The staff subject who added it; absent on seeded rows. */
		createdBy: v.optional(v.string()),
	}).index("by_practitioner_date", ["practitioner", "date"]),

	appointments: defineTable({
		tenant: v.string(),
		practitioner: v.id("practitioners"),
		service: v.id("services"),
		/** The room an onsite session uses, when its service needs one. */
		room: v.optional(v.id("rooms")),
		mode: modeValidator,
		start: v.number(),
		end: v.number(),
		/** `end` plus the service's buffer: what the calendar loses. */
		blockedUntil: v.number(),
		status: statusValidator,
		/** Public, readable reference (`K7M3-9QXA`). */
		reference: v.string(),
		/** For a hold: when it lapses. */
		holdExpiresAt: v.optional(v.number()),
		/** SHA-256 of the hold token the confirm form carries. */
		holdTokenHash: v.string(),
		/** SHA-256 of the cancel code shown to the visitor once, set when they submit. */
		cancelCodeHash: v.optional(v.string()),
		/** Set when the visitor submits; erased by retention. */
		contact: v.optional(contactValidator),
		audience: v.optional(audienceValidator),
		locale: localeValidator,
		channel: channelValidator,
		submittedAt: v.optional(v.number()),
		/**
		 * The estate account that made the request, when the visitor was signed in: SHA-256 of
		 * `psi-account:` + the account's subject (never the subject itself, never a name or e-mail).
		 * Absent for anonymous requests, which are never linked without proof (`account.link`).
		 */
		accountHash: v.optional(v.string()),
		/** The staff subject who last decided on it (confirm, decline, cancel, reschedule). */
		decidedBy: v.optional(v.string()),
		/** Why the team declined or cancelled it: a closed, administrative list, never clinical. */
		decisionReason: v.optional(decisionReasonValidator),
		rescheduledFrom: v.optional(v.id("appointments")),
		rescheduledTo: v.optional(v.id("appointments")),
		updatedAt: v.number(),
	})
		.index("by_practitioner_start", ["practitioner", "start"])
		.index("by_reference", ["reference"])
		.index("by_status_hold", ["status", "holdExpiresAt"])
		.index("by_room_start", ["room", "start"])
		.index("by_tenant_start", ["tenant", "start"])
		.index("by_account_start", ["accountHash", "start"])
		.index("by_updated", ["updatedAt"]),
});
