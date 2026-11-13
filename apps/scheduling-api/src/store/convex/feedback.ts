import { z } from "zod";
import type { FeedbackPort, FeedbackReplyRow, FeedbackRow } from "../ports";
import { StoreRefused } from "../types";
import { actorArg } from "./call";
import { Encrypted, toEncrypted, toSealed } from "./envelope";
import type { Rpc } from "./rpc";

const Contact = z.object({
	name: z.string().optional(),
	email: z.string().optional(),
	phone: z.string().optional(),
});
const Item = z.object({
	id: z.string(),
	kind: z.enum(["appointment_rating", "general", "suggestion", "complaint", "site_issue"]),
	channel: z.enum(["account", "email_link", "chat", "staff"]),
	status: z.enum(["new", "read", "answered", "closed"]),
	createdAt: z.number(),
	updatedAt: z.number(),
	version: z.number(),
	readAt: z.number().optional(),
	answeredAt: z.number().optional(),
	closedAt: z.number().optional(),
	visit: z.string().optional(),
	appointment: z.string().optional(),
	client: z.string().optional(),
	linkedAccount: z.boolean(),
	rating: z.number().optional(),
	textEnc: Encrypted.optional(),
	consentContact: z.boolean().optional(),
	contact: Contact.optional(),
	staffSubject: z.string().optional(),
});
const Reply = z.object({ id: z.string(), by: z.string(), at: z.number(), textEnc: Encrypted });
/** The refusals of these wrappers carry the field names a bad item got wrong. */
const Refused = z.object({
	ok: z.literal(false),
	reason: z.string(),
	problems: z.array(z.string()).optional(),
});
const List = z.union([
	z.object({ ok: z.literal(true), items: z.array(Item), more: z.boolean() }),
	Refused,
]);
const Got = z.union([
	z.object({ ok: z.literal(true), item: Item, replies: z.array(Reply) }),
	Refused,
]);
const Replied = z.union([
	z.object({ ok: z.literal(true), status: Item.shape.status, contactable: z.boolean() }),
	Refused,
]);
const Status = z.union([
	z.object({ ok: z.literal(true), changed: z.boolean(), status: Item.shape.status }),
	Refused,
]);
const Issued = z.union([
	z.object({ ok: z.literal(true), token: z.string(), expiresAt: z.number() }),
	Refused,
]);
const Inspected = z.union([
	z.object({ ok: z.literal(true), start: z.number(), expiresAt: z.number() }),
	Refused,
]);
const Redeemed = z.union([z.object({ ok: z.literal(true), id: z.string() }), Refused]);

const refusal = (out: z.infer<typeof Refused>): StoreRefused =>
	new StoreRefused(out.reason, out.problems === undefined ? undefined : { problems: out.problems });

const rowOf = (i: z.infer<typeof Item>): FeedbackRow => {
	const { textEnc, ...rest } = i;
	return { ...rest, ...(textEnc === undefined ? {} : { textSealed: toSealed(textEnc) }) };
};
const replyOf = (r: z.infer<typeof Reply>): FeedbackReplyRow => ({
	id: r.id,
	by: r.by,
	at: r.at,
	textSealed: toSealed(r.textEnc),
});
const defined = (o: object): Record<string, unknown> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Feedback over `apiFeedback` and `feedbackLinks`; the text is sealed by the service and only ever ciphertext here. */
export function feedbackPort(rpc: Rpc): FeedbackPort {
	return {
		async list(app, groups, filter) {
			const { statuses, ...rest } = filter;
			const out = await rpc.query(
				"apiFeedback:list",
				{
					tenant: app,
					groups,
					...defined(rest),
					...(statuses === undefined ? {} : { statuses }),
				},
				List,
			);
			if (!out.ok) throw refusal(out);
			return { items: out.items.map(rowOf), more: out.more };
		},
		async get(app, id, groups) {
			const out = await rpc.query("apiFeedback:get", { tenant: app, feedback: id, groups }, Got);
			if (out.ok) return { item: rowOf(out.item), replies: out.replies.map(replyOf) };
			if (out.reason === "not_found") return undefined;
			throw refusal(out);
		},
		async reply(app, id, textSealed) {
			const out = await rpc.mutation(
				"apiFeedback:reply",
				{ tenant: app, actor: actorArg(), feedback: id, textEnc: toEncrypted(textSealed) },
				Replied,
			);
			if (!out.ok) throw refusal(out);
			// The wrapper does not name the reply it wrote: it is the newest of the thread.
			const thread = await rpc.query(
				"apiFeedback:get",
				{ tenant: app, feedback: id, groups: ["core"] },
				Got,
			);
			if (!thread.ok) throw refusal(thread);
			const last = thread.replies.at(-1);
			if (last === undefined) throw new StoreRefused("not_found");
			return { status: out.status, contactable: out.contactable, replyId: last.id, at: last.at };
		},
		async setStatus(app, id, event, expectedVersion) {
			const out = await rpc.mutation(
				"apiFeedback:setStatus",
				{
					tenant: app,
					actor: actorArg(),
					feedback: id,
					event,
					...(expectedVersion === undefined ? {} : { expectedVersion }),
				},
				Status,
			);
			if (!out.ok) throw refusal(out);
			return { status: out.status, changed: out.changed };
		},
		async issueLink(app, target, ttlHours) {
			const out = await rpc.mutation(
				"feedbackLinks:issue",
				{
					tenant: app,
					actor: actorArg(),
					...defined(target),
					...(ttlHours === undefined ? {} : { ttlHours }),
				},
				Issued,
			);
			if (!out.ok) throw refusal(out);
			return { token: out.token, expiresAt: out.expiresAt };
		},
		async inspectLink(app, token) {
			const out = await rpc.query("feedbackLinks:inspect", { tenant: app, token }, Inspected);
			if (!out.ok) throw refusal(out);
			return { start: out.start, expiresAt: out.expiresAt };
		},
		async redeem(app, token, input) {
			const { textSealed, ...rest } = input;
			const out = await rpc.mutation(
				"feedbackLinks:redeem",
				{
					tenant: app,
					token,
					...defined(rest),
					...(textSealed === undefined ? {} : { textEnc: toEncrypted(textSealed) }),
				},
				Redeemed,
			);
			if (!out.ok) throw refusal(out);
			return { id: out.id };
		},
	};
}
