import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { REFUSED } from "./apiSupport";
import { CATALOG_MAX, LIST_MAX, TOO_MANY_ROWS, within } from "./bounded";
import { requireServer } from "./guard";
import { serverKeyValidator } from "./validators";

/** The most columns one read names (the API's MAX_IDS). */
const MAX_COLUMNS = 100;

const view = (x: Doc<"visits">) => ({ ...x, id: x._id });

/**
 * The live visits of a few calendar columns starting in [from, to), each column read through its own index (a week of
 * one calendar reads that calendar's week, never the clinic's). Soft-deleted visits are left out; cancelled ones are
 * answered (they say so). `people`: practitioners' columns (`practitioners`, their ids) plus the group sessions they
 * lead (the API's `people` ids, in a visit's meta), because a group session sits on its group's column. `rooms` and
 * `devices`: the visits held in those rooms or on those devices. An id that names nothing matches nothing; more than
 * LIST_MAX visits refuses (`too_many_rows`) rather than answer part of them.
 */
export const columnVisits = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		from: v.number(),
		to: v.number(),
		of: v.union(
			v.object({
				kind: v.literal("people"),
				practitioners: v.array(v.string()),
				people: v.array(v.string()),
			}),
			v.object({ kind: v.literal("rooms"), ids: v.array(v.string()) }),
			v.object({ kind: v.literal("devices"), ids: v.array(v.string()) }),
		),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const { tenant, from, to, of } = args;
		const named = of.kind === "people" ? [...of.practitioners, ...of.people] : of.ids;
		if (to <= from || named.length > 2 * MAX_COLUMNS) return REFUSED("invalid");
		const read = await (of.kind === "people"
			? peopleVisits(ctx, tenant, from, to, of.practitioners, of.people)
			: resourceVisits(ctx, tenant, from, to, of.kind, of.ids));
		if (read === undefined) return REFUSED(TOO_MANY_ROWS);
		return { ok: true as const, visits: read.filter((r) => r.deletedAt === undefined).map(view) };
	},
});

/** Several bounded reads, together bounded too: `undefined` once they hold more than LIST_MAX rows. */
async function gather(
	reads: ReadonlyArray<(left: number) => Promise<Doc<"visits">[] | undefined>>,
): Promise<Doc<"visits">[] | undefined> {
	const out: Doc<"visits">[] = [];
	for (const read of reads) {
		const rows = await read(LIST_MAX - out.length);
		if (rows === undefined) return undefined;
		out.push(...rows);
	}
	return out;
}

async function peopleVisits(
	ctx: QueryCtx,
	tenant: string,
	from: number,
	to: number,
	practitioners: ReadonlyArray<string>,
	people: ReadonlyArray<string>,
): Promise<Doc<"visits">[] | undefined> {
	const onColumn = (columnKey: string) => (left: number) =>
		within(
			ctx.db
				.query("visits")
				.withIndex("by_tenant_column_start", (q) =>
					q.eq("tenant", tenant).eq("columnKey", columnKey).gte("start", from).lt("start", to),
				),
			left,
		);
	const own = [...new Set(practitioners)].map((id) => onColumn(`practitioner:${id}`));
	const wanted = new Set(people);
	if (wanted.size === 0) return gather(own);
	// A group session is on its group's column; who leads it is in its meta. The groups are the app's catalogue.
	const groups = await within(
		ctx.db.query("groupActivities").withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant)),
		CATALOG_MAX,
	);
	if (groups === undefined) return undefined;
	const led = await gather(groups.map((g) => onColumn(`group:${g._id}`)));
	if (led === undefined) return undefined;
	const mine = await gather(own);
	if (mine === undefined || mine.length + led.length > LIST_MAX) return undefined;
	return [...mine, ...led.filter((r) => r.meta !== undefined && wanted.has(r.meta.practitioner))];
}

/**
 * A room's or a device's visits: those that use it (the visit's `room` / `device`) AND those on its own column
 * (`room:<id>` / `device:<id>`). A visit is never told both ways (the import does not repeat a resource that is its
 * column), but one that is appears once. Each read is bounded; together they are too.
 */
async function resourceVisits(
	ctx: QueryCtx,
	tenant: string,
	from: number,
	to: number,
	kind: "rooms" | "devices",
	ids: ReadonlyArray<string>,
): Promise<Doc<"visits">[] | undefined> {
	const onColumn = (columnKey: string) => (left: number) =>
		within(
			ctx.db
				.query("visits")
				.withIndex("by_tenant_column_start", (q) =>
					q.eq("tenant", tenant).eq("columnKey", columnKey).gte("start", from).lt("start", to),
				),
			left,
		);
	const reads = [...new Set(ids)].flatMap((given) => {
		if (kind === "rooms") {
			const room = ctx.db.normalizeId("rooms", given);
			if (room === null) return [];
			return [
				(left: number) =>
					within(
						ctx.db
							.query("visits")
							.withIndex("by_tenant_room_start", (q) =>
								q.eq("tenant", tenant).eq("room", room).gte("start", from).lt("start", to),
							),
						left,
					),
				onColumn(`room:${room}`),
			];
		}
		const device = ctx.db.normalizeId("devices", given);
		if (device === null) return [];
		return [
			(left: number) =>
				within(
					ctx.db
						.query("visits")
						.withIndex("by_tenant_device_start", (q) =>
							q.eq("tenant", tenant).eq("device", device).gte("start", from).lt("start", to),
						),
					left,
				),
			onColumn(`device:${device}`),
		];
	});
	const read = await gather(reads);
	if (read === undefined) return undefined;
	const seen = new Set<string>();
	return read.filter((r) => (seen.has(r._id) ? false : (seen.add(r._id), true)));
}
