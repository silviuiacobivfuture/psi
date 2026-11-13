import { v } from "convex/values";
import {
	actionDefinitionSchema,
	customFieldSchema,
	customValueStorage,
	parseDefinition,
	viewDefinitionSchema,
} from "../src/clinic/builder";
import { formDefinitionSchema, valueSchemaFor } from "../src/clinic/forms";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { owned, REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import { actorValidator, encryptedValidator, serverKeyValidator } from "./validators";

/**
 * What an app's owners build, for the staff API: form templates (versioned: a new definition is a
 * new version, an old response keeps its own), custom fields and their values (clinical-group values
 * arrive as ciphertext), and view and action definitions (validated JSON, versioned). A definition
 * is checked with the same zod schemas the console uses; one that does not parse is refused.
 */
export const defineForm = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		definition: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const parsed = parseDefinition(formDefinitionSchema, args.definition);
		if (!parsed.ok) return { ok: false as const, reason: "invalid", paths: parsed.paths };
		const def = parsed.value;
		const rows = await ctx.db
			.query("formDefinitions")
			.withIndex("by_tenant_key_version", (q) => q.eq("tenant", args.tenant).eq("key", def.key))
			.collect();
		const version = rows.reduce((max, r) => Math.max(max, r.version), 0) + 1;
		const id = await ctx.db.insert("formDefinitions", {
			tenant: args.tenant,
			key: def.key,
			version,
			kind: def.kind,
			title: def.title,
			definition: JSON.stringify({ ...def, version }),
			status: "active",
			createdAt: Date.now(),
			createdBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "form.define",
			entity: "form",
			entityId: id,
			kind: "form",
			version,
		});
		return { ok: true as const, id, version };
	},
});

export const retireForm = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, form: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "formDefinitions", args.tenant, args.form);
		if (row === null) return REFUSED("not_found");
		if (row.status === "retired") return { ok: true as const, changed: false as const };
		await ctx.db.patch(row._id, { status: "retired" });
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "form.define",
			entity: "form",
			entityId: row._id,
			kind: "form",
			version: row.version,
			fields: ["status"],
		});
		return { ok: true as const, changed: true as const };
	},
});

export const forms = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("formDefinitions")
			.withIndex("by_tenant_key_version", (q) => q.eq("tenant", args.tenant))
			.collect();
		return {
			ok: true as const,
			forms: rows.map((r) => ({
				id: r._id,
				key: r.key,
				version: r.version,
				kind: r.kind,
				title: r.title,
				status: r.status,
				definition: r.definition,
			})),
		};
	},
});

export const setCustomField = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		definition: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const parsed = parseDefinition(customFieldSchema, args.definition);
		if (!parsed.ok) return { ok: false as const, reason: "invalid", paths: parsed.paths };
		const def = parsed.value;
		const existing = await ctx.db
			.query("customFieldDefs")
			.withIndex("by_tenant_entity_key", (q) =>
				q.eq("tenant", args.tenant).eq("entity", def.entity).eq("key", def.key),
			)
			.unique();
		const fields = {
			group: def.group,
			active: true,
			definition: JSON.stringify(def),
			updatedAt: Date.now(),
			updatedBy: args.actor.subject,
		};
		const id =
			existing === null
				? await ctx.db.insert("customFieldDefs", {
						tenant: args.tenant,
						entity: def.entity,
						key: def.key,
						...fields,
					})
				: existing._id;
		if (existing !== null) await ctx.db.patch(id, fields);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: id,
			kind: "builder",
			version: 1,
			fields: ["customField"],
		});
		return { ok: true as const, id };
	},
});

export const removeCustomField = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, field: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "customFieldDefs", args.tenant, args.field);
		if (row === null) return REFUSED("not_found");
		await ctx.db.patch(row._id, {
			active: false,
			updatedAt: Date.now(),
			updatedBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: row._id,
			kind: "builder",
			version: 1,
			fields: ["customField"],
		});
		return { ok: true as const };
	},
});

/** Views and actions: a new definition of a key is its next version; the older ones go inactive. */
export const setDefinition = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		kind: v.union(v.literal("view"), v.literal("action")),
		json: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const parsed =
			args.kind === "view"
				? parseDefinition(viewDefinitionSchema, args.json)
				: parseDefinition(actionDefinitionSchema, args.json);
		if (!parsed.ok) return { ok: false as const, reason: "invalid", paths: parsed.paths };
		const defKey = parsed.value.key;
		const rows = await ctx.db
			.query("builderDefs")
			.withIndex("by_tenant_kind_key", (q) =>
				q.eq("tenant", args.tenant).eq("kind", args.kind).eq("key", defKey),
			)
			.collect();
		for (const r of rows) if (r.active) await ctx.db.patch(r._id, { active: false });
		const version = rows.reduce((max, r) => Math.max(max, r.version), 0) + 1;
		const id = await ctx.db.insert("builderDefs", {
			tenant: args.tenant,
			kind: args.kind,
			key: defKey,
			version,
			json: JSON.stringify(parsed.value),
			active: true,
			updatedAt: Date.now(),
			updatedBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: id,
			kind: "builder",
			version,
			fields: [args.kind],
		});
		return { ok: true as const, id, version };
	},
});

export const deactivateDefinition = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		definition: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "builderDefs", args.tenant, args.definition);
		if (row === null) return REFUSED("not_found");
		await ctx.db.patch(row._id, {
			active: false,
			updatedAt: Date.now(),
			updatedBy: args.actor.subject,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: row._id,
			kind: "builder",
			version: row.version,
			fields: ["active"],
		});
		return { ok: true as const };
	},
});

export const definitions = query({
	args: { key: serverKeyValidator, tenant: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const defs = await ctx.db
			.query("builderDefs")
			.withIndex("by_tenant_kind_key", (q) => q.eq("tenant", args.tenant))
			.collect();
		const fields = await ctx.db
			.query("customFieldDefs")
			.withIndex("by_tenant_entity_key", (q) => q.eq("tenant", args.tenant))
			.collect();
		return {
			ok: true as const,
			definitions: defs
				.filter((d) => d.active)
				.map((d) => ({ id: d._id, kind: d.kind, key: d.key, version: d.version, json: d.json })),
			customFields: fields
				.filter((f) => f.active)
				.map((f) => ({
					id: f._id,
					entity: f.entity,
					key: f.key,
					group: f.group,
					definition: f.definition,
				})),
		};
	},
});

async function entityExists(
	ctx: QueryCtx,
	tenant: string,
	entity: string,
	id: string,
): Promise<boolean> {
	if (entity === "client") return (await owned(ctx, "clients", tenant, id)) !== null;
	if (entity === "appointment") return (await owned(ctx, "visits", tenant, id)) !== null;
	if (entity === "package") return (await owned(ctx, "packages", tenant, id)) !== null;
	if (entity === "staff")
		return (
			(await owned(ctx, "staffMembers", tenant, id)) !== null ||
			(await practitionerOf(ctx, tenant, id)) !== undefined
		);
	return false;
}

/** Sets a custom field's value on an entity. The clinical group's values must arrive as ciphertext; the rest as JSON text. */
export const setValue = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		entity: v.union(
			v.literal("client"),
			v.literal("appointment"),
			v.literal("package"),
			v.literal("staff"),
		),
		entityId: v.string(),
		fieldKey: v.string(),
		plain: v.optional(v.string()),
		enc: v.optional(encryptedValidator),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const def = await ctx.db
			.query("customFieldDefs")
			.withIndex("by_tenant_entity_key", (q) =>
				q.eq("tenant", args.tenant).eq("entity", args.entity).eq("key", args.fieldKey),
			)
			.unique();
		if (def === null || !def.active) return REFUSED("unknown_field");
		if (!(await entityExists(ctx, args.tenant, args.entity, args.entityId)))
			return REFUSED("unknown_entity");
		const storage = customValueStorage(def.group);
		if (
			storage === "encrypted"
				? args.enc === undefined || args.plain !== undefined
				: args.plain === undefined || args.enc !== undefined
		) {
			return REFUSED(storage === "encrypted" ? "must_be_encrypted" : "must_be_plain");
		}
		if (args.plain !== undefined) {
			const parsed = parseDefinition(customFieldSchema, def.definition);
			let value: unknown;
			try {
				value = JSON.parse(args.plain);
			} catch {
				return REFUSED("invalid");
			}
			if (!parsed.ok || !valueSchemaFor(parsed.value).safeParse(value).success)
				return REFUSED("invalid");
		}
		const existing = (
			await ctx.db
				.query("customValues")
				.withIndex("by_tenant_entity", (q) =>
					q.eq("tenant", args.tenant).eq("entity", args.entity).eq("entityId", args.entityId),
				)
				.collect()
		).find((x) => x.fieldKey === args.fieldKey);
		const fields = { group: def.group, plain: args.plain, enc: args.enc, updatedAt: Date.now() };
		const id: Doc<"customValues">["_id"] =
			existing === undefined
				? await ctx.db.insert("customValues", {
						tenant: args.tenant,
						entity: args.entity,
						entityId: args.entityId,
						fieldKey: args.fieldKey,
						...fields,
					})
				: existing._id;
		if (existing !== undefined) await ctx.db.patch(id, fields);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: id,
			kind: "builder",
			version: 1,
			fields: ["customValue"],
		});
		return { ok: true as const, id };
	},
});

export const values = query({
	args: { key: serverKeyValidator, tenant: v.string(), entity: v.string(), entityId: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const rows = await ctx.db
			.query("customValues")
			.withIndex("by_tenant_entity", (q) =>
				q.eq("tenant", args.tenant).eq("entity", args.entity).eq("entityId", args.entityId),
			)
			.collect();
		return {
			ok: true as const,
			values: rows.map((r) => ({
				fieldKey: r.fieldKey,
				group: r.group,
				plain: r.plain,
				enc: r.enc,
			})),
		};
	},
});
