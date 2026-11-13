import { describe, expect, it } from "vitest";
import { createFieldCrypto } from "../../ports/crypto";
import { newId } from "../ids";
import type { ClientRow, DeviceRow, GroupRow, PersonRow, RoomRow, ServiceRow } from "../types";
import type { ContractSection } from "./env";

/**
 * People, rooms, devices, group activities, services and clients: the same rows in, the same rows out, on every
 * adapter. Timestamps are the store's to stamp (Convex keeps its own creation times), so rows are compared without them.
 */
const crypto = createFieldCrypto("ab".repeat(32));
const NOW = Date.UTC(2026, 10, 13, 8);
const stamps = { createdAt: NOW, updatedAt: NOW };
const DAY = 86_400_000;

const bare = <T extends { id: string; createdAt: number; updatedAt: number }>(row: T) => {
	const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
	return rest;
};
const bareClient = (row: ClientRow) => {
	const { id: _id, createdAt: _c, updatedAt: _u, archivedAt, deletedAt, purgeAt, ...rest } = row;
	return {
		...rest,
		standing: [archivedAt !== undefined, deletedAt !== undefined, purgeAt !== undefined],
	};
};
const byName = <T extends { name?: string; displayName?: string }>(a: T, b: T): number =>
	(a.name ?? a.displayName ?? "").localeCompare(b.name ?? b.displayName ?? "");

export const catalogSection: ContractSection = (env) => {
	const fresh = async () => {
		const app = await env().newApp();
		return { app, c: env().store.c };
	};

	describe("people", () => {
		const practitioner = (app: string, over: Partial<PersonRow> = {}): PersonRow => ({
			id: newId("p"),
			app,
			displayName: "Dora Test",
			kind: "practitioner",
			active: true,
			external: false,
			...stamps,
			...over,
		});

		it("a practitioner round-trips through insert, get and list, with the store's own id", async () => {
			const { app, c } = await fresh();
			const saved = await c.people.insert(
				practitioner(app, { subject: "dora", color: "#aabbcc", external: true }),
			);
			expect(await c.people.get(app, saved.id)).toMatchObject({
				displayName: "Dora Test",
				kind: "practitioner",
				subject: "dora",
				color: "#aabbcc",
				external: true,
				active: true,
			});
			expect((await c.people.list(app)).map((p) => p.id)).toEqual([saved.id]);
		});

		it("each staff kind is kept as the API named it", async () => {
			const { app, c } = await fresh();
			const rows = [];
			for (const kind of ["reception", "volunteer", "staff"] as const)
				rows.push(
					await c.people.insert(
						practitioner(app, {
							kind,
							displayName: `Person ${kind}`,
							color: "#112233",
							external: kind === "staff",
						}),
					),
				);
			const read = (await c.people.list(app)).sort(byName);
			expect(read.map((p) => [p.kind, p.color, p.external])).toEqual([
				["reception", "#112233", false],
				["staff", "#112233", true],
				["volunteer", "#112233", false],
			]);
		});

		it("replace changes exactly what changed, and the next read shows it", async () => {
			const { app, c } = await fresh();
			const saved = await c.people.insert(practitioner(app));
			const next = {
				...saved,
				displayName: "Dora Renamed",
				active: false,
				subject: "dora2",
				color: "#000000",
			};
			expect(await c.people.replace(next)).toBe(true);
			expect(bare((await c.people.get(app, saved.id)) ?? saved)).toEqual(bare(next));
			const { color: _color, ...withoutColor } = next;
			await c.people.replace(withoutColor);
			expect((await c.people.get(app, saved.id))?.color).toBeUndefined();
		});

		it("replace of a person that is not there says so and writes nothing", async () => {
			const { app, c } = await fresh();
			const stranger = practitioner(app, { id: newId("p") });
			expect(await c.people.replace(stranger)).toBe(false);
			expect(await c.people.list(app)).toEqual([]);
		});

		it("remove deletes once, and a second remove says there was nothing", async () => {
			const { app, c } = await fresh();
			const saved = await c.people.insert(practitioner(app));
			expect(await c.people.remove(app, saved.id)).toBe(true);
			expect(await c.people.get(app, saved.id)).toBeUndefined();
			expect(await c.people.remove(app, saved.id)).toBe(false);
		});

		it("an app sees only its own people", async () => {
			const one = await fresh();
			const two = await fresh();
			const saved = await one.c.people.insert(practitioner(one.app));
			expect(await two.c.people.list(two.app)).toEqual([]);
			expect(await two.c.people.get(two.app, saved.id)).toBeUndefined();
		});
	});

	describe("rooms, devices and group activities", () => {
		it("a room keeps a free-text kind and an absent capacity, and a capacity past Convex's own limit", async () => {
			const { app, c } = await fresh();
			const room = (over: Partial<RoomRow> = {}): RoomRow => ({
				id: newId("o"),
				app,
				name: "Room One",
				kind: "sensory-lab",
				active: true,
				...stamps,
				...over,
			});
			const saved = await c.rooms.insert(room());
			expect(bare((await c.rooms.get(app, saved.id)) ?? saved)).toEqual(bare(room()));
			const big = { ...saved, capacity: 80, kind: "hall", name: "Hall" };
			await c.rooms.replace(big);
			expect(bare((await c.rooms.get(app, saved.id)) ?? saved)).toEqual(bare(big));
			await c.rooms.replace({ ...big, active: false });
			expect((await c.rooms.get(app, saved.id))?.active).toBe(false);
			expect(await c.rooms.remove(app, saved.id)).toBe(true);
			expect(await c.rooms.remove(app, saved.id)).toBe(false);
		});

		it("a device keeps its room, and loses it when it is taken out", async () => {
			const { app, c } = await fresh();
			const room = await c.rooms.insert({
				id: newId("o"),
				app,
				name: "Room",
				kind: "therapy",
				capacity: 4,
				active: true,
				...stamps,
			});
			const device: DeviceRow = {
				id: newId("d"),
				app,
				name: "Device One",
				roomId: room.id,
				active: true,
				...stamps,
			};
			const saved = await c.devices.insert(device);
			expect((await c.devices.get(app, saved.id))?.roomId).toBe(room.id);
			const { roomId: _r, ...without } = saved;
			await c.devices.replace({ ...without, name: "Device Two" });
			const after = await c.devices.get(app, saved.id);
			expect(after?.name).toBe("Device Two");
			expect(after?.roomId).toBeUndefined();
			expect(await c.devices.remove(app, saved.id)).toBe(true);
		});

		it("a group activity keeps its kind and its members", async () => {
			const { app, c } = await fresh();
			const group: GroupRow = {
				id: newId("g"),
				app,
				name: "Atelier",
				kind: "atelier",
				clientIds: ["client-a-0001", "client-b-0002"],
				active: true,
				...stamps,
			};
			const saved = await c.groups.insert(group);
			expect(bare((await c.groups.get(app, saved.id)) ?? saved)).toEqual(bare(group));
			const next = {
				...saved,
				kind: "group" as const,
				clientIds: ["client-b-0002"],
				active: false,
			};
			await c.groups.replace(next);
			expect(bare((await c.groups.get(app, saved.id)) ?? saved)).toEqual(bare(next));
			expect(await c.groups.remove(app, saved.id)).toBe(true);
			expect(await c.groups.get(app, saved.id)).toBeUndefined();
		});
	});

	describe("services", () => {
		it("round-trip with their practitioners and prices; replace changes them; remove deletes", async () => {
			const { app, c } = await fresh();
			const dora = await c.people.insert({
				id: newId("p"),
				app,
				displayName: "Dora Test",
				kind: "practitioner",
				active: true,
				external: false,
				...stamps,
			});
			const elena = await c.people.insert({
				id: newId("p"),
				app,
				displayName: "Elena Test",
				kind: "practitioner",
				active: true,
				external: false,
				...stamps,
			});
			const service: ServiceRow = {
				id: newId("s"),
				app,
				slug: "evaluation",
				name: { ro: "Evaluare", en: "Evaluation" },
				durationMinutes: 60,
				bufferMinutes: 15,
				modes: ["onsite", "online"],
				practitionerIds: [dora.id],
				active: true,
				prices: { priceCents: 25_000, currency: "RON" },
				...stamps,
			};
			const saved = await c.services.insert(service);
			const read = await c.services.get(app, saved.id);
			expect(bare(read ?? saved)).toEqual(bare(service));
			const next: ServiceRow = {
				...saved,
				name: { ro: "Ședință", en: "Session" },
				durationMinutes: 45,
				modes: ["online"],
				practitionerIds: [dora.id, elena.id],
				active: false,
				prices: { priceCents: 30_000, currency: "RON" },
			};
			await c.services.replace(next);
			const after = await c.services.get(app, saved.id);
			expect(bare(after ?? saved)).toEqual({
				...bare(next),
				practitionerIds: expect.arrayContaining([dora.id, elena.id]),
			});
			const { prices: _p, ...noPrice } = next;
			await c.services.replace(noPrice);
			expect((await c.services.get(app, saved.id))?.prices).toBeUndefined();
			expect(await c.services.remove(app, saved.id)).toBe(true);
			expect(await c.services.remove(app, saved.id)).toBe(false);
		});
	});

	describe("clients", () => {
		const sealed = (app: string, id: string): string =>
			crypto.seal(
				JSON.stringify({ diagnosis: "synthetic-diagnosis", notes: "synthetic-notes" }),
				`${app}:client:${id}:clinical`,
			);
		const fullClient = (app: string, treating: string[]): ClientRow => ({
			id: newId("c"),
			app,
			name: "Client One",
			status: "active",
			treating,
			birthYear: 2016,
			contact: { phone: "0712 345 678", email: "one@example.test", address: "Strada Test 1" },
			guardian: { name: "Guardian One", phone: "0722 111 222", relationship: "parent" },
			money: { tariffCents: 15_000, discountPercent: 10, billingName: "Billing One" },
			...stamps,
		});
		const practitioner = async (app: string, name = "Dora Test") =>
			env().store.c.people.insert({
				id: newId("p"),
				app,
				displayName: name,
				kind: "practitioner",
				active: true,
				external: false,
				...stamps,
			});

		it("all four groups, the treating relation and the sealed clinical text round-trip", async () => {
			const { app, c } = await fresh();
			const dora = await practitioner(app);
			const draft = fullClient(app, [dora.id]);
			const saved = await c.clients.insert(draft);
			const withClinical: ClientRow = { ...saved, clinicalSealed: sealed(app, saved.id) };
			await c.clients.replace(withClinical);
			const read = await c.clients.get(app, saved.id);
			expect(read).toBeDefined();
			expect(bareClient(read ?? saved)).toEqual(bareClient(withClinical));
			expect(JSON.stringify(read)).not.toContain("synthetic");
			expect(
				crypto.open(read?.clinicalSealed ?? "", `${app}:client:${saved.id}:clinical`),
			).toContain("synthetic-diagnosis");
		});

		it("a client with nothing but a name is a client", async () => {
			const { app, c } = await fresh();
			const saved = await c.clients.insert({
				id: newId("c"),
				app,
				name: "Only A Name",
				status: "active",
				treating: [],
				...stamps,
			});
			const read = await c.clients.get(app, saved.id);
			expect(read).toMatchObject({ name: "Only A Name", status: "active", treating: [] });
			expect(Object.keys(read ?? {})).not.toContain("contact");
			expect(Object.keys(read ?? {})).not.toContain("money");
		});

		it("replace changes contact, guardian, money and the name, and clears what was removed", async () => {
			const { app, c } = await fresh();
			const saved = await c.clients.insert(fullClient(app, []));
			const next: ClientRow = {
				...saved,
				name: "Client Renamed",
				contact: { email: "new@example.test" },
				guardian: { name: "Guardian Two" },
				money: { tariffCents: 20_000 },
			};
			await c.clients.replace(next);
			expect(bareClient((await c.clients.get(app, saved.id)) ?? saved)).toEqual(bareClient(next));
			const { guardian: _g, money: _m, contact: _c, ...bareNext } = next;
			await c.clients.replace(bareNext);
			const read = await c.clients.get(app, saved.id);
			expect(Object.keys(read ?? {})).not.toEqual(expect.arrayContaining(["guardian"]));
			expect(read?.guardian).toBeUndefined();
			expect(read?.money).toBeUndefined();
			expect(read?.contact).toBeUndefined();
		});

		it("who treats a client changes only when the row says so", async () => {
			const { app, c } = await fresh();
			const dora = await practitioner(app, "Dora Test");
			const elena = await practitioner(app, "Elena Test");
			const saved = await c.clients.insert(fullClient(app, [dora.id]));
			await c.clients.replace({ ...saved, name: "Renamed" });
			expect((await c.clients.get(app, saved.id))?.treating).toEqual([dora.id]);
			await c.clients.replace({ ...saved, name: "Renamed", treating: [elena.id] });
			expect((await c.clients.get(app, saved.id))?.treating).toEqual([elena.id]);
			expect((await c.clients.list(app)).find((x) => x.id === saved.id)?.treating).toEqual([
				elena.id,
			]);
		});

		it("archive, restore, delete and restore again follow the standing; delete sets the purge date", async () => {
			const { app, c } = await fresh();
			const saved = await c.clients.insert(fullClient(app, []));
			await c.clients.replace({ ...saved, status: "archived", archivedAt: NOW });
			const archived = await c.clients.get(app, saved.id);
			expect(archived?.status).toBe("archived");
			expect(archived?.archivedAt).toBeDefined();
			expect((await c.clients.list(app, { eq: { status: "archived" } })).map((x) => x.id)).toEqual([
				saved.id,
			]);
			expect(await c.clients.list(app, { eq: { status: "active" } })).toEqual([]);
			await c.clients.replace({
				...saved,
				status: "deleted",
				deletedAt: NOW,
				purgeAt: NOW + 30 * DAY,
			});
			const deleted = await c.clients.get(app, saved.id);
			expect(deleted?.status).toBe("deleted");
			expect(deleted?.purgeAt).toBe((deleted?.deletedAt ?? 0) + 30 * DAY);
			await c.clients.replace({ ...saved, status: "active" });
			const back = await c.clients.get(app, saved.id);
			expect(back?.status).toBe("active");
			expect(back?.deletedAt).toBeUndefined();
			expect(back?.archivedAt).toBeUndefined();
			expect(back?.purgeAt).toBeUndefined();
		});

		it("list filters by standing and by any field, and an app sees only its own clients", async () => {
			const one = await fresh();
			const two = await fresh();
			const a = await one.c.clients.insert({ ...fullClient(one.app, []), name: "Alpha" });
			await one.c.clients.insert({ ...fullClient(one.app, []), name: "Beta" });
			await two.c.clients.insert({ ...fullClient(two.app, []), name: "Gamma" });
			expect((await one.c.clients.list(one.app)).map((x) => x.name).sort()).toEqual([
				"Alpha",
				"Beta",
			]);
			expect(
				(await one.c.clients.list(one.app, { eq: { name: "Alpha" } })).map((x) => x.id),
			).toEqual([a.id]);
			expect(await two.c.clients.get(two.app, a.id)).toBeUndefined();
		});

		it("replace of a client that is not there says so", async () => {
			const { app, c } = await fresh();
			expect(await c.clients.replace(fullClient(app, []))).toBe(false);
		});
	});
};
