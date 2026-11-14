import { randomBytes } from "node:crypto";
import { nameKey, type RoomsSeed, roomsPlanDocument } from "@psi/scheduling/clinic";
import { withActor } from "@psi/scheduling-api/store-actor";
import type { AppointmentRow, StorePort } from "@psi/scheduling-api/store-types";
import { FloorPlanDocument } from "@psi/scheduling-sdk/contract";
import {
	type AccountLink,
	type CatalogPlan,
	planCatalog,
	planStaff,
	type StaffPlan,
	type Step,
} from "./plan-org";
import { type LeftStep, planRooms, type RoomStep } from "./plan-rooms";
import type { OrgSeed } from "./seed";

/** Who the store records as the one who set the rooms and the organisation up. */
export const ROOMS_ACTOR = "system:rooms";

export interface MappingRow {
	/** The room's name before (null: made by this run). */
	from: string | null;
	to: string;
	floor: string;
	id: string;
	kind: RoomStep["kind"];
	appointments: number;
}
export interface LeftRow {
	name: string;
	id: string;
	kind: LeftStep["kind"];
	appointments: number;
}
export interface ApplyReport {
	app: string;
	dryRun: boolean;
	mapping: MappingRow[];
	left: LeftRow[];
	plan: { saved: boolean; revision: number };
	/** Appointments in the app, those with a room, and those whose room or device moved (always 0, or the run fails). */
	appointments: { total: number; withRoom: number; moved: number };
	catalog?: CatalogPlan;
	staff?: StaffPlan;
}

/** A run that would leave an appointment without its room: nothing after the check is trusted, and it exits non-zero. */
export class AppointmentsMoved extends Error {
	override readonly name = "AppointmentsMoved";
}

/** JSON with every object's keys in order, so two plans that say the same thing compare equal. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value === "object" && value !== null)
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}
const withoutRevision = (text: string): string => {
	const parsed: unknown = JSON.parse(text);
	return canonical(
		typeof parsed === "object" && parsed !== null ? { ...parsed, revision: 0 } : parsed,
	);
};

const where = (a: AppointmentRow): string => `${a.roomId ?? "-"}|${a.deviceId ?? "-"}`;
const counts = (appts: ReadonlyArray<AppointmentRow>): Map<string, number> => {
	const out = new Map<string, number>();
	for (const a of appts)
		if (a.roomId !== undefined) out.set(a.roomId, (out.get(a.roomId) ?? 0) + 1);
	return out;
};

/** A new row's id, as the service makes one (a store that assigns its own, as Convex does, answers with that). */
const freshId = (prefix: string): string => prefix + randomBytes(12).toString("hex").slice(0, 16);

/** Writes one step's row; a made row comes back with the id the store gave it. */
async function write<R extends { id: string }>(
	step: Step<R>,
	coll: { insert(row: R): Promise<R>; replace(row: R): Promise<boolean> },
	prefix: string,
): Promise<R> {
	switch (step.kind) {
		case "create":
			return coll.insert({ ...step.next, id: freshId(prefix) });
		case "update":
			if (!(await coll.replace(step.next))) throw new Error(`${step.label} is no longer stored`);
			return step.next;
		case "keep":
			return step.before;
		default: {
			const never: never = step;
			return never;
		}
	}
}

/**
 * Applies a clinic's rooms seed (and, given one, its org seed) to the store, as `system:rooms`: the owner's rooms (an
 * imported room renamed in place, so it keeps its id and its appointments), the old rooms that are none of them taken
 * off the plan, the floor plan drawn from the stored ids, then the organisation's name, devices, groups, draft
 * services and practitioners. A dry run writes nothing and reports the same. A second run writes nothing. No
 * appointment is ever written; a real run checks every appointment's room and device against what it read first.
 * Writes the store only: the authorization tuples of a made room, device or linked person follow with
 * `reconcile-authz`.
 */
export async function applyOrg(input: {
	store: StorePort;
	rooms: RoomsSeed;
	org?: OrgSeed;
	links: ReadonlyArray<AccountLink>;
	dryRun: boolean;
	now: number;
}): Promise<ApplyReport> {
	const { store, rooms: seed, dryRun, now } = input;
	// Every refusal is found before the first write: a real run plans the whole of it first, as a dry run would.
	if (!dryRun) await applyOrg({ ...input, dryRun: true });
	const app = seed.app;
	const c = store.c;
	const appRow = await c.apps.get(app, app);
	if (appRow === undefined) throw new Error(`the app ${app} is not in the store`);
	const before = await c.appointments.list(app);
	const per = counts(before);
	const run = <T>(f: () => Promise<T>): Promise<T> => withActor(ROOMS_ACTOR, f);

	const roomsPlan = planRooms(seed, await c.rooms.list(app), await c.people.list(app), now);
	const roomIds = new Map<string, string>();
	const mapping: MappingRow[] = [];
	const floorOf = new Map(seed.floors.flatMap((f) => f.rooms.map((r) => [r.id, f.name] as const)));
	for (const step of roomsPlan.steps) {
		let id: string;
		if (step.kind === "create")
			id = dryRun
				? `pending:${step.seedId}`
				: (await run(() => c.rooms.insert({ ...step.next, id: freshId("o") }))).id;
		else {
			id = step.before.id;
			if (step.kind === "update" && !dryRun) await run(() => c.rooms.replace(step.next));
		}
		roomIds.set(step.seedId, id);
		mapping.push({
			from: step.kind === "create" ? null : step.before.name,
			to: step.next.name,
			floor: floorOf.get(step.seedId) ?? "",
			id,
			kind: step.kind,
			appointments: per.get(id) ?? 0,
		});
	}
	const left: LeftRow[] = [];
	for (const step of roomsPlan.left) {
		if (step.kind === "retire" && !dryRun) await run(() => c.rooms.replace(step.next));
		left.push({
			name: step.before.name,
			id: step.before.id,
			kind: step.kind,
			appointments: per.get(step.before.id) ?? 0,
		});
	}

	const stored = await store.docs.get(app, "floor_plan");
	const revision = stored?.revision ?? 0;
	const doc = FloorPlanDocument.parse(
		roomsPlanDocument(seed, (seedId) => roomIds.get(seedId) ?? seedId, revision + 1),
	);
	const body = JSON.stringify(doc);
	const planSame = stored !== undefined && withoutRevision(stored.body) === withoutRevision(body);
	let planRevision = revision;
	if (!planSame && !dryRun)
		planRevision = (await run(() => store.docs.put(app, "floor_plan", revision, body))).revision;

	const report: ApplyReport = {
		app,
		dryRun,
		mapping,
		left,
		plan: { saved: !planSame, revision: planRevision },
		appointments: {
			total: before.length,
			withRoom: [...per.values()].reduce((a, b) => a + b, 0),
			moved: 0,
		},
	};

	const org = input.org;
	if (org !== undefined) {
		const catalog = planCatalog({
			org,
			roomIds,
			app: appRow,
			devices: await c.devices.list(app),
			groups: await c.groups.list(app),
			now,
		});
		const deviceIds = new Map<string, string>();
		if (!dryRun) await run(() => write(catalog.app, c.apps, "a"));
		for (const step of catalog.devices) {
			const row = dryRun
				? step.kind === "create"
					? { ...step.next, id: `pending:${step.label}` }
					: step.before
				: await run(() => write(step, c.devices, "d"));
			deviceIds.set(nameKey(row.name), row.id);
		}
		if (!dryRun) for (const step of catalog.groups) await run(() => write(step, c.groups, "g"));
		const staff = planStaff({
			rooms: seed,
			org,
			roomIds,
			deviceIds,
			services: await c.services.list(app),
			people: await c.people.list(app),
			links: input.links,
			now,
		});
		if (!dryRun) {
			for (const step of staff.services) await run(() => write(step, c.services, "s"));
			for (const step of staff.people) await run(() => write(step, c.people, "p"));
		}
		report.catalog = catalog;
		report.staff = staff;
	}

	if (!dryRun) {
		const after = new Map((await c.appointments.list(app)).map((a) => [a.id, a]));
		const roomsNow = new Set((await c.rooms.list(app)).map((r) => r.id));
		const moved = before.filter((a) => {
			const now = after.get(a.id);
			return (
				now === undefined ||
				where(now) !== where(a) ||
				(now.roomId !== undefined && !roomsNow.has(now.roomId))
			);
		});
		report.appointments.moved = moved.length;
		if (moved.length > 0)
			throw new AppointmentsMoved(
				`${moved.length} appointments no longer have the room or device they had (first: ${moved[0]?.id})`,
			);
	}
	return report;
}
