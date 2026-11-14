import {
	type OneOffEntry,
	oneOffProblems,
	type WeeklyRule,
	weeklyPlanProblems,
} from "@psi/scheduling/domain";
import { MAX_PREVIEW_DAYS, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { loadPauses, pausesFor, stateOf } from "../engagement/booking-pause";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, notFound } from "../http/errors";
import type { StoredAvailability } from "../store/availability-port";
import { must } from "./shared";

type C = Ctx<RouteSpec>;
const DAY_MS = 86_400_000;
const CALENDAR = "sched_calendar" as const;

async function zoneOf(ctx: C): Promise<string> {
	return (await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app")).timeZone;
}

async function availabilityOf(ctx: C, personId: string, from: string): Promise<StoredAvailability> {
	const found = await ctx.deps.store.availability.get(ctx.app, personId, from);
	if (found === undefined) throw notFound("practitioner");
	return found;
}

/** A rule without `undefined` fields, as the store keeps it. */
function ruleOf(r: {
	weekday: number;
	start: number;
	end: number;
	modes: ("onsite" | "online")[];
	validFrom?: string | undefined;
	validUntil?: string | undefined;
	week?: "A" | "B" | undefined;
	override?: boolean | undefined;
}): WeeklyRule {
	return {
		weekday: r.weekday,
		start: r.start,
		end: r.end,
		modes: [...new Set(r.modes)],
		...(r.validFrom === undefined ? {} : { validFrom: r.validFrom }),
		...(r.validUntil === undefined ? {} : { validUntil: r.validUntil }),
		...(r.week === undefined ? {} : { week: r.week }),
		...(r.override === true ? { override: true } : {}),
	};
}

/** Refuses a set of rules with problems (400 `invalid`, `detail.problems`), before anything is written. */
function refuseProblems(rules: ReadonlyArray<WeeklyRule>, personId?: string): void {
	const problems = weeklyPlanProblems(rules);
	if (problems.length > 0)
		throw fail("invalid", "the weekly rules have problems", {
			reason: "plan",
			problems: problems.map((p) => ({ ...p, ...(personId === undefined ? {} : { personId }) })),
		});
}

function entryOf(e: {
	from: string;
	until?: string | undefined;
	kind: "closed" | "open";
	start?: number | undefined;
	end?: number | undefined;
	modes?: ("onsite" | "online")[] | undefined;
}): OneOffEntry {
	return {
		from: e.from,
		kind: e.kind,
		...(e.until === undefined ? {} : { until: e.until }),
		...(e.start === undefined ? {} : { start: e.start }),
		...(e.end === undefined ? {} : { end: e.end }),
		...(e.modes === undefined ? {} : { modes: e.modes }),
	};
}

const view = (personId: string, timeZone: string, a: StoredAvailability) => ({
	personId,
	timeZone,
	...(a.abAnchor === undefined ? {} : { abAnchor: a.abAnchor }),
	rules: a.rules.map((r) => ({ ...r, modes: [...r.modes] })),
	exceptions: a.exceptions.map(({ modes, ...e }) => ({
		...e,
		...(modes === undefined ? {} : { modes: [...modes] }),
	})),
});

const today = (ctx: C, timeZone: string): string =>
	new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ctx.now));

export const availabilityHandlers: HandlersOf<
	| "availability.get"
	| "availability.rulesPut"
	| "availability.copyRules"
	| "availability.oneOffCreate"
	| "availability.oneOffRemove"
	| "availability.preview"
	| "rooms.closures"
	| "rooms.closureCreate"
	| "rooms.closureRemove"
> = {
	async "availability.get"(ctx) {
		const personId = String(ctx.params.id);
		return view(personId, await zoneOf(ctx), await availabilityOf(ctx, personId, ctx.query.from));
	},

	async "availability.rulesPut"(ctx) {
		const personId = String(ctx.params.id);
		const timeZone = await zoneOf(ctx);
		const before = await availabilityOf(ctx, personId, today(ctx, timeZone));
		const rules = ctx.body.rules.map(ruleOf);
		refuseProblems(rules);
		await ctx.deps.store.availability.replaceRules(ctx.app, [{ personId, rules }]);
		ctx.note({ rules: rules.length, before: before.rules.length });
		return view(personId, timeZone, await availabilityOf(ctx, personId, today(ctx, timeZone)));
	},

	async "availability.copyRules"(ctx) {
		const { from, to } = ctx.body;
		if (to.includes(from) || new Set(to).size !== to.length)
			throw fail("invalid", "copy to other practitioners, once each", { field: "to" });
		// Every practitioner is asked before anything is written: one the caller may not edit refuses the whole copy.
		await ctx.authorize("availability_view", CALENDAR, from);
		for (const id of to) await ctx.authorize("availability_edit", CALENDAR, id);
		const timeZone = await zoneOf(ctx);
		const source = await availabilityOf(ctx, from, today(ctx, timeZone));
		for (const id of to) await availabilityOf(ctx, id, today(ctx, timeZone));
		refuseProblems(source.rules);
		await ctx.deps.store.availability.replaceRules(
			ctx.app,
			to.map((personId) => ({ personId, rules: source.rules })),
		);
		ctx.auditTarget(from);
		ctx.note({ to: to.length, rules: source.rules.length });
		return { items: to.map((personId) => ({ personId, rules: source.rules.length })) };
	},

	async "availability.oneOffCreate"(ctx) {
		const { personIds } = ctx.body;
		if (new Set(personIds).size !== personIds.length)
			throw fail("invalid", "each practitioner once", { field: "personIds" });
		for (const id of personIds) await ctx.authorize("availability_edit", CALENDAR, id);
		const entry = entryOf(ctx.body.entry);
		const timeZone = await zoneOf(ctx);
		const problems = [];
		for (const personId of personIds) {
			const held = await availabilityOf(ctx, personId, entry.from);
			for (const p of oneOffProblems(entry, held.exceptions, timeZone))
				problems.push({ ...p, personId });
		}
		if (problems.length > 0)
			throw fail("invalid", "the entry has problems", { reason: "entry", problems });
		const added = await ctx.deps.store.availability.addOneOff(ctx.app, personIds, entry, timeZone);
		ctx.auditTarget(personIds[0] ?? ctx.app);
		ctx.note({ people: personIds.length, days: added, kind: entry.kind });
		return { items: personIds.map((personId) => ({ personId, added })) };
	},

	async "availability.oneOffRemove"(ctx) {
		const personId = String(ctx.params.id);
		const removed = await ctx.deps.store.availability.removeOneOff(
			ctx.app,
			personId,
			String(ctx.params.entry),
		);
		if (!removed) throw notFound("entry");
		return { ok: true as const };
	},

	async "availability.preview"(ctx) {
		const personId = String(ctx.params.id);
		const { service, from, to } = ctx.query;
		if (to <= from || to - from > MAX_PREVIEW_DAYS * DAY_MS)
			throw fail("invalid", `a preview spans at most ${MAX_PREVIEW_DAYS} days`, { field: "to" });
		const key = ctx.deps.store.visitor.practitionerKey(personId);
		// Asked from the far future: only whether the person is a practitioner, none of their days.
		const practitioner = await ctx.deps.store.availability.get(ctx.app, personId, "9999-12-31");
		if (key === undefined || practitioner === undefined) throw notFound("practitioner");
		// The visitor's own slot code, restricted to this person: what the public site offers of them.
		const out = await ctx.deps.store.visitor.slots(ctx.app, {
			service,
			from,
			to,
			practitioner: key,
			limit: 200,
		});
		if (!out.ok) throw notFound("service");
		const pauses = await loadPauses(ctx.deps.store, ctx.app);
		const paused =
			pausesFor(pauses, ctx.now, { service, practitioner: personId }).length > 0 ||
			pauses.some((p) => p.scope.level === "site" && stateOf(p, ctx.now) === "active");
		return {
			personId,
			timeZone: out.timeZone,
			service: out.service,
			from,
			to,
			slots: out.slots.map((s) => ({ start: s.start, end: s.end, modes: s.modes })),
			paused,
		};
	},

	async "rooms.closures"(ctx) {
		const found = await ctx.deps.store.availability.closures(
			ctx.app,
			String(ctx.params.id),
			ctx.query.from,
		);
		if (found === undefined) throw notFound("room");
		return { items: found };
	},

	async "rooms.closureCreate"(ctx) {
		const roomId = String(ctx.params.id);
		const b = ctx.body;
		const entry = entryOf({ ...b, kind: "closed" });
		const problems = oneOffProblems(entry, [], await zoneOf(ctx));
		if (problems.length > 0)
			throw fail("invalid", "the closure has problems", { reason: "entry", problems });
		if ((await ctx.deps.store.availability.closures(ctx.app, roomId, b.from)) === undefined)
			throw notFound("room");
		await ctx.deps.store.availability.addClosure(ctx.app, roomId, {
			from: b.from,
			until: b.until ?? b.from,
			start: b.start,
			end: b.end,
		});
		const items = await ctx.deps.store.availability.closures(ctx.app, roomId, b.from);
		ctx.auditTarget(roomId);
		return { items: items ?? [] };
	},

	async "rooms.closureRemove"(ctx) {
		const roomId = String(ctx.params.id);
		if (
			!(await ctx.deps.store.availability.removeClosure(
				ctx.app,
				roomId,
				String(ctx.params.closure),
			))
		)
			throw notFound("closure");
		ctx.auditTarget(roomId);
		return { ok: true as const };
	},
};
