import type { PauseInput, RouteSpec } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import {
	bodyOf,
	type LoadedPause,
	loadPauses,
	MAX_PAUSES,
	messageOf,
	type StoredPause,
	stateOf,
} from "../engagement/booking-pause";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, notFound } from "../http/errors";
import { newId } from "./shared";

type C = Ctx<RouteSpec>;
type Input = z.output<typeof PauseInput>;

const view = (p: LoadedPause, now: number) => ({
	id: p.id,
	scope: p.scope,
	...(p.from === undefined ? {} : { from: p.from }),
	...(p.until === undefined ? {} : { until: p.until }),
	message: messageOf(p),
	defaultMessage: p.message === undefined,
	callbacksOpen: p.callbacksOpen,
	blockStaff: p.blockStaff,
	state: stateOf(p, now),
	createdAt: p.createdAt,
	createdBy: p.createdBy,
	updatedAt: p.updatedAt,
});

/** The public sites of this app: the callers whose service key reaches it. */
const sitesOf = (ctx: C): string[] =>
	ctx.deps.config.callers
		.filter((c) => c.app === ctx.app)
		.map((c) => c.id)
		.sort();

/**
 * What a pause must say before it is kept (400 `invalid` with `detail.reason`, nothing written): an end after its start
 * and after now, a site this app has, a service and a practitioner the app has.
 */
async function check(ctx: C, input: Input): Promise<void> {
	const start = input.from ?? ctx.now;
	if (input.until !== undefined && input.until <= start)
		throw fail("invalid", "a pause ends after it starts", {
			field: "until",
			reason: "until_before_from",
		});
	if (input.until !== undefined && input.until <= ctx.now)
		throw fail("invalid", "a pause ends in the future", { field: "until", reason: "until_past" });
	const scope = input.scope;
	switch (scope.level) {
		case "organisation":
			return;
		case "site":
			if (!sitesOf(ctx).includes(scope.site))
				throw fail("invalid", "not a site of this app", { field: "scope", reason: "unknown_site" });
			return;
		case "service": {
			const known = (await ctx.deps.store.c.services.list(ctx.app)).some(
				(s) => s.slug === scope.service,
			);
			if (!known)
				throw fail("invalid", "not a service of this app", {
					field: "scope",
					reason: "unknown_service",
				});
			return;
		}
		case "practitioner": {
			const person = await ctx.deps.store.c.people.get(ctx.app, scope.practitionerId);
			if (person === undefined || person.kind !== "practitioner")
				throw fail("invalid", "not a practitioner of this app", {
					field: "scope",
					reason: "unknown_practitioner",
				});
			return;
		}
		default: {
			const never: never = scope;
			return never;
		}
	}
}

const stored = (ctx: C, input: Input, made?: LoadedPause): StoredPause => ({
	scope: input.scope,
	...(input.from === undefined ? {} : { from: input.from }),
	...(input.until === undefined ? {} : { until: input.until }),
	...(input.message === undefined ? {} : { message: input.message }),
	callbacksOpen: input.callbacksOpen,
	blockStaff: input.blockStaff,
	createdAt: made?.createdAt ?? ctx.now,
	createdBy: made?.createdBy ?? ctx.subject,
	updatedAt: ctx.now,
});

async function held(ctx: C, id: string): Promise<LoadedPause> {
	const found = (await loadPauses(ctx.deps.store, ctx.app)).find((p) => p.id === id);
	if (found === undefined) throw notFound("pause");
	return found;
}

export const bookingPauseHandlers: HandlersOf<
	"bookingPause.list" | "bookingPause.create" | "bookingPause.update" | "bookingPause.remove"
> = {
	async "bookingPause.list"(ctx) {
		const pauses = await loadPauses(ctx.deps.store, ctx.app);
		return {
			items: pauses.map((p) => view(p, ctx.now)),
			sites: sitesOf(ctx),
			paused: pauses.some((p) => stateOf(p, ctx.now) === "active"),
		};
	},

	async "bookingPause.create"(ctx) {
		await check(ctx, ctx.body);
		const kept = await loadPauses(ctx.deps.store, ctx.app);
		if (kept.length >= MAX_PAUSES)
			throw fail("invalid", "too many pauses: remove ended ones first", { reason: "too_many" });
		const id = newId("bp");
		const body = stored(ctx, ctx.body);
		const saved = await ctx.deps.store.keyed.put(ctx.app, "pause", id, 0, bodyOf(body));
		ctx.note({
			level: body.scope.level,
			callbacksOpen: body.callbacksOpen,
			blockStaff: body.blockStaff,
		});
		return view({ ...body, id, revision: saved.revision }, ctx.now);
	},

	async "bookingPause.update"(ctx) {
		const id = String(ctx.params.id);
		const was = await held(ctx, id);
		await check(ctx, ctx.body);
		const body = stored(ctx, ctx.body, was);
		const saved = await ctx.deps.store.keyed.put(ctx.app, "pause", id, was.revision, bodyOf(body));
		ctx.note({
			level: body.scope.level,
			callbacksOpen: body.callbacksOpen,
			blockStaff: body.blockStaff,
		});
		return view({ ...body, id, revision: saved.revision }, ctx.now);
	},

	async "bookingPause.remove"(ctx) {
		const id = String(ctx.params.id);
		const was = await held(ctx, id);
		await ctx.deps.store.keyed.remove(ctx.app, "pause", id);
		ctx.note({ level: was.scope.level, state: stateOf(was, ctx.now) });
		return { ok: true as const };
	},
};
