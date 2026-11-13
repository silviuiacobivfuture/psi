import { FIELD_GROUPS } from "@psi/scheduling-sdk/contract";
import { z } from "zod";
import type { HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import type { AuditRow, DefinitionRow } from "../store/types";
import { must, paginate } from "./shared";

const MAX_BODY = 64_000;
/** What a definition body must look like, per kind. A field's group is one the permissions govern: a definition cannot invent a way past them. */
const BODIES: Record<string, z.ZodTypeAny> = {
	fields: z.object({
		entity: z.enum(["client", "appointment", "package", "person"]),
		key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
		type: z.enum([
			"text",
			"long_text",
			"number",
			"money",
			"date",
			"choice",
			"multi_choice",
			"yes_no",
			"file",
			"rating",
		]),
		group: z.enum(FIELD_GROUPS),
		required: z.boolean().default(false),
		order: z.number().int().default(0),
		options: z.array(z.string()).optional(),
	}),
	forms: z.object({
		kind: z.enum(["session_report", "questionnaire"]),
		fields: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).max(200),
	}),
};

const definitionOut = (d: DefinitionRow) => ({
	id: d.id,
	kind: d.kind,
	version: d.version,
	name: d.name,
	body: d.body,
	createdAt: d.createdAt,
	updatedAt: d.updatedAt,
});
const auditOut = (a: AuditRow) => ({
	id: a.id,
	at: a.at,
	actor: a.actor,
	action: a.action,
	target: a.target,
	...(a.detail === undefined ? {} : { detail: a.detail }),
});

export const adminHandlers: HandlersOf<
	"audit.list" | "builder.list" | "builder.put" | "builder.remove" | "imports.list"
> = {
	async "audit.list"(ctx) {
		const { action, from, to } = ctx.query;
		const rows = (await ctx.deps.store.c.audit.list(ctx.app))
			.filter(
				(a) =>
					(action === undefined || a.action === action) &&
					(from === undefined || a.at >= from) &&
					(to === undefined || a.at < to),
			)
			.sort((a, b) => b.at - a.at);
		const page = paginate(rows, ctx.query.limit, ctx.query.cursor);
		return { ...page, items: page.items.map(auditOut) };
	},

	async "builder.list"(ctx) {
		const kind = ctx.params.kind;
		return {
			items: (await ctx.deps.store.c.definitions.list(ctx.app, { eq: { kind } }))
				.sort((a, b) => a.id.localeCompare(b.id))
				.map(definitionOut),
		};
	},

	async "builder.put"(ctx) {
		const kind = ctx.params.kind;
		const id = String(ctx.params.id);
		if (JSON.stringify(ctx.body.body).length > MAX_BODY)
			throw fail("invalid", "the definition is too large", { field: "body" });
		const shape = BODIES[kind];
		const parsed =
			shape === undefined
				? { success: true as const, data: ctx.body.body }
				: shape.safeParse(ctx.body.body);
		if (!parsed.success)
			throw fail("invalid", "the definition does not match its kind", {
				fields: parsed.error.issues.map((i) => i.path.join(".")),
			});
		const held = await ctx.deps.store.c.definitions.get(ctx.app, id);
		if (held !== undefined && held.kind !== kind)
			throw fail("conflict", "the id belongs to another kind", { kind: held.kind });
		// Each replace is a new version: a record keeps the version of the form it was written with.
		const row: DefinitionRow = {
			id,
			app: ctx.app,
			kind,
			version: (held?.version ?? 0) + 1,
			name: ctx.body.name,
			body: ctx.body.body,
			createdAt: held?.createdAt ?? ctx.now,
			updatedAt: ctx.now,
		};
		if (held === undefined) await ctx.deps.store.c.definitions.insert(row);
		else await ctx.deps.store.c.definitions.replace(row);
		ctx.note({ kind, version: row.version });
		return definitionOut(row);
	},

	async "builder.remove"(ctx) {
		const row = await must(
			ctx.deps.store.c.definitions,
			ctx.app,
			String(ctx.params.id),
			"definition",
		);
		if (row.kind !== ctx.params.kind) throw fail("not_found", "definition not found");
		const used =
			row.kind === "forms" &&
			(await ctx.deps.store.c.records.list(ctx.app, { eq: { formId: row.id } })).length > 0;
		if (used) throw fail("conflict", "records were written with this form", { reason: "in_use" });
		await ctx.deps.store.c.definitions.remove(ctx.app, row.id);
		return { ok: true as const };
	},

	async "imports.list"(ctx) {
		return {
			items: (await ctx.deps.store.c.imports.list(ctx.app))
				.sort((a, b) => b.startedAt - a.startedAt)
				.map((i) => ({
					id: i.id,
					source: i.source,
					status: i.status,
					counts: i.counts,
					startedAt: i.startedAt,
					...(i.finishedAt === undefined ? {} : { finishedAt: i.finishedAt }),
				})),
		};
	},
};
