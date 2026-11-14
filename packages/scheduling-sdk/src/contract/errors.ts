import { z } from "zod/v4";

/**
 * The closed list of refusal codes. A consumer branches on `code`, never on `message`. Each has one
 * HTTP status. `not_found` also answers "not yours to see": the service does not confirm that an
 * app or an object exists to someone with no reach into it.
 */
export const ERROR_STATUS = {
	invalid: 400,
	unauthenticated: 401,
	invalid_token: 401,
	forbidden: 403,
	not_found: 404,
	conflict: 409,
	slot_taken: 409,
	hold_expired: 410,
	/** The neutral online refusal: the visitor is told only that this cannot be booked online, never why. */
	unavailable_online: 409,
	/**
	 * Online booking is paused for what was asked (the organisation, the site, the service or the practitioner):
	 * `detail` is `BookingPausedDetail`, the message the visitor is to read and whether a callback stays open.
	 */
	booking_paused: 409,
	not_allowed: 403,
	rate_limited: 429,
	internal: 500,
	unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const ErrorBody = z.object({
	error: z.object({
		code: z.enum(ERROR_CODES),
		message: z.string(),
		requestId: z.string(),
		/**
		 * What the refusal is about: a refused field group, a reason, the problems of a save (codes and indexes). Never a
		 * person's data; the one text it carries is `booking_paused`'s message, which the clinic wrote for visitors.
		 */
		detail: z.record(z.string(), z.unknown()).optional(),
	}),
});
export type ErrorBodyType = z.infer<typeof ErrorBody>;
