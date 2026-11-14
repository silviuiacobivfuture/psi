import { accountHashOf, DecisionReasonSchema, type StaffSchedulingClient } from "@psi/scheduling";
import { z } from "zod";
import { type RequestsPort, StoreRefused, type VisitorPort } from "../types";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Web requests on Convex: the booking requests the visitor flow already stores (`staffRequests`, `staff:decide`), the
 * callback requests (`webRequests`, a contact with no slot), the signed-in visitor's own requests (`account`), and the
 * count the inbox badge shows.
 */
const DAY = 86_400_000;
/** A booking request still waiting is counted for this long after its start; older ones are not the team's to answer. */
const PENDING_LOOKBACK_DAYS = 90;

const Callbacks = answer({
	callbacks: z.array(
		z.object({
			reference: z.string(),
			status: z.enum(["new", "handled"]),
			createdAt: z.number(),
			contact: z
				.object({ name: z.string(), email: z.string().optional(), phone: z.string().optional() })
				.optional(),
		}),
	),
});
const Count = answer({ count: z.number() });
const Decided = answer({});
const Found = answer({ found: z.boolean() });
const Created = answer({ id: z.string() });

export function requestsPort(rpc: Rpc, staff: StaffSchedulingClient): RequestsPort {
	return {
		async list(app, from, to) {
			const booked = await staff.requests({ tenant: app, from, to });
			// An app with no booking tenant yet has no bookings; a window too full to read is refused, never cut short.
			if (!booked.ok && booked.reason === "too_many_rows") throw new StoreRefused(booked.reason);
			const callbacks = unwrap(
				await rpc.query("webRequests:callbacks", { tenant: app, from, to }, Callbacks),
			);
			return [
				...(booked.ok ? booked.requests : []).map((r) => ({
					reference: r.reference,
					status: r.status === "held" || r.status === "expired" ? ("requested" as const) : r.status,
					start: r.start,
					end: r.end,
					serviceSlug: r.serviceSlug,
					createdAt: r.submittedAt ?? r.start,
					...(r.contact === undefined
						? {}
						: {
								contact: {
									name: r.contact.name,
									...(r.contact.phone === undefined ? {} : { phone: r.contact.phone }),
									...(r.contact.email === undefined ? {} : { email: r.contact.email }),
								},
							}),
				})),
				...callbacks.callbacks.map((c) => ({
					reference: c.reference,
					status: c.status === "new" ? ("requested" as const) : ("handled" as const),
					createdAt: c.createdAt,
					...(c.contact === undefined
						? {}
						: {
								contact: {
									name: c.contact.name,
									...(c.contact.phone === undefined ? {} : { phone: c.contact.phone }),
									...(c.contact.email === undefined ? {} : { email: c.contact.email }),
								},
							}),
				})),
			];
		},
		async pending(app) {
			const out = unwrap(
				await rpc.query(
					"webRequests:pending",
					{ tenant: app, from: Date.now() - PENDING_LOOKBACK_DAYS * DAY },
					Count,
				),
			);
			return out.count;
		},
		async decide(app, reference, decision, reason, actor) {
			const known = DecisionReasonSchema.safeParse(reason);
			// A callback can only be called back: there is no slot to confirm, no booking to decline.
			if (decision === "handle") {
				const decided = await rpc.mutation(
					"webRequests:handleCallback",
					{ tenant: app, reference, actor: { subject: actor } },
					Decided,
				);
				if (decided.ok) return { ok: true };
				return {
					ok: false,
					reason: decided.reason === "not_allowed" ? "not_allowed" : "not_found",
				};
			}
			const out = await staff.decide({
				tenant: app,
				reference,
				decision,
				...(known.success ? { reason: known.data } : {}),
				actor: { subject: actor },
			});
			if (out.ok) return { ok: true };
			if (out.reason !== "not_found") return { ok: false, reason: out.reason };
			const callback = unwrap(
				await rpc.query("webRequests:isCallback", { tenant: app, reference }, Found),
			);
			return { ok: false, reason: callback.found ? "not_allowed" : "not_found" };
		},
	};
}

const Mine = answer({
	requests: z.array(
		z.object({
			reference: z.string(),
			tenant: z.string(),
			service: z.string(),
			status: z.string(),
			mode: z.enum(["onsite", "online"]),
			start: z.number(),
			end: z.number(),
		}),
	),
});
const Cancelled = answer({ start: z.number() });

/** What Convex adds to the visitor flow the existing client already covers: a callback, and a signed-in visitor's own requests. */
export function visitorExtras(rpc: Rpc): Pick<VisitorPort, "callback" | "mine" | "cancelMine"> {
	return {
		async callback(app, input) {
			// The site's form requires the consent box before it calls; a request that arrives here carries it.
			const out = await rpc.mutation(
				"callbacks:create",
				{
					tenant: app,
					contact: input.contact,
					audience: input.audience ?? "adult",
					when: input.when,
					locale: input.locale,
					channel: input.channel,
					page: input.page,
					...(input.preferredStart === undefined ? {} : { preferredStart: input.preferredStart }),
					...(input.service === undefined ? {} : { service: input.service }),
					consent: true,
				},
				Created,
			);
			return { reference: unwrap(out).id };
		},
		async mine(app, subject) {
			const out = unwrap(
				await rpc.query("account:forAccount", { accountHash: accountHashOf(subject) }, Mine),
			);
			// The reference is the request's id for the visitor: the one thing they hold.
			return out.requests
				.filter((r) => r.tenant === app)
				.map((r) => ({
					id: r.reference,
					reference: r.reference,
					status: r.status,
					start: r.start,
					end: r.end,
					mode: r.mode,
					...(r.service === "" ? {} : { serviceSlug: r.service }),
				}));
		},
		async cancelMine(app, subject, id) {
			const mine = await this.mine(app, subject);
			if (!mine.some((r) => r.id === id)) return { ok: false, reason: "not_found" };
			const out = await rpc.mutation(
				"account:cancelForAccount",
				{ reference: id, accountHash: accountHashOf(subject) },
				Cancelled,
			);
			if (out.ok) return { ok: true };
			return { ok: false, reason: out.reason === "not_allowed" ? "not_allowed" : "not_found" };
		},
	};
}
