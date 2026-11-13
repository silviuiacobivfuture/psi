import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { blacklistCategoryValidator, blacklistSeverityValidator } from "./tables/clinicBlacklist";
import {
	attendanceValidator,
	creditTypeValidator,
	rosterStatusValidator,
	statusValidator,
} from "./validators";

/**
 * Pages of an app's rows for `validateClinicData` (`src/admin-validate.ts`), which checks the data
 * without changing it. Internal: reached with the admin key. Each page carries only what the
 * checks need (contacts, times, links), a `label` (the old id when the row has one), and a cursor.
 * Clinical fields are never read into an answer. Soft-deleted and erased rows are left out.
 */
const PAGE = 500;
const pageArgs = { tenant: v.string(), cursor: v.union(v.string(), v.null()) };
const labelOf = (row: { _id: string; legacyId?: string | undefined }): string =>
	row.legacyId ?? row._id;
const next = <T>(page: PaginationResult<T>): string | null =>
	page.isDone ? null : page.continueCursor;

export const zone = internalQuery({
	args: { tenant: v.string() },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, { tenant }) => {
		const row = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", tenant))
			.unique();
		return row?.timeZone ?? null;
	},
});

const contact = { phone: v.optional(v.string()), email: v.optional(v.string()) };

export const clients = internalQuery({
	args: pageArgs,
	returns: v.object({
		next: v.union(v.string(), v.null()),
		rows: v.array(
			v.object({
				id: v.string(),
				label: v.string(),
				...contact,
				guardian: v.optional(v.object(contact)),
			}),
		),
	}),
	handler: async (ctx, { tenant, cursor }) => {
		const page = await ctx.db
			.query("clients")
			.withIndex("by_tenant_name", (q) => q.eq("tenant", tenant))
			.paginate({ cursor, numItems: PAGE });
		const rows = page.page
			.filter((c) => c.erasedAt === undefined && c.deletedAt === undefined)
			.map((c) => ({
				id: c._id,
				label: labelOf(c),
				...(c.phone === undefined ? {} : { phone: c.phone }),
				...(c.email === undefined ? {} : { email: c.email }),
				...(c.guardian === undefined
					? {}
					: {
							guardian: {
								...(c.guardian.phone === undefined ? {} : { phone: c.guardian.phone }),
								...(c.guardian.email === undefined ? {} : { email: c.guardian.email }),
							},
						}),
			}));
		return { next: next(page), rows };
	},
});

export const visits = internalQuery({
	args: pageArgs,
	returns: v.object({
		next: v.union(v.string(), v.null()),
		rows: v.array(
			v.object({
				id: v.string(),
				label: v.string(),
				client: v.optional(v.string()),
				column: v.object({ kind: v.string(), id: v.string() }),
				room: v.optional(v.string()),
				device: v.optional(v.string()),
				start: v.number(),
				end: v.number(),
				status: statusValidator,
				attendance: attendanceValidator,
				package: v.optional(v.string()),
				creditType: v.optional(creditTypeValidator),
			}),
		),
	}),
	handler: async (ctx, { tenant, cursor }) => {
		const page = await ctx.db
			.query("visits")
			.withIndex("by_tenant_start", (q) => q.eq("tenant", tenant))
			.paginate({ cursor, numItems: PAGE });
		const rows = page.page
			.filter((x) => x.deletedAt === undefined)
			.map((x) => ({
				id: x._id,
				label: labelOf(x),
				...(x.client === undefined ? {} : { client: x.client }),
				column: { kind: x.column.kind, id: x.column.id },
				...(x.room === undefined ? {} : { room: x.room }),
				...(x.device === undefined ? {} : { device: x.device }),
				start: x.start,
				end: x.end,
				status: x.status,
				attendance: x.attendance,
				...(x.package === undefined ? {} : { package: x.package }),
				...(x.creditType === undefined ? {} : { creditType: x.creditType }),
			}));
		return { next: next(page), rows };
	},
});

export const packages = internalQuery({
	args: pageArgs,
	returns: v.object({
		next: v.union(v.string(), v.null()),
		rows: v.array(
			v.object({
				id: v.string(),
				label: v.string(),
				totalSessions: v.number(),
				bonusSessions: v.number(),
			}),
		),
	}),
	handler: async (ctx, { tenant, cursor }) => {
		const page = await ctx.db
			.query("packages")
			.withIndex("by_tenant_client", (q) => q.eq("tenant", tenant))
			.paginate({ cursor, numItems: PAGE });
		return {
			next: next(page),
			rows: page.page.map((p) => ({
				id: p._id,
				label: labelOf(p),
				totalSessions: p.totalSessions,
				bonusSessions: p.bonusSessions,
			})),
		};
	},
});

const person = v.object({ kind: v.string(), id: v.string() });

export const roster = internalQuery({
	args: pageArgs,
	returns: v.object({
		next: v.union(v.string(), v.null()),
		rows: v.array(
			v.object({
				person,
				date: v.string(),
				status: rosterStatusValidator,
				startMinutes: v.optional(v.number()),
				endMinutes: v.optional(v.number()),
			}),
		),
	}),
	handler: async (ctx, { tenant, cursor }) => {
		const page = await ctx.db
			.query("rosterDays")
			.withIndex("by_tenant_date", (q) => q.eq("tenant", tenant))
			.paginate({ cursor, numItems: PAGE });
		return {
			next: next(page),
			rows: page.page.map((d) => ({
				person: { kind: d.person.kind, id: d.person.id },
				date: d.date,
				status: d.status,
				...(d.startMinutes === undefined ? {} : { startMinutes: d.startMinutes }),
				...(d.endMinutes === undefined ? {} : { endMinutes: d.endMinutes }),
			})),
		};
	},
});

export const blocks = internalQuery({
	args: pageArgs,
	returns: v.object({
		next: v.union(v.string(), v.null()),
		rows: v.array(
			v.object({
				person,
				dateStart: v.string(),
				dateEnd: v.string(),
				reason: v.string(),
			}),
		),
	}),
	handler: async (ctx, { tenant, cursor }) => {
		const page = await ctx.db
			.query("staffBlocks")
			.withIndex("by_tenant_person_start", (q) => q.eq("tenant", tenant))
			.paginate({ cursor, numItems: PAGE });
		return {
			next: next(page),
			rows: page.page.map((b: Doc<"staffBlocks">) => ({
				person: { kind: b.person.kind, id: b.person.id },
				dateStart: b.dateStart,
				dateEnd: b.dateEnd,
				reason: b.reason,
			})),
		};
	},
});

export const blacklist = internalQuery({
	args: pageArgs,
	returns: v.object({
		next: v.union(v.string(), v.null()),
		rows: v.array(
			v.object({
				id: v.string(),
				client: v.optional(v.string()),
				phone: v.optional(v.string()),
				email: v.optional(v.string()),
				category: blacklistCategoryValidator,
				severity: blacklistSeverityValidator,
				active: v.boolean(),
				expiresAt: v.optional(v.number()),
				createdAt: v.number(),
			}),
		),
	}),
	handler: async (ctx, { tenant, cursor }) => {
		const page = await ctx.db
			.query("blacklistEntries")
			.withIndex("by_tenant_active", (q) => q.eq("tenant", tenant).eq("active", true))
			.paginate({ cursor, numItems: PAGE });
		return {
			next: next(page),
			rows: page.page.map((e) => ({
				id: e._id,
				...(e.client === undefined ? {} : { client: e.client }),
				...(e.phone === undefined ? {} : { phone: e.phone }),
				...(e.email === undefined ? {} : { email: e.email }),
				category: e.category,
				severity: e.severity,
				active: e.active,
				...(e.expiresAt === undefined ? {} : { expiresAt: e.expiresAt }),
				createdAt: e.createdAt,
			})),
		};
	},
});
