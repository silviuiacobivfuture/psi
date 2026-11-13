import { isBlocking, overlaps } from "../src/domain/conflicts";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { appointmentsAround, MAX_BLOCK_MS } from "./calendar";

/**
 * Whether a visit would take a practitioner, room or device that something else already has: another
 * live visit, or (practitioner, room) a web hold, request or confirmed booking. Returns what clashes.
 * Read in the same transaction as the write, so two staff cannot both take the last time.
 */
export async function busyOfVisitsInfo(
	ctx: QueryCtx,
	tenant: string,
	spec: {
		column: { kind: "practitioner" | "device" | "room" | "group"; id: string };
		room?: Id<"rooms"> | undefined;
		device?: Id<"devices"> | undefined;
		start: number;
		end: number;
		except?: Id<"visits">;
	},
): Promise<"practitioner" | "room" | "device" | undefined> {
	const now = Date.now();
	const span = { start: spec.start, until: spec.end };
	const from = spec.start - MAX_BLOCK_MS;
	const clash = (
		rows: ReadonlyArray<{
			_id: Id<"visits">;
			status: "held" | "requested" | "confirmed" | "cancelled" | "declined" | "expired";
			start: number;
			end: number;
			deletedAt?: number;
		}>,
	): boolean =>
		rows.some(
			(r) =>
				r._id !== spec.except &&
				r.deletedAt === undefined &&
				isBlocking({ status: r.status, start: r.start, blockedUntil: r.end }, now) &&
				overlaps(span, { start: r.start, until: r.end }),
		);
	const onColumn = async (key: string) =>
		ctx.db
			.query("visits")
			.withIndex("by_tenant_column_start", (q) =>
				q.eq("tenant", tenant).eq("columnKey", key).gte("start", from).lt("start", spec.end),
			)
			.collect();
	const resources: Array<["practitioner" | "room" | "device", string]> = [];
	if (spec.column.kind === "practitioner") resources.push(["practitioner", spec.column.id]);
	if (spec.column.kind === "room") resources.push(["room", spec.column.id]);
	if (spec.column.kind === "device") resources.push(["device", spec.column.id]);
	if (spec.room !== undefined) resources.push(["room", spec.room]);
	if (spec.device !== undefined) resources.push(["device", spec.device]);
	for (const [kind, id] of resources) {
		if (clash(await onColumn(`${kind}:${id}`))) return kind;
		if (kind === "room") {
			const using = await ctx.db
				.query("visits")
				.withIndex("by_tenant_room_start", (q) =>
					q
						.eq("tenant", tenant)
						.eq("room", id as Id<"rooms">)
						.gte("start", from)
						.lt("start", spec.end),
				)
				.collect();
			if (clash(using)) return "room";
		}
		if (kind === "device") {
			const using = await ctx.db
				.query("visits")
				.withIndex("by_tenant_device_start", (q) =>
					q
						.eq("tenant", tenant)
						.eq("device", id as Id<"devices">)
						.gte("start", from)
						.lt("start", spec.end),
				)
				.collect();
			if (clash(using)) return "device";
		}
		if (kind === "practitioner") {
			const web = await appointmentsAround(ctx, id as Id<"practitioners">, spec.start, spec.end);
			if (
				web.some(
					(a) => isBlocking(a, now) && overlaps(span, { start: a.start, until: a.blockedUntil }),
				)
			)
				return "practitioner";
		}
		if (kind === "room") {
			const web = await ctx.db
				.query("appointments")
				.withIndex("by_room_start", (q) =>
					q
						.eq("room", id as Id<"rooms">)
						.gte("start", from)
						.lt("start", spec.end),
				)
				.collect();
			if (
				web.some(
					(a) => isBlocking(a, now) && overlaps(span, { start: a.start, until: a.blockedUntil }),
				)
			)
				return "room";
		}
	}
	return undefined;
}
