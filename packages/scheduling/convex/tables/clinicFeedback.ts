import { defineTable } from "convex/server";
import { v } from "convex/values";
import { encryptedValidator } from "../validators";

/**
 * Feedback (src/clinic/feedback.ts): what clients say after an appointment or any time from their
 * account, and what staff say about the app itself. The text, and every reply, is ciphertext
 * (Convex never reads it); the rating, kind, channel and status are plain so the reports can count.
 */

export const feedbackKindValidator = v.union(
	v.literal("appointment_rating"),
	v.literal("general"),
	v.literal("suggestion"),
	v.literal("complaint"),
	v.literal("site_issue"),
);

export const feedbackChannelValidator = v.union(
	v.literal("account"),
	v.literal("email_link"),
	v.literal("chat"),
	v.literal("staff"),
);

export const feedbackStatusValidator = v.union(
	v.literal("new"),
	v.literal("read"),
	v.literal("answered"),
	v.literal("closed"),
);

export const feedback = defineTable({
	tenant: v.string(),
	kind: feedbackKindValidator,
	rating: v.optional(v.number()),
	textEnc: v.optional(encryptedValidator),
	channel: feedbackChannelValidator,
	status: feedbackStatusValidator,
	/** What it is about: a staff-made visit, a public booking, a client record. */
	visit: v.optional(v.id("visits")),
	appointment: v.optional(v.id("appointments")),
	client: v.optional(v.id("clients")),
	/** A signed-in visitor (the hash the booking flow uses), never the subject itself. */
	accountHash: v.optional(v.string()),
	/** The staff subject who wrote it (channel `staff`). */
	staffSubject: v.optional(v.string()),
	/** Consent to be contacted back, and the contact given with it (only stored with consent). */
	consentContact: v.boolean(),
	contact: v.optional(
		v.object({
			name: v.optional(v.string()),
			email: v.optional(v.string()),
			phone: v.optional(v.string()),
		}),
	),
	createdAt: v.number(),
	updatedAt: v.number(),
	readAt: v.optional(v.number()),
	answeredAt: v.optional(v.number()),
	closedAt: v.optional(v.number()),
	version: v.number(),
})
	.index("by_tenant_created", ["tenant", "createdAt"])
	.index("by_tenant_status", ["tenant", "status", "createdAt"])
	.index("by_tenant_visit", ["tenant", "visit"])
	.index("by_tenant_appointment", ["tenant", "appointment"])
	.index("by_tenant_client", ["tenant", "client"])
	.index("by_tenant_account", ["tenant", "accountHash", "createdAt"]);

/** The staff reply thread of one feedback item, oldest first. */
export const feedbackReplies = defineTable({
	tenant: v.string(),
	feedback: v.id("feedback"),
	by: v.string(),
	textEnc: encryptedValidator,
	at: v.number(),
}).index("by_tenant_feedback", ["tenant", "feedback", "at"]);

/**
 * One-time links for post-appointment feedback. The token is signed (HMAC) and carries the app,
 * the id below, the subject and the expiry; this row makes it single use. Redeeming marks `usedAt`
 * in the same transaction that stores the feedback.
 */
export const feedbackLinks = defineTable({
	tenant: v.string(),
	jti: v.string(),
	subjectKind: v.union(v.literal("visit"), v.literal("appointment")),
	subject: v.string(),
	expiresAt: v.number(),
	createdAt: v.number(),
	createdBy: v.string(),
	usedAt: v.optional(v.number()),
	feedback: v.optional(v.id("feedback")),
}).index("by_tenant_jti", ["tenant", "jti"]);
