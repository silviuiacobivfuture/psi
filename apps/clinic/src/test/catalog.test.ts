import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakePort } from "../port/fake";
import { PortError } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

const refused = async (p: Promise<unknown>): Promise<string> => {
	try {
		await p;
	} catch (e) {
		return e instanceof PortError ? e.code : "other";
	}
	return "none";
};
const fake = () => createFakePort({ today: "2026-11-16", members: {} });

describe("the catalogue in the port: people", () => {
	it("adds a therapist with hours, rooms and services; she gets a calendar column and shows in the picker", async () => {
		const port = fake();
		const made = await port.savePerson("psizone", null, {
			name: "Ștefania Țurcanu",
			email: "stefania@example.test",
			roles: ["therapist"],
			practitioner: true,
			colour: 3,
			specialty: "Psihoterapie",
			hours: [{ from: 540, to: 1020 }, null, null, null, null, null, null],
			roomIds: ["cabinet-1"],
			serviceIds: ["s1"],
		});
		expect(made).toMatchObject({
			kind: "person",
			name: "Ștefania Țurcanu",
			bookable: true,
			specialty: "Psihoterapie",
		});
		expect((await port.columns("psizone")).some((c) => c.id === made.id)).toBe(true);
	});
	it("a team member who is not a practitioner has no calendar column but is still listed", async () => {
		const port = fake();
		const made = await port.savePerson("psizone", null, {
			name: "Recepție Nouă",
			practitioner: false,
			roles: ["reception"],
		});
		expect((await port.columns("psizone")).some((c) => c.id === made.id)).toBe(false);
		expect((await port.catalogColumns("psizone")).some((c) => c.id === made.id)).toBe(true);
	});
	it("refuses a duplicate e-mail, an unknown role, an unknown room and a bad day, writing nothing", async () => {
		const port = fake();
		await port.savePerson("psizone", null, {
			name: "A",
			email: "a@example.test",
			practitioner: true,
		});
		const before = (await port.catalogColumns("psizone")).length;
		expect(
			await refused(port.savePerson("psizone", null, { name: "B", email: "a@example.test" })),
		).toBe("conflict");
		expect(await refused(port.savePerson("psizone", null, { name: "B", roles: ["nope"] }))).toBe(
			"invalid",
		);
		expect(await refused(port.savePerson("psizone", null, { name: "B", roomIds: ["nope"] }))).toBe(
			"invalid",
		);
		expect(await refused(port.savePerson("psizone", null, { name: " " }))).toBe("invalid");
		expect(await refused(port.savePerson("psizone", "zz", { name: "B" }))).toBe("not-found");
		expect((await port.catalogColumns("psizone")).length).toBe(before);
	});
	it("edits keep the id; switching a person off takes her off the calendar but keeps her", async () => {
		const port = fake();
		const made = await port.savePerson("psizone", null, { name: "C", practitioner: true });
		const off = await port.savePerson("psizone", made.id, {
			name: "C",
			practitioner: true,
			active: false,
		});
		expect(off.id).toBe(made.id);
		expect((await port.columns("psizone")).some((c) => c.id === made.id)).toBe(false);
		expect((await port.catalogColumns("psizone")).find((c) => c.id === made.id)?.active).toBe(
			false,
		);
	});
	it("removing one with appointments switches her off; one without is deleted and unlinked everywhere", async () => {
		const port = fake();
		const used = await port.removeCatalog("psizone", "person", "p1");
		expect(used.outcome).toBe("deactivated");
		expect((await port.catalogColumns("psizone")).some((c) => c.id === "p1")).toBe(true);
		const fresh = await port.savePerson("psizone", null, { name: "D", practitioner: true });
		await port.saveRoom("psizone", "cabinet-1", {
			name: "Cabinet 1",
			category: "therapy",
			capacity: 3,
			homeOf: fresh.id,
		});
		expect((await port.removeCatalog("psizone", "person", fresh.id)).outcome).toBe("deleted");
		expect(
			(await port.catalogColumns("psizone")).find((c) => c.id === "cabinet-1")?.homeOf,
		).toBeUndefined();
	});
});

describe("rooms, devices, services, roles", () => {
	it("a room has floor, category, capacity, bookable and a home practitioner that must exist", async () => {
		const port = fake();
		const room = await port.saveRoom("psizone", null, {
			name: "Cabinet 3",
			floor: "Parter",
			category: "neuro",
			capacity: 2,
			bookable: false,
			homeOf: "p2",
		});
		expect(room).toMatchObject({
			category: "neuro",
			floor: "Parter",
			capacity: 2,
			bookable: false,
			homeOf: "p2",
		});
		expect(
			await refused(
				port.saveRoom("psizone", null, { name: "X", category: "therapy", homeOf: "nope" }),
			),
		).toBe("invalid");
		expect(
			await refused(port.saveRoom("psizone", null, { name: "X", category: "other" as never })),
		).toBe("invalid");
	});
	it("a device has a type and a room that must exist", async () => {
		const port = fake();
		const dev = await port.saveDevice("psizone", null, {
			name: "NFB 3",
			type: "nfb",
			roomId: "neurofeedback-1",
		});
		expect(dev).toMatchObject({ deviceType: "nfb", deviceRoom: "neurofeedback-1" });
		expect(await refused(port.saveDevice("psizone", null, { name: "X", roomId: "nope" }))).toBe(
			"invalid",
		);
	});
	it("a service links to practitioners, rooms and devices that exist, and can be switched off", async () => {
		const port = fake();
		const svc = await port.saveService("psizone", null, {
			name: "Terapie de cuplu",
			durationMin: 60,
			priceBani: 20000,
			practitionerIds: ["p1"],
			roomIds: ["cabinet-1"],
			deviceIds: [],
			online: false,
			bufferMin: 10,
		});
		expect(svc).toMatchObject({
			durationMin: 60,
			online: false,
			bufferMin: 10,
			practitionerIds: ["p1"],
		});
		expect(
			await refused(
				port.saveService("psizone", null, {
					name: "X",
					durationMin: 60,
					practitionerIds: ["nope"],
				}),
			),
		).toBe("invalid");
		expect(await refused(port.saveService("psizone", null, { name: "X", durationMin: 2 }))).toBe(
			"invalid",
		);
		await port.saveService("psizone", svc.id, {
			name: "Terapie de cuplu",
			durationMin: 60,
			active: false,
		});
		expect((await port.services("psizone")).some((s) => s.id === svc.id)).toBe(false);
	});
	it("a role is created from another's permissions and deleted only when unused and not a system role", async () => {
		const port = fake();
		const role = await port.createRole("psizone", { name: "Stagiar", copyFrom: "therapist" });
		expect(role.grants).toEqual(
			(await port.roles("psizone")).find((r) => r.id === "therapist")?.grants,
		);
		expect(await refused(port.createRole("psizone", { name: "stagiar" }))).toBe("conflict");
		expect(await refused(port.createRole("psizone", { name: "Z", copyFrom: "nope" }))).toBe(
			"invalid",
		);
		expect(await refused(port.deleteRole("psizone", "owner"))).toBe("conflict");
		await port.deleteRole("psizone", role.id);
		expect((await port.roles("psizone")).some((r) => r.id === role.id)).toBe(false);
	});
});

let c: Console;
beforeAll(async () => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
	);
	await c.signIn();
});
afterAll(() => c.close());
const html = async (path: string): Promise<string> => await (await c.get(path)).text();
const post = (path: string, values: Record<string, string>): Promise<Response> =>
	c.post(path, new URLSearchParams(values), {
		"content-type": "application/x-www-form-urlencoded",
	});

describe("every Setări tab has its add button, its empty state, its edit sheet and its removal", () => {
	for (const [segment, add, kind] of [
		["people", "Adaugă persoană", "person"],
		["rooms", "Adaugă cabinet", "room"],
		["devices", "Adaugă aparat", "device"],
		["services", "Adaugă serviciu", "service"],
		["roles", "Rol nou", "role"],
	] as const) {
		it(`${segment}: a primary '${add}' that opens the form`, async () => {
			const page = await html(`/settings/${segment}`);
			expect(page).toContain(`data-action="${kind}.new"`);
			expect(page).toContain(add);
			const opened = await html(`/settings/${segment}?new=1`);
			expect(opened).toContain(
				segment === "roles" ? 'data-form="role-new"' : `data-form="${kind}-save"`,
			);
		});
	}
	it("an organisation with nothing set up shows the add button in its empty state too", async () => {
		const empty = await startConsole(
			MEMBER,
			{ today: "2026-11-16", empty: true },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
		);
		await empty.signIn();
		try {
			const port = empty.port;
			for (const c of await port.catalogColumns("psizone"))
				if (c.kind === "device") await port.removeCatalog("psizone", "device", c.id);
			const page = await (await empty.get("/settings/devices")).text();
			expect(page.match(/data-action="device\.new"/g)?.length).toBeGreaterThanOrEqual(2);
		} finally {
			await empty.close();
		}
	});
	it("a therapist is added through the sheet, listed with her roles, opened for editing and removed with a confirmation", async () => {
		const res = await post("/settings/people/save", {
			name: "Ștefania Țurcanu",
			email: "stefania@example.test",
			roles: "therapist",
			practitioner: "on",
			colour: "3",
			specialty: "Psihoterapie",
			h0_from: "09:00",
			h0_to: "17:00",
			active: "on",
		});
		expect(res.status).toBe(200);
		const made = (await c.port.catalogColumns("psizone")).find(
			(x) => x.name === "Ștefania Țurcanu",
		);
		expect(made?.hours?.[0]).toEqual({ from: 540, to: 1020 });
		const list = await html("/settings/people");
		expect(list).toContain("Ștefania Țurcanu");
		expect(list).toContain("Psihoterapie");
		const edit = await html(`/settings/people?edit=${made?.id}`);
		expect(edit).toContain('value="stefania@example.test"');
		expect(edit).toContain('name="h0_from"');
		await post(`/settings/people/${made?.id}/save`, {
			name: "Ștefania T.",
			practitioner: "on",
			colour: "3",
			active: "on",
		});
		expect((await c.port.catalogColumns("psizone")).find((x) => x.id === made?.id)?.name).toBe(
			"Ștefania T.",
		);
		expect(await html(`/settings/people?confirm=${made?.id}`)).toContain(
			`/settings/people/${made?.id}/remove`,
		);
		await post(`/settings/people/${made?.id}/remove`, {});
		expect((await c.port.catalogColumns("psizone")).some((x) => x.id === made?.id)).toBe(false);
	});
	it("a refused value writes nothing and says so", async () => {
		const before = (await c.port.catalogColumns("psizone")).length;
		const res = await post("/settings/rooms/save", {
			name: "Cabinet X",
			category: "nope",
			capacity: "2",
		});
		expect(res.status).toBe(200);
		expect((await c.port.catalogColumns("psizone")).length).toBe(before);
		expect(await html("/settings/rooms?problem=invalid")).toContain("Nu s-a salvat nimic");
	});
	it("a service in lei is stored in bani, a room with a home practitioner and a device in a room are saved", async () => {
		await post("/settings/services/save", {
			name: "Evaluare nouă",
			durationMin: "75",
			price: "350",
			online: "on",
			active: "on",
			practitionerIds: "p1",
		});
		const svc = (await c.port.services("psizone")).find((s) => s.name === "Evaluare nouă");
		expect(svc).toMatchObject({ durationMin: 75, priceBani: 35000, practitionerIds: ["p1"] });
		await post("/settings/rooms/save", {
			name: "Cabinet Test",
			category: "therapy",
			capacity: "3",
			homeOf: "p1",
			bookable: "on",
		});
		const room = (await c.port.catalogColumns("psizone")).find((x) => x.name === "Cabinet Test");
		expect(room?.homeOf).toBe("p1");
		await post("/settings/devices/save", {
			name: "NFB Test",
			type: "nfb",
			roomId: room?.id ?? "",
			bookable: "on",
		});
		expect(
			(await c.port.catalogColumns("psizone")).find((x) => x.name === "NFB Test")?.deviceRoom,
		).toBe(room?.id);
	});
	it("a role is made from another and deleted again; a system role cannot be", async () => {
		await post("/settings/roles", { name: "Stagiar", copyFrom: "therapist" });
		const role = (await c.port.roles("psizone")).find((r) => r.name === "Stagiar");
		expect(role).toBeDefined();
		expect((await post("/settings/roles/owner/delete", {})).status).toBe(200);
		expect((await c.port.roles("psizone")).some((r) => r.id === "owner")).toBe(true);
		await post(`/settings/roles/${role?.id}/delete`, {});
		expect((await c.port.roles("psizone")).some((r) => r.id === role?.id)).toBe(false);
	});
	it("someone without the permission gets the list but no add, no edit link and no removal", async () => {
		const reception = await startConsole(
			MEMBER,
			{ today: "2026-11-16" },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await reception.signIn();
		try {
			const res = await reception.get("/settings/people");
			if (res.status === 200) {
				const page = await res.text();
				expect(page).not.toContain('data-action="person.new"');
				expect(page).not.toContain("?edit=");
			} else expect(res.status).toBe(403);
			expect(
				(
					await reception.post("/settings/people/save", new URLSearchParams({ name: "X" }), {
						"content-type": "application/x-www-form-urlencoded",
					})
				).status,
			).toBe(403);
		} finally {
			await reception.close();
		}
	});
});
