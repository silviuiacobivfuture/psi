import { nameKey, type RoomsSeed } from "@psi/scheduling/clinic";
import type {
	AppRow,
	DeviceRow,
	GroupRow,
	PersonRow,
	ServiceRow,
} from "@psi/scheduling-api/store-types";
import { homeOf, RoomsPlanRefused } from "./plan-rooms";
import type { OrgSeed } from "./seed";

/** One row's fate: made, changed, or already as the seed says (a stored service: as the owners left it). */
export type Step<R> =
	| { kind: "create"; label: string; next: R }
	| { kind: "update"; label: string; before: R; next: R }
	| { kind: "keep"; label: string; before: R };

/** A sign-in account to link: the practitioner's name and the account's subject. */
export interface AccountLink {
	person: string;
	subject: string;
}

const stepOf = <R extends { updatedAt: number }>(
	label: string,
	before: R | undefined,
	next: R,
	compare: ReadonlyArray<keyof R>,
): Step<R> => {
	if (before === undefined) return { kind: "create", label, next };
	const same = compare.every((k) => JSON.stringify(before[k]) === JSON.stringify(next[k]));
	return same ? { kind: "keep", label, before } : { kind: "update", label, before, next };
};

/** The one stored row a seed entry names (by its name, then a former one); two are refused. */
function matchOne<R>(
	rows: ReadonlyArray<R>,
	nameOf: (r: R) => string,
	names: ReadonlyArray<string>,
	what: string,
): R | undefined {
	for (const n of names) {
		const found = rows.filter((r) => nameKey(nameOf(r)) === nameKey(n));
		if (found.length > 1) throw new RoomsPlanRefused(`${found.length} ${what}s are named ${n}`);
		if (found[0] !== undefined) return found[0];
	}
	return undefined;
}

/** The stored id of a seed's room or device; on a dry run, a room or device still to be made has a stand-in id. */
const idIn = (ids: ReadonlyMap<string, string>, key: string, what: string): string => {
	const id = ids.get(key);
	if (id === undefined) throw new RoomsPlanRefused(`the ${what} ${key} has no stored id`);
	return id;
};

export interface CatalogPlan {
	app: Step<AppRow>;
	devices: Step<DeviceRow>[];
	groups: Step<GroupRow>[];
}

/**
 * The organisation's name, each device in its room (one of the old system's kept by its name, and with it every
 * appointment booked on it) and the groups (renamed in place), from what the store holds.
 */
export function planCatalog(input: {
	org: OrgSeed;
	/** The stored id of each of the owner's rooms, by the rooms seed's id. */
	roomIds: ReadonlyMap<string, string>;
	app: AppRow;
	devices: ReadonlyArray<DeviceRow>;
	groups: ReadonlyArray<GroupRow>;
	now: number;
}): CatalogPlan {
	const { org, now } = input;
	const app = stepOf("organisation", input.app, { ...input.app, name: org.name, updatedAt: now }, [
		"name",
	]);
	const devices = org.devices.map((d) => {
		const before = matchOne(input.devices, (r) => r.name, [d.name, ...d.formerly], "device");
		const facts = {
			name: d.name,
			roomId: idIn(input.roomIds, d.room, "room"),
			deviceType: d.deviceType,
			active: true,
		};
		const next: DeviceRow =
			before === undefined
				? { id: "", app: org.app, ...facts, createdAt: now, updatedAt: now }
				: { ...before, ...facts, updatedAt: now };
		return stepOf(d.name, before, next, ["name", "roomId", "deviceType", "active"]);
	});
	const groups = org.groups.map((g) => {
		const before = matchOne(input.groups, (r) => r.name, [g.name, ...g.formerly], "group");
		const next: GroupRow =
			before === undefined
				? {
						id: "",
						app: org.app,
						name: g.name,
						kind: g.kind,
						clientIds: [],
						active: true,
						createdAt: now,
						updatedAt: now,
					}
				: { ...before, name: g.name, kind: g.kind, updatedAt: now };
		return stepOf(g.name, before, next, ["name", "kind"]);
	});
	return { app, devices, groups };
}

export interface StaffPlan {
	services: Step<ServiceRow>[];
	people: Step<PersonRow>[];
	/** The active practitioners still with no sign-in account after the plan. */
	unlinked: string[];
}

/**
 * The services the seed lists that the store lacks, as inactive drafts with no price (one the store holds is the
 * owners' and is left alone), and each practitioner with a room of their own given that room first among theirs and
 * linked to the sign-in account the run names. A link to an account another person has, or to a person already linked
 * elsewhere, is refused.
 */
export function planStaff(input: {
	rooms: RoomsSeed;
	org: OrgSeed;
	roomIds: ReadonlyMap<string, string>;
	/** The stored id of each seed device, by its name's key. */
	deviceIds: ReadonlyMap<string, string>;
	services: ReadonlyArray<ServiceRow>;
	people: ReadonlyArray<PersonRow>;
	links: ReadonlyArray<AccountLink>;
	now: number;
}): StaffPlan {
	const { org, now } = input;
	const services = org.services.map((s): Step<ServiceRow> => {
		const before = input.services.find((r) => r.slug === s.slug);
		if (before !== undefined) return { kind: "keep", label: s.slug, before };
		return {
			kind: "create",
			label: s.slug,
			next: {
				id: "",
				app: org.app,
				slug: s.slug,
				name: s.name,
				durationMinutes: org.serviceDraft.durationMinutes,
				bufferMinutes: 0,
				modes: org.serviceDraft.modes,
				practitionerIds: [],
				category: s.category,
				roomCategory: s.category,
				roomIds: s.rooms.map((r) => idIn(input.roomIds, r, "room")),
				deviceIds: s.devices.map((d) => idIn(input.deviceIds, nameKey(d), "device")),
				active: false,
				createdAt: now,
				updatedAt: now,
			},
		};
	});

	const homes = new Map<string, string>();
	for (const floor of input.rooms.floors)
		for (const room of floor.rooms) {
			const home = homeOf(input.people, room.homePractitioner);
			if (home !== undefined) homes.set(home.id, idIn(input.roomIds, room.id, "room"));
		}
	const linkOf = new Map<string, string>();
	for (const l of input.links) {
		const person = homeOf(input.people, l.person);
		if (person === undefined) throw new RoomsPlanRefused(`no one on the team is named ${l.person}`);
		if (person.subject !== undefined && person.subject !== l.subject)
			throw new RoomsPlanRefused(`${l.person} is already linked to another account`);
		const other = input.people.find((p) => p.subject === l.subject && p.id !== person.id);
		if (other !== undefined)
			throw new RoomsPlanRefused(`the account for ${l.person} is already ${other.displayName}'s`);
		linkOf.set(person.id, l.subject);
	}
	const people = input.people
		.filter((p) => homes.has(p.id) || linkOf.has(p.id))
		.map((p) => {
			const room = homes.get(p.id);
			const subject = linkOf.get(p.id) ?? p.subject;
			const roomIds =
				room === undefined ? p.roomIds : [room, ...(p.roomIds ?? []).filter((r) => r !== room)];
			const next: PersonRow = {
				...p,
				...(subject === undefined ? {} : { subject }),
				...(roomIds === undefined ? {} : { roomIds }),
				updatedAt: now,
			};
			return stepOf(p.displayName, p, next, ["subject", "roomIds"]);
		});
	const unlinked = input.people
		.filter((p) => p.kind === "practitioner" && p.active)
		.filter((p) => (linkOf.get(p.id) ?? p.subject) === undefined)
		.map((p) => p.displayName)
		.sort((a, b) => a.localeCompare(b, "ro"));
	return { services, people, unlinked };
}
