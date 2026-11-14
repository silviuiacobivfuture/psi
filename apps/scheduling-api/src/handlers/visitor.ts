import { accountHashOf } from "@psi/scheduling";
import { visitorSubject } from "../auth/principal";
import type { HandlersOf } from "../http/context";
import { type ApiError, fail } from "../http/errors";
import type { Reason, StorePort } from "../store/types";
import { paginate } from "./shared";

const TEAM_REQUESTS = { kind: "team", permission: "web_requests_view" } as const;

const REASONS: Record<Reason, () => ApiError> = {
	invalid: () => fail("invalid", "invalid request"),
	unknown_service: () => fail("not_found", "unknown service"),
	slot_taken: () => fail("slot_taken", "the slot was just taken"),
	not_offered: () => fail("conflict", "the slot is not offered"),
	not_found: () => fail("not_found", "not found"),
	hold_expired: () => fail("hold_expired", "the hold lapsed"),
	unavailable_online: () => fail("unavailable_online", "this cannot be booked online"),
	not_allowed: () => fail("not_allowed", "not allowed"),
};

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
	if (result.ok) return result as Extract<T, { ok: true }>;
	const reason = (result as { reason?: Reason }).reason;
	throw reason === undefined ? fail("internal", "unexpected") : REASONS[reason]();
}

export const visitorHandlers: HandlersOf<
	| "visitor.services"
	| "visitor.slots"
	| "visitor.hold"
	| "visitor.release"
	| "visitor.submit"
	| "visitor.cancel"
	| "visitor.callback"
	| "visitor.mine"
	| "visitor.mineCancel"
	| "visitor.mineReschedule"
> = {
	async "visitor.services"(ctx) {
		const out = await ctx.deps.store.visitor.services(ctx.app);
		if (out === undefined) throw fail("not_found", "app not found");
		return out;
	},
	async "visitor.slots"(ctx) {
		const { ok: _ok, ...rest } = ok(await ctx.deps.store.visitor.slots(ctx.app, ctx.query));
		return rest;
	},
	async "visitor.hold"(ctx) {
		const { ok: _ok, ...rest } = ok(await ctx.deps.store.visitor.hold(ctx.app, ctx.body));
		return rest;
	},
	async "visitor.release"(ctx) {
		ok(
			await ctx.deps.store.visitor.release(
				ctx.app,
				String(ctx.params.reference),
				ctx.body.holdToken,
			),
		);
		return { ok: true as const };
	},
	async "visitor.submit"(ctx) {
		const subject =
			ctx.principal.kind === "person" ? ctx.principal.subject : visitorSubject(ctx.principal);
		const { ok: _ok, ...rest } = ok(
			await ctx.deps.store.visitor.submit(ctx.app, {
				reference: String(ctx.params.reference),
				holdToken: ctx.body.holdToken,
				contact: ctx.body.contact,
				audience: ctx.body.audience,
				subject,
			}),
		);
		await ctx.changed("request", "created", rest.reference);
		await ctx.notify(
			"request.created",
			TEAM_REQUESTS,
			{ reference: rest.reference },
			rest.reference,
		);
		await ctx.notify(
			"appointment.requested",
			TEAM_REQUESTS,
			{ reference: rest.reference, start: rest.start },
			rest.reference,
		);
		return rest;
	},
	async "visitor.cancel"(ctx) {
		const out = ok(
			await ctx.deps.store.visitor.cancel(
				ctx.app,
				String(ctx.params.reference),
				ctx.body.cancelCode,
			),
		);
		await ctx.changed("request", "updated", String(ctx.params.reference));
		await ctx.notify(
			"appointment.cancelled",
			TEAM_REQUESTS,
			{ reference: String(ctx.params.reference), by: "visitor" },
			String(ctx.params.reference),
		);
		return { start: out.start };
	},
	async "visitor.callback"(ctx) {
		// The callback form stores a request with no hold: the blacklist is asked first, and a hit is told one neutral word.
		if (await ctx.deps.store.blacklist.screen(ctx.app, "callback", ctx.body.contact))
			throw fail("unavailable_online", "this cannot be booked online");
		const out = await ctx.deps.store.visitor.callback(ctx.app, ctx.body);
		await ctx.changed("request", "created", out.reference);
		await ctx.notify("request.created", TEAM_REQUESTS, { reference: out.reference }, out.reference);
		return out;
	},
	async "visitor.mine"(ctx) {
		const subject = ownSubject(ctx.principal);
		const rows = await ctx.deps.store.visitor.mine(ctx.app, subject);
		return paginate(
			rows.map((r) => ownView(r, ctx.now)),
			ctx.query.limit,
			ctx.query.cursor,
		);
	},
	async "visitor.mineCancel"(ctx) {
		const subject = ownSubject(ctx.principal);
		const id = String(ctx.params.id);
		const held = await changeable(ctx.deps.store, ctx.app, subject, id, ctx.now);
		ok(await ctx.deps.store.visitor.cancelMine(ctx.app, subject, id));
		await ctx.changed("request", "updated", id);
		await ctx.notify(
			"appointment.cancelled",
			TEAM_REQUESTS,
			{ reference: held.reference, by: "visitor", account: accountHashOf(subject) },
			id,
		);
		return { ok: true as const };
	},
	async "visitor.mineReschedule"(ctx) {
		const subject = ownSubject(ctx.principal);
		const id = String(ctx.params.id);
		const held = await changeable(ctx.deps.store, ctx.app, subject, id, ctx.now);
		const { ok: _ok, ...moved } = ok(
			await ctx.deps.store.visitor.rescheduleMine(ctx.app, subject, id, ctx.body),
		);
		await ctx.changed("request", "updated", id);
		await ctx.changed("request", "created", moved.reference);
		await ctx.notify(
			"appointment.moved",
			TEAM_REQUESTS,
			{ reference: moved.reference, previousStart: held.start, account: accountHashOf(subject) },
			moved.reference,
		);
		ctx.auditTarget(moved.reference);
		ctx.note({ from: held.reference });
		return moved;
	},
};

/** Whose own data a `/me` route touches: the signed-in visitor, or the one a site's key names. */
function ownSubject(principal: Parameters<typeof visitorSubject>[0]): string {
	const subject = visitorSubject(principal);
	if (subject === undefined) throw fail("invalid", "name the visitor");
	return subject;
}

type OwnRow = Awaited<ReturnType<StorePort["visitor"]["mine"]>>[number];

/** A row as the visitor sees it, with the clinic's rule for changing it online applied at `now`. */
function ownView(r: OwnRow, now: number) {
	const { noticeMinutes, ...row } = r;
	const changeUntil = r.start - noticeMinutes * 60_000;
	return {
		...row,
		changeUntil,
		canChange: (r.status === "requested" || r.status === "confirmed") && now < changeUntil,
	};
}

/**
 * The visitor's own row, when it may still change online; otherwise the refusal, before anything is written: not theirs
 * (or not there) is 404, past the clinic's notice or no longer open is 403 `not_allowed` with `too_late`.
 */
async function changeable(
	store: StorePort,
	app: string,
	subject: string,
	id: string,
	now: number,
): Promise<OwnRow> {
	const row = (await store.visitor.mine(app, subject)).find((r) => r.id === id);
	if (row === undefined) throw fail("not_found", "not found");
	if (!ownView(row, now).canChange)
		throw fail("not_allowed", "this can no longer be changed online", { reason: "too_late" });
	return row;
}
