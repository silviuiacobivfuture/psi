import { v } from "convex/values";
import {
	type ClientInput,
	duplicatesInFile,
	IMPORT_MAX_ROWS,
	identityKeys,
	NOTE_MAX,
} from "../src/domain/clients";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { eraseClinicData } from "./clinicErase";
import { requireServer } from "./guard";
import { ensureTenantRow, SLUG } from "./setupSupport";
import { actorValidator, audienceValidator, serverKeyValidator } from "./validators";

/**
 * The team's client records and the import of existing customers. The CSV is read and checked
 * outside (`readClients`); here the rows are stored or, with `commit: false`, only reported: a dry
 * run writes nothing. A row whose phone, e-mail (or guardian's contact with the child's name)
 * matches a stored client, or an earlier row of the same file, is a duplicate and is skipped, so
 * sending the same file twice creates nothing the second time.
 */
const rowValidator = v.object({
	line: v.number(),
	client: v.object({
		name: v.string(),
		kind: audienceValidator,
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
		guardian: v.optional(
			v.object({ name: v.string(), phone: v.optional(v.string()), email: v.optional(v.string()) }),
		),
		staffNotes: v.optional(v.string()),
		consent: v.object({ contact: v.boolean(), reminders: v.boolean() }),
	}),
});

async function storeMatch(
	ctx: MutationCtx,
	tenant: string,
	client: ClientInput,
): Promise<"phone" | "email" | "guardian" | undefined> {
	for (const key of identityKeys(client)) {
		const hit = await ctx.db
			.query("clientKeys")
			.withIndex("by_tenant_key", (q) => q.eq("tenant", tenant).eq("key", key))
			.first();
		if (hit !== null)
			return key.startsWith("p:") ? "phone" : key.startsWith("e:") ? "email" : "guardian";
	}
	return undefined;
}

async function insertClient(
	ctx: MutationCtx,
	tenant: string,
	client: ClientInput,
	source: "import" | "staff",
	actor: string,
): Promise<Id<"clients">> {
	const now = Date.now();
	const id = await ctx.db.insert("clients", {
		tenant,
		name: client.name,
		kind: client.kind,
		...(client.phone === undefined ? {} : { phone: client.phone }),
		...(client.email === undefined ? {} : { email: client.email }),
		...(client.guardian === undefined ? {} : { guardian: client.guardian }),
		...(client.staffNotes === undefined ? {} : { staffNotes: client.staffNotes }),
		consent: client.consent,
		source,
		createdBy: actor,
		createdAt: now,
		updatedAt: now,
	});
	for (const key of identityKeys(client))
		await ctx.db.insert("clientKeys", { tenant, key, client: id });
	return id;
}

const sound = (c: ClientInput): boolean =>
	c.name.length > 0 &&
	(c.staffNotes ?? "").length <= NOTE_MAX &&
	((c.kind === "adult" && (c.phone !== undefined || c.email !== undefined)) ||
		(c.kind !== "adult" && c.guardian !== undefined));

export const importClients = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		rows: v.array(rowValidator),
		commit: v.boolean(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (
			!SLUG.test(args.tenant) ||
			args.rows.length > IMPORT_MAX_ROWS ||
			!args.rows.every((r) => sound(r.client))
		) {
			return { ok: false as const, reason: "invalid" as const };
		}
		const inFile = duplicatesInFile(args.rows);
		const skip = new Set(inFile.map((d) => d.line));
		const duplicates = [...inFile];
		const fresh: typeof args.rows = [];
		for (const r of args.rows) {
			if (skip.has(r.line)) continue;
			const by = await storeMatch(ctx, args.tenant, r.client);
			if (by === undefined) fresh.push(r);
			else duplicates.push({ line: r.line, with: "store", by });
		}
		if (args.commit && fresh.length > 0) {
			await ensureTenantRow(ctx, args.tenant);
			for (const r of fresh)
				await insertClient(ctx, args.tenant, r.client, "import", args.actor.subject);
		}
		return {
			ok: true as const,
			committed: args.commit,
			total: args.rows.length,
			created: fresh.length,
			duplicates: duplicates.sort((a, b) => a.line - b.line),
		};
	},
});

/** Adds one client by hand (the same checks); a duplicate is refused with what it matches. */
export const createClient = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		client: rowValidator.fields.client,
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!SLUG.test(args.tenant) || !sound(args.client))
			return { ok: false as const, reason: "invalid" as const };
		if ((await storeMatch(ctx, args.tenant, args.client)) !== undefined)
			return { ok: false as const, reason: "duplicate" as const };
		await ensureTenantRow(ctx, args.tenant);
		return {
			ok: true as const,
			id: await insertClient(ctx, args.tenant, args.client, "staff", args.actor.subject),
		};
	},
});

/** Clients of the tenant whose name starts with `prefix` (staff search), at most 50. */
export const clients = query({
	args: { key: serverKeyValidator, tenant: v.string(), prefix: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const prefix = args.prefix.trim();
		const rows = await ctx.db
			.query("clients")
			.withIndex("by_tenant_name", (q) =>
				prefix === ""
					? q.eq("tenant", args.tenant)
					: q.eq("tenant", args.tenant).gte("name", prefix).lt("name", `${prefix}￿`),
			)
			.filter((q) => q.eq(q.field("deletedAt"), undefined))
			.take(50);
		return {
			ok: true as const,
			clients: rows.map((c) => ({
				id: c._id,
				name: c.name,
				kind: c.kind,
				...(c.phone === undefined ? {} : { phone: c.phone }),
				...(c.email === undefined ? {} : { email: c.email }),
				...(c.guardian === undefined ? {} : { guardian: c.guardian }),
				...(c.staffNotes === undefined ? {} : { staffNotes: c.staffNotes }),
				consent: c.consent,
			})),
		};
	},
});

/** Links a request or appointment to a client record of the same tenant. */
export const linkClient = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		reference: v.string(),
		client: v.string(),
		actor: actorValidator,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const appt = await ctx.db
			.query("appointments")
			.withIndex("by_reference", (q) => q.eq("reference", args.reference))
			.unique();
		const id = ctx.db.normalizeId("clients", args.client);
		const client = id === null ? null : await ctx.db.get(id);
		if (
			appt === null ||
			appt.tenant !== args.tenant ||
			client === null ||
			client.tenant !== args.tenant
		) {
			return { ok: false as const, reason: "not_found" as const };
		}
		await ctx.db.patch(appt._id, { client: client._id, updatedAt: Date.now() });
		return { ok: true as const };
	},
});

/** Erases a client record and its keys, and unlinks its appointments (the erasure a person asks for). */
export const eraseClient = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), client: v.string(), actor: actorValidator },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const id = ctx.db.normalizeId("clients", args.client);
		const client = id === null ? null : await ctx.db.get(id);
		if (client === null || client.tenant !== args.tenant)
			return { ok: false as const, reason: "not_found" as const };
		const keys = await ctx.db
			.query("clientKeys")
			.withIndex("by_client", (q) => q.eq("client", client._id))
			.collect();
		for (const k of keys) await ctx.db.delete(k._id);
		const linked = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) => q.eq("tenant", args.tenant))
			.collect();
		let unlinked = 0;
		for (const a of linked.filter((x) => x.client === client._id)) {
			await ctx.db.patch(a._id, { client: undefined });
			unlinked += 1;
		}
		const erased = await eraseClinicData(ctx, args.tenant, client._id, Date.now());
		return { ok: true as const, unlinked, storageKeys: erased.storageKeys };
	},
});
