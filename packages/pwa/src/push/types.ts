import { z } from "zod";
import { PWA_BRANDS } from "../brand";

/** The brands that publish articles (the blog's three). */
export const ARTICLE_BRANDS = ["psizone", "eqsync", "hemisync"] as const;
export type ArticleBrand = (typeof ARTICLE_BRANDS)[number];

/**
 * What a person can ask to be told about, one purpose each, opt-in only:
 * - `booking`: their own appointment requests (confirmed, cancelled, a reminder the day before).
 *   Needs a signed-in account; anonymous subscriptions never hold it.
 * - `articles:<brand>`: a new article from that brand.
 */
export const TopicSchema = z.enum([
	"booking",
	"articles:psizone",
	"articles:eqsync",
	"articles:hemisync",
]);
export type Topic = z.infer<typeof TopicSchema>;

export const SiteSchema = z.enum(PWA_BRANDS);
export const LocaleSchema = z.enum(["ro", "en"]);
export type PushLocale = z.infer<typeof LocaleSchema>;

/** `PushSubscription.toJSON()` as the browser sends it. */
export const BrowserSubscriptionSchema = z.object({
	endpoint: z.string().url().max(2048),
	expirationTime: z.number().nullable().optional(),
	keys: z.object({
		/** P-256 public key, base64url, 65 bytes → 87 characters. */
		p256dh: z
			.string()
			.regex(/^[A-Za-z0-9_-]+=*$/)
			.min(86)
			.max(90),
		/** 16-byte auth secret, base64url → 22 characters. */
		auth: z
			.string()
			.regex(/^[A-Za-z0-9_-]+=*$/)
			.min(21)
			.max(26),
	}),
});
export type BrowserSubscription = z.infer<typeof BrowserSubscriptionSchema>;

/** One browser's subscription, as the server keeps it. Nothing clinical, nothing about a booking. */
export interface SubscriptionRecord {
	/** Random id; also the device token a Novu Push Webhook integration would carry. */
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	/** The site whose service worker holds it: that worker renders the words. */
	site: z.infer<typeof SiteSchema>;
	locale: PushLocale;
	topics: ReadonlyArray<Topic>;
	/** The account (`sub`) it belongs to, or null for an anonymous visitor (articles only). */
	subject: string | null;
	createdAt: number;
	updatedAt: number;
	/** Consecutive failed sends; at FAILURE_LIMIT the record is dropped. */
	failures: number;
}

export const FAILURE_LIMIT = 5;

/**
 * The events `notify()` accepts. A booking event names the account (its scheduling hash, or the
 * subject) or, failing that, the reference a booking link in this store resolves; it never carries a
 * time, a practitioner or a reason, and none of that ever reaches a notification.
 */
export const NotifyEventSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.enum(["booking.confirmed", "booking.cancelled", "booking.reminder"]),
		/**
		 * The account, as the scheduling store names it: `accountHashOf(subject)` (64 hex). The
		 * preferred address: Convex holds it on every signed-in request and never holds the subject.
		 */
		accountHash: z
			.string()
			.regex(/^[0-9a-f]{64}$/)
			.optional(),
		reference: z.string().min(1).max(64).optional(),
		subject: z.string().min(1).max(200).optional(),
		/** For `booking.confirmed`: the start (UTC ms), so the day-before reminder can be planned. */
		start: z.number().int().positive().optional(),
	}),
	z.object({
		kind: z.literal("article.published"),
		brand: z.enum(ARTICLE_BRANDS),
		/** The CMS document id: one notification per article, ever. */
		id: z.string().min(1).max(100),
		/** Absolute URL of the article per locale. */
		url: z.object({ ro: z.string().url(), en: z.string().url() }),
		/** The public headline per locale, when known. */
		headline: z.object({ ro: z.string().max(200), en: z.string().max(200) }).optional(),
	}),
	z.object({
		/** A test push to one subscription (local development and the ops smoke). */
		kind: z.literal("test"),
		endpoint: z.string().url(),
	}),
]);
export type NotifyEvent = z.infer<typeof NotifyEventSchema>;

/** The kinds a push payload names; the receiving site's worker has the words for each. */
export const PUSH_KINDS = [
	"booking.confirmed",
	"booking.cancelled",
	"booking.reminder",
	"article.published",
	"test",
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/**
 * What travels inside the encrypted Web Push message. No sentence is sent: the subscriber's own
 * site renders the words in its voice and locale. A booking payload is its kind and a link to the
 * account page, nothing else.
 */
export const PushPayloadSchema = z.object({
	v: z.literal(1),
	kind: z.enum(PUSH_KINDS),
	locale: LocaleSchema,
	/** Where a tap leads: a same-site path, or an estate site's absolute URL. */
	url: z.string().min(1).max(2048),
	/** Collapses repeats on the device (`booking`, `article-<id>`). */
	tag: z.string().min(1).max(64),
	brand: z.enum(ARTICLE_BRANDS).optional(),
	headline: z.string().max(200).optional(),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;

/**
 * The words a site's worker shows, per kind; `{brand}` and `{headline}` are filled in. A site
 * that takes no bookings leaves the booking kinds out (none of its subscriptions can hold them).
 */
export interface PushText {
	title: string;
	body: string;
}
export type PushTexts = Readonly<
	{ [K in Exclude<PushKind, BookingKind>]: PushText } & { [K in BookingKind]?: PushText }
>;
export type BookingKind = "booking.confirmed" | "booking.cancelled" | "booking.reminder";
