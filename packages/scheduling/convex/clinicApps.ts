import { v } from "convex/values";
import { formDefinitionSchema } from "../src/clinic/forms";
import { SEED_FORM_TEMPLATES } from "../src/clinic/templates";
import { SEED_ROLES } from "../src/permissions/roles";
import { internalMutation } from "./_generated/server";
import { logChange } from "./changeLog";
import { localeValidator } from "./validators";

/**
 * Brings an app (a tenant) into being, or completes it: the tenant row with its name, kind and
 * settings, the seed roles and the four seeded form templates. Idempotent and non-destructive: a
 * role or form version that exists is left exactly as the app's owners last edited it.
 */
export const ensureApp = internalMutation({
	args: {
		slug: v.string(),
		name: v.string(),
		kind: v.union(v.literal("clinic"), v.literal("club")),
		defaultLocale: localeValidator,
		currency: v.string(),
		address: v.optional(v.string()),
	},
	returns: v.object({ created: v.boolean(), rolesAdded: v.number(), formsAdded: v.number() }),
	handler: async (ctx, args) => {
		const now = Date.now();
		const settings = {
			defaultLocale: args.defaultLocale,
			currency: args.currency,
			address: args.address,
		};
		const found = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();
		let created = false;
		if (found === null) {
			created = true;
			await ctx.db.insert("tenants", {
				slug: args.slug,
				timeZone: "Europe/Bucharest",
				active: true,
				name: args.name,
				kind: args.kind,
				settings,
			});
			await ctx.db.insert("auditEvents", {
				tenant: args.slug,
				at: now,
				actor: "system:setup",
				action: "app.create",
				entity: "app",
				entityId: args.slug,
				summary: "app.create",
			});
		} else if (
			found.name === undefined ||
			found.kind === undefined ||
			found.settings === undefined
		) {
			await ctx.db.patch(found._id, {
				name: found.name ?? args.name,
				kind: found.kind ?? args.kind,
				settings: found.settings ?? settings,
			});
		}
		let rolesAdded = 0;
		for (const role of SEED_ROLES) {
			const has = await ctx.db
				.query("roles")
				.withIndex("by_tenant_name", (q) => q.eq("tenant", args.slug).eq("name", role.name))
				.unique();
			if (has !== null) continue;
			await ctx.db.insert("roles", {
				tenant: args.slug,
				name: role.name,
				description: role.description,
				permissions: [...role.permissions],
				seeded: true,
				updatedAt: now,
				updatedBy: "system:setup",
			});
			rolesAdded += 1;
		}
		let formsAdded = 0;
		for (const form of SEED_FORM_TEMPLATES) {
			const has = await ctx.db
				.query("formDefinitions")
				.withIndex("by_tenant_key_version", (q) =>
					q.eq("tenant", args.slug).eq("key", form.key).eq("version", form.version),
				)
				.unique();
			if (has !== null) continue;
			await ctx.db.insert("formDefinitions", {
				tenant: args.slug,
				key: form.key,
				version: form.version,
				kind: form.kind,
				title: form.title,
				definition: JSON.stringify(form),
				status: "active",
				createdAt: now,
				createdBy: "system:setup",
			});
			formsAdded += 1;
		}
		return { created, rolesAdded, formsAdded };
	},
});

/**
 * Adds options an import learned from data to a stored form version, for the fields that declare
 * `learnOptions`. Options are only ever added, never removed or reordered, so what an owner edited
 * stays; a field that does not learn options is refused. Idempotent.
 */
export const learnFormOptions = internalMutation({
	args: {
		tenant: v.string(),
		definitionKey: v.string(),
		definitionVersion: v.number(),
		field: v.string(),
		values: v.array(v.string()),
	},
	returns: v.object({ added: v.number() }),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("formDefinitions")
			.withIndex("by_tenant_key_version", (q) =>
				q
					.eq("tenant", args.tenant)
					.eq("key", args.definitionKey)
					.eq("version", args.definitionVersion),
			)
			.unique();
		if (row === null) throw new Error("no such form version");
		const parsed = formDefinitionSchema.parse(JSON.parse(row.definition));
		let added = 0;
		const fields = parsed.fields.map((field) => {
			if (field.key !== args.field) return field;
			if (field.learnOptions !== true) throw new Error("field does not learn options");
			const have = new Set(field.options.map((o) => o.value));
			const fresh = args.values.filter((value) => !have.has(value));
			added = fresh.length;
			return {
				...field,
				options: [
					...field.options,
					...fresh.map((value) => ({ value, label: { ro: value, en: value } })),
				],
			};
		});
		if (added === 0) return { added };
		await ctx.db.patch(row._id, {
			definition: JSON.stringify(formDefinitionSchema.parse({ ...parsed, fields })),
		});
		await logChange(ctx, args.tenant, "form", row._id, 1);
		await ctx.db.insert("auditEvents", {
			tenant: args.tenant,
			at: Date.now(),
			actor: "system:import",
			action: "form.define",
			entity: "form",
			entityId: `${args.definitionKey}:${args.definitionVersion}`,
			summary: `form.define; fields: ${args.field}; count: ${added}`,
		});
		return { added };
	},
});
