import { z } from "zod/v4";
import { route } from "../define";
import { NotificationPrefs, NotificationPrefsView } from "../entities-notify";
import { AppParam, Id, Locale, Ms, Ok, PageQuery, page } from "../primitives";

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);
const Mode = z.enum(["onsite", "online"]);
const Contact = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().max(200).optional(),
	phone: z.string().max(40).optional(),
	/** Whole years. */
	age: z.number().optional(),
	/** What is going on, in the person's words: personal data, erased with the contact. */
	details: z.string().max(4000).optional(),
});
const Audience = z.enum(["child", "teen", "adult"]);
const Reference = z.string().min(8).max(12);

export const OfferedSlot = z.object({
	id: z.string(),
	practitioner: z.string(),
	practitionerName: z.string(),
	start: Ms,
	end: Ms,
	modes: z.array(Mode),
});
export const VisitorService = z.object({
	slug: Slug,
	name: z.object({ ro: z.string(), en: z.string() }).optional(),
	durationMinutes: z.number().int(),
	modes: z.array(Mode),
	practitioners: z.array(z.object({ id: z.string(), name: z.string() })),
});
export const Hold = z.object({
	reference: z.string(),
	holdToken: z.string(),
	start: Ms,
	end: Ms,
	mode: Mode,
	expiresAt: Ms,
	practitionerName: z.string(),
	timeZone: z.string(),
});
export const Submitted = z.object({
	reference: z.string(),
	cancelCode: z.string(),
	start: Ms,
	end: Ms,
	mode: Mode,
	timeZone: z.string(),
});
export const OwnAppointment = z.object({
	id: z.string(),
	reference: z.string(),
	status: z.string(),
	start: Ms,
	end: Ms,
	mode: Mode.optional(),
	serviceSlug: z.string().optional(),
});
export const CallbackRequest = z.object({ reference: z.string() });

/** The visitor side: a site's server (service key) or a signed-in visitor (SSO) books, holds, cancels. */
export const VISITOR_ROUTES = [
	route({
		id: "visitor.services",
		method: "GET",
		path: "/v1/apps/:app/book/services",
		side: "visitor",
		summary: "The services a visitor can book, with the people who offer them",
		params: AppParam,
		response: z.object({ timeZone: z.string(), services: z.array(VisitorService) }),
	}),
	route({
		id: "visitor.slots",
		method: "GET",
		path: "/v1/apps/:app/book/slots",
		side: "visitor",
		summary: "Free slots of a service between two instants",
		params: AppParam,
		query: z.object({
			service: Slug,
			from: z.coerce.number().int().nonnegative(),
			to: z.coerce.number().int().nonnegative(),
			mode: Mode.optional(),
			limit: z.coerce.number().int().min(1).max(200).optional(),
		}),
		response: z.object({
			timeZone: z.string(),
			service: z.object({
				slug: z.string(),
				durationMinutes: z.number().int(),
				holdMinutes: z.number().int(),
			}),
			slots: z.array(OfferedSlot),
		}),
	}),
	route({
		id: "visitor.hold",
		method: "POST",
		path: "/v1/apps/:app/book/holds",
		side: "visitor",
		summary: "Keep a slot for a few minutes while the visitor fills the form",
		params: AppParam,
		body: z.object({
			service: Slug,
			practitioner: z.string().min(3).max(64),
			start: Ms,
			mode: Mode,
			locale: Locale,
			channel: z.enum(["form", "guide"]),
		}),
		response: Hold,
	}),
	route({
		id: "visitor.release",
		method: "POST",
		path: "/v1/apps/:app/book/holds/:reference/release",
		side: "visitor",
		summary: "Give a held slot back",
		params: AppParam.extend({ reference: Reference }),
		body: z.object({ holdToken: z.string().min(16).max(64) }),
		response: Ok,
	}),
	route({
		id: "visitor.submit",
		method: "POST",
		path: "/v1/apps/:app/book/holds/:reference/submit",
		side: "visitor",
		summary: "Turn a hold into a request with the visitor's contact",
		params: AppParam.extend({ reference: Reference }),
		body: z.object({
			holdToken: z.string().min(16).max(64),
			/**
			 * The five booking fields (booking-fields.ts) are all required, whether the site's form or its assistant took
			 * them; the service refuses each missing or invalid one with its own reason. Loose here on purpose.
			 */
			contact: Contact.extend({ name: z.string().trim().max(200) }),
			audience: Audience.optional(),
		}),
		response: Submitted,
		audit: "request.create",
	}),
	route({
		id: "visitor.cancel",
		method: "POST",
		path: "/v1/apps/:app/book/requests/:reference/cancel",
		side: "visitor",
		summary: "Cancel with the reference and the cancel code shown once at submit",
		params: AppParam.extend({ reference: Reference }),
		body: z.object({ cancelCode: z.string().min(6).max(32) }),
		response: z.object({ start: Ms }),
		audit: "visitor.cancel",
	}),
	route({
		id: "visitor.callback",
		method: "POST",
		path: "/v1/apps/:app/book/callback-requests",
		side: "visitor",
		summary: "Ask the team to call back, with no slot",
		params: AppParam,
		body: z.object({
			contact: Contact,
			audience: Audience.optional(),
			locale: Locale,
			/** When the visitor would like the call. */
			when: z.enum(["morning", "afternoon", "any"]).default("any"),
			/** The page the form was on. */
			page: z.string().max(120).default("/"),
			channel: z.enum(["form", "guide"]).default("form"),
			/** A time the visitor chose that could not be held: the team calls about it. */
			preferredStart: Ms.optional(),
			/** The service the visitor was looking at. */
			service: Slug.optional(),
		}),
		response: CallbackRequest,
		audit: "callback.create",
	}),
	route({
		id: "visitor.mine",
		method: "GET",
		path: "/v1/apps/:app/me/appointments",
		side: "visitor",
		summary:
			"The signed-in visitor's own appointments (service keys name the visitor in x-psi-subject)",
		params: AppParam,
		query: PageQuery,
		response: page(OwnAppointment),
	}),
	route({
		id: "visitor.mineCancel",
		method: "POST",
		path: "/v1/apps/:app/me/appointments/:id/cancel",
		side: "visitor",
		summary: "Cancel one of the visitor's own appointments",
		params: AppParam.extend({ id: Id }),
		response: Ok,
		audit: "visitor.cancel",
	}),
	route({
		id: "visitor.notifications",
		method: "GET",
		path: "/v1/apps/:app/me/account/notifications",
		side: "visitor",
		summary:
			"The signed-in visitor's notification preferences (channel by kind) and what each kind offers",
		params: AppParam,
		response: NotificationPrefsView,
	}),
	route({
		id: "visitor.notificationsSave",
		method: "PUT",
		path: "/v1/apps/:app/me/account/notifications",
		side: "visitor",
		summary:
			"Replace the signed-in visitor's notification preferences; a channel a kind does not offer, or that cannot be switched off, is refused",
		params: AppParam,
		body: NotificationPrefs,
		response: NotificationPrefsView,
		audit: "visitor.notifications",
	}),
] as const;
