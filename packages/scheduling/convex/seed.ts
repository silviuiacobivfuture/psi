import { v } from "convex/values";
import type { Mode } from "../src/domain/catalog";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Seeding, for local development and tests only. Internal: reachable with the deployment's admin
 * key (`convex run`), never through the app's server key. Every name here is fictional and says
 * DEMO; no real practitioner is ever seeded.
 */

const ZONE = "Europe/Bucharest";
const WEEKDAYS = [1, 2, 3, 4, 5];

interface ServiceSeed {
	slug: string;
	durationMinutes: number;
	bufferMinutes: number;
	stepMinutes: number;
	minNoticeMinutes: number;
	horizonDays: number;
	holdMinutes: number;
	modes: Mode[];
	location?: string;
}

async function upsertTenant(ctx: MutationCtx, slug: string): Promise<void> {
	const found = await ctx.db
		.query("tenants")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
	if (found === null) await ctx.db.insert("tenants", { slug, timeZone: ZONE, active: true });
	else await ctx.db.patch(found._id, { timeZone: ZONE, active: true });
}

async function upsertPractitioner(
	ctx: MutationCtx,
	tenant: string,
	slug: string,
	displayName: string,
): Promise<Id<"practitioners">> {
	const found = await ctx.db
		.query("practitioners")
		.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant).eq("slug", slug))
		.unique();
	if (found !== null) {
		await ctx.db.patch(found._id, { displayName, active: true });
		return found._id;
	}
	return ctx.db.insert("practitioners", { tenant, slug, displayName, active: true });
}

async function upsertService(
	ctx: MutationCtx,
	tenant: string,
	seed: ServiceSeed,
	practitioners: Id<"practitioners">[],
): Promise<void> {
	const found = await ctx.db
		.query("services")
		.withIndex("by_tenant_slug", (q) => q.eq("tenant", tenant).eq("slug", seed.slug))
		.unique();
	const row = { tenant, ...seed, practitioners, active: true };
	if (found === null) await ctx.db.insert("services", row);
	else await ctx.db.replace(found._id, row);
}

async function replaceRules(
	ctx: MutationCtx,
	practitioner: Id<"practitioners">,
	windows: ReadonlyArray<{ weekday: number; start: number; end: number; modes: Mode[] }>,
): Promise<void> {
	const old = await ctx.db
		.query("rules")
		.withIndex("by_practitioner", (q) => q.eq("practitioner", practitioner))
		.collect();
	for (const rule of old) await ctx.db.delete(rule._id);
	for (const window of windows) await ctx.db.insert("rules", { practitioner, ...window });
}

/** The demo calendars: one DEMO practitioner for Psizone evaluations, one for EQ-SYNC online. */
export const demo = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ tenants: string[] }> => {
		for (const tenant of ["psizone", "eqsync", "hemisync"]) await upsertTenant(ctx, tenant);
		const ana = await upsertPractitioner(ctx, "psizone", "demo-ana", "DEMO Ana Exemplu");
		await replaceRules(
			ctx,
			ana,
			WEEKDAYS.flatMap((weekday) => [
				{ weekday, start: 9 * 60, end: 13 * 60, modes: ["onsite"] satisfies Mode[] },
				{ weekday, start: 14 * 60, end: 18 * 60, modes: ["onsite"] satisfies Mode[] },
			]),
		);
		await upsertService(
			ctx,
			"psizone",
			{
				slug: "evaluation",
				durationMinutes: 60,
				bufferMinutes: 15,
				stepMinutes: 75,
				minNoticeMinutes: 12 * 60,
				horizonDays: 28,
				holdMinutes: 10,
				modes: ["onsite"],
				location: "galati",
			},
			[ana],
		);
		const mihai = await upsertPractitioner(ctx, "eqsync", "demo-mihai", "DEMO Mihai Exemplu");
		await replaceRules(ctx, mihai, [
			{ weekday: 2, start: 18 * 60, end: 20 * 60, modes: ["online"] },
			{ weekday: 4, start: 18 * 60, end: 20 * 60, modes: ["online"] },
		]);
		await upsertService(
			ctx,
			"eqsync",
			{
				slug: "online-session",
				durationMinutes: 50,
				bufferMinutes: 10,
				stepMinutes: 60,
				minNoticeMinutes: 24 * 60,
				horizonDays: 21,
				holdMinutes: 10,
				modes: ["online"],
			},
			[mihai],
		);
		return { tenants: ["psizone", "eqsync", "hemisync"] };
	},
});

/** A throwaway tenant for the race tests: one practitioner open every day, all day, both modes. */
export const fixture = internalMutation({
	args: { tenant: v.string() },
	handler: async (ctx, args): Promise<{ practitioner: Id<"practitioners"> }> => {
		if (!args.tenant.startsWith("test-")) throw new Error("fixture tenants start with test-");
		await upsertTenant(ctx, args.tenant);
		const practitioner = await upsertPractitioner(ctx, args.tenant, "fixture", "DEMO Fixture");
		await replaceRules(
			ctx,
			practitioner,
			[1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
				weekday,
				start: 0,
				end: 24 * 60,
				modes: ["onsite", "online"] satisfies Mode[],
			})),
		);
		await upsertService(
			ctx,
			args.tenant,
			{
				slug: "race",
				durationMinutes: 30,
				bufferMinutes: 0,
				stepMinutes: 15,
				minNoticeMinutes: 0,
				horizonDays: 60,
				holdMinutes: 10,
				modes: ["onsite", "online"],
			},
			[practitioner],
		);
		return { practitioner };
	},
});

/** Removes a test tenant and everything in it. */
export const dropFixture = internalMutation({
	args: { tenant: v.string() },
	handler: async (ctx, args): Promise<{ deleted: number }> => {
		if (!args.tenant.startsWith("test-")) throw new Error("fixture tenants start with test-");
		let deleted = 0;
		const appointments = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) => q.eq("tenant", args.tenant))
			.collect();
		const practitioners = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		const services = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		const tenants = await ctx.db
			.query("tenants")
			.withIndex("by_slug", (q) => q.eq("slug", args.tenant))
			.collect();
		for (const p of practitioners) {
			const rules = await ctx.db
				.query("rules")
				.withIndex("by_practitioner", (q) => q.eq("practitioner", p._id))
				.collect();
			const exceptions = await ctx.db
				.query("exceptions")
				.withIndex("by_practitioner_date", (q) => q.eq("practitioner", p._id))
				.collect();
			for (const r of [...rules, ...exceptions]) await ctx.db.delete(r._id);
			deleted += rules.length + exceptions.length;
		}
		for (const row of [...appointments, ...practitioners, ...services, ...tenants]) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
		return { deleted };
	},
});
