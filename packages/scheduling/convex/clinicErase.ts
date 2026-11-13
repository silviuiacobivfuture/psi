import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Erasing a client for real (a GDPR request, or the 30-day soft delete running out). It removes
 * everything personal and clinical that hangs on the client: reports and questionnaires, custom
 * values, files (metadata; the caller deletes the bytes at the returned keys), the treating
 * relations, the duplicate keys, and the free text of their visits. What the books need stays,
 * without a person in it: visits (time, column, price, amount paid), packages and payments hang
 * on a client row that is kept as an emptied tombstone. A client with none of those is deleted
 * outright, unless it was imported: that one keeps its old id on the tombstone so a re-import cannot
 * bring it back (`importSupport.clientRef`). The caller records the audit event (no content in it).
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

	const keys = await ctx.db
		.query("clientKeys")
		.withIndex("by_client", (q) => q.eq("client", client))
		.collect();
	for (const row of keys) await ctx.db.delete(row._id);

	const relations = await ctx.db
		.query("treating")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	for (const row of relations) await ctx.db.delete(row._id);

	// What the client wrote about their appointments, and the replies to it, goes with them.
	const said = await ctx.db
		.query("feedback")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	for (const item of said) {
		const replies = await ctx.db
			.query("feedbackReplies")
			.withIndex("by_tenant_feedback", (q) => q.eq("tenant", tenant).eq("feedback", item._id))
			.collect();
		for (const r of replies) await ctx.db.delete(r._id);
		await ctx.db.delete(item._id);
	}
	if (said.length > 0) {
		await ctx.db.insert("auditEvents", {
			tenant,
			at: now,
			actor: "system:erase",
			action: "feedback.erase",
			entity: "feedback",
			entityId: client,
			summary: `feedback.erase; count: ${said.length}`,
		});
	}

	// A blacklist entry keeps its phone, e-mail and reason (the clinic's legitimate interest in not
	// booking someone who was abusive); it stops pointing at the erased client and drops the name.
	const flagged = await ctx.db
		.query("blacklistEntries")
		.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant).eq("client", client))
		.collect();
	for (const row of flagged) {
		await ctx.db.patch(row._id, {
			client: undefined,
			name: undefined,
			updatedAt: now,
			version: row.version + 1,
		});
	}

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
	const row = await ctx.db.get(client);
	// An imported client always leaves a tombstone: without its old id on record, the next run of the
	// import would bring the client back.
	if (visits.length === 0 && packages === null && payment === null && row?.legacyId === undefined) {
		await ctx.db.delete(client);
		return { storageKeys, tombstoned: false };
	}
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
		// The old app's id stays on the tombstone, so a re-run of the import finds it and never brings the client back.
		...(row?.legacyId === undefined ? {} : { legacyId: row.legacyId }),
		version: (row?.version ?? 0) + 1,
	});
	return { storageKeys, tombstoned: true };
}
