import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { requireServer } from "./guard";
import { definitionOf } from "./importSupport";
import { practitionerOf } from "./setupSupport";
import {
	actorValidator,
	encryptedValidator,
	fileKindValidator,
	serverKeyValidator,
} from "./validators";

/**
 * Clinical records (form responses) and file metadata for the staff API. The answers are ONE
 * ciphertext, encrypted by the caller before it arrives and decrypted by the caller after it
 * leaves; nothing here can read them. Every read of a record is itself an audit event.
 */
export const writeRecord = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		definitionKey: v.string(),
		definitionVersion: v.number(),
		client: v.string(),
		visit: v.optional(v.string()),
		practitioner: v.optional(v.string()),
		payload: encryptedValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const definition = await definitionOf(
			ctx,
			args.tenant,
			args.definitionKey,
			args.definitionVersion,
		);
		if (definition === null || definition.status !== "active") return REFUSED("unknown_form");
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null || client.erasedAt !== undefined) return REFUSED("unknown_client");
		const visit =
			args.visit === undefined ? undefined : await owned(ctx, "visits", args.tenant, args.visit);
		if (visit === null) return REFUSED("unknown_visit");
		const practitioner =
			args.practitioner === undefined
				? undefined
				: await practitionerOf(ctx, args.tenant, args.practitioner);
		if (practitioner === undefined && args.practitioner !== undefined)
			return REFUSED("unknown_practitioner");
		const now = Date.now();
		const id = await ctx.db.insert("formResponses", {
			tenant: args.tenant,
			definition: definition._id,
			definitionKey: args.definitionKey,
			definitionVersion: args.definitionVersion,
			client: client._id,
			visit: visit?._id,
			practitioner: practitioner?._id,
			payload: args.payload,
			createdAt: now,
			updatedAt: now,
			createdBy: args.actor.subject,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "record.write",
			entity: "record",
			entityId: id,
			kind: "record",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

export const updateRecord = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		record: v.string(),
		expectedVersion: v.optional(v.number()),
		payload: encryptedValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "formResponses", args.tenant, args.record);
		if (row === null) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		const version = row.version + 1;
		await ctx.db.patch(row._id, { payload: args.payload, updatedAt: Date.now(), version });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "record.write",
			entity: "record",
			entityId: row._id,
			kind: "record",
			version,
			fields: ["payload"],
		});
		return { ok: true as const, version };
	},
});

export const deleteRecord = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, record: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "formResponses", args.tenant, args.record);
		if (row === null) return REFUSED("not_found");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "record.write",
			entity: "record",
			entityId: row._id,
			kind: "record",
			version: row.version + 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});

const out = (r: {
	_id: string;
	definitionKey: string;
	definitionVersion: number;
	client: string;
	visit?: string;
	practitioner?: string;
	payload: { keyVersion: number; iv: string; data: string };
	createdAt: number;
	updatedAt: number;
	version: number;
}) => ({
	id: r._id,
	definitionKey: r.definitionKey,
	definitionVersion: r.definitionVersion,
	client: r.client,
	visit: r.visit,
	practitioner: r.practitioner,
	payload: r.payload,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
	version: r.version,
});

/** One record, ciphertext. The read is audited: who looked at which record. */
export const readRecord = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, record: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "formResponses", args.tenant, args.record);
		if (row === null) return REFUSED("not_found");
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "record.read",
			entity: "record",
			entityId: row._id,
			kind: "audit",
			version: row.version,
		});
		return { ok: true as const, record: out(row) };
	},
});

/** A client's records, ciphertext. One audit event for the list (the client, not every record). */
export const recordsOfClient = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, client: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null) return REFUSED("not_found");
		const rows = await ctx.db
			.query("formResponses")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id))
			.collect();
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "record.read",
			entity: "record",
			entityId: client._id,
			kind: "audit",
			version: client.version ?? 0,
		});
		return { ok: true as const, records: rows.map(out) };
	},
});

// Files (metadata; the bytes are in object storage, already encrypted) -------------------------

const fileFields = {
	kind: fileKindValidator,
	client: v.optional(v.string()),
	title: v.optional(v.string()),
	fileName: v.string(),
	storageKey: v.string(),
	sha256: v.string(),
	sizeBytes: v.number(),
	contentType: v.string(),
	encryption: v.object({ keyVersion: v.number(), iv: v.string() }),
};

export const addFile = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, ...fileFields },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.kind === "client_file" && args.client === undefined) return REFUSED("client_required");
		const client =
			args.client === undefined ? undefined : await owned(ctx, "clients", args.tenant, args.client);
		if (client === null || client?.erasedAt !== undefined) return REFUSED("unknown_client");
		if (!/^[0-9a-f]{64}$/.test(args.sha256) || args.sizeBytes < 0 || args.fileName.trim() === "")
			return REFUSED("invalid");
		const id = await ctx.db.insert("files", {
			tenant: args.tenant,
			kind: args.kind,
			client: client?._id,
			title: args.title,
			fileName: args.fileName,
			storageKey: args.storageKey,
			sha256: args.sha256,
			sizeBytes: args.sizeBytes,
			contentType: args.contentType,
			uploadedBy: args.actor.subject,
			encryption: args.encryption,
			createdAt: Date.now(),
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "file.add",
			entity: "file",
			entityId: id,
			kind: "file",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

/** Removes the metadata and queues the object's key for deletion in the store. */
export const removeFile = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, file: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "files", args.tenant, args.file);
		if (row === null) return REFUSED("not_found");
		await ctx.db.insert("storageOutbox", {
			tenant: args.tenant,
			storageKey: row.storageKey,
			reason: "erasure",
			createdAt: Date.now(),
		});
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "file.remove",
			entity: "file",
			entityId: row._id,
			kind: "file",
			version: row.version + 1,
		});
		return { ok: true as const, storageKey: row.storageKey };
	},
});

export const files = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		client: v.optional(v.string()),
		kind: v.optional(fileKindValidator),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.client !== undefined) {
			const client = await owned(ctx, "clients", args.tenant, args.client);
			if (client === null) return REFUSED("not_found");
			const rows = await ctx.db
				.query("files")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id))
				.collect();
			return { ok: true as const, files: rows.map((f) => ({ ...f, id: f._id })) };
		}
		const rows = await ctx.db
			.query("files")
			.withIndex("by_tenant_kind", (q) =>
				q.eq("tenant", args.tenant).eq("kind", args.kind ?? "notice"),
			)
			.collect();
		return { ok: true as const, files: rows.map((f) => ({ ...f, id: f._id })) };
	},
});
