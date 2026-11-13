import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Erasing a client for real (a GDPR request, or the 30-day soft delete running out). It removes
 * everything personal and clinical that hangs on the client: reports and questionnaires, custom
 * values, files (metadata; the caller deletes the bytes at the returned keys), the treating
 * relations, the duplicate keys, and the free text of their visits. What the books need stays,
 * without a person in it: visits (time, column, price, amount paid), packages and payments hang
 * on a client row that is kept as an emptied tombstone. A client with none of those is deleted
 * outright. The caller records the audit event (no content in it).
 */
export async function eraseClinicData(
	ctx: MutationCtx,
	tenant: string,
	client: Id<"clients">,
	now: number,
): Promise<{ storageKeys: string[]; tombstoned: boolean }> {
	const responses = await ctx.db
		.query("formResponses")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	for (const row of responses) await ctx.db.delete(row._id);

	const values = await ctx.db
		.query("customValues")
		.withIndex("by_tenant_entity", (q) =>
			q.eq("tenant", tenant).eq("entity", "client").eq("entityId", client),
		)
		.collect();
	for (const row of values) await ctx.db.delete(row._id);

	const stored = await ctx.db
		.query("files")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	const storageKeys = stored.map((f) => f.storageKey);
	for (const row of stored) {
		await ctx.db.insert("storageOutbox", {
			tenant,
			storageKey: row.storageKey,
			reason: "erasure",
			createdAt: now,
		});
		await ctx.db.delete(row._id);
	}

	const relations = await ctx.db
		.query("treating")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	for (const row of relations) await ctx.db.delete(row._id);

	const visits = await ctx.db
		.query("visits")
		.withIndex("by_tenant_client_start", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	for (const row of visits) {
		await ctx.db.patch(row._id, {
			notes: undefined,
			therapistNotes: undefined,
			updatedAt: now,
			version: row.version + 1,
		});
	}
	const packages = await ctx.db
		.query("packages")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.first();
	const payment = await ctx.db
		.query("payments")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.first();
	if (visits.length === 0 && packages === null && payment === null) {
		await ctx.db.delete(client);
		return { storageKeys, tombstoned: false };
	}
	const row = await ctx.db.get(client);
	await ctx.db.replace(client, {
		tenant,
		name: "erased",
		kind: "adult",
		consent: { contact: false, reminders: false },
		source: row?.source ?? "staff",
		createdBy: row?.createdBy ?? "system:erase",
		createdAt: row?.createdAt ?? now,
		updatedAt: now,
		deletedAt: row?.deletedAt ?? now,
		erasedAt: now,
		version: (row?.version ?? 0) + 1,
	});
	return { storageKeys, tombstoned: true };
}
