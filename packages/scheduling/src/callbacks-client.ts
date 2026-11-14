import { z } from "zod";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { cleanContact, contactProblem } from "./domain/contact";
import { AudienceSchema, LocaleSchema } from "./results";
import type { Transport } from "./transport";

/**
 * Web callback requests (docs/plans/clinic.md slice 0): the visitor-facing server stores one, the
 * team's console lists them and marks them handled. Generic over the app (`tenant`): any site on
 * the store calls the same functions.
 */

const Tenant = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);
const Instant = z.number().int().nonnegative();

export const CallbackWhenSchema = z.enum(["morning", "afternoon", "any"]);
export type CallbackWhen = z.infer<typeof CallbackWhenSchema>;
export const CallbackChannelSchema = z.enum(["form", "guide"]);
export const CallbackStatusSchema = z.enum(["new", "handled"]);

export const CallbackInputSchema = z
	.object({
		tenant: Tenant,
		contact: z.object({
			name: z.string().max(200),
			email: z.string().max(200).optional(),
			phone: z.string().max(40).optional(),
			age: z.number().int().min(0).max(120).optional(),
			details: z.string().max(2000).optional(),
		}),
		audience: AudienceSchema,
		when: CallbackWhenSchema,
		/** A slot the visitor chose that could not be held (UTC ms). */
		preferredStart: Instant.optional(),
		service: Tenant.optional(),
		locale: LocaleSchema,
		channel: CallbackChannelSchema,
		/** The page the form was on: "/contact". */
		page: z.string().regex(/^\/[A-Za-z0-9/_-]{0,100}$/),
		/** The visitor ticked the consent box. */
		consent: z.boolean(),
	})
	.strict();
export type CallbackInput = z.infer<typeof CallbackInputSchema>;

export const RawCallbackCreateSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), id: z.string().min(1) }),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["no_consent", "invalid", "unknown_tenant"]),
	}),
]);
export type CallbackResult = z.infer<typeof RawCallbackCreateSchema>;

export const CallbackRowSchema = z.object({
	id: z.string().min(1),
	status: CallbackStatusSchema,
	createdAt: Instant,
	audience: AudienceSchema,
	when: CallbackWhenSchema,
	locale: LocaleSchema,
	channel: CallbackChannelSchema,
	page: z.string(),
	contact: z
		.object({
			name: z.string(),
			email: z.string().optional(),
			phone: z.string().optional(),
			age: z.number().optional(),
			details: z.string().optional(),
		})
		.optional(),
	preferredStart: Instant.optional(),
	service: z.string().optional(),
	handledAt: Instant.optional(),
	handledBy: z.string().optional(),
});
export type CallbackRow = z.infer<typeof CallbackRowSchema>;

export const RawCallbackListSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), timeZone: z.string(), callbacks: z.array(CallbackRowSchema) }),
	z.object({ ok: z.literal(false), reason: z.literal("unknown_tenant") }),
]);
export type CallbackListResult = z.infer<typeof RawCallbackListSchema>;

export const RawCallbackHandledSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);
export type CallbackHandledResult = z.infer<typeof RawCallbackHandledSchema>;

/** The visitor-facing half. A transport failure throws `SchedulingUnavailable`. */
export interface CallbackRequester {
	requestCallback(input: CallbackInput): Promise<CallbackResult>;
}

export function callbackRequesterOn(transport: Transport): CallbackRequester {
	const key = transport.serverKey;
	return {
		async requestCallback(input) {
			const parsed = CallbackInputSchema.safeParse(input);
			if (!parsed.success) return { ok: false, reason: "invalid" };
			const c = parsed.data;
			// Nothing reaches the store without consent, or with a contact the form would have refused.
			if (!c.consent) return { ok: false, reason: "no_consent" };
			if (contactProblem(c.contact) !== undefined) return { ok: false, reason: "invalid" };
			return transport.call(RawCallbackCreateSchema, (convex) =>
				convex.mutation(
					api.callbacks.create,
					{
						key,
						tenant: c.tenant,
						contact: cleanContact(c.contact),
						audience: c.audience,
						when: c.when,
						...(c.preferredStart === undefined ? {} : { preferredStart: c.preferredStart }),
						...(c.service === undefined ? {} : { service: c.service }),
						locale: c.locale,
						channel: c.channel,
						page: c.page,
						consent: true,
					},
					{ skipQueue: true },
				),
			);
		},
	};
}

/** The team-facing half: the list (newest first) and the "handled" mark. */
export interface CallbacksStaff {
	callbacks(input: {
		tenant: string;
		status?: z.infer<typeof CallbackStatusSchema>;
		limit?: number;
	}): Promise<CallbackListResult>;
	markCallbackHandled(input: {
		tenant: string;
		id: string;
		actor: { subject: string };
	}): Promise<CallbackHandledResult>;
}

export function callbacksStaffOn(transport: Transport): CallbacksStaff {
	const key = transport.serverKey;
	return {
		callbacks: (input) =>
			transport.call(RawCallbackListSchema, (c) => c.query(api.callbacks.list, { key, ...input })),
		markCallbackHandled: (input) =>
			transport.call(RawCallbackHandledSchema, (c) =>
				c.mutation(
					api.callbacks.markHandled,
					{ key, tenant: input.tenant, id: input.id as Id<"callbackRequests">, actor: input.actor },
					{ skipQueue: true },
				),
			),
	};
}
