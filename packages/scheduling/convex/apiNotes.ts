import { v } from "convex/values";
import { planChange } from "../src/clinic/change";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { requireServer } from "./guard";
import { noteCategoryValidator } from "./tables/clinicNotes";
import { actorValidator, encryptedValidator, serverKeyValidator } from "./validators";

/**
 * Staff notes about a client, for the staff API. A `clinic` note is ciphertext (`textEnc`, sealed by the service; Convex
 * never decrypts it) and carries no `text`; every other category is plain `text` and carries no `textEnc`. A note does not
 * cross the clinical line: its category may change only among the plain ones. Reads write nothing (the API audits the
 * clinical read it authorizes); every change appends one audit event with the names of the fields, never a word of the note.
 */
const MAX_CHARS = 5_000;
const view = (n: Doc<"clientNotes">) => ({ ...n, id: n._id });
const clinical = (category: string): boolean => category === "clinic";

/** Whether the note's content is in the right shape for its category: the text of a plain one, the ciphertext of a clinical one. */
function shaped(category: string, text: string | undefined, enc: unknown): boolean {
	if (clinical(category)) return text === undefined && enc !== undefined;
	return enc === undefined && text !== undefined && text.trim() !== "" && text.length <= MAX_CHARS;
}

export const list = query({
	args: { key: serverKeyValidator, tenant: v.string(), client: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null) return REFUSED("not_found");
		const rows = await ctx.db
			.query("clientNotes")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", client._id))
			.take(2_001);
		if (rows.length > 2_000) return REFUSED("too_many");
		return { ok: true as const, notes: rows.map(view) };
	},
});

export const byId = query({
	args: { key: serverKeyValidator, tenant: v.string(), note: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("clientNotes", args.note);
		const row = id === null ? null : await ctx.db.get(id);
		return row === null || row.tenant !== args.tenant
			? REFUSED("not_found")
			: { ok: true as const, note: view(row) };
	},
});

export const create = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		category: noteCategoryValidator,
		text: v.optional(v.string()),
		textEnc: v.optional(encryptedValidator),
		pinned: v.boolean(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client = await owned(ctx, "clients", args.tenant, args.client);
		if (client === null || client.erasedAt !== undefined) return REFUSED("unknown_client");
		if (!shaped(args.category, args.text, args.textEnc)) return REFUSED("invalid");
		const now = Date.now();
		const id = await ctx.db.insert("clientNotes", {
			tenant: args.tenant,
			client: client._id,
			category: args.category,
			...(args.text === undefined ? {} : { text: args.text }),
			...(args.textEnc === undefined ? {} : { textEnc: args.textEnc }),
			pinned: args.pinned,
			author: args.actor.subject,
			createdAt: now,
			updatedAt: now,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "note.create",
			entity: "note",
			entityId: id,
			kind: "client",
			version: 1,
		});
		return { ok: true as const, id };
	},
});

export const update = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		note: v.string(),
		expectedVersion: v.optional(v.number()),
		patch: v.object({
			category: v.optional(noteCategoryValidator),
			text: v.optional(v.string()),
			textEnc: v.optional(encryptedValidator),
			pinned: v.optional(v.boolean()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("clientNotes", args.note);
		const row = id === null ? null : await ctx.db.get(id);
		if (row === null || row.tenant !== args.tenant) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		const { category, text, textEnc, pinned } = args.patch;
		// A note stays on its side of the clinical line.
		if (category !== undefined && clinical(category) !== clinical(row.category))
			return REFUSED("invalid");
		const next = category ?? row.category;
		const content = text !== undefined || textEnc !== undefined;
		if (content && !shaped(next, text, textEnc)) return REFUSED("invalid");
		const patch = {
			...(category === undefined ? {} : { category }),
			...(text === undefined ? {} : { text }),
			...(textEnc === undefined ? {} : { textEnc }),
			...(pinned === undefined ? {} : { pinned }),
		};
		const change = planChange(row, patch);
		if (!change.changed)
			return { ok: true as const, changed: false as const, version: row.version };
		await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now(), version: change.nextVersion });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "note.update",
			entity: "note",
			entityId: row._id,
			kind: "client",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const, version: change.nextVersion };
	},
});

export const remove = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, note: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("clientNotes", args.note);
		const row = id === null ? null : await ctx.db.get(id);
		if (row === null || row.tenant !== args.tenant) return REFUSED("not_found");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "note.delete",
			entity: "note",
			entityId: row._id,
			kind: "client",
			version: row.version + 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});
