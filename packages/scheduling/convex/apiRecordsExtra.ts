import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * What the staff API needs on top of apiRecords / apiRoster / apiBuilder (a minimal, additive layer, same rules:
 * server key, the app checked on every id, audit + change log on every write, ciphertext untouched):
 *  - reads of records and files that do NOT write an audit event (the API audits the read it authorizes, and a refused
 *    caller's lookup must leave nothing behind),
 *  - a file that is `pending` until its upload is complete,
 *  - the import runs, derived from the import's own audit events.
 * Leave requests are in apiLeaveExtra, the builder's definitions in apiDefinitionsExtra.
 */

// Records and files, read without an audit event ------------------------------------------------

const recordOut = (r: Doc<"formResponses">) => ({
	id: r._id,
	definitionKey: r.definitionKey,
	definitionVersion: r.definitionVersion,
	client: r.client,
	visit: r.visit,
	practitioner: r.practitioner,
	payload: r.payload,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
	createdBy: r.createdBy,
	version: r.version,
});

export const recordById = query({
	args: { key: serverKeyValidator, tenant: v.string(), record: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "formResponses", args.tenant, args.record);
		return row === null ? REFUSED("not_found") : { ok: true as const, record: recordOut(row) };
	},
});

/** The app's records, ciphertext; narrowed by client and/or form key. */
export const recordsList = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		client: v.optional(v.string()),
		definitionKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		let rows: Doc<"formResponses">[];
		if (args.client !== undefined) {
			const client = await owned(ctx, "clients", args.tenant, args.client);
			if (client === null) return { ok: true as const, records: [] };
			rows = await ctx.db
				.query("formResponses")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id))
				.collect();
		} else if (args.definitionKey !== undefined) {
			rows = await ctx.db
				.query("formResponses")
				.withIndex("by_tenant_definition", (q) =>
					q.eq("tenant", args.tenant).eq("definitionKey", args.definitionKey ?? ""),
				)
				.collect();
		} else {
			rows = await ctx.db
				.query("formResponses")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant))
				.collect();
		}
		return {
			ok: true as const,
			records: rows
				.filter((r) => args.definitionKey === undefined || r.definitionKey === args.definitionKey)
				.map(recordOut),
		};
	},
});

const fileOut = (f: Doc<"files">) => ({
	id: f._id,
	client: f.client,
	fileName: f.fileName,
	storageKey: f.storageKey,
	sizeBytes: f.sizeBytes,
	contentType: f.contentType,
	uploadedBy: f.uploadedBy,
	status: f.status ?? ("ready" as const),
	createdAt: f.createdAt,
	completedAt: f.completedAt,
});

/** Zeros: the hash of an upload nobody has finished (the bytes go straight to object storage). */
const PENDING_SHA = "0".repeat(64);

export const fileById = query({
	args: { key: serverKeyValidator, tenant: v.string(), file: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "files", args.tenant, args.file);
		return row === null || row.kind !== "client_file"
			? REFUSED("not_found")
			: { ok: true as const, file: fileOut(row) };
	},
});

/** Client files of the app (one client's, or all). */
export const clientFiles = query({
	args: { key: serverKeyValidator, tenant: v.string(), client: v.optional(v.string()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		let rows: Doc<"files">[];
		if (args.client !== undefined) {
			const client = await owned(ctx, "clients", args.tenant, args.client);
			if (client === null) return { ok: true as const, files: [] };
			rows = await ctx.db
				.query("files")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id))
				.collect();
		} else {
			rows = await ctx.db
				.query("files")
				.withIndex("by_tenant_kind", (q) => q.eq("tenant", args.tenant).eq("kind", "client_file"))
				.collect();
		}
		return { ok: true as const, files: rows.filter((f) => f.kind === "client_file").map(fileOut) };
	},
});

/** A client file whose upload is signed but not finished. */
export const initFile = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		fileName: v.string(),
		storageKey: v.string(),
		sizeBytes: v.number(),
		contentType: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null || client.erasedAt !== undefined) return REFUSED("unknown_client");
		if (args.sizeBytes < 0 || args.fileName.trim() === "" || args.storageKey === "")
			return REFUSED("invalid");
		const id = await ctx.db.insert("files", {
			tenant: args.tenant,
			kind: "client_file",
			client: client._id,
			fileName: args.fileName,
			storageKey: args.storageKey,
			sha256: PENDING_SHA,
			sizeBytes: args.sizeBytes,
			contentType: args.contentType,
			uploadedBy: args.actor.subject,
			encryption: { keyVersion: 0, iv: "" },
			status: "pending",
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

export const completeFile = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, file: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "files", args.tenant, args.file);
		if (row === null || row.kind !== "client_file") return REFUSED("not_found");
		const version = row.version + 1;
		await ctx.db.patch(row._id, { status: "ready", completedAt: Date.now(), version });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "file.add",
			entity: "file",
			entityId: row._id,
			kind: "file",
			version,
			fields: ["status"],
		});
		return { ok: true as const };
	},
});

/** Only a client file's name moves; the same name again writes nothing. The log records the field, never the name. */
export const renameFile = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		file: v.string(),
		fileName: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "files", args.tenant, args.file);
		if (row === null || row.kind !== "client_file") return REFUSED("not_found");
		const fileName = args.fileName.trim();
		if (fileName === "" || fileName.length > 200) return REFUSED("invalid");
		if (fileName === row.fileName) return { ok: true as const, changed: false as const };
		const version = row.version + 1;
		await ctx.db.patch(row._id, { fileName, version });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "file.rename",
			entity: "file",
			entityId: row._id,
			kind: "file",
			version,
			fields: ["fileName"],
		});
		return { ok: true as const, changed: true as const };
	},
});

// Import runs ----------------------------------------------------------------------------------

/** Batches this close together are one run of the import. */
const RUN_GAP_MS = 10 * 60_000;

/** The import's runs, derived from its audit events (one `import.batch` per table per call; no row content is stored). */
export const importRuns = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const events = (
			await ctx.db
				.query("auditEvents")
				.withIndex("by_tenant_at", (q) => q.eq("tenant", args.tenant))
				.collect()
		).filter((e) => e.action === "import.batch");
		const runs: { startedAt: number; finishedAt: number; counts: Record<string, number> }[] = [];
		for (const e of events) {
			const last = runs.at(-1);
			const count = Number(/count: (\d+)/.exec(e.summary)?.[1] ?? 0);
			const table = e.entityId;
			if (last !== undefined && e.at - last.finishedAt <= RUN_GAP_MS) {
				last.finishedAt = e.at;
				last.counts[table] = (last.counts[table] ?? 0) + count;
			} else {
				runs.push({ startedAt: e.at, finishedAt: e.at, counts: { [table]: count } });
			}
		}
		return { ok: true as const, runs };
	},
});
