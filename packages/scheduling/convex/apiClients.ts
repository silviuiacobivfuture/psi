import { v } from "convex/values";
import { planChange, planTreatingChange } from "../src/clinic/change";
import { visibilityOf } from "../src/clinic/clients";
import { type ClientInput, identityKeys } from "../src/domain/clients";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { changeStanding } from "./clinicStanding";
import { requireServer } from "./guard";
import { practitionerOf } from "./setupSupport";
import {
	actorValidator,
	audienceValidator,
	clientStatusValidator,
	encryptedValidator,
	serverKeyValidator,
} from "./validators";

/**
 * Clients for the staff API. Plain contact and demographics are plain; the reason for coming, the
 * diagnosis and health notes arrive and leave as ciphertext (never decrypted here). Who treats a
 * client changes only through `setTreating`, asked for by a person.
 */
const guardian = v.object({
	name: v.string(),
	phone: v.optional(v.string()),
	email: v.optional(v.string()),
	relationship: v.optional(v.string()),
	occupation: v.optional(v.string()),
});

const editable = {
	name: v.string(),
	kind: audienceValidator,
	phone: v.optional(v.string()),
	email: v.optional(v.string()),
	guardian: v.optional(guardian),
	consent: v.object({ contact: v.boolean(), reminders: v.boolean() }),
	status: v.optional(clientStatusValidator),
	gender: v.optional(v.string()),
	birthDate: v.optional(v.string()),
	occupation: v.optional(v.string()),
	referralSource: v.optional(v.string()),
	location: v.optional(v.string()),
	firstTherapy: v.optional(v.boolean()),
	staffNotes: v.optional(v.string()),
	mainReasonEnc: v.optional(encryptedValidator),
	diagnosisEnc: v.optional(encryptedValidator),
	healthNotesEnc: v.optional(encryptedValidator),
};
const patchValidator = v.object({
	name: v.optional(v.string()),
	kind: v.optional(audienceValidator),
	phone: v.optional(v.string()),
	email: v.optional(v.string()),
	guardian: v.optional(guardian),
	consent: v.optional(editable.consent),
	status: v.optional(clientStatusValidator),
	gender: v.optional(v.string()),
	birthDate: v.optional(v.string()),
	occupation: v.optional(v.string()),
	referralSource: v.optional(v.string()),
	location: v.optional(v.string()),
	firstTherapy: v.optional(v.boolean()),
	staffNotes: v.optional(v.string()),
	mainReasonEnc: v.optional(encryptedValidator),
	diagnosisEnc: v.optional(encryptedValidator),
	healthNotesEnc: v.optional(encryptedValidator),
});
const CLEARABLE = [
	"phone",
	"email",
	"guardian",
	"gender",
	"birthDate",
	"occupation",
	"referralSource",
	"location",
	"firstTherapy",
	"staffNotes",
	"mainReasonEnc",
	"diagnosisEnc",
	"healthNotesEnc",
] as const;

async function writeKeys(ctx: MutationCtx, tenant: string, row: Doc<"clients">): Promise<void> {
	for (const k of await ctx.db
		.query("clientKeys")
		.withIndex("by_client", (q) => q.eq("client", row._id))
		.collect()) {
		await ctx.db.delete(k._id);
	}
	const input: ClientInput = {
		name: row.name,
		kind: row.kind,
		consent: row.consent,
		...(row.phone === undefined ? {} : { phone: row.phone }),
		...(row.email === undefined ? {} : { email: row.email }),
		...(row.guardian === undefined ? {} : { guardian: row.guardian }),
	};
	for (const key of identityKeys(input)) {
		await ctx.db.insert("clientKeys", { tenant, key, client: row._id });
	}
}

const view = (c: Doc<"clients">) => ({ ...c, id: c._id, visibility: visibilityOf(c) });

export const create = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.object(editable),
		practitioners: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.client.name.trim() === "") return REFUSED("invalid");
		const treating = [];
		for (const p of args.practitioners ?? []) {
			const found = await practitionerOf(ctx, args.tenant, p);
			if (found === undefined) return REFUSED("unknown_practitioner");
			treating.push(found._id);
		}
		const now = Date.now();
		const id = await ctx.db.insert("clients", {
			...args.client,
			tenant: args.tenant,
			source: "staff",
			createdBy: args.actor.subject,
			createdAt: now,
			updatedAt: now,
			version: 1,
		});
		const row = await ctx.db.get(id);
		if (row !== null) await writeKeys(ctx, args.tenant, row);
		for (const practitioner of treating) {
			await ctx.db.insert("treating", {
				tenant: args.tenant,
				practitioner,
				client: id,
				createdAt: now,
				createdBy: args.actor.subject,
			});
		}
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "client.create",
			entity: "client",
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
		client: v.string(),
		expectedVersion: v.optional(v.number()),
		patch: patchValidator,
		clear: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "clients", args.tenant, args.client);
		if (row === null || row.erasedAt !== undefined) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		const cleared = args.clear ?? [];
		if (!cleared.every((f) => (CLEARABLE as ReadonlyArray<string>).includes(f))) {
			return REFUSED("invalid");
		}
		if (args.patch.name !== undefined && args.patch.name.trim() === "") return REFUSED("invalid");
		const change = planChange(
			{ ...row, version: row.version ?? 0 },
			{
				...args.patch,
				...Object.fromEntries(
					cleared.filter((f) => Reflect.get(row, f) !== undefined).map((f) => [f, undefined]),
				),
			},
		);
		if (!change.changed)
			return { ok: true as const, changed: false as const, version: row.version ?? 0 };
		await ctx.db.patch(row._id, {
			...args.patch,
			...Object.fromEntries(cleared.map((f) => [f, undefined])),
			updatedAt: Date.now(),
			version: change.nextVersion,
		});
		const after = await ctx.db.get(row._id);
		if (after !== null) await writeKeys(ctx, args.tenant, after);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "client.update",
			entity: "client",
			entityId: row._id,
			kind: "client",
			version: change.nextVersion,
			fields: change.fields,
		});
		return { ok: true as const, changed: true as const, version: change.nextVersion };
	},
});

export const standing = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		action: v.union(
			v.literal("archive"),
			v.literal("unarchive"),
			v.literal("delete"),
			v.literal("restore"),
		),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		return changeStanding(ctx, {
			tenant: args.tenant,
			client: args.client,
			action: args.action,
			actor: args.actor.subject,
		});
	},
});

/** Who treats a client: replaced only by this call, which a person makes; never by saving a visit or a record. */
export const setTreating = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		client: v.string(),
		practitioners: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "clients", args.tenant, args.client);
		if (row === null || row.erasedAt !== undefined) return REFUSED("not_found");
		const wanted = [];
		for (const p of args.practitioners) {
			const found = await practitionerOf(ctx, args.tenant, p);
			if (found === undefined) return REFUSED("unknown_practitioner");
			wanted.push(found._id);
		}
		const current = await ctx.db
			.query("treating")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", row._id))
			.collect();
		const plan = planTreatingChange(
			current.map((t) => t.practitioner),
			wanted,
			{ kind: "staff", actor: args.actor.subject },
		);
		if (!plan.ok) return REFUSED(plan.reason);
		if (plan.added.length === 0 && plan.removed.length === 0)
			return { ok: true as const, changed: false as const };
		for (const t of current) if (plan.removed.includes(t.practitioner)) await ctx.db.delete(t._id);
		for (const practitioner of wanted.filter((p) => plan.added.includes(p))) {
			await ctx.db.insert("treating", {
				tenant: args.tenant,
				practitioner,
				client: row._id,
				createdAt: Date.now(),
				createdBy: args.actor.subject,
			});
		}
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "client.practitioner_change",
			entity: "client",
			entityId: row._id,
			kind: "client",
			version: row.version ?? 0,
			fields: ["treating"],
		});
		return { ok: true as const, changed: true as const };
	},
});

export const get = query({
	args: { key: serverKeyValidator, tenant: v.string(), client: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "clients", args.tenant, args.client);
		if (row === null || row.erasedAt !== undefined) return REFUSED("not_found");
		const treating = await ctx.db
			.query("treating")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", row._id))
			.collect();
		return { ok: true as const, client: view(row), treating: treating.map((t) => t.practitioner) };
	},
});

/** At most this many clients or practitioners are named in one batched read. */
const MANY_MAX = 100;
/** A practitioner treating more clients than this is refused rather than answered from part of the relation. */
const TREATING_MAX = 5000;

/**
 * Many clients by id in ONE round trip, each with its practitioners: the ones found (not erased) in the order asked,
 * an unknown, erased or other tenant's id silently absent. More than 100 ids is `invalid`.
 */
export const getMany = query({
	args: { key: serverKeyValidator, tenant: v.string(), clients: v.array(v.string()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.clients.length > MANY_MAX) return REFUSED("invalid");
		const found = [];
		for (const id of new Set(args.clients)) {
			const row = await owned(ctx, "clients", args.tenant, id);
			if (row === null || row.erasedAt !== undefined) continue;
			const treating = await ctx.db
				.query("treating")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", row._id))
				.take(MANY_MAX);
			found.push({ client: view(row), treating: treating.map((t) => t.practitioner as string) });
		}
		return { ok: true as const, clients: found };
	},
});

/**
 * The treating relation of many practitioners in ONE round trip (each read from its index): `{ practitioner, clients }`
 * per practitioner found, in the order asked. More than 100 practitioners is `invalid`; one treating more than 5000
 * clients is `too_many_rows` (never a partial answer).
 */
export const treatingForMany = query({
	args: { key: serverKeyValidator, tenant: v.string(), practitioners: v.array(v.string()) },
	handler: async (ctx, args) => {
		requireServer(args.key);
		if (args.practitioners.length > MANY_MAX) return REFUSED("invalid");
		const out: { practitioner: string; clients: string[] }[] = [];
		for (const id of new Set(args.practitioners)) {
			const p = await practitionerOf(ctx, args.tenant, id);
			if (p === undefined) continue;
			const rows = await ctx.db
				.query("treating")
				.withIndex("by_tenant_practitioner", (q) =>
					q.eq("tenant", args.tenant).eq("practitioner", p._id),
				)
				.take(TREATING_MAX + 1);
			if (rows.length > TREATING_MAX) return REFUSED("too_many_rows");
			out.push({ practitioner: id, clients: rows.map((r) => r.client as string) });
		}
		return { ok: true as const, treating: out };
	},
});

export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		prefix: v.optional(v.string()),
		visibility: v.optional(
			v.union(v.literal("listed"), v.literal("archived"), v.literal("deleted"), v.literal("all")),
		),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const prefix = (args.prefix ?? "").trim();
		const want = args.visibility ?? "listed";
		const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
		const rows = ctx.db
			.query("clients")
			.withIndex("by_tenant_name", (q) =>
				prefix === ""
					? q.eq("tenant", args.tenant)
					: q.eq("tenant", args.tenant).gte("name", prefix).lt("name", `${prefix}￿`),
			);
		// Read in name order and stop at the page: never the whole app to answer its first `limit` clients.
		const shown: Doc<"clients">[] = [];
		for await (const c of rows) {
			if (c.erasedAt === undefined && (want === "all" || visibilityOf(c) === want)) shown.push(c);
			if (shown.length >= limit) break;
		}
		return { ok: true as const, clients: shown.map(view) };
	},
});

/** The treating relation both ways: a client's practitioners, or a practitioner's clients. */
export const treatingFor = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		client: v.optional(v.string()),
		practitioner: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		if ((args.client === undefined) === (args.practitioner === undefined))
			return REFUSED("invalid");
		if (args.client !== undefined) {
			const c = await owned(ctx, "clients", args.tenant, args.client);
			if (c === null) return REFUSED("not_found");
			const rows = await ctx.db
				.query("treating")
				.withIndex("by_tenant_client", (q) => q.eq("tenant", args.tenant).eq("client", c._id))
				.collect();
			return {
				ok: true as const,
				practitioners: rows.map((r) => r.practitioner as string),
				clients: [] as string[],
			};
		}
		const p = await practitionerOf(ctx, args.tenant, args.practitioner ?? "");
		if (p === undefined) return REFUSED("not_found");
		const rows = await ctx.db
			.query("treating")
			.withIndex("by_tenant_practitioner", (q) =>
				q.eq("tenant", args.tenant).eq("practitioner", p._id),
			)
			.collect();
		return {
			ok: true as const,
			practitioners: [] as string[],
			clients: rows.map((r) => r.client as string),
		};
	},
});
