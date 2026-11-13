import { v } from "convex/values";
import { type FormDefinition, formDefinitionSchema } from "../src/clinic/forms";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { REFUSED, record } from "./apiSupport";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * The builder's definitions as the API takes them: all five kinds, the API's own id and body, every replace the next
 * version. A form is also written as a form template (what records are written against); seeded templates are listed
 * as the API's own shape. Templates and definitions share one version sequence per key.
 */
// Definitions as the API takes them ------------------------------------------------------------

const labelArg = v.object({ ro: v.string(), en: v.string() });
const DEFINITION_KINDS = ["fields", "forms", "views", "actions", "catalogues"] as const;
const FORM_KEY = /^[a-z][a-z0-9-]{1,40}$/;

/** The API's form body (`{kind, fields: [names]}`) as a form template: every named field is a clinical long text. */
function templateOf(
	key: string,
	version: number,
	name: { ro: string; en: string },
	body: unknown,
): FormDefinition | undefined {
	const b = typeof body === "object" && body !== null ? body : {};
	const kind = Reflect.get(b, "kind");
	const names = Reflect.get(b, "fields");
	if (!Array.isArray(names) || names.length === 0) return undefined;
	const parsed = formDefinitionSchema.safeParse({
		key,
		version,
		kind: kind === "questionnaire" ? "questionnaire" : "report",
		title: name,
		fields: names.map((n) => ({
			key: n,
			label: { ro: String(n), en: String(n) },
			type: "longtext",
			options: [],
			required: false,
			group: "clinical",
		})),
	});
	return parsed.success ? parsed.data : undefined;
}

const parseBody = (text: string): Record<string, unknown> => {
	try {
		const out: unknown = JSON.parse(text);
		return typeof out === "object" && out !== null && !Array.isArray(out)
			? Object.fromEntries(Object.entries(out))
			: {};
	} catch {
		return {};
	}
};

const defOut = (d: Doc<"apiDefinitions">) => ({
	id: d.key,
	kind: d.kind,
	version: d.version,
	name: d.name,
	body: d.body,
	createdAt: d.createdAt,
	updatedAt: d.updatedAt,
});

/** A form template that was never put through the API (a seeded one): shown as the API's own shape. */
function seededOut(rows: Doc<"formDefinitions">[]) {
	const latest = rows.filter((r) => r.status === "active").sort((a, b) => b.version - a.version)[0];
	if (latest === undefined) return undefined;
	const names = parseBody(latest.definition).fields;
	return {
		id: latest.key,
		kind: "forms",
		version: latest.version,
		name: latest.title,
		body: JSON.stringify({
			kind: latest.kind === "questionnaire" ? "questionnaire" : "session_report",
			fields: Array.isArray(names)
				? names.map((f) => (typeof f === "object" && f !== null ? Reflect.get(f, "key") : f))
				: [],
		}),
		createdAt: latest.createdAt,
		updatedAt: latest.createdAt,
	};
}

async function allDefinitions(ctx: QueryCtx, tenant: string) {
	const own = await ctx.db
		.query("apiDefinitions")
		.withIndex("by_tenant_key", (q) => q.eq("tenant", tenant))
		.collect();
	const forms = await ctx.db
		.query("formDefinitions")
		.withIndex("by_tenant_key_version", (q) => q.eq("tenant", tenant))
		.collect();
	const byKey = new Map<string, Doc<"formDefinitions">[]>();
	for (const f of forms) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
	const have = new Set(own.map((d) => d.key));
	const seeded = [...byKey.entries()]
		.filter(([key]) => !have.has(key))
		.map(([, rows]) => seededOut(rows))
		.filter((d) => d !== undefined);
	return [...own.map(defOut), ...seeded];
}

export const listDefinitions = query({
	args: { key: serverKeyValidator, tenant: v.string(), id: v.optional(v.string()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const all = await allDefinitions(ctx, args.tenant);
		return {
			ok: true as const,
			definitions: args.id === undefined ? all : all.filter((d) => d.id === args.id),
		};
	},
});

/** Creates or replaces a definition; every replace is the next version. A form is also written as a form template. */
export const putDefinition = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		id: v.string(),
		kind: v.string(),
		name: labelArg,
		body: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (!(DEFINITION_KINDS as readonly string[]).includes(args.kind)) return REFUSED("invalid");
		const held = await ctx.db
			.query("apiDefinitions")
			.withIndex("by_tenant_key", (q) => q.eq("tenant", args.tenant).eq("key", args.id))
			.unique();
		const templates = await ctx.db
			.query("formDefinitions")
			.withIndex("by_tenant_key_version", (q) => q.eq("tenant", args.tenant).eq("key", args.id))
			.collect();
		if (
			(held !== null && held.kind !== args.kind) ||
			(templates.length > 0 && args.kind !== "forms")
		)
			return REFUSED("exists");
		const version = Math.max(held?.version ?? 0, ...templates.map((t) => t.version)) + 1;
		const now = Date.now();
		if (args.kind === "forms") {
			if (!FORM_KEY.test(args.id)) return REFUSED("invalid");
			const template = templateOf(args.id, version, args.name, parseBody(args.body));
			if (template !== undefined) {
				const formId = await ctx.db.insert("formDefinitions", {
					tenant: args.tenant,
					key: args.id,
					version,
					kind: template.kind,
					title: template.title,
					definition: JSON.stringify(template),
					status: "active",
					createdAt: now,
					createdBy: args.actor.subject,
				});
				await record(ctx, {
					tenant: args.tenant,
					actor: args.actor.subject,
					action: "form.define",
					entity: "form",
					entityId: formId,
					kind: "form",
					version,
				});
			}
		}
		const fields = { name: args.name, body: args.body, version, updatedAt: now };
		let id: Doc<"apiDefinitions">["_id"];
		if (held === null) {
			id = await ctx.db.insert("apiDefinitions", {
				tenant: args.tenant,
				kind: args.kind,
				key: args.id,
				createdAt: now,
				...fields,
			});
		} else {
			id = held._id;
			await ctx.db.patch(id, fields);
		}
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
		return { ok: true as const, version, createdAt: held?.createdAt ?? now, updatedAt: now };
	},
});

export const removeDefinition = mutation({
	args: { key: serverKeyValidator, tenant: v.string(), actor: actorValidator, id: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const held = await ctx.db
			.query("apiDefinitions")
			.withIndex("by_tenant_key", (q) => q.eq("tenant", args.tenant).eq("key", args.id))
			.unique();
		const templates = await ctx.db
			.query("formDefinitions")
			.withIndex("by_tenant_key_version", (q) => q.eq("tenant", args.tenant).eq("key", args.id))
			.collect();
		if (held === null && templates.length === 0) return REFUSED("not_found");
		// Records keep the version they were written with: a template is retired, never deleted.
		for (const t of templates)
			if (t.status === "active") await ctx.db.patch(t._id, { status: "retired" });
		if (held !== null) await ctx.db.delete(held._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "builder.change",
			entity: "builder",
			entityId: held?._id ?? args.id,
			kind: "builder",
			version: (held?.version ?? 0) + 1,
			fields: ["deleted"],
		});
		return { ok: true as const };
	},
});
