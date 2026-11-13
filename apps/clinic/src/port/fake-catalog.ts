import type { z } from "zod";
import { type ClinicPort, PortError } from "./port";
import type { AppSlug, Column, Service } from "./schema";
import {
	DeviceInputSchema,
	NewRoleSchema,
	PersonInputSchema,
	RoomInputSchema,
	ServiceInputSchema,
} from "./schema-catalog";
import type { AppData } from "./seed";

export interface CatalogDeps {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
	nextId: (prefix: string) => string;
}

type CatalogMethods = Pick<
	ClinicPort,
	| "catalogColumns"
	| "savePerson"
	| "saveRoom"
	| "saveDevice"
	| "saveService"
	| "removeCatalog"
	| "createRole"
	| "deleteRole"
>;

/** The roles the clinic starts with: they are never deleted. */
const SYSTEM_ROLES = new Set(["owner", "reception", "therapist", "accountant"]);

const parse = <S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> => {
	const r = schema.safeParse(raw);
	if (!r.success)
		throw new PortError("invalid", r.error.issues.map((i) => i.path.join(".")).join(","));
	return r.data;
};
const drop = <T extends object>(o: T): T =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** What the calendar and the pickers offer: not switched off, and a person only when they have a calendar. */
export const calendarColumns = (cols: ReadonlyArray<Column>): Column[] =>
	cols.filter((c) => c.active !== false && !(c.kind === "person" && c.bookable === false));
export const activeServices = (list: ReadonlyArray<Service>): Service[] =>
	list.filter((s) => s.active !== false);

/** The team's catalogue in the fake: people, rooms, devices, services and roles, with the service's own rules. */
export function createFakeCatalog(deps: CatalogDeps): CatalogMethods {
	const { guard, log, nextId } = deps;
	const upsert = (
		d: AppData,
		id: string | null,
		make: (id: string) => Column,
		kind: Column["kind"],
	): Column => {
		if (id === null) {
			const made = make(nextId(kind === "person" ? "p" : kind === "room" ? "r" : "d"));
			d.columns.push(made);
			return made;
		}
		const i = d.columns.findIndex((c) => c.id === id && c.kind === kind);
		if (i < 0) throw new PortError("not-found", id);
		const made = make(id);
		d.columns[i] = made;
		return made;
	};
	const exists = (d: AppData, id: string, kind: Column["kind"]): boolean =>
		d.columns.some((c) => c.id === id && c.kind === kind);
	const keep = (d: AppData, id: string | null): Column | undefined =>
		d.columns.find((c) => c.id === id);

	return {
		async catalogColumns(app) {
			guard("catalogColumns");
			return deps.data(app).columns;
		},
		async savePerson(app, id, raw) {
			guard("savePerson");
			const d = deps.data(app);
			const input = parse(PersonInputSchema, raw);
			const known = new Set(d.roles.map((r) => r.id));
			if (!input.roles.every((r) => known.has(r))) throw new PortError("invalid", "roles");
			if (!input.roomIds.every((r) => exists(d, r, "room")))
				throw new PortError("invalid", "roomIds");
			if (!input.serviceIds.every((s) => d.services.some((x) => x.id === s)))
				throw new PortError("invalid", "serviceIds");
			if (
				input.email !== undefined &&
				d.columns.some((c) => c.kind === "person" && c.id !== id && c.email === input.email)
			)
				throw new PortError("conflict", "email");
			const before = keep(d, id);
			const made = upsert(
				d,
				id,
				(pid) =>
					drop({
						id: pid,
						kind: "person" as const,
						name: input.name,
						colour: input.colour,
						email: input.email,
						specialty: input.specialty,
						hours: input.hours,
						roles: input.roles,
						roomIds: input.roomIds,
						serviceIds: input.serviceIds,
						active: input.active,
						bookable: input.practitioner,
					}),
				"person",
			);
			log(d, "console", before === undefined ? "person.create" : "person.update", made.id);
			return made;
		},
		async saveRoom(app, id, raw) {
			guard("saveRoom");
			const d = deps.data(app);
			const input = parse(RoomInputSchema, raw);
			if (input.homeOf !== null && !exists(d, input.homeOf, "person"))
				throw new PortError("invalid", "homeOf");
			const made = upsert(
				d,
				id,
				(rid) =>
					drop({
						id: rid,
						kind: "room" as const,
						name: input.name,
						colour: input.category === "neuro" ? 4 : 5,
						capacity: input.capacity,
						category: input.category,
						floor: input.floor,
						purpose: input.purpose,
						homeOf: input.homeOf ?? undefined,
						bookable: input.bookable,
						active: keep(d, id)?.active,
					}),
				"room",
			);
			log(d, "console", id === null ? "room.create" : "room.update", made.id);
			return made;
		},
		async saveDevice(app, id, raw) {
			guard("saveDevice");
			const d = deps.data(app);
			const input = parse(DeviceInputSchema, raw);
			if (input.roomId !== null && !exists(d, input.roomId, "room"))
				throw new PortError("invalid", "roomId");
			const made = upsert(
				d,
				id,
				(did) =>
					drop({
						id: did,
						kind: "device" as const,
						name: input.name,
						colour: 4,
						deviceType: input.type,
						deviceRoom: input.roomId ?? undefined,
						bookable: input.bookable,
						active: keep(d, id)?.active,
					}),
				"device",
			);
			log(d, "console", id === null ? "device.create" : "device.update", made.id);
			return made;
		},
		async saveService(app, id, raw) {
			guard("saveService");
			const d = deps.data(app);
			const input = parse(ServiceInputSchema, raw);
			if (!input.practitionerIds.every((p) => exists(d, p, "person")))
				throw new PortError("invalid", "practitionerIds");
			if (!input.roomIds.every((r) => exists(d, r, "room")))
				throw new PortError("invalid", "roomIds");
			if (!input.deviceIds.every((x) => exists(d, x, "device")))
				throw new PortError("invalid", "deviceIds");
			const made: Service = drop({
				id: id ?? nextId("s"),
				name: input.name,
				durationMin: input.durationMin,
				priceBani: input.priceBani,
				category: input.category,
				roomCategory: input.roomCategory ?? undefined,
				bufferMin: input.bufferMin,
				online: input.online,
				practitionerIds: input.practitionerIds,
				roomIds: input.roomIds,
				deviceIds: input.deviceIds,
				active: input.active,
			});
			const i = id === null ? -1 : d.services.findIndex((s) => s.id === id);
			if (id !== null && i < 0) throw new PortError("not-found", id);
			if (i < 0) d.services.push(made);
			else d.services[i] = made;
			log(d, "console", id === null ? "service.create" : "service.update", made.id);
			return made;
		},
		async removeCatalog(app, kind, id) {
			guard("removeCatalog");
			const d = deps.data(app);
			if (kind === "service") {
				if (!d.services.some((s) => s.id === id)) throw new PortError("not-found", id);
				const used = d.appointments.some((a) => a.serviceId === id);
				if (used) {
					d.services = d.services.map((s) => (s.id === id ? { ...s, active: false } : s));
					log(d, "console", "service.deactivate", id);
					return { outcome: "deactivated" };
				}
				d.services = d.services.filter((s) => s.id !== id);
				log(d, "console", "service.delete", id);
				return { outcome: "deleted" };
			}
			if (!exists(d, id, kind)) throw new PortError("not-found", id);
			const used = d.appointments.some((a) => a.columnId === id || a.resourceIds.includes(id));
			if (used) {
				d.columns = d.columns.map((c) => (c.id === id ? { ...c, active: false } : c));
				log(d, "console", `${kind}.deactivate`, id);
				return { outcome: "deactivated" };
			}
			d.columns = d.columns
				.filter((c) => c.id !== id)
				.map((c) => ({
					...c,
					...(c.homeOf === id ? { homeOf: undefined } : {}),
					...(c.deviceRoom === id ? { deviceRoom: undefined } : {}),
					...(c.roomIds?.includes(id) === true
						? { roomIds: c.roomIds.filter((x) => x !== id) }
						: {}),
				}))
				.map((c) => drop(c));
			d.services = d.services.map((s) =>
				drop({
					...s,
					practitionerIds: s.practitionerIds?.filter((x) => x !== id),
					roomIds: s.roomIds?.filter((x) => x !== id),
					deviceIds: s.deviceIds?.filter((x) => x !== id),
				}),
			);
			log(d, "console", `${kind}.delete`, id);
			return { outcome: "deleted" };
		},
		async createRole(app, raw) {
			guard("createRole");
			const d = deps.data(app);
			const input = parse(NewRoleSchema, raw);
			const from =
				input.copyFrom === null ? undefined : d.roles.find((r) => r.id === input.copyFrom);
			if (input.copyFrom !== null && from === undefined) throw new PortError("invalid", "copyFrom");
			if (d.roles.some((r) => r.name.toLowerCase() === input.name.toLowerCase()))
				throw new PortError("conflict", "name");
			const role = {
				id: nextId("role"),
				name: input.name,
				description: input.description ?? "",
				members: 0,
				grants: from === undefined ? {} : structuredClone(from.grants),
				fieldGroups: from === undefined ? [] : [...from.fieldGroups],
			};
			d.roles.push(role);
			log(d, "console", "role.create", role.id);
			return role;
		},
		async deleteRole(app, id) {
			guard("deleteRole");
			const d = deps.data(app);
			const role = d.roles.find((r) => r.id === id);
			if (role === undefined) throw new PortError("not-found", id);
			if (SYSTEM_ROLES.has(id) || role.members > 0) throw new PortError("conflict", "in use");
			d.roles = d.roles.filter((r) => r.id !== id);
			log(d, "console", "role.delete", id);
		},
	};
}
