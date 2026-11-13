import { v } from "convex/values";
import { makeAuditEvent } from "../src/clinic/audit";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * What every import function shares. The import is keyed on the OLD app's ids (`legacyId`, written
 * `<table>:<id>`) and never deletes: a row is created, updated (its version bumps) or left alone
 * when its `fingerprint` (a keyed hash of the source row, computed by the importer) is unchanged.
 * References arrive as legacy ids and are resolved here, inside the transaction; a reference that
 * resolves to nothing writes nothing and is reported as an orphan. Results carry old ids only.
 */

export const resultValidator = v.object({
	legacyId: v.string(),
	id: v.optional(v.string()),
	outcome: v.union(
		v.literal("created"),
		v.literal("updated"),
		v.literal("unchanged"),
		v.literal("orphan"),
	),
	/** Why (for an orphan, the reference that is missing) or what to look at, by kind, never content. */
	flag: v.optional(v.string()),
});

export interface UpsertResult {
	legacyId: string;
	id?: string;
	outcome: "created" | "updated" | "unchanged" | "orphan";
	flag?: string;
}

export const MAX_BATCH = 300;

/** What the existing row must expose for the decision. */
interface Existing {
	id: string;
	fingerprint: string | undefined;
	version: number | undefined;
}

/**
 * Upserts one row: `find` locates it by legacy id, `insert` creates it, `update` rewrites the
 * importer-owned fields at the next version. An unchanged fingerprint touches nothing.
 */
export async function upsertRow(args: {
	legacyId: string;
	fingerprint: string;
	find: () => Promise<Existing | null>;
	insert: () => Promise<string>;
	update: (id: string, nextVersion: number) => Promise<void>;
}): Promise<UpsertResult> {
	const found = await args.find();
	if (found === null)
		return { legacyId: args.legacyId, id: await args.insert(), outcome: "created" };
	const id = found.id;
	if (found.fingerprint === args.fingerprint) {
		return { legacyId: args.legacyId, id, outcome: "unchanged" };
	}
	await args.update(id, (found.version ?? 0) + 1);
	return { legacyId: args.legacyId, id, outcome: "updated" };
}

export function orphan(legacyId: string, missing: string): UpsertResult {
	return { legacyId, outcome: "orphan", flag: `missing:${missing}` };
}

/** A row not written, for a reason the importer reports by code (`erased:client`, `slug_taken`). */
export function refused(legacyId: string, flag: string): UpsertResult {
	return { legacyId, outcome: "orphan", flag };
}

// Lookups by legacy id, one per table: the index is `by_tenant_legacy` on each.

export async function practitionerByLegacy(
	ctx: QueryCtx,
	tenant: string,
	legacyId: string,
): Promise<Doc<"practitioners"> | null> {
	return ctx.db
		.query("practitioners")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

export async function deviceByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("devices")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

export async function roomByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("rooms")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

export async function groupByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("groupActivities")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

export async function staffByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("staffMembers")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

export async function clientByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("clients")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

/**
 * A client a row refers to, by legacy id: found, absent, or ERASED. An erased client (a tombstone
 * that keeps its old id) is never written to again, so a re-import cannot bring back what was erased.
 */
export async function clientRef(
	ctx: QueryCtx,
	tenant: string,
	legacyId: string | undefined,
): Promise<{ ok: true; client: Doc<"clients"> | undefined } | { ok: false; flag: string }> {
	if (legacyId === undefined) return { ok: true, client: undefined };
	const client = await clientByLegacy(ctx, tenant, legacyId);
	if (client === null) return { ok: false, flag: "missing:client" };
	if (client.erasedAt !== undefined) return { ok: false, flag: "erased:client" };
	return { ok: true, client };
}

export async function visitByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("visits")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

export async function packageByLegacy(ctx: QueryCtx, tenant: string, legacyId: string) {
	return ctx.db
		.query("packages")
		.withIndex("by_tenant_legacy", (q) => q.eq("tenant", tenant).eq("legacyId", legacyId))
		.unique();
}

/** A form definition by key and version. */
export async function definitionOf(ctx: QueryCtx, tenant: string, key: string, version: number) {
	return ctx.db
		.query("formDefinitions")
		.withIndex("by_tenant_key_version", (q) =>
			q.eq("tenant", tenant).eq("key", key).eq("version", version),
		)
		.unique();
}

/** One audit event for a batch: the table, how many rows changed. No row content. */
export async function auditBatch(
	ctx: MutationCtx,
	tenant: string,
	table: string,
	results: ReadonlyArray<UpsertResult>,
): Promise<void> {
	const changed = results.filter((r) => r.outcome === "created" || r.outcome === "updated").length;
	if (changed === 0) return;
	const made = makeAuditEvent({
		tenant,
		at: Date.now(),
		actor: "system:import",
		action: "import.batch",
		entity: "import",
		entityId: table,
		fields: [table],
		count: changed,
	});
	if (!made.ok) throw new Error(`audit event refused: ${made.problems.join(",")}`);
	await ctx.db.insert("auditEvents", {
		tenant: made.event.tenant,
		at: made.event.at,
		actor: made.event.actor,
		action: made.event.action,
		entity: made.event.entity,
		entityId: made.event.entityId,
		summary: made.event.summary,
	});
}
