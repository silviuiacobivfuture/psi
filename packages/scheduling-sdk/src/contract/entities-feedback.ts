import { z } from "zod/v4";
import { Id, Ms, Subject } from "./primitives";

/** Mirrors `@psi/scheduling/clinic` (a test in the service holds the lists together). */
export const FEEDBACK_KINDS = [
	"appointment_rating",
	"general",
	"suggestion",
	"complaint",
	"site_issue",
] as const;
export const FEEDBACK_CHANNELS = ["account", "email_link", "chat", "staff"] as const;
export const FEEDBACK_STATUSES = ["new", "read", "answered", "closed"] as const;
export const FeedbackKind = z.enum(FEEDBACK_KINDS);
export const FeedbackChannel = z.enum(FEEDBACK_CHANNELS);
export const FeedbackStatus = z.enum(FEEDBACK_STATUSES);

/** The text of a feedback or of a reply: at most 4000 characters, checked on the plain text before it is sealed. */
export const FEEDBACK_TEXT_MAX = 4_000;
const Text = z.string().trim().min(1).max(FEEDBACK_TEXT_MAX);
export const FeedbackContact = z.object({
	name: z.string().trim().min(1).max(80).optional(),
	email: z.string().trim().min(3).max(200).optional(),
	phone: z.string().trim().min(3).max(40).optional(),
});

/**
 * An item as the caller may see it. `core` (the rating, the text) and `contact` (who wrote it, how to reach them,
 * whether they agreed to be contacted) are field groups: a group the caller does not hold is ABSENT, not empty.
 */
export const FeedbackItem = z.object({
	id: Id,
	kind: FeedbackKind,
	channel: FeedbackChannel,
	status: FeedbackStatus,
	createdAt: Ms,
	updatedAt: Ms,
	version: z.number().int().min(1),
	readAt: Ms.optional(),
	answeredAt: Ms.optional(),
	closedAt: Ms.optional(),
	visit: Id.optional(),
	appointment: Id.optional(),
	client: Id.optional(),
	/** Written from a signed-in account (the account itself is never named). */
	linkedAccount: z.boolean(),
	rating: z.number().int().min(1).max(5).optional(),
	text: z.string().optional(),
	consentContact: z.boolean().optional(),
	contact: FeedbackContact.optional(),
	staffSubject: Subject.optional(),
});
export const FeedbackReply = z.object({ id: Id, by: Subject, at: Ms, text: z.string() });
export const FeedbackDetail = z.object({ item: FeedbackItem, replies: z.array(FeedbackReply) });
export const FeedbackListQuery = z.object({
	status: z.array(FeedbackStatus).or(FeedbackStatus).optional(),
	kind: FeedbackKind.optional(),
	channel: FeedbackChannel.optional(),
	from: z.coerce.number().int().nonnegative().optional(),
	to: z.coerce.number().int().nonnegative().optional(),
	minRating: z.coerce.number().int().min(1).max(5).optional(),
	maxRating: z.coerce.number().int().min(1).max(5).optional(),
	before: z.coerce.number().int().nonnegative().optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const FeedbackList = z.object({ items: z.array(FeedbackItem), more: z.boolean() });
export const FeedbackReplyBody = z.object({ text: Text });
/** `contactable`: the author agreed to be contacted, so the reply may be sent on (the service never sends it itself). */
export const FeedbackReplied = z.object({
	reply: FeedbackReply,
	status: FeedbackStatus,
	contactable: z.boolean(),
});
export const FeedbackStatusBody = z.object({
	event: z.enum(["read", "close", "reopen"]),
	expectedVersion: z.number().int().min(1).optional(),
});
export const FeedbackStatusChanged = z.object({ status: FeedbackStatus, changed: z.boolean() });

/** One link, for one appointment: a visit (its id) or a public booking (its reference). */
export const FeedbackLinkIssue = z
	.object({
		visit: Id.optional(),
		appointment: z.string().min(3).max(64).optional(),
		/** 1 hour to 90 days; 14 days when absent. */
		ttlHours: z.number().int().min(1).max(2160).optional(),
	})
	.refine((b) => (b.visit === undefined) !== (b.appointment === undefined), {
		message: "name a visit or a booking, not both",
	});
/** The signed token goes in the e-mail's link; the page that takes it is the site's, so the service does not build a URL. */
export const FeedbackLink = z.object({ token: z.string().min(20).max(2000), expiresAt: Ms });

export const FeedbackLinkQuery = z.object({ token: z.string().min(20).max(2000) });
export const FeedbackLinkOpen = z.object({ start: Ms, expiresAt: Ms });
export const FeedbackLinkSubmit = z.object({
	token: z.string().min(20).max(2000),
	rating: z.number().int().min(1).max(5).optional(),
	text: Text.optional(),
	consentContact: z.boolean(),
	contact: FeedbackContact.optional(),
});
export const FeedbackStored = z.object({ id: Id });
