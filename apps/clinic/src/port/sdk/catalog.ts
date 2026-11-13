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
import { column, serviceOf } from "./map";

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
 * routes. The service keeps less than the console asks for: what it has no field for (a person's e-mail invite,
 * specialty, hours, rooms and services; a room's floor, category, bookable flag and home practitioner; a device's type;
 * a service's price, category, rooms, devices and online flag) is validated here and not stored until the service
 * grows it. The answer carries what the service did keep.
 */
export function catalogGroup(sdk: SdkContext, columns: (app: AppSlug) => Promise<Column[]>) {
	const { api, run } = sdk;
	return {
		catalogColumns: (app: AppSlug): Promise<Column[]> => run(() => columns(app)),

		savePerson: (app: AppSlug, id: string | null, raw: PersonInput): Promise<Column> =>
			run(async () => {
				const p = PersonInputSchema.safeParse(raw);
				if (!p.success) throw invalid("person");
				const kind = p.data.practitioner ? ("practitioner" as const) : ("staff" as const);
				const saved =
					id === null
						? await api.people.create({ app, displayName: p.data.name, kind })
						: await api.people.update({
								app,
								id,
								displayName: p.data.name,
								kind,
								active: p.data.active,
							});
				return {
					...column("person", saved.id, saved.displayName, p.data.colour - 1),
					active: saved.active,
				};
			}),

		saveRoom: (app: AppSlug, id: string | null, raw: RoomInput): Promise<Column> =>
			run(async () => {
				const r = RoomInputSchema.safeParse(raw);
				if (!r.success) throw invalid("room");
				const body = { name: r.data.name, kind: r.data.category, capacity: r.data.capacity };
				const saved =
					id === null
						? await api.rooms.create({ app, ...body })
						: await api.rooms.update({ app, id, ...body });
				return {
					...column("room", saved.id, saved.name, 4, saved.capacity),
					category: r.data.category,
				};
			}),

		saveDevice: (app: AppSlug, id: string | null, raw: DeviceInput): Promise<Column> =>
			run(async () => {
				const d = DeviceInputSchema.safeParse(raw);
				if (!d.success) throw invalid("device");
				const room = d.data.roomId === null ? {} : { roomId: d.data.roomId };
				const saved =
					id === null
						? await api.devices.create({ app, name: d.data.name, ...room })
						: await api.devices.update({ app, id, name: d.data.name, ...room });
				return column("device", saved.id, saved.name, 3);
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
				};
				const saved =
					id === null
						? await api.services.create({
								app,
								slug: slugOf(s.data.name),
								...shared,
								modes: [...shared.modes],
							})
						: await api.services.update({
								app,
								id,
								...shared,
								modes: [...shared.modes],
								active: s.data.active,
							});
				return serviceOf(saved);
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
