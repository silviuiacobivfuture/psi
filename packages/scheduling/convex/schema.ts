import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { callbackRequests } from "./callbackSchema";
import { apiDefinitions, leaveRequests } from "./tables/apiRecordsExtra";
import {
	coordinatorAssignments,
	permissionOverrides,
	roleMembers,
	roles,
	treating,
} from "./tables/clinicAccess";
import { blacklistEntries, blacklistEvents } from "./tables/clinicBlacklist";
import { appDocuments } from "./tables/clinicDocs";
import { feedback, feedbackLinks, feedbackReplies } from "./tables/clinicFeedback";
import { clientNotes } from "./tables/clinicNotes";
import {
	appKeys,
	auditEvents,
	builderDefs,
	changeLog,
	customFieldDefs,
	customValues,
	files,
	formDefinitions,
	formResponses,
	storageOutbox,
} from "./tables/clinicRecords";
import { devices, groupActivities, staffMembers } from "./tables/clinicResources";
import { packages, payments, rosterDays, staffBlocks, visits } from "./tables/clinicVisits";
import { memberProfiles } from "./tables/memberProfiles";
import { notifyOutbox, usedLinks } from "./tables/notify";
import {
	audienceValidator,
	channelValidator,
	clientStatusValidator,
	contactValidator,
	decisionReasonValidator,
	encryptedValidator,
	localeValidator,
	modeValidator,
	statusValidator,
} from "./validators";

/**
 * The scheduling store. Every row belongs to one tenant (a brand: psizone, eqsync, hemisync), and
 * every function filters by it. Times are UTC milliseconds; rules and exceptions are wall time
 * (minutes after midnight) in the tenant's zone. No row of the public booking flow holds a reason
 * for a visit: an appointment names the service chosen, never why.
 *
 * A tenant is an APP (docs/plans/clinic.md section 4): `psizone`, `hemisync`. The clinic's tables
 * (`tables/clinic*.ts`) all carry it and every index starts with it; nothing crosses apps. The
 * older tables below gained only optional fields, so deployed rows stay valid; their indexes and
 * the app-less `rules`, `exceptions` and `roomClosures` (reached through a practitioner or room,
 * which carry the tenant) are unchanged.
 */
export default defineSchema({
	tenants: defineTable({
		slug: v.string(),
		/** IANA zone the tenant's rules are written in: Europe/Bucharest. */
		timeZone: v.string(),
		active: v.boolean(),
		/** When the app's name, zone or status last changed (UTC ms); absent on older rows. */
		updatedAt: v.optional(v.number()),
		/** The app's name and kind (a clinic, or a club like Hemi-Sync); absent on older rows. */
		name: v.optional(v.string()),
		kind: v.optional(v.union(v.literal("clinic"), v.literal("club"))),
		settings: v.optional(
			v.object({
				defaultLocale: localeValidator,
				currency: v.string(),
				address: v.optional(v.string()),
			}),
		),
	}).index("by_slug", ["slug"]),

	practitioners: defineTable({
		tenant: v.string(),
		/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
		extra: v.optional(v.string()),
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
		// Clinic fields (all optional): the calendar column's look and the usual working week.
		shortName: v.optional(v.string()),
		specialty: v.optional(v.string()),
		color: v.optional(v.string()),
		background: v.optional(v.string()),
		sortOrder: v.optional(v.number()),
		/** ISO weekdays (Monday 1) and the minutes after midnight the person usually starts and ends. */
		workDays: v.optional(v.array(v.number())),
		workStartMinutes: v.optional(v.number()),
		workEndMinutes: v.optional(v.number()),
		/** The sign-in subject, for the `self` scope. */
		staffSubject: v.optional(v.string()),
		legacyId: v.optional(v.string()),
		fingerprint: v.optional(v.string()),
		version: v.optional(v.number()),
	})
		.index("by_tenant_slug", ["tenant", "slug"])
		.index("by_tenant_legacy", ["tenant", "legacyId"])
		.index("by_tenant_subject", ["tenant", "staffSubject"]),

	rooms: defineTable({
		tenant: v.string(),
		/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
		extra: v.optional(v.string()),
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
		color: v.optional(v.string()),
		background: v.optional(v.string()),
		sortOrder: v.optional(v.number()),
		legacyId: v.optional(v.string()),
		fingerprint: v.optional(v.string()),
		version: v.optional(v.number()),
	})
		.index("by_tenant_slug", ["tenant", "slug"])
		.index("by_tenant_legacy", ["tenant", "legacyId"]),

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
		/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
		extra: v.optional(v.string()),
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

	/**
	 * The clinic's own customers (docs/plans/scheduling.md §6): who they are and how to reach them,
	 * a guardian for a child, consent flags, a short administrative note for staff. Never read by a
	 * visitor-facing function and never clinical. Erased on request (`staffClients.eraseClient`).
	 */
	clients: defineTable({
		tenant: v.string(),
		/** What the service's API holds about this row that no column here does (JSON text, `apiCatalogExtra`). Wiped with the row. */
		extra: v.optional(v.string()),
		name: v.string(),
		kind: audienceValidator,
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
		guardian: v.optional(
			v.object({
				name: v.string(),
				phone: v.optional(v.string()),
				email: v.optional(v.string()),
				relationship: v.optional(v.string()),
				occupation: v.optional(v.string()),
			}),
		),
		staffNotes: v.optional(v.string()),
		consent: v.object({ contact: v.boolean(), reminders: v.boolean() }),
		source: v.union(v.literal("import"), v.literal("staff")),
		createdBy: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		// Clinic fields (all optional). Who treats the client is the `treating` relation, never a
		// field here, so nothing can move a client by saving it.
		status: v.optional(clientStatusValidator),
		/** Archive hides; delete is soft for 30 days. Different things, different fields. */
		archivedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		/** Set when the client was erased: the row stays only as a content-free tombstone for the ledger. */
		erasedAt: v.optional(v.number()),
		gender: v.optional(v.string()),
		birthDate: v.optional(v.string()),
		occupation: v.optional(v.string()),
		referralSource: v.optional(v.string()),
		location: v.optional(v.string()),
		/** Whether this is the client's first therapy at all (the old app kept a yes/no). */
		firstTherapy: v.optional(v.boolean()),
		/** Clinical, encrypted: the reason for coming, the diagnosis, health notes. */
		mainReasonEnc: v.optional(encryptedValidator),
		diagnosisEnc: v.optional(encryptedValidator),
		healthNotesEnc: v.optional(encryptedValidator),
		legacyId: v.optional(v.string()),
		fingerprint: v.optional(v.string()),
		version: v.optional(v.number()),
	})
		.index("by_tenant_name", ["tenant", "name"])
		.index("by_tenant_legacy", ["tenant", "legacyId"])
		.index("by_tenant_deleted", ["tenant", "deletedAt"]),

	/** What finds a client's duplicates: `p:` phone, `e:` e-mail, `g:` guardian's contact + the child's name. */
	clientKeys: defineTable({ tenant: v.string(), key: v.string(), client: v.id("clients") })
		.index("by_tenant_key", ["tenant", "key"])
		.index("by_client", ["client"]),

	appointments: defineTable({
		tenant: v.string(),
		practitioner: v.id("practitioners"),
		service: v.id("services"),
		/** The client record the team linked to it, if any. */
		client: v.optional(v.id("clients")),
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
		.index("by_updated", ["updatedAt"])
		.index("by_tenant_updated", ["tenant", "updatedAt"])
		.index("by_tenant_created", ["tenant"])
		// The bookings linked to one client record (erasing the client unlinks them, never the whole app read).
		.index("by_tenant_client", ["tenant", "client"]),

	// The clinic: every table below carries the app and starts every index with it.
	devices,
	groupActivities,
	staffMembers,
	visits,
	packages,
	payments,
	rosterDays,
	staffBlocks,
	appKeys,
	formDefinitions,
	formResponses,
	customFieldDefs,
	customValues,
	builderDefs,
	files,
	auditEvents,
	apiDefinitions,
	leaveRequests,
	storageOutbox,
	changeLog,
	roles,
	roleMembers,
	memberProfiles,
	permissionOverrides,
	treating,
	coordinatorAssignments,
	callbackRequests,
	notifyOutbox,
	usedLinks,
	blacklistEntries,
	blacklistEvents,
	feedback,
	feedbackReplies,
	feedbackLinks,
	appDocuments,
	clientNotes,
});
