import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
	attendanceValidator,
	columnValidator,
	creditTypeValidator,
	encryptedValidator,
	paymentMethodValidator,
	personValidator,
	rosterStatusValidator,
	statusValidator,
} from "../validators";

/**
 * Staff-made appointments, packages with their payment ledger, and the roster. They live apart
 * from `appointments` (the public booking flow) so the web-request retention can never reach
 * them. Money is whole bani; what a package has used is derived from its visits, never stored.
 */

export const visits = defineTable({
	tenant: v.string(),
	client: v.optional(v.id("clients")),
	column: columnValidator,
	/** `kind:id` of the column, for the conflict index. */
	columnKey: v.string(),
	/** A room or device the visit uses besides its column. */
	room: v.optional(v.id("rooms")),
	device: v.optional(v.id("devices")),
	/** Wall time in the app's zone, stored as instants. */
	start: v.number(),
	end: v.number(),
	durationMinutes: v.number(),
	sessionType: v.string(),
	status: statusValidator,
	attendance: attendanceValidator,
	notes: v.optional(v.string()),
	therapistNotes: v.optional(encryptedValidator),
	priceMinor: v.optional(v.number()),
	amountPaidMinor: v.optional(v.number()),
	paymentMethod: v.optional(paymentMethodValidator),
	package: v.optional(v.id("packages")),
	creditType: v.optional(creditTypeValidator),
	reminderSent: v.boolean(),
	clientConfirmed: v.boolean(),
	createdBy: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_start", ["tenant", "start"])
	.index("by_tenant_column_start", ["tenant", "columnKey", "start"])
	.index("by_tenant_client_start", ["tenant", "client", "start"])
	.index("by_tenant_package_start", ["tenant", "package", "start"])
	.index("by_tenant_room_start", ["tenant", "room", "start"])
	.index("by_tenant_device_start", ["tenant", "device", "start"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

export const packages = defineTable({
	tenant: v.string(),
	client: v.id("clients"),
	sessionType: v.string(),
	totalSessions: v.number(),
	bonusSessions: v.number(),
	priceMinor: v.number(),
	startDate: v.optional(v.string()),
	notes: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_client", ["tenant", "client"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

/** The payments ledger: positive is money in, negative a refund. Paid-so-far is its sum. */
export const payments = defineTable({
	tenant: v.string(),
	client: v.id("clients"),
	package: v.optional(v.id("packages")),
	amountMinor: v.number(),
	method: v.optional(paymentMethodValidator),
	at: v.number(),
	createdBy: v.string(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_package", ["tenant", "package", "at"])
	.index("by_tenant_client", ["tenant", "client", "at"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

export const rosterDays = defineTable({
	tenant: v.string(),
	person: personValidator,
	/** `kind:id` of the person, for the index. */
	personKey: v.string(),
	date: v.string(),
	status: rosterStatusValidator,
	startMinutes: v.optional(v.number()),
	endMinutes: v.optional(v.number()),
	notes: v.optional(v.string()),
	updatedAt: v.number(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_person_date", ["tenant", "personKey", "date"])
	.index("by_tenant_date", ["tenant", "date"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);

export const staffBlocks = defineTable({
	tenant: v.string(),
	person: personValidator,
	personKey: v.string(),
	dateStart: v.string(),
	dateEnd: v.string(),
	reason: v.string(),
	notes: v.optional(v.string()),
	createdAt: v.number(),
	legacyId: v.optional(v.string()),
	fingerprint: v.optional(v.string()),
	version: v.number(),
})
	.index("by_tenant_person_start", ["tenant", "personKey", "dateStart"])
	.index("by_tenant_legacy", ["tenant", "legacyId"]);
