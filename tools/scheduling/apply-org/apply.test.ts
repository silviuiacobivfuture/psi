import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseRoomsSeed, type RoomsSeed } from "@psi/scheduling/clinic";
import type { AppointmentRow, StorePort } from "@psi/scheduling-api/store-types";
import { createWorld, type Populated } from "@psi/scheduling-api/testing-populate";
import { beforeEach, describe, expect, it } from "vitest";
import { AppointmentsMoved, applyOrg, ROOMS_ACTOR } from "./apply";
import { RoomsPlanRefused } from "./plan-rooms";
import { type OrgSeed, parseOrgSeed } from "./seed";

const seedFile = (name: string): unknown =>
	JSON.parse(
		readFileSync(createRequire(import.meta.url).resolve(`@psi/scheduling/seed/${name}`), "utf8"),
	);
const ROOMS: RoomsSeed = parseRoomsSeed(seedFile("psizone-rooms.json"));
const ORG: OrgSeed = parseOrgSeed(seedFile("psizone-org.json"), ROOMS);
const APP = "psizone";
const OLD_ROOMS = [
	"Cabinet Psihoterapie 1",
	"Cabinet Psihoterapie 2",
	"Cabinet Terapie",
	"Sală Grup / Hemi-Sync",
	"Sală Kinetoterapie",
	"Cabinet Grup",
];
const TEAM = [
	"Turcu Adrian",
	"Turcu Daniela",
	"Pavel Irina",
	"Nafureanu Nicoleta",
	"Hancu Nicoleta",
];
const ADRIAN = "a".repeat(64);
const DANIELA = "d".repeat(64);
const LINKS = [
	{ person: "Turcu Adrian", subject: ADRIAN },
	{ person: "Turcu Daniela", subject: DANIELA },
];

let w: Populated;
let ids: Record<string, string>;

const str = (v: unknown): string => {
	if (typeof v !== "string") throw new Error("expected an id");
	return v;
};
async function made(path: string, body: unknown): Promise<string> {
	const reply = await w.call("olga", "POST", `/v1/apps/${APP}${path}`, body);
	if (reply.status >= 300) throw new Error(`${path} answered ${reply.status}`);
	return str(reply.json.id);
}

/** The clinic as the import left it: the old system's six rooms, two devices, a group and the team, with bookings. */
beforeEach(async () => {
	w = await createWorld();
	ids = {};
	for (const name of OLD_ROOMS) ids[name] = await made("/rooms", { name, kind: "therapy" });
	for (const name of TEAM)
		ids[name] = await made("/people", { displayName: name, kind: "practitioner" });
	ids["NFB 1"] = await made("/devices", { name: "NFB 1" });
	ids["NFB 2"] = await made("/devices", { name: "NFB 2" });
	ids.RaceMeUp = await made("/groups", { name: "RaceMeUp", kind: "group" });
	const at = Date.UTC(2026, 4, 4, 8);
	let n = 0;
	const book = async (row: Partial<AppointmentRow>): Promise<void> => {
		n += 1;
		await w.store.c.appointments.insert({
			id: `appt-${n}`,
			app: APP,
			kind: "block",
			status: "scheduled",
			practitionerId: ids["Turcu Adrian"] ?? "",
			start: at + n * 3_600_000,
			end: at + n * 3_600_000 + 1_800_000,
			remind: true,
			createdAt: at,
			updatedAt: at,
			...row,
		});
	};
	for (const name of OLD_ROOMS) {
		await book({ roomId: ids[name] });
		await book({ roomId: ids[name] });
	}
	await book({ deviceId: ids["NFB 1"] });
	await book({});
});

const where = async (): Promise<string[]> =>
	(await w.store.c.appointments.list(APP))
		.map((a) => `${a.id}:${a.roomId ?? "-"}:${a.deviceId ?? "-"}`)
		.sort();
/** Every row the run may touch, as stored: what a run that writes nothing leaves exactly as it was. */
const everything = async (store: StorePort = w.store): Promise<string> =>
	JSON.stringify(
		await Promise.all([
			store.c.apps.get(APP, APP),
			store.c.rooms.list(APP),
			store.c.devices.list(APP),
			store.c.groups.list(APP),
			store.c.services.list(APP),
			store.c.people.list(APP),
			store.c.appointments.list(APP),
			store.docs.get(APP, "floor_plan"),
		]),
	);
const run = (dryRun: boolean, extra: { org?: OrgSeed | null; links?: typeof LINKS } = {}) =>
	applyOrg({
		store: w.store,
		rooms: ROOMS,
		...(extra.org === null ? {} : { org: extra.org ?? ORG }),
		links: extra.links ?? LINKS,
		dryRun,
		now: Date.UTC(2026, 10, 14),
	});
const room = async (name: string) => (await w.store.c.rooms.list(APP)).find((r) => r.name === name);

describe("apply-org on a clinic the import made", () => {
	it("a dry run reports the mapping and writes nothing", async () => {
		const before = await everything();
		const report = await run(true);
		expect(await everything()).toBe(before);
		expect(report.dryRun).toBe(true);
		expect(report.plan.saved).toBe(true);
		const map = Object.fromEntries(report.mapping.map((m) => [m.to, m.from]));
		expect(map).toMatchObject({
			"Turcu Adrian": "Cabinet Psihoterapie 1",
			"Turcu Daniela": "Cabinet Psihoterapie 2",
			"Sală terapie grup": "Sală Grup / Hemi-Sync",
			"Cabinet psihoterapie": "Cabinet Grup",
			"Pavel Irina": null,
			"Cabinet 1": null,
		});
		expect(report.mapping).toHaveLength(11);
		expect(report.left.map((l) => [l.name, l.kind]).sort()).toEqual([
			["Cabinet Terapie", "retire"],
			["Room One", "untouched"],
			["Sală Kinetoterapie", "retire"],
		]);
	});

	it("renames the imported rooms in place, makes the rest, and no appointment loses its room or device", async () => {
		const before = await where();
		const report = await run(false);
		expect(await where()).toEqual(before);
		// The populated world brings two appointments of its own, in its own room.
		expect(report.appointments).toMatchObject({ total: 16, withRoom: 14, moved: 0 });
		expect(report.mapping.find((m) => m.to === "Turcu Adrian")?.appointments).toBe(2);
		expect(report.left.find((l) => l.name === "Sală Kinetoterapie")?.appointments).toBe(2);
		const adrian = await room("Turcu Adrian");
		expect(adrian?.id).toBe(ids["Cabinet Psihoterapie 1"]);
		expect(adrian).toMatchObject({
			kind: "therapy",
			floor: "Etajul 1",
			purpose: "Consiliere și psihoterapie",
			homePractitionerId: ids["Turcu Adrian"],
			active: true,
		});
		expect((await room("Năfureanu Nicoleta"))?.homePractitionerId).toBe(ids["Nafureanu Nicoleta"]);
		expect(await room("Mapping cerebral")).toMatchObject({ kind: "neuro", floor: "Etajul 1" });
		for (const name of ["Cabinet Terapie", "Sală Kinetoterapie"])
			expect(await room(name)).toMatchObject({ id: ids[name], active: false, bookable: false });
		expect((await room("Room One"))?.active).toBe(true);
		const names = (await w.store.c.rooms.list(APP)).filter((r) => r.active).map((r) => r.name);
		expect(names.sort()).toEqual(
			[...ROOMS.floors.flatMap((f) => f.rooms.map((r) => r.name)), "Room One"].sort(),
		);
	});

	it("draws the floor plan from the stored rooms, saved as system:rooms and served by the service", async () => {
		await run(false);
		const stored = await w.store.docs.get(APP, "floor_plan");
		expect(stored).toMatchObject({ revision: 1, updatedBy: ROOMS_ACTOR });
		const served = await w.call("olga", "GET", `/v1/apps/${APP}/floor-plan`);
		expect(served.status).toBe(200);
		const doc = served.json.doc as { floors: { name: string; shapes: { roomId: string }[] }[] };
		expect(doc.floors.map((f) => f.name)).toEqual(["Parter", "Etajul 1", "Etajul 2"]);
		expect(doc.floors.map((f) => f.shapes.length)).toEqual([2, 3, 6]);
		const linked = doc.floors.flatMap((f) => f.shapes.map((s) => s.roomId)).sort();
		const real = (await w.store.c.rooms.list(APP))
			.filter((r) => ROOMS.floors.some((f) => f.rooms.some((x) => x.name === r.name)))
			.map((r) => r.id)
			.sort();
		expect(linked).toEqual(real);
	});

	it("sets up the organisation: name, devices in their rooms, the group renamed, draft services, own rooms, accounts", async () => {
		const report = await run(false);
		expect((await w.store.c.apps.get(APP, APP))?.name).toBe("Centrul Psihologic PSIZONE");
		const devices = await w.store.c.devices.list(APP);
		const dev = (name: string) => devices.find((d) => d.name === name);
		expect(dev("NFB 1")).toMatchObject({
			id: ids["NFB 1"],
			roomId: (await room("Neurofeedback 1"))?.id,
			deviceType: "nfb",
		});
		expect(dev("NFB 2")?.roomId).toBe((await room("Neurofeedback 2"))?.id);
		expect(dev("QEEG")).toMatchObject({
			roomId: (await room("Mapping cerebral"))?.id,
			deviceType: "qeeg",
		});
		const groups = await w.store.c.groups.list(APP);
		expect(groups.find((g) => g.id === ids.RaceMeUp)?.name).toBe("Race Me Up");
		const services = (await w.store.c.services.list(APP)).filter((s) => s.slug !== "evaluation");
		expect(services.map((s) => s.slug).sort()).toEqual(ORG.services.map((s) => s.slug).sort());
		for (const s of services) {
			expect(s.active, s.slug).toBe(false);
			expect(s.prices, s.slug).toBeUndefined();
		}
		const nfb = services.find((s) => s.slug === "neurofeedback");
		expect(nfb?.deviceIds?.sort()).toEqual([ids["NFB 1"], ids["NFB 2"]].sort());
		expect(services.find((s) => s.slug === "evaluare-qeeg")?.deviceIds).toEqual([dev("QEEG")?.id]);
		const people = await w.store.c.people.list(APP);
		const person = (name: string) => people.find((p) => p.displayName === name);
		expect(person("Turcu Adrian")).toMatchObject({
			subject: ADRIAN,
			roomIds: [ids["Cabinet Psihoterapie 1"]],
		});
		expect(person("Turcu Daniela")).toMatchObject({
			subject: DANIELA,
			roomIds: [ids["Cabinet Psihoterapie 2"]],
		});
		expect(person("Pavel Irina")?.subject).toBeUndefined();
		expect(person("Pavel Irina")?.roomIds).toEqual([(await room("Pavel Irina"))?.id]);
		expect(person("Hancu Nicoleta")?.roomIds).toBeUndefined();
		expect(report.staff?.unlinked).toEqual(["Hancu Nicoleta", "Nafureanu Nicoleta", "Pavel Irina"]);
	});

	it("runs again and writes nothing", async () => {
		await run(false);
		const after = await everything();
		const again = await run(false);
		expect(await everything()).toBe(after);
		expect(again.plan.saved).toBe(false);
		expect(again.mapping.every((m) => m.kind === "keep")).toBe(true);
		expect(again.left.filter((l) => l.kind === "retire")).toEqual([]);
		const steps = [
			again.catalog?.app,
			...(again.catalog?.devices ?? []),
			...(again.catalog?.groups ?? []),
			...(again.staff?.services ?? []),
			...(again.staff?.people ?? []),
		];
		expect(steps.map((s) => s?.kind)).toEqual(steps.map(() => "keep"));
		expect((await run(true)).mapping.map((m) => m.kind)).toEqual(again.mapping.map(() => "keep"));
	});

	it("--only rooms sets the rooms and the plan and leaves the organisation alone", async () => {
		const report = await run(false, { org: null, links: [] });
		expect(report.catalog).toBeUndefined();
		expect((await w.store.c.apps.get(APP, APP))?.name).toBe("Psizone");
		expect((await w.store.c.devices.list(APP)).map((d) => d.name).sort()).toEqual(
			["Device One", "NFB 1", "NFB 2"].sort(),
		);
		expect((await room("Turcu Adrian"))?.id).toBe(ids["Cabinet Psihoterapie 1"]);
	});

	it("a service the owners already hold is left as they left it", async () => {
		await made("/services", {
			slug: "logopedie",
			name: { ro: "Logopedie (60)", en: "Speech" },
			durationMinutes: 60,
			modes: ["onsite"],
		});
		const report = await run(false);
		const held = (await w.store.c.services.list(APP)).find((s) => s.slug === "logopedie");
		expect(held).toMatchObject({
			durationMinutes: 60,
			active: true,
			name: { ro: "Logopedie (60)" },
		});
		expect(report.staff?.services.find((s) => s.label === "logopedie")?.kind).toBe("keep");
	});
});

describe("apply-org refuses, writing nothing", () => {
	it("when two stored rooms could each be the same room", async () => {
		await made("/rooms", { name: "turcu ADRIAN", kind: "therapy" });
		await made("/rooms", { name: "Turcu Adrian", kind: "therapy" });
		const before = await everything();
		await expect(run(false)).rejects.toThrow(RoomsPlanRefused);
		expect(await everything()).toBe(before);
	});
	it("when a link names no one on the team", async () => {
		const before = await everything();
		await expect(
			run(false, { links: [{ person: "Nobody Here", subject: ADRIAN }] }),
		).rejects.toThrow(/no one on the team/);
		expect(await everything()).toBe(before);
	});
	it("when the account is already another person's", async () => {
		await w.store.c.people.replace({
			...((await w.store.c.people.get(APP, ids["Pavel Irina"] ?? "")) ?? fail()),
			subject: ADRIAN,
		});
		const before = await everything();
		await expect(run(false)).rejects.toThrow(/already Pavel Irina's/);
		expect(await everything()).toBe(before);
	});
	it("when the practitioner is already linked to another account", async () => {
		await w.store.c.people.replace({
			...((await w.store.c.people.get(APP, ids["Turcu Daniela"] ?? "")) ?? fail()),
			subject: "someone-else",
		});
		const before = await everything();
		await expect(run(false)).rejects.toThrow(/already linked to another account/);
		expect(await everything()).toBe(before);
	});
	it("when the app is not in the store", async () => {
		await expect(
			applyOrg({
				store: w.store,
				rooms: { ...ROOMS, app: "nowhere" },
				links: [],
				dryRun: true,
				now: 1,
			}),
		).rejects.toThrow(/not in the store/);
	});
});

describe("apply-org checks the appointments it read against what it leaves", () => {
	it("fails when an appointment's room changed under it", async () => {
		// Someone moves a booking while the run writes the rooms: the run must say so, not report success.
		const real = w.store.c.rooms;
		const store: StorePort = {
			...w.store,
			docs: w.store.docs,
			c: {
				...w.store.c,
				rooms: {
					get: (app, id) => real.get(app, id),
					list: (app, q) => real.list(app, q),
					insert: (row) => real.insert(row),
					remove: (app, id) => real.remove(app, id),
					async replace(row) {
						const a = await w.store.c.appointments.get(APP, "appt-1");
						if (a !== undefined)
							await w.store.c.appointments.replace({ ...a, roomId: ids["Cabinet Terapie"] });
						return real.replace(row);
					},
				},
			},
		};
		await expect(
			applyOrg({ store, rooms: ROOMS, links: [], dryRun: false, now: 1 }),
		).rejects.toThrow(AppointmentsMoved);
	});
});

function fail(): never {
	throw new Error("the populated row is missing");
}
