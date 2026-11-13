import { z } from "zod";
import { normalizeEmail, normalizePhone } from "./identifiers";

/**
 * Feedback: what clients say about an appointment (right after it, from a one-time link) or at
 * any time from their account or the chat, and what staff say about the app itself. The text
 * limit is applied here, to the plain text, before the caller encrypts it; the store holds
 * ciphertext only. The parent questionnaire stays what it is (a form with its own responses).
 */

export const FEEDBACK_KINDS = [
	"appointment_rating",
	"general",
	"suggestion",
	"complaint",
	"site_issue",
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_CHANNELS = ["account", "email_link", "chat", "staff"] as const;
export type FeedbackChannel = (typeof FEEDBACK_CHANNELS)[number];

export const FEEDBACK_STATUSES = ["new", "read", "answered", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const TEXT_MAX = 4_000;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

const text = z.string().trim().min(1).max(TEXT_MAX);
const contact = z
	.object({
		name: z.string().trim().min(1).max(80).optional(),
		email: z
			.string()
			.trim()
			.transform((e, ctx) => {
				const n = normalizeEmail(e);
				if (n === undefined) ctx.addIssue({ code: "custom", message: "email" });
				return n ?? "";
			})
			.optional(),
		phone: z
			.string()
			.trim()
			.transform((p, ctx) => {
				const n = normalizePhone(p);
				if (n === undefined) ctx.addIssue({ code: "custom", message: "phone" });
				return n ?? "";
			})
			.optional(),
	})
	.strict();

/** What the rules look at, whether the text is plain (a caller) or ciphertext (the store). */
export interface FeedbackShape {
	kind: FeedbackKind;
	rating?: number | undefined;
	hasText: boolean;
	channel: FeedbackChannel;
	visit?: string | undefined;
	appointment?: string | undefined;
	consentContact: boolean;
	hasContact: boolean;
}

/** The rules a feedback item must meet, as problem codes (empty when it may be stored). */
export function feedbackProblems(f: FeedbackShape): ReadonlyArray<string> {
	const problems: string[] = [];
	if (f.rating === undefined && !f.hasText) problems.push("rating_or_text");
	if (
		f.rating !== undefined &&
		!(Number.isInteger(f.rating) && f.rating >= RATING_MIN && f.rating <= RATING_MAX)
	) {
		problems.push("rating_range");
	}
	if (f.kind === "appointment_rating") {
		if (f.rating === undefined) problems.push("rating_required");
		if (f.visit === undefined && f.appointment === undefined) problems.push("appointment_required");
	}
	if (f.channel === "staff" && f.kind === "appointment_rating") problems.push("staff_kind");
	if (f.channel === "email_link" && f.kind !== "appointment_rating") problems.push("link_kind");
	if (f.hasContact && !f.consentContact) problems.push("consent_required");
	return problems;
}

export const feedbackContactSchema = contact;

/**
 * What a caller gives, as plain text, before the text is encrypted. A visitor or a client writes
 * `appointment_rating` (a rating, tied to the appointment), `general`, `suggestion` or
 * `complaint`; staff write about the app: `general`, `suggestion`, `complaint` or `site_issue`.
 */
export const feedbackInputSchema = z
	.object({
		kind: z.enum(FEEDBACK_KINDS),
		rating: z.number().int().min(RATING_MIN).max(RATING_MAX).optional(),
		text: text.optional(),
		channel: z.enum(FEEDBACK_CHANNELS),
		/** A staff-made visit, a public booking (its reference), a client record. */
		visit: z.string().min(1).max(100).optional(),
		appointment: z.string().min(1).max(100).optional(),
		client: z.string().min(1).max(100).optional(),
		consentContact: z.boolean(),
		/** How to reach them; only with consent to be contacted. */
		contact: contact.optional(),
	})
	.superRefine((f, ctx) => {
		for (const message of feedbackProblems({
			...f,
			hasText: f.text !== undefined,
			hasContact: f.contact !== undefined,
		})) {
			ctx.addIssue({ code: "custom", path: [message], message });
		}
	});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

/** The longest ciphertext the store accepts: 4,000 characters of UTF-8 as base64, with its tag. */
export const CIPHERTEXT_MAX = 24_000;

export const replyInputSchema = z.object({ text });
export type ReplyInput = z.infer<typeof replyInputSchema>;

export type FeedbackEvent = "read" | "reply" | "close" | "reopen";

export type StatusRefusal = "closed" | "not_closed";

export type StatusChange =
	| { ok: true; next: FeedbackStatus; changed: boolean }
	| { ok: false; reason: StatusRefusal };

/**
 * The status after an event. Reading marks `new` as `read` and changes nothing else; a reply makes
 * an open item `answered` and is refused on a closed one; closing is final until it is reopened
 * (to `read`); reopening anything not closed is refused.
 */
export function nextStatus(current: FeedbackStatus, event: FeedbackEvent): StatusChange {
	switch (event) {
		case "read":
			return current === "new"
				? { ok: true, next: "read", changed: true }
				: { ok: true, next: current, changed: false };
		case "reply":
			return current === "closed"
				? { ok: false, reason: "closed" }
				: { ok: true, next: "answered", changed: current !== "answered" };
		case "close":
			return current === "closed"
				? { ok: false, reason: "closed" }
				: { ok: true, next: "closed", changed: true };
		case "reopen":
			return current === "closed"
				? { ok: true, next: "read", changed: true }
				: { ok: false, reason: "not_closed" };
		default: {
			const never: never = event;
			throw new Error(`unknown event ${String(never)}`);
		}
	}
}
