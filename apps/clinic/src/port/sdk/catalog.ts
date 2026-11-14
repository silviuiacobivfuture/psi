import { PortError } from "../port";
import { grantsFromRelations } from "../role-map";
import type { AppSlug, Column, Role, Service } from "../schema";
import {
	type CatalogKind,
	type DeviceInput,
	DeviceInputSchema,
	type NewRole,
	NewRoleSchema,
	type PersonInput,
	PersonInputSchema,
	type RoomInput,
	RoomInputSchema,
	type ServiceInput,
	ServiceInputSchema,
} from "../schema-catalog";
import type { SdkContext } from "./context";
import { deviceColumn, drain, personColumn, roomColumn, serviceOf } from "./map";

const invalid = (what: string): PortError => new PortError("invalid", what);
const slugOf = (name: string): string =>
	name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);

/**
 * People, rooms, devices, services and roles, over the service's `people`, `rooms`, `devices`, `services` and `roles`
 * routes, with everything the service keeps: a person's e-mail, specialty, hours, rooms and services; a room's floor,
 * purpose, category, bookable flag and own practitioner; a device's type and bookable flag; a service's category, room
 * category, rooms, devices, online flag and price (the price route). What is not the service's to keep (the e-mail
 * invitation into sign-in) is not done here.
 */
export function catalogGroup(sdk: SdkContext) {
	const { api, run } = sdk;
	const page = <T>(
		app: AppSlug,
		f: (i: {
			app: string;
			limit: number;
			cursor?: string;
		}) => Promise<{ items: T[]; nextCursor?: string | undefined }>,
	) => drain<T>((cursor) => f({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }));
	return {
		/** Every person, room and device, the switched-off ones too. */
		catalogColumns: (app: AppSlug): Promise<Column[]> =>
			run(async () => {
				const [people, rooms, devices] = await Promise.all([
					page(app, (i) => api.people.list(i)),
					page(app, (i) => api.rooms.list(i)),
					page(app, (i) => api.devices.list(i)),
				]);
				return [
					...people.map((p, i) => personColumn(p, i)),
					...rooms.map((r, i) => roomColumn(r, i + 4)),
					...devices.map((d, i) => deviceColumn(d, i + 3)),
				];
			}),

		savePerson: (app: AppSlug, id: string | null, raw: PersonInput): Promise<Column> =>
			run(async () => {
				const p = PersonInputSchema.safeParse(raw);
				if (!p.success) throw invalid("person");
				const body = {
					displayName: p.data.name,
					kind: p.data.practitioner ? ("practitioner" as const) : ("staff" as const),
					color: String(p.data.colour),
					hours: p.data.hours,
					roomIds: p.data.roomIds,
					serviceIds: p.data.serviceIds,
					...(p.data.email === undefined ? {} : { email: p.data.email }),
					...(p.data.specialty === undefined ? {} : { specialty: p.data.specialty }),
				};
				const saved =
					id === null
						? await api.people.create({ app, ...body })
						: await api.people.update({ app, id, ...body, active: p.data.active });
				return personColumn(saved, p.data.colour - 1);
			}),

		saveRoom: (app: AppSlug, id: string | null, raw: RoomInput): Promise<Column> =>
			run(async () => {
				const r = RoomInputSchema.safeParse(raw);
				if (!r.success) throw invalid("room");
				const body = {
					name: r.data.name,
					kind: r.data.category,
					capacity: r.data.capacity,
					bookable: r.data.bookable,
					...(r.data.floor === undefined ? {} : { floor: r.data.floor }),
					...(r.data.purpose === undefined ? {} : { purpose: r.data.purpose }),
					...(r.data.homeOf === null ? {} : { homePractitionerId: r.data.homeOf }),
				};
				const saved =
					id === null
						? await api.rooms.create({ app, ...body })
						: await api.rooms.update({ app, id, ...body });
				return roomColumn(saved, 4);
			}),

		saveDevice: (app: AppSlug, id: string | null, raw: DeviceInput): Promise<Column> =>
			run(async () => {
				const d = DeviceInputSchema.safeParse(raw);
				if (!d.success) throw invalid("device");
				const body = {
					name: d.data.name,
					deviceType: d.data.type,
					bookable: d.data.bookable,
					...(d.data.roomId === null ? {} : { roomId: d.data.roomId }),
				};
				const saved =
					id === null
						? await api.devices.create({ app, ...body })
						: await api.devices.update({ app, id, ...body });
				return deviceColumn(saved, 3);
			}),

		saveService: (app: AppSlug, id: string | null, raw: ServiceInput): Promise<Service> =>
			run(async () => {
				const s = ServiceInputSchema.safeParse(raw);
				if (!s.success) throw invalid("service");
				const shared = {
					name: { ro: s.data.name, en: s.data.name },
					durationMinutes: s.data.durationMin,
					bufferMinutes: s.data.bufferMin,
					practitionerIds: s.data.practitionerIds,
					modes: s.data.online ? (["onsite", "online"] as const) : (["onsite"] as const),
					roomIds: s.data.roomIds,
					deviceIds: s.data.deviceIds,
					...(s.data.category === undefined ? {} : { category: s.data.category }),
					...(s.data.roomCategory === null ? {} : { roomCategory: s.data.roomCategory }),
				};
				const modes = [...shared.modes];
				const saved =
					id === null
						? await api.services.create({ app, slug: slugOf(s.data.name), ...shared, modes })
						: await api.services.update({ app, id, ...shared, modes, active: s.data.active });
				// The price has its own route (and its own permission): only said when there is one to say.
				const priced =
					s.data.priceBani === null
						? saved
						: await api.services.setPrice({
								app,
								id: saved.id,
								priceCents: s.data.priceBani,
								currency: "RON",
							});
				return serviceOf(priced);
			}),

		removeCatalog: (
			app: AppSlug,
			kind: CatalogKind,
			id: string,
		): Promise<{ outcome: "deleted" | "deactivated" }> =>
			run(async () => {
				// The service deletes, or deactivates when there is history; its answer does not say which.
				if (kind === "person") await api.people.remove({ app, id });
				else if (kind === "room") await api.rooms.remove({ app, id });
				else if (kind === "device") await api.devices.remove({ app, id });
				else await api.services.remove({ app, id });
				return { outcome: "deleted" as const };
			}),

		createRole: (app: AppSlug, raw: NewRole): Promise<Role> =>
			run(async () => {
				const r = NewRoleSchema.safeParse(raw);
				if (!r.success) throw invalid("role");
				const made = await api.roles.create({
					app,
					name: r.data.name,
					...(r.data.description === undefined ? {} : { description: r.data.description }),
					...(r.data.copyFrom === null ? {} : { copyFrom: r.data.copyFrom }),
				});
				return {
					id: made.id,
					name: made.name,
					description: made.description ?? "",
					members: 0,
					...grantsFromRelations(made.permissions),
				};
			}),

		deleteRole: (app: AppSlug, id: string): Promise<void> =>
			run(async () => {
				await api.roles.remove({ app, id });
			}),
	};
}
