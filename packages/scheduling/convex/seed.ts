import { v } from "convex/values";
import type { Audience, Mode } from "../src/domain/catalog";
import { type Contact, cleanContact, contactProblem } from "../src/domain/contact";
import { generateSlots, type Slot } from "../src/domain/slots";
import { DAY_MINUTES, MINUTE_MS, toLocal } from "../src/domain/time";
import { makeReference, type RandomBytes } from "../src/domain/tokens";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
	appointmentByReference,
	busyAround,
	exceptionsOf,
	rulesOf,
	serviceSpec,
	tenantBySlug,
} from "./calendar";
import { CLINIC_TABLES, rowsOf } from "./clinicTables";

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
	return ctx.db.insert("practitioners", {
		tenant,
		slug,
		displayName,
		active: true,
	});
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
	windows: ReadonlyArray<{
		weekday: number;
		start: number;
		end: number;
		modes: Mode[];
	}>,
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
				{
					weekday,
					start: 9 * 60,
					end: 13 * 60,
					modes: ["onsite"] satisfies Mode[],
				},
				{
					weekday,
					start: 14 * 60,
					end: 18 * 60,
					modes: ["onsite"] satisfies Mode[],
				},
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

/** Three fictional people asking for the DEMO evaluation; every name says DEMO, no address is real. */
const DEMO_ASKERS: ReadonlyArray<{ contact: Contact; audience: Audience }> = [
	{
		contact: { name: "DEMO Client Unu", phone: "0700 000 001" },
		audience: "adult",
	},
	{
		contact: { name: "DEMO Client Doi", email: "demo.doi@example.invalid" },
		audience: "child",
	},
	{
		contact: { name: "DEMO Client Trei", phone: "0700 000 003" },
		audience: "teen",
	},
];
const DEMO_WINDOW_DAYS = 14;

const mathRandom: RandomBytes = (length) =>
	Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));

/** One free slot on each of the first days that have one, a little later each day. */
function spreadSlots(slots: ReadonlyArray<Slot>, timeZone: string, count: number): Slot[] {
	const byDate = new Map<string, Slot[]>();
	for (const slot of slots) {
		const date = toLocal(slot.start, timeZone).date;
		byDate.set(date, [...(byDate.get(date) ?? []), slot]);
	}
	return [...byDate.values()].slice(0, count).flatMap((day, i) => {
		const slot = day[Math.min(i * 2, day.length - 1)];
		return slot === undefined ? [] : [slot];
	});
}

/**
 * Three `requested` DEMO appointments for psizone's DEMO evaluation in the coming days, on slots
 * the rules offer and nothing blocks (chosen by the slot engine), so the staff console has
 * something to confirm or decline. Skips when this seed's DEMO requests already wait in the
 * window. Needs `seed:demo` first.
 */
export const demoRequests = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ created: number; references: string[] }> => {
		const tenant = await tenantBySlug(ctx, "psizone");
		const practitioner = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", "psizone").eq("slug", "demo-ana"))
			.unique();
		const service = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", "psizone").eq("slug", "evaluation"))
			.unique();
		if (tenant === undefined || practitioner === null || service === null) {
			throw new Error("no DEMO calendar: run seed:demo first");
		}
		const now = Date.now();
		const to = now + DEMO_WINDOW_DAYS * DAY_MINUTES * MINUTE_MS;
		const waiting = await ctx.db
			.query("appointments")
			.withIndex("by_tenant_start", (q) =>
				q.eq("tenant", "psizone").gte("start", now).lt("start", to),
			)
			.collect();
		const seeded = new Set(DEMO_ASKERS.map((asker) => asker.contact.name));
		const demo = waiting.filter(
			(row) =>
				row.status === "requested" && row.contact !== undefined && seeded.has(row.contact.name),
		);
		if (demo.length > 0) return { created: 0, references: demo.map((row) => row.reference) };
		const spec = serviceSpec(service);
		const [rules, exceptions, busy] = await Promise.all([
			rulesOf(ctx, practitioner._id),
			exceptionsOf(ctx, practitioner._id, now, to, tenant.timeZone),
			busyAround(ctx, practitioner._id, now, to, now),
		]);
		const slots = generateSlots({
			timeZone: tenant.timeZone,
			service: spec,
			rules,
			exceptions,
			busy,
			from: now,
			to,
			now,
			mode: "onsite",
		});
		const references: string[] = [];
		const picked = spreadSlots(slots, tenant.timeZone, DEMO_ASKERS.length);
		for (const [i, slot] of picked.entries()) {
			const asker = DEMO_ASKERS[i];
			if (asker === undefined || contactProblem(asker.contact) !== undefined) continue;
			let reference = makeReference(mathRandom);
			while ((await appointmentByReference(ctx, reference)) !== undefined) {
				reference = makeReference(mathRandom);
			}
			const holdTokenHash = [...mathRandom(32)]
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
			await ctx.db.insert("appointments", {
				tenant: tenant.slug,
				practitioner: practitioner._id,
				service: service._id,
				mode: "onsite",
				start: slot.start,
				end: slot.end,
				blockedUntil: slot.end + spec.bufferMinutes * MINUTE_MS,
				status: "requested",
				reference,
				holdTokenHash,
				contact: cleanContact(asker.contact),
				audience: asker.audience,
				locale: "ro",
				channel: "form",
				submittedAt: now,
				updatedAt: now,
			});
			references.push(reference);
		}
		return { created: references.length, references };
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

/**
 * A public booking that already took place (a confirmed appointment in the past), in a fixture
 * tenant: the public flow can only book ahead, and the feedback rules need one that has ended.
 */
export const pastBooking = internalMutation({
	args: { tenant: v.string(), reference: v.string(), daysAgo: v.number() },
	handler: async (ctx, args): Promise<{ reference: string }> => {
		if (!args.tenant.startsWith("test-")) throw new Error("fixture tenants start with test-");
		const tenant = await tenantBySlug(ctx, args.tenant);
		const practitioner = await ctx.db
			.query("practitioners")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.first();
		const service = await ctx.db
			.query("services")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.first();
		if (tenant === undefined || practitioner === null || service === null) {
			throw new Error("run seed:fixture first");
		}
		const now = Date.now();
		const start = now - args.daysAgo * 86_400_000;
		await ctx.db.insert("appointments", {
			tenant: args.tenant,
			practitioner: practitioner._id,
			service: service._id,
			mode: "online",
			start,
			end: start + 30 * MINUTE_MS,
			blockedUntil: start + 30 * MINUTE_MS,
			status: "confirmed",
			reference: args.reference,
			holdTokenHash: "0".repeat(64),
			locale: "ro",
			channel: "form",
			submittedAt: start - 86_400_000,
			updatedAt: now,
		});
		return { reference: args.reference };
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
		const rooms = await ctx.db
			.query("rooms")
			.withIndex("by_tenant_slug", (q) => q.eq("tenant", args.tenant))
			.collect();
		const clients = await ctx.db
			.query("clients")
			.withIndex("by_tenant_name", (q) => q.eq("tenant", args.tenant))
			.collect();
		for (const client of clients) {
			const keys = await ctx.db
				.query("clientKeys")
				.withIndex("by_client", (q) => q.eq("client", client._id))
				.collect();
			for (const k of keys) await ctx.db.delete(k._id);
			deleted += keys.length;
			await ctx.db.delete(client._id);
			deleted += 1;
		}
		for (const room of rooms) {
			const closures = await ctx.db
				.query("roomClosures")
				.withIndex("by_room_date", (q) => q.eq("room", room._id))
				.collect();
			for (const c of closures) await ctx.db.delete(c._id);
			deleted += closures.length;
		}
		// The clinic's rows of the tenant, first: they point at the practitioners and rooms above.
		for (const table of CLINIC_TABLES) {
			if (table === "practitioners" || table === "rooms" || table === "clients") continue;
			for (const row of await rowsOf(ctx, args.tenant, table)) {
				await ctx.db.delete(row._id);
				deleted += 1;
			}
		}
		for (const row of [...appointments, ...practitioners, ...services, ...rooms, ...tenants]) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
		return { deleted };
	},
});
