import { v } from "convex/values";
import {
	CIPHERTEXT_MAX,
	type FeedbackChannel,
	type FeedbackKind,
	feedbackContactSchema,
	feedbackProblems,
} from "../src/clinic/feedback";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { owned, record } from "./apiSupport";
import { appointmentByReference } from "./calendar";
import { encryptedValidator } from "./validators";

/**
 * What the feedback functions share: the arguments of an item, the checks, and the one place a
 * feedback row is made (so a rating from a link and a note from an account follow the same rules).
 */
export const groupsValidator = v.array(v.union(v.literal("core"), v.literal("contact")));
export type Group = "core" | "contact";

export const itemArgs = {
	kind: v.union(
		v.literal("appointment_rating"),
		v.literal("general"),
		v.literal("suggestion"),
		v.literal("complaint"),
		v.literal("site_issue"),
	),
	rating: v.optional(v.number()),
	textEnc: v.optional(encryptedValidator),
	visit: v.optional(v.string()),
	appointment: v.optional(v.string()),
	client: v.optional(v.string()),
	consentContact: v.boolean(),
	contact: v.optional(
		v.object({
			name: v.optional(v.string()),
			email: v.optional(v.string()),
			phone: v.optional(v.string()),
		}),
	),
};

export interface Item {
	kind: FeedbackKind;
	rating?: number | undefined;
	textEnc?: Doc<"feedback">["textEnc"];
	visit?: string | undefined;
	appointment?: string | undefined;
	client?: string | undefined;
	consentContact: boolean;
	contact?:
		| { name?: string | undefined; email?: string | undefined; phone?: string | undefined }
		| undefined;
}

export type Made =
	| { ok: true; id: Id<"feedback"> }
	| { ok: false; reason: string; problems?: ReadonlyArray<string> };

/** The subject of a rating is over: a confirmed visit that took place (not absent), or a past, confirmed booking. */
export function ratable(
	subject: { status: string; end: number; attendance?: string; deletedAt?: number | undefined },
	now: number,
): boolean {
	return (
		subject.status === "confirmed" &&
		subject.deletedAt === undefined &&
		subject.attendance !== "absent" &&
		subject.end <= now
	);
}

/**
 * Checks an item against the rules and the app's rows, and stores it. The caller has already
 * decided who may write it. One rating per appointment: `already_rated`.
 */
export async function makeFeedback(
	ctx: MutationCtx,
	tenant: string,
	item: Item,
	channel: FeedbackChannel,
	author: { accountHash?: string; staffSubject?: string; actor: string },
	now: number,
	resolved?: { visit?: Doc<"visits">; appointment?: Doc<"appointments"> },
): Promise<Made> {
	const problems = feedbackProblems({
		kind: item.kind,
		rating: item.rating,
		hasText: item.textEnc !== undefined,
		channel,
		visit: item.visit,
		appointment: item.appointment,
		consentContact: item.consentContact,
		hasContact: item.contact !== undefined,
	});
	if (problems.length > 0) return { ok: false, reason: "invalid", problems };
	if (item.textEnc !== undefined && item.textEnc.data.length > CIPHERTEXT_MAX) {
		return { ok: false, reason: "too_long" };
	}
	const contact =
		item.contact === undefined ? undefined : feedbackContactSchema.safeParse(item.contact);
	if (contact !== undefined && !contact.success)
		return { ok: false, reason: "invalid", problems: ["contact"] };

	const visit =
		resolved?.visit ??
		(item.visit === undefined ? undefined : await owned(ctx, "visits", tenant, item.visit));
	if (visit === null || visit?.deletedAt !== undefined)
		return { ok: false, reason: "unknown_visit" };
	let booking: Doc<"appointments"> | undefined = resolved?.appointment;
	if (booking === undefined && item.appointment !== undefined) {
		booking = await appointmentByReference(ctx, item.appointment);
		if (booking === undefined || booking.tenant !== tenant)
			return { ok: false, reason: "unknown_appointment" };
	}
	let client =
		item.client === undefined ? undefined : await owned(ctx, "clients", tenant, item.client);
	if (client === null || client?.erasedAt !== undefined)
		return { ok: false, reason: "unknown_client" };
	if (client === undefined && visit?.client !== undefined) {
		const linked = await ctx.db.get(visit.client);
		client = linked !== null && linked.erasedAt === undefined ? linked : undefined;
	} else if (client !== undefined && visit?.client !== undefined && visit.client !== client._id) {
		return { ok: false, reason: "client_mismatch" };
	}
	if (item.kind === "appointment_rating") {
		const subject = visit ?? booking;
		if (subject === undefined || !ratable(subject, now))
			return { ok: false, reason: "not_eligible" };
		const twin =
			visit !== undefined
				? await ctx.db
						.query("feedback")
						.withIndex("by_tenant_visit", (q) => q.eq("tenant", tenant).eq("visit", visit._id))
						.filter((q) => q.eq(q.field("kind"), "appointment_rating"))
						.first()
				: await ctx.db
						.query("feedback")
						.withIndex("by_tenant_appointment", (q) =>
							q.eq("tenant", tenant).eq("appointment", booking?._id),
						)
						.filter((q) => q.eq(q.field("kind"), "appointment_rating"))
						.first();
		if (twin !== null) return { ok: false, reason: "already_rated" };
	}
	const id = await ctx.db.insert("feedback", {
		tenant,
		kind: item.kind,
		...(item.rating === undefined ? {} : { rating: item.rating }),
		...(item.textEnc === undefined ? {} : { textEnc: item.textEnc }),
		channel,
		status: "new",
		...(visit === undefined ? {} : { visit: visit._id }),
		...(booking === undefined ? {} : { appointment: booking._id }),
		...(client === undefined ? {} : { client: client._id }),
		...(author.accountHash === undefined ? {} : { accountHash: author.accountHash }),
		...(author.staffSubject === undefined ? {} : { staffSubject: author.staffSubject }),
		consentContact: item.consentContact,
		...(contact?.success === true ? { contact: contact.data } : {}),
		createdAt: now,
		updatedAt: now,
		version: 1,
	});
	await record(ctx, {
		tenant,
		actor: author.actor,
		action: "feedback.create",
		entity: "feedback",
		entityId: id,
		kind: "feedback",
		version: 1,
		fields: ["kind", "channel", ...(item.rating === undefined ? [] : ["rating"])],
	});
	return { ok: true, id };
}

export type { QueryCtx };
