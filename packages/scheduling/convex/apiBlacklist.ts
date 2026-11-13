import { v } from "convex/values";
import {
	BLACKLIST_CATEGORIES,
	BLACKLIST_SEVERITIES,
	type BlacklistInput,
	blacklistInputSchema,
	blacklistMatch,
	blacklistPatchSchema,
	CLEARABLE_FIELDS,
	MAX_ACTIVE_ENTRIES,
	severityAllowed,
} from "../src/clinic/blacklist";
import { planChange } from "../src/clinic/change";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { owned, REFUSED, record, stale } from "./apiSupport";
import { activeEntries, candidateOfClient, type entryOf, screenOnline } from "./blacklistGate";
import { requireServer } from "./guard";
import { actorValidator, serverKeyValidator } from "./validators";

/**
 * The blacklist for the staff API (src/clinic/blacklist.ts). The API checks the permission and
 * says how far the caller may go: `limit: "warn_only"` is a role that may flag someone at warn
 * level and nothing stronger. The reason is staff-only text: it leaves here only to a staff caller.
 */
const limitArg = v.optional(v.union(v.literal("any"), v.literal("warn_only")));

const entryArg = v.object({
	client: v.optional(v.string()),
	phone: v.optional(v.string()),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	reason: v.string(),
	category: v.union(...BLACKLIST_CATEGORIES.map((c) => v.literal(c))),
	severity: v.union(...BLACKLIST_SEVERITIES.map((s) => v.literal(s))),
	expiresAt: v.optional(v.number()),
});

const view = (row: Doc<"blacklistEntries">) => ({ ...row, id: row._id });

/** Another active entry already names the same client, phone or e-mail. */
async function duplicateOf(
	row: { client?: string; phone?: string; email?: string },
	entries: ReadonlyArray<ReturnType<typeof entryOf>>,
	except?: string,
): Promise<string | undefined> {
	return entries.find(
		(e) =>
			e.id !== except &&
			((row.client !== undefined && e.client === row.client) ||
				(row.phone !== undefined && e.phone === row.phone) ||
				(row.email !== undefined && e.email === row.email)),
	)?.id;
}

export const create = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		entry: entryArg,
		limit: limitArg,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const parsed = blacklistInputSchema.safeParse(args.entry);
		if (!parsed.success)
			return {
				...REFUSED("invalid"),
				problems: problemsOf(parsed.error.issues),
			};
		const input: BlacklistInput = parsed.data;
		if (!severityAllowed(input.severity, args.limit ?? "any"))
			return REFUSED("severity_not_allowed");
		const now = Date.now();
		if (input.expiresAt !== undefined && input.expiresAt <= now) return REFUSED("already_expired");
		const client =
			input.client === undefined
				? undefined
				: await owned(ctx, "clients", args.tenant, input.client);
		if (client === null || client?.erasedAt !== undefined) return REFUSED("unknown_client");
		const active = await activeEntries(ctx, args.tenant);
		if (active.length >= MAX_ACTIVE_ENTRIES) return REFUSED("limit");
		const twin = await duplicateOf(
			{ ...input, ...(client === undefined ? {} : { client: client._id }) },
			active,
		);
		if (twin !== undefined) return { ...REFUSED("exists"), id: twin };
		const id = await ctx.db.insert("blacklistEntries", {
			tenant: args.tenant,
			...(client === undefined ? {} : { client: client._id }),
			...(input.phone === undefined ? {} : { phone: input.phone }),
			...(input.email === undefined ? {} : { email: input.email }),
			...(input.name === undefined ? {} : { name: input.name }),
			reason: input.reason,
			category: input.category,
			severity: input.severity,
			active: true,
			...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
			createdBy: args.actor.subject,
			createdAt: now,
			updatedBy: args.actor.subject,
			updatedAt: now,
			version: 1,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "blacklist.create",
			entity: "blacklist",
			entityId: id,
			kind: "blacklist",
			version: 1,
			fields: Object.keys(input).sort(),
		});
		return { ok: true as const, id };
	},
});

function problemsOf(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] {
	return [...new Set(issues.map((i) => i.path.map(String).join(".") || "(entry)"))];
}

export const update = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		entry: v.string(),
		expectedVersion: v.optional(v.number()),
		patch: v.object({
			client: v.optional(v.string()),
			phone: v.optional(v.string()),
			email: v.optional(v.string()),
			name: v.optional(v.string()),
			reason: v.optional(v.string()),
			category: v.optional(v.union(...BLACKLIST_CATEGORIES.map((c) => v.literal(c)))),
			severity: v.optional(v.union(...BLACKLIST_SEVERITIES.map((s) => v.literal(s)))),
			expiresAt: v.optional(v.number()),
			active: v.optional(v.boolean()),
		}),
		clear: v.optional(v.array(v.string())),
		limit: limitArg,
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "blacklistEntries", args.tenant, args.entry);
		if (row === null) return REFUSED("not_found");
		if (stale(row.version, args.expectedVersion)) return REFUSED("stale");
		const limit = args.limit ?? "any";
		// A caller limited to warn may neither touch a stronger entry nor make one stronger.
		if (!severityAllowed(row.severity, limit)) return REFUSED("severity_not_allowed");
		const cleared = args.clear ?? [];
		if (!cleared.every((f) => (CLEARABLE_FIELDS as ReadonlyArray<string>).includes(f))) {
			return REFUSED("invalid");
		}
		const parsed = blacklistPatchSchema.safeParse(args.patch);
		if (!parsed.success)
			return {
				...REFUSED("invalid"),
				problems: problemsOf(parsed.error.issues),
			};
		const { client: patchClient, ...plain } = parsed.data;
		const patch = plain;
		if (patch.severity !== undefined && !severityAllowed(patch.severity, limit)) {
			return REFUSED("severity_not_allowed");
		}
		const now = Date.now();
		if (patch.expiresAt !== undefined && patch.expiresAt <= now) return REFUSED("already_expired");
		let clientId: Id<"clients"> | undefined;
		if (patchClient !== undefined) {
			const client = await owned(ctx, "clients", args.tenant, patchClient);
			if (client === null || client.erasedAt !== undefined) return REFUSED("unknown_client");
			clientId = client._id;
		}
		const next = {
			client: cleared.includes("client") ? undefined : (clientId ?? row.client),
			phone: cleared.includes("phone") ? undefined : (patch.phone ?? row.phone),
			email: cleared.includes("email") ? undefined : (patch.email ?? row.email),
		};
		if (next.client === undefined && next.phone === undefined && next.email === undefined) {
			return REFUSED("identifier_required");
		}
		const reactivating = patch.active === true && !row.active;
		if (reactivating || (patch.active ?? row.active)) {
			const active = await activeEntries(ctx, args.tenant);
			if (reactivating && active.length >= MAX_ACTIVE_ENTRIES) return REFUSED("limit");
			const touchesIdentity =
				patch.phone !== undefined || patch.email !== undefined || clientId !== undefined;
			if (
				(reactivating || touchesIdentity) &&
				(await duplicateOf(next, active, row._id)) !== undefined
			) {
				return REFUSED("exists");
			}
		}
		const change = planChange(
			{ ...row, version: row.version },
			{
				...patch,
				...(clientId === undefined ? {} : { client: clientId }),
				...Object.fromEntries(
					cleared.filter((f) => Reflect.get(row, f) !== undefined).map((f) => [f, undefined]),
				),
			},
		);
		if (!change.changed)
			return {
				ok: true as const,
				changed: false as const,
				version: row.version,
			};
		await ctx.db.patch(row._id, {
			...patch,
			...(clientId === undefined ? {} : { client: clientId }),
			...Object.fromEntries(cleared.map((f) => [f, undefined])),
			updatedBy: args.actor.subject,
			updatedAt: now,
			version: change.nextVersion,
		});
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "blacklist.update",
			entity: "blacklist",
			entityId: row._id,
			kind: "blacklist",
			version: change.nextVersion,
			fields: change.fields,
		});
		return {
			ok: true as const,
			changed: true as const,
			version: change.nextVersion,
		};
	},
});

export const remove = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		actor: actorValidator,
		entry: v.string(),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "blacklistEntries", args.tenant, args.entry);
		if (row === null) return REFUSED("not_found");
		await ctx.db.delete(row._id);
		await record(ctx, {
			tenant: args.tenant,
			actor: args.actor.subject,
			action: "blacklist.delete",
			entity: "blacklist",
			entityId: row._id,
			kind: "blacklist",
			version: row.version + 1,
		});
		return { ok: true as const };
	},
});

export const get = query({
	args: { key: serverKeyValidator, tenant: v.string(), entry: v.string() },
	handler: async (ctx, args) => {
		requireServer(args.key);
		const row = await owned(ctx, "blacklistEntries", args.tenant, args.entry);
		return row === null ? REFUSED("not_found") : { ok: true as const, entry: view(row) };
	},
});

/** The app's entries; the ones that no longer apply (switched off or expired) only when asked. */
export const list = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		includeInactive: v.optional(v.boolean()),
		now: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const now = args.now ?? Date.now();
		const rows = await ctx.db
			.query("blacklistEntries")
			.withIndex("by_tenant_active", (q) => q.eq("tenant", args.tenant))
			.take(2 * MAX_ACTIVE_ENTRIES);
		const shown =
			args.includeInactive === true
				? rows
				: rows.filter((r) => r.active && (r.expiresAt === undefined || r.expiresAt > now));
		return { ok: true as const, entries: shown.map(view) };
	},
});

/** For the banner: does the blacklist name this client or contact? Read-only; staff only. */
export const check = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		client: v.optional(v.string()),
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const client =
			args.client === undefined ? undefined : await owned(ctx, "clients", args.tenant, args.client);
		if (client === null) return REFUSED("unknown_client");
		const candidate = {
			...(client === undefined ? {} : candidateOfClient(client)),
			phones: [
				args.phone,
				...(client === undefined ? [] : (candidateOfClient(client).phones ?? [])),
			],
			emails: [
				args.email,
				...(client === undefined ? [] : (candidateOfClient(client).emails ?? [])),
			],
			...(args.name === undefined ? {} : { name: args.name }),
		};
		const hit = blacklistMatch(candidate, await activeEntries(ctx, args.tenant), Date.now());
		return hit === undefined
			? { ok: true as const, hit: null }
			: {
					ok: true as const,
					hit: {
						entry: hit.entry.id,
						severity: hit.entry.severity,
						category: hit.entry.category,
						reason: hit.entry.reason,
						matchedBy: hit.via,
						matched: hit.matched,
						nameAgrees: hit.nameAgrees,
					},
				};
	},
});

/**
 * The gate for an online path that stores a request without a hold, the callback form: ask before
 * storing. `{ ok: false, reason: "unavailable_online" }` is all the visitor may learn; a refusal is
 * recorded for the team (an event and an audit entry), anything else writes nothing.
 */
export const screen = mutation({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		channel: v.union(v.literal("callback"), v.literal("form"), v.literal("guide")),
		contact: v.object({
			name: v.optional(v.string()),
			phone: v.optional(v.string()),
			email: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const out = await screenOnline(
			ctx,
			args.tenant,
			{
				phones: [args.contact.phone],
				emails: [args.contact.email],
				...(args.contact.name === undefined ? {} : { name: args.contact.name }),
			},
			args.channel,
		);
		return out.refused ? REFUSED("unavailable_online") : { ok: true as const };
	},
});

/** What the blacklist did: online refusals and staff overrides (with their reasons), newest first. */
export const events = query({
	args: {
		key: serverKeyValidator,
		tenant: v.string(),
		entry: v.optional(v.string()),
		before: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		requireServer(args.key);
		const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
		const before = args.before ?? Number.MAX_SAFE_INTEGER;
		const rows =
			args.entry === undefined
				? await ctx.db
						.query("blacklistEvents")
						.withIndex("by_tenant_at", (q) => q.eq("tenant", args.tenant).lt("at", before))
						.order("desc")
						.take(limit)
				: await ctx.db
						.query("blacklistEvents")
						.withIndex("by_tenant_entry", (q) =>
							q
								.eq("tenant", args.tenant)
								.eq("entry", args.entry ?? "")
								.lt("at", before),
						)
						.order("desc")
						.take(limit);
		return {
			ok: true as const,
			events: rows.map((e) => ({ ...e, id: e._id })),
		};
	},
});
