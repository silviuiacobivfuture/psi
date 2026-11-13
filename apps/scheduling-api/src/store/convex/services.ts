import { z } from "zod";
import type { Collection, ServiceRow } from "../types";
import { StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { catalogCollection } from "./catalog-collection";
import { readExtra, writeExtra } from "./extra";
import { splitTable, withTable } from "./ids";

/**
 * `services` on `staffSetup:createService`, `staffCatalog:updateService` (keyed by slug, which the API row carries)
 * and `apiCatalogExtra`. The prices have no column; they are the `extra`. A service the API creates is also what the
 * public booking flow offers, so the columns Convex needs and the API does not have are set to the clinic's usual
 * values: a slot every `duration + buffer` minutes, twelve hours' notice, four weeks ahead, a ten-minute hold.
 */
const FN = "apiCatalogExtra";
const MINIMUM_NOTICE_MINUTES = 12 * 60;
const HORIZON_DAYS = 28;
const HOLD_MINUTES = 10;

const Mode = z.enum(["onsite", "online"]);
const Doc = z.object({
	id: z.string(),
	_creationTime: z.number(),
	slug: z.string(),
	name: z.object({ ro: z.string(), en: z.string() }).optional(),
	durationMinutes: z.number(),
	bufferMinutes: z.number(),
	modes: z.array(Mode),
	practitioners: z.array(z.string()),
	active: z.boolean(),
	updatedAt: z.number().optional(),
	extra: z.string().optional(),
});
const Extra = z.object({
	prices: z.object({ priceCents: z.number(), currency: z.string() }).optional(),
	category: z.string().optional(),
	roomCategory: z.string().optional(),
	roomIds: z.array(z.string()).optional(),
	deviceIds: z.array(z.string()).optional(),
});
/** What a service says beyond the columns Convex models: the prices and how it is filed and where it is given. */
const extraOf = (row: ServiceRow): Record<string, unknown> => ({
	...(row.prices === undefined ? {} : { prices: row.prices }),
	...(row.category === undefined ? {} : { category: row.category }),
	...(row.roomCategory === undefined ? {} : { roomCategory: row.roomCategory }),
	...(row.roomIds === undefined ? {} : { roomIds: row.roomIds }),
	...(row.deviceIds === undefined ? {} : { deviceIds: row.deviceIds }),
});

const stamp = (n: number): number => Math.floor(n);
const practitionerId = (apiId: string): string => {
	const at = splitTable(["p"], apiId);
	if (at === undefined) throw new StoreRefused("unknown_person");
	return at.id;
};
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((x) => b.includes(x));

export function servicesCollection(call: Caller): Collection<ServiceRow> {
	const setExtra = (row: ServiceRow) =>
		call.mutate(
			`${FN}:setExtra`,
			{
				tenant: row.app,
				actor: actorArg(),
				table: "services",
				id: row.id,
				extra: writeExtra(extraOf(row)),
			},
			{},
		);
	return catalogCollection<ServiceRow>({
		async all(app) {
			const out = await call.query(`${FN}:services`, { tenant: app }, { services: z.array(Doc) });
			return out.services.map((d) => {
				const extra = readExtra(Extra, d.extra);
				return {
					id: d.id,
					app,
					slug: d.slug,
					name: d.name ?? { ro: d.slug, en: d.slug },
					durationMinutes: d.durationMinutes,
					bufferMinutes: d.bufferMinutes,
					modes: d.modes,
					practitionerIds: d.practitioners.map((p) => withTable("p", p)),
					active: d.active,
					...(extra?.prices === undefined ? {} : { prices: extra.prices }),
					...(extra?.category === undefined ? {} : { category: extra.category }),
					...(extra?.roomCategory === undefined ? {} : { roomCategory: extra.roomCategory }),
					...(extra?.roomIds === undefined ? {} : { roomIds: extra.roomIds }),
					...(extra?.deviceIds === undefined ? {} : { deviceIds: extra.deviceIds }),
					createdAt: stamp(d._creationTime),
					updatedAt: stamp(d.updatedAt ?? d._creationTime),
				};
			});
		},
		async create(row) {
			const made = await call.mutate(
				"staffSetup:createService",
				{
					tenant: row.app,
					slug: row.slug,
					name: row.name,
					durationMinutes: row.durationMinutes,
					bufferMinutes: row.bufferMinutes,
					stepMinutes: Math.min(240, row.durationMinutes + row.bufferMinutes),
					minNoticeMinutes: MINIMUM_NOTICE_MINUTES,
					horizonDays: HORIZON_DAYS,
					holdMinutes: HOLD_MINUTES,
					modes: row.modes,
					practitioners: row.practitionerIds.map(practitionerId),
					actor: actorArg(),
				},
				{ id: z.string() },
			);
			const saved = { ...row, id: made.id };
			if (Object.keys(extraOf(saved)).length > 0) await setExtra(saved);
			if (!row.active)
				await call.mutate(
					"staffCatalog:updateService",
					{ tenant: row.app, service: row.slug, patch: { active: false }, actor: actorArg() },
					{},
				);
			return saved;
		},
		async update(before, after) {
			const columns =
				before.name.ro !== after.name.ro ||
				before.name.en !== after.name.en ||
				before.durationMinutes !== after.durationMinutes ||
				before.bufferMinutes !== after.bufferMinutes ||
				!sameList(before.modes, after.modes) ||
				!sameList(before.practitionerIds, after.practitionerIds) ||
				before.active !== after.active;
			if (columns)
				await call.mutate(
					"staffCatalog:updateService",
					{
						tenant: after.app,
						service: after.slug,
						actor: actorArg(),
						patch: {
							name: after.name,
							durationMinutes: after.durationMinutes,
							bufferMinutes: after.bufferMinutes,
							modes: after.modes,
							practitioners: after.practitionerIds.map(practitionerId),
							active: after.active,
						},
					},
					{},
				);
			if (JSON.stringify(extraOf(before)) !== JSON.stringify(extraOf(after))) await setExtra(after);
		},
		async remove(app, id) {
			try {
				await call.mutate(
					`${FN}:removeRow`,
					{ tenant: app, actor: actorArg(), table: "services", id },
					{},
				);
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				throw error;
			}
		},
	});
}
