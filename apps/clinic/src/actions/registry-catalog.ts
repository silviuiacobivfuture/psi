import { z } from "zod";
import { m } from "../paraglide/messages.js";
import {
	DeviceInputSchema,
	NewRoleSchema,
	PersonInputSchema,
	RoomInputSchema,
	ServiceInputSchema,
} from "../port/schema-catalog";
import { define, label } from "./define";
import type { ActionDef, EntityKind, Screen } from "./types";

const id = z.string().min(1).max(100);
const area = (kind: string): string => `/settings/${kind}`;

interface Cfg {
	kind: "person" | "room" | "device" | "service";
	entity: EntityKind;
	segment: "people" | "rooms" | "devices" | "services";
	screen: Screen;
	keys: { create: string; edit: string; remove: string };
	text: {
		add: (locale: "ro" | "en") => string;
		edit: (locale: "ro" | "en") => string;
		remove: (locale: "ro" | "en") => string;
	};
}

const CFG: ReadonlyArray<Cfg> = [
	{
		kind: "person",
		entity: "person",
		segment: "people",
		screen: "settings.people",
		keys: { create: "people_create", edit: "people_edit", remove: "people_archive" },
		text: {
			add: (l) => m.ac_person_add({}, { locale: l }),
			edit: (l) => m.ac_person_edit({}, { locale: l }),
			remove: (l) => m.ac_person_remove({}, { locale: l }),
		},
	},
	{
		kind: "room",
		entity: "room",
		segment: "rooms",
		screen: "settings.rooms",
		keys: { create: "rooms_create", edit: "rooms_edit", remove: "rooms_delete" },
		text: {
			add: (l) => m.ac_room_add({}, { locale: l }),
			edit: (l) => m.ac_room_edit({}, { locale: l }),
			remove: (l) => m.ac_room_remove({}, { locale: l }),
		},
	},
	{
		kind: "device",
		entity: "device",
		segment: "devices",
		screen: "settings.devices",
		keys: { create: "devices_create", edit: "devices_edit", remove: "devices_delete" },
		text: {
			add: (l) => m.ac_device_add({}, { locale: l }),
			edit: (l) => m.ac_device_edit({}, { locale: l }),
			remove: (l) => m.ac_device_remove({}, { locale: l }),
		},
	},
	{
		kind: "service",
		entity: "service",
		segment: "services",
		screen: "settings.services",
		keys: { create: "services_create", edit: "services_edit", remove: "services_delete" },
		text: {
			add: (l) => m.ac_service_add({}, { locale: l }),
			edit: (l) => m.ac_service_edit({}, { locale: l }),
			remove: (l) => m.ac_service_remove({}, { locale: l }),
		},
	},
];

const inputOf = {
	person: PersonInputSchema,
	room: RoomInputSchema,
	device: DeviceInputSchema,
	service: ServiceInputSchema,
} as const;

function forKind(c: Cfg): ReadonlyArray<ActionDef> {
	const base = area(c.segment);
	return [
		define({
			id: `${c.kind}.new`,
			tier: "org",
			entity: c.entity,
			label: c.text.add,
			icon: "plus",
			placements: { primary: [c.screen], empty: [c.screen], palette: ["global"] },
			mobile: "fab",
			needs: { write: [c.keys.create] },
			route: { method: "POST", path: `${base}/save` },
			confirm: "none",
			opens: "editItem",
			to: () => `${base}?new=1`,
			params: z.object({ id: z.null().default(null), input: inputOf[c.kind] }),
			run: async (ctx, p) => {
				const made = await save(ctx, c.kind, null, p.input);
				return { status: "ok", to: `${base}?saved=${encodeURIComponent(made)}` };
			},
		}),
		define({
			id: `${c.kind}.edit`,
			tier: "org",
			entity: c.entity,
			label: c.text.edit,
			icon: "edit",
			placements: { screen: [c.screen], menu: [c.screen] },
			mobile: "list",
			needs: { write: [c.keys.edit] },
			route: { method: "POST", path: `${base}/:id/save` },
			confirm: "none",
			to: (e) => `${base}?edit=${encodeURIComponent(e.id ?? "")}`,
			params: z.object({ id, input: inputOf[c.kind] }),
			run: async (ctx, p) => {
				await save(ctx, c.kind, p.id, p.input);
				return { status: "ok", to: `${base}?saved=${encodeURIComponent(p.id)}` };
			},
		}),
		define({
			id: `${c.kind}.remove`,
			tier: "org",
			entity: c.entity,
			label: c.text.remove,
			icon: "trash",
			placements: { menu: [c.screen] },
			mobile: "menu",
			needs: { write: [c.keys.remove] },
			route: { method: "POST", path: `${base}/:id/remove` },
			confirm: "confirm",
			to: (e) => `${base}?confirm=${encodeURIComponent(e.id ?? "")}`,
			params: z.object({ id }),
			run: async (ctx, p) => {
				const r = await ctx.port.removeCatalog(ctx.app, c.kind, p.id);
				return { status: "ok", to: `${base}?${r.outcome}=1` };
			},
		}),
	];
}

async function save(
	ctx: Parameters<NonNullable<ActionDef["run"]>>[0],
	kind: Cfg["kind"],
	itemId: string | null,
	input: unknown,
): Promise<string> {
	switch (kind) {
		case "person":
			return (await ctx.port.savePerson(ctx.app, itemId, PersonInputSchema.parse(input))).id;
		case "room":
			return (await ctx.port.saveRoom(ctx.app, itemId, RoomInputSchema.parse(input))).id;
		case "device":
			return (await ctx.port.saveDevice(ctx.app, itemId, DeviceInputSchema.parse(input))).id;
		case "service":
			return (await ctx.port.saveService(ctx.app, itemId, ServiceInputSchema.parse(input))).id;
		default: {
			const never: never = kind;
			return never;
		}
	}
}

export const CATALOG_ACTIONS: ReadonlyArray<ActionDef> = [
	...CFG.flatMap(forKind),
	define({
		id: "role.new",
		tier: "org",
		entity: "role",
		label: label((o) => m.ac_role_add({}, o)),
		icon: "plus",
		placements: { primary: ["settings.roles"], empty: ["settings.roles"], palette: ["global"] },
		mobile: "fab",
		needs: { write: ["roles_create"] },
		route: { method: "POST", path: "/settings/roles" },
		confirm: "none",
		opens: "newRole",
		to: () => "/settings/roles?new=1",
		params: NewRoleSchema,
		run: async (ctx, p) => {
			const made = await ctx.port.createRole(ctx.app, p);
			return { status: "ok", to: `/settings/roles?role=${encodeURIComponent(made.id)}&saved=1` };
		},
	}),
	define({
		id: "role.delete",
		tier: "org",
		entity: "role",
		label: label((o) => m.ac_role_delete({}, o)),
		icon: "trash",
		placements: { menu: ["settings.roles"] },
		mobile: "menu",
		needs: { write: ["roles_delete"] },
		route: { method: "POST", path: "/settings/roles/:id/delete" },
		confirm: "confirm",
		to: (e) => `/settings/roles?confirm=${encodeURIComponent(e.id ?? "")}`,
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.deleteRole(ctx.app, p.id);
			return { status: "ok", to: "/settings/roles?deleted=1" };
		},
	}),
];
