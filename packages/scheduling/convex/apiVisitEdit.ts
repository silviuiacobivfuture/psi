import { v } from "convex/values";
import { planChange } from "../src/clinic/change";
import { columnKey } from "../src/clinic/visits";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { recordOverride, type StaffGate, staffGate } from "./blacklistGate";
import { requireServer } from "./guard";
import {
	actorValidator,
	overrideValidator,
	serverKeyValidator,
	visitMetaValidator,
} from "./validators";
import { columnArg, links } from "./visitLinks";
import { moveTakenBy, prepareMove } from "./visitMove";

/** Fields that exist only to make another one searchable: the audit event names what a person changed, not these. */
const DERIVED = ["durationMinutes", "columnKey"];

/** What an edit may change; shared by the edit of one visit and the edit of a whole series. */
export const editFields = {
	client: v.optional(v.string()),
	package: v.optional(v.union(v.string(), v.null())),
	sessionType: v.optional(v.string()),
	priceMinor: v.optional(v.number()),
	notes: v.optional(v.string()),
	meta: v.optional(visitMetaValidator),
	/** A requested visit the client confirmed. */
	confirm: v.optional(v.literal(true)),
	move: v.optional(
		v.object({
			start: v.number(),
			end: v.number(),
			column: v.optional(columnArg),
			room: v.optional(v.string()),
			device: v.optional(v.string()),
		}),
	),
	override: v.optional(overrideValidator),
};

export interface EditSpec {
	expectedVersion?: number | undefined;
	client?: string | undefined;
	package?: string | null | undefined;
	sessionType?: string | undefined;
	priceMinor?: number | undefined;
	notes?: string | undefined;
	meta?: Doc<"visits">["meta"];
	confirm?: true | undefined;
	move?:
		| {
				start: number;
				end: number;
				column?: { kind: "practitioner" | "device" | "room" | "group"; id: string } | undefined;
				room?: string | undefined;
				device?: string | undefined;
		  }
		| undefined;
	override?: { reason: string; authority: "ack" | "staff" | "admin" } | undefined;
}

/** What an edit would do, decided without writing: nothing to do, a change to write, or a refusal with its reason. */
export type EditPlan =
	| { ok: true; changed: false; version: number }
	| {
			ok: true;
			changed: true;
			patch: Partial<Doc<"visits">>;
			fields: string[];
			version: number;
			overridden: Extract<StaffGate, { stop?: undefined }>["overridden"];
	  }
	| {
			ok: false;
			refusal: { ok: false; reason: string; with?: "practitioner" | "room" | "device" };
	  };

/**
 * Every check of an edit, and none of its writes. The checks read the app as it is now; a caller that applies several
 * plans in one mutation (a series) is still in one transaction, so what they read cannot change under them.
 */
export async function planEdit(
	ctx: QueryCtx,
	tenant: string,
	row: Doc<"visits">,
	spec: EditSpec,
): Promise<EditPlan> {
	const refuse = (reason: string): EditPlan => ({ ok: false, refusal: REFUSED(reason) });
	if (row.deletedAt !== undefined) return refuse("not_found");
	if (stale(row.version, spec.expectedVersion)) return refuse("stale");
	if (row.status !== "confirmed" && row.status !== "requested") return refuse("not_allowed");
	if (spec.confirm === true && row.status !== "requested") return refuse("not_requested");
	if (spec.priceMinor !== undefined && (!Number.isInteger(spec.priceMinor) || spec.priceMinor < 0))
		return refuse("negative_money");
	if (spec.meta !== undefined && spec.meta.practitioner.trim() === "") return refuse("invalid");

	const linked = await links(ctx, tenant, {
		client: spec.client,
		package: typeof spec.package === "string" ? spec.package : undefined,
	});
	if (!linked.ok) return refuse(linked.reason);
	const client = linked.client ?? row.client;
	const pack = spec.package === null ? undefined : (linked.package ?? row.package);
	if (pack !== undefined) {
		const held = await ctx.db.get(pack);
		if (held === null || held.client !== client) return refuse("package_not_clients");
	}

	const clientChanged = linked.client !== undefined && linked.client !== row.client;
	const prepared =
		spec.move === undefined ? undefined : await prepareMove(ctx, tenant, row, spec.move);
	if (prepared !== undefined && !prepared.ok) return refuse(prepared.reason);
	const gate: StaffGate =
		clientChanged || spec.move !== undefined
			? await staffGate(
					ctx,
					tenant,
					client === undefined ? undefined : await ctx.db.get(client),
					spec.override,
					Date.now(),
				)
			: {};
	if (gate.stop !== undefined) return { ok: false, refusal: gate.stop };
	if (prepared?.ok === true && spec.move !== undefined) {
		const taken = await moveTakenBy(ctx, tenant, row, prepared.move, spec.move);
		if (taken !== undefined) return { ok: false, refusal: { ...REFUSED("overlaps"), with: taken } };
	}

	const patch: Partial<Doc<"visits">> = {
		...(linked.client === undefined ? {} : { client: linked.client }),
		...(spec.package === null
			? { package: undefined, creditType: undefined }
			: linked.package === undefined
				? {}
				: { package: linked.package }),
		...(spec.sessionType === undefined ? {} : { sessionType: spec.sessionType }),
		...(spec.priceMinor === undefined ? {} : { priceMinor: spec.priceMinor }),
		...(spec.notes === undefined ? {} : { notes: spec.notes }),
		...(spec.meta === undefined ? {} : { meta: spec.meta }),
		...(spec.confirm === true ? { status: "confirmed" as const } : {}),
		...(prepared?.ok === true && spec.move !== undefined
			? {
					start: spec.move.start,
					end: spec.move.end,
					durationMinutes: prepared.move.durationMinutes,
					column: prepared.move.column,
					columnKey: columnKey(prepared.move.column),
					room: prepared.move.room,
					device: prepared.move.device,
				}
			: {}),
	};
	const change = planChange(row, patch);
	if (!change.changed) return { ok: true, changed: false, version: row.version };
	return {
		ok: true,
		changed: true,
		patch,
		fields: change.fields.filter((f) => !DERIVED.includes(f)),
		version: change.nextVersion,
		overridden: "overridden" in gate ? gate.overridden : undefined,
	};
}

/** Writes a plan that changes something: the visit, its audit event, and the override that let it through. */
export async function applyEdit(
	ctx: MutationCtx,
	tenant: string,
	actor: string,
	row: Doc<"visits">,
	plan: Extract<EditPlan, { changed: true }>,
): Promise<void> {
	await ctx.db.patch(row._id, { ...plan.patch, updatedAt: Date.now(), version: plan.version });
	await record(ctx, {
		tenant,
		actor,
		action: "visit.update",
		entity: "visit",
		entityId: row._id,
		kind: "visit",
		version: plan.version,
		fields: plan.fields,
	});
	if (plan.overridden !== undefined)
		await recordOverride(ctx, tenant, actor, plan.overridden, row._id);
}

/**
 * One edit of a staff visit, all or nothing: the client, the package (taken out of one with `null`), the session type,
 * the price, the note, the API's own facts (`meta`), the confirmation of a requested visit and a move in time or place.
 * Every refusal is decided before the first write, so a refusal changes nothing (a Convex mutation that returns after a
 * write has still committed it, which is why nothing here writes until every check has passed). The blacklist is asked
 * about the client the visit will have when the client changes or the visit moves.
 */
export const edit = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		visit: v.string(),
		expectedVersion: v.optional(v.number()),
		...editFields,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "visits", args.tenant, args.visit);
		if (row === null) return REFUSED("not_found");
		const plan = await planEdit(ctx, args.tenant, row, args);
		if (!plan.ok) return plan.refusal;
		if (!plan.changed) return { ok: true as const, changed: false as const, version: plan.version };
		await applyEdit(ctx, args.tenant, args.actor.subject, row, plan);
		return { ok: true as const, changed: true as const, version: plan.version };
	},
});
