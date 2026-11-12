import type {
	RoomsResult,
	StaffAvailability,
	StaffCatalog,
	StaffSchedulingClient,
} from "@psi/scheduling";
import { toLocal } from "@psi/scheduling";
import type { Brand } from "../authz/types";
import type { SetupState } from "./scheduling-model";

const ZONE = "Europe/Bucharest";
type Catalog = Extract<StaffCatalog, { ok: true }>;
type Available = Extract<StaffAvailability, { ok: true }>;
type Rooms = Extract<RoomsResult, { ok: true }>["rooms"];

export function stateOf(
	brand: Brand,
	tenant: string,
	catalog: Catalog | null,
	availability: ReadonlyMap<string, Available | null>,
	now: number,
	rooms: Rooms = [],
): SetupState {
	const timeZone = catalog?.timeZone ?? ZONE;
	return {
		brand,
		tenant,
		exists: catalog !== null,
		timeZone,
		today: toLocal(now, timeZone).date,
		practitioners: (catalog?.practitioners ?? []).map((p) => {
			const a = availability.get(p.id) ?? null;
			return {
				id: p.id,
				slug: p.slug,
				name: p.displayName,
				active: p.active,
				external: p.external === true,
				rooms: p.rooms ?? [],
				abAnchor: p.abAnchor ?? null,
				rules:
					a === null
						? null
						: a.rules.map((r) => ({
								id: r.id,
								weekday: r.weekday,
								start: r.start,
								end: r.end,
								modes: r.modes,
								dated: r.validFrom !== undefined || r.validUntil !== undefined,
								...(r.week === undefined ? {} : { week: r.week }),
								...(r.override === true ? { override: true } : {}),
								...(r.validFrom === undefined ? {} : { validFrom: r.validFrom }),
								...(r.validUntil === undefined ? {} : { validUntil: r.validUntil }),
							})),
				exceptions: (a?.exceptions ?? []).map((x) => ({
					id: x.id,
					date: x.date,
					kind: x.kind,
					...(x.start === undefined ? {} : { start: x.start }),
					...(x.end === undefined ? {} : { end: x.end }),
				})),
			};
		}),
		services: (catalog?.services ?? []).map((s) => ({
			id: s.id,
			slug: s.slug,
			name: s.name ?? null,
			durationMinutes: s.durationMinutes,
			bufferMinutes: s.bufferMinutes,
			stepMinutes: s.stepMinutes,
			minNoticeMinutes: s.minNoticeMinutes,
			horizonDays: s.horizonDays,
			holdMinutes: s.holdMinutes,
			modes: s.modes,
			...(s.location === undefined ? {} : { location: s.location }),
			practitioners: s.practitioners,
			active: s.active,
			roomKind: s.roomKind ?? null,
			roomEquipment: s.roomEquipment ?? [],
			roomAudiences: s.roomAudiences ?? [],
		})),
		rooms: rooms.map((r) => ({
			id: r.id,
			slug: r.slug,
			name: r.name,
			kind: r.kind,
			capacity: r.capacity,
			suits: r.suits,
			equipment: r.equipment,
			active: r.active,
			closures: r.closures,
		})),
	};
}

/** Reads the tenant's whole setup; a tenant the store does not know yet is an empty setup. */
export async function loadSetup(
	staff: StaffSchedulingClient,
	brand: Brand,
	tenant: string,
	now: number = Date.now(),
): Promise<SetupState> {
	const catalog = await staff.catalog({ tenant });
	if (!catalog.ok) return stateOf(brand, tenant, null, new Map(), now);
	const fromDate = toLocal(now, catalog.timeZone).date;
	const rooms = await staff.rooms({ tenant, fromDate });
	const availability = new Map<string, Available | null>();
	await Promise.all(
		catalog.practitioners.map(async (p) => {
			const a = await staff
				.availability({ tenant, practitioner: p.id, fromDate })
				.catch(() => null);
			availability.set(p.id, a?.ok ? a : null);
		}),
	);
	return stateOf(brand, tenant, catalog, availability, now, rooms.ok ? rooms.rooms : []);
}
