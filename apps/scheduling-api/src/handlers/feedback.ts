import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden, notFound } from "../http/errors";
import type { FeedbackGroups, FeedbackRow } from "../store/ports";
import { StoreRefused } from "../store/types";

type C = Ctx<RouteSpec>;

/** A rating this low or lower tells the owners. */
const LOW_RATING = 2;

/** Feedback text is sealed per app: a sealed value moved to another app does not open. */
export const feedbackContext = (app: string): string => `feedback:${app}`;

/** The field groups the caller holds on feedback: `core` (rating, text, replies) and `contact` (who wrote it). */
async function groupsOf(ctx: C): Promise<FeedbackGroups> {
	const held: ("core" | "contact")[] = [];
	if (await ctx.canAll("feedback_view_core")) held.push("core");
	if (await ctx.canAll("feedback_view_contact")) held.push("contact");
	return held;
}

function shown(ctx: C, row: FeedbackRow) {
	const { textSealed, ...rest } = row;
	return {
		...rest,
		...(textSealed === undefined
			? {}
			: { text: ctx.deps.crypto.open(textSealed, feedbackContext(ctx.app)) }),
	};
}

/** What a visitor is told of a link that does not work: one answer for "never was", the page for "used" and "expired". */
function linkRefusal(error: unknown): unknown {
	if (!(error instanceof StoreRefused)) return error;
	switch (error.reason) {
		case "invalid_link":
		case "wrong_app":
		case "subject_gone":
		case "not_found":
			return notFound("link");
		case "expired":
		case "used":
			return fail("conflict", "this link no longer works", { reason: error.reason });
		default:
			return error;
	}
}

async function viaLink<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw linkRefusal(error);
	}
}

export const feedbackHandlers: HandlersOf<
	| "feedback.linkInspect"
	| "feedback.linkSubmit"
	| "feedback.issueLink"
	| "feedback.list"
	| "feedback.get"
	| "feedback.reply"
	| "feedback.setStatus"
> = {
	async "feedback.linkInspect"(ctx) {
		return viaLink(() => ctx.deps.store.feedback.inspectLink(ctx.app, ctx.query.token));
	},

	async "feedback.linkSubmit"(ctx) {
		const { token, text, ...rest } = ctx.body;
		const { id } = await viaLink(() =>
			ctx.deps.store.feedback.redeem(ctx.app, token, {
				...rest,
				...(text === undefined
					? {}
					: { textSealed: ctx.deps.crypto.seal(text, feedbackContext(ctx.app)) }),
			}),
		);
		// A low rating is for the people who answer to the clinic, at once; what was written is for them to read in the console.
		if (rest.rating !== undefined && rest.rating <= LOW_RATING)
			await ctx.notify(
				"feedback.negative",
				{ kind: "team", permission: "feedback_view" },
				{ feedbackId: id, rating: rest.rating },
				id,
			);
		return { id };
	},

	async "feedback.issueLink"(ctx) {
		const out = await ctx.deps.store.feedback.issueLink(ctx.app, ctx.body, ctx.body.ttlHours);
		ctx.note({ about: ctx.body.visit === undefined ? "booking" : "visit" });
		return out;
	},

	async "feedback.list"(ctx) {
		const { status, limit, ...rest } = ctx.query;
		const out = await ctx.deps.store.feedback.list(ctx.app, await groupsOf(ctx), {
			...rest,
			limit,
			statuses: status === undefined ? undefined : Array.isArray(status) ? status : [status],
		});
		return { items: out.items.map((row) => shown(ctx, row)), more: out.more };
	},

	async "feedback.get"(ctx) {
		const out = await ctx.deps.store.feedback.get(
			ctx.app,
			String(ctx.params.id),
			await groupsOf(ctx),
		);
		if (out === undefined) throw notFound("feedback");
		return {
			item: shown(ctx, out.item),
			replies: out.replies.map((r) => ({
				id: r.id,
				by: r.by,
				at: r.at,
				text: ctx.deps.crypto.open(r.textSealed, feedbackContext(ctx.app)),
			})),
		};
	},

	async "feedback.reply"(ctx) {
		// The reply's text is the core group: writing it needs the core group's right too.
		if (!(await ctx.canAll("feedback_reply_core")))
			throw forbidden("not allowed to write this field group", { group: "core" });
		const done = await ctx.deps.store.feedback.reply(
			ctx.app,
			String(ctx.params.id),
			ctx.deps.crypto.seal(ctx.body.text, feedbackContext(ctx.app)),
		);
		ctx.note({ status: done.status });
		return {
			reply: { id: done.replyId, by: ctx.subject, at: done.at, text: ctx.body.text },
			status: done.status,
			contactable: done.contactable,
		};
	},

	async "feedback.setStatus"(ctx) {
		const held = await ctx.authorizeAny(["feedback_view", "feedback_close"], "sched_role", ctx.app);
		// Marking read is a viewer's act (or a closer's); closing and reopening are the closer's.
		const needs =
			ctx.body.event === "read" ? ["feedback_view", "feedback_close"] : ["feedback_close"];
		if (!needs.some((key) => held.includes(key)))
			throw forbidden("the role does not allow this", { permission: "feedback_close" });
		const done = await ctx.deps.store.feedback.setStatus(
			ctx.app,
			String(ctx.params.id),
			ctx.body.event,
			ctx.body.expectedVersion,
		);
		ctx.note({ event: ctx.body.event, status: done.status });
		return done;
	},
};
