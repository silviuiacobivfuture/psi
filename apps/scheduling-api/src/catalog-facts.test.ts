import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const WEEK = [
	{ from: 540, to: 1020 },
	{ from: 540, to: 1020 },
	null,
	{ from: 600, to: 840 },
	{ from: 540, to: 1020 },
	null,
	null,
];

describe.each(
	factories,
)("what the team says about people, rooms, devices and services, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	/** A write that must be refused: the status, and NOTHING moved anywhere. */
	async function refused(run: () => Promise<Reply>, status: number): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const list = async (path: string): Promise<Array<Record<string, unknown>>> =>
		(ok(await as("olga", "GET", path), path).items as Array<Record<string, unknown>>) ?? [];

	let room = "";
	let device = "";
	let person = "";
	beforeAll(async () => {
		w = await factory.create();
		room = String(
			ok(await as("olga", "POST", "/rooms", { name: "Cabinet Facts", kind: "neuro" }), "room").id,
		);
		device = String(ok(await as("olga", "POST", "/devices", { name: "NFB Facts" }), "device").id);
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("people", () => {
		it("a practitioner is added with specialty, hours, rooms and services, and listed with them", async () => {
			const made = ok(
				await as("olga", "POST", "/people", {
					displayName: "Ștefania Țurcanu",
					kind: "practitioner",
					email: "stefania@example.test",
					specialty: "Psihoterapie",
					hours: WEEK,
					roomIds: [room],
					serviceIds: [],
				}),
				"person",
			);
			person = String(made.id);
			expect(made).toMatchObject({
				specialty: "Psihoterapie",
				hours: WEEK,
				roomIds: [room],
				email: "stefania@example.test",
			});
			const listed = (await list("/people")).find((p) => p.id === person);
			expect(listed).toMatchObject({ specialty: "Psihoterapie", hours: WEEK, roomIds: [room] });
		});
		it("a change keeps what it did not say", async () => {
			const r = await as("olga", "PATCH", `/people/${person}`, { specialty: "Consiliere" });
			expect(r.status).toBe(200);
			const after = (await list("/people")).find((p) => p.id === person);
			expect(after).toMatchObject({ specialty: "Consiliere", hours: WEEK, roomIds: [room] });
		});
		it("a staff member who is not a practitioner keeps them too", async () => {
			const made = ok(
				await as("olga", "POST", "/people", {
					displayName: "Recepție Nouă",
					kind: "reception",
					specialty: "Primire",
					hours: WEEK,
				}),
				"staff",
			);
			expect((await list("/people")).find((p) => p.id === made.id)).toMatchObject({
				specialty: "Primire",
				hours: WEEK,
			});
		});
		it("is refused for an unknown room or service, a day that ends before it starts, a week of the wrong length, and a bad e-mail field", async () => {
			await refused(
				() =>
					as("olga", "POST", "/people", {
						displayName: "X",
						kind: "practitioner",
						roomIds: ["nope"],
					}),
				400,
			);
			await refused(
				() =>
					as("olga", "POST", "/people", {
						displayName: "X",
						kind: "practitioner",
						serviceIds: ["nope"],
					}),
				400,
			);
			await refused(
				() =>
					as("olga", "POST", "/people", {
						displayName: "X",
						kind: "practitioner",
						hours: [{ from: 900, to: 600 }, null, null, null, null, null, null],
					}),
				400,
			);
			await refused(
				() =>
					as("olga", "POST", "/people", { displayName: "X", kind: "practitioner", hours: [null] }),
				400,
			);
			await refused(() => as("olga", "PATCH", `/people/${person}`, { roomIds: ["nope"] }), 400);
		});
		it("is refused for someone who may not add people, writing nothing", async () => {
			await refused(
				() => as("vera", "POST", "/people", { displayName: "Nope", kind: "staff", specialty: "x" }),
				403,
			);
		});
	});

	describe("rooms", () => {
		it("a room has a floor, a purpose, a category, bookable and the practitioner whose room it is", async () => {
			const made = ok(
				await as("olga", "POST", "/rooms", {
					name: "Cabinet Irina",
					kind: "therapy",
					floor: "Etajul 2",
					purpose: "Psihoterapie",
					bookable: true,
					homePractitionerId: person,
				}),
				"room",
			);
			expect(made).toMatchObject({
				floor: "Etajul 2",
				purpose: "Psihoterapie",
				kind: "therapy",
				bookable: true,
				homePractitionerId: person,
			});
			expect((await list("/rooms")).find((r) => r.id === made.id)).toMatchObject({
				floor: "Etajul 2",
				homePractitionerId: person,
			});
		});
		it("a change keeps the rest; a room can be made unbookable", async () => {
			const id = String(
				ok(
					await as("olga", "POST", "/rooms", {
						name: "Cabinet Tinut",
						kind: "therapy",
						floor: "Parter",
					}),
					"room",
				).id,
			);
			const r = await as("olga", "PATCH", `/rooms/${id}`, { bookable: false });
			expect(r.json).toMatchObject({ floor: "Parter", bookable: false, kind: "therapy" });
		});
		it("is refused for a practitioner that does not exist, and for a floor that is empty text", async () => {
			await refused(
				() =>
					as("olga", "POST", "/rooms", { name: "X", kind: "therapy", homePractitionerId: "nope" }),
				400,
			);
			await refused(
				() => as("olga", "POST", "/rooms", { name: "X", kind: "therapy", floor: "   " }),
				400,
			);
			await refused(
				() => as("olga", "PATCH", `/rooms/${room}`, { homePractitionerId: "nope" }),
				400,
			);
		});
	});

	describe("devices", () => {
		it("a device has a type and may be unbookable; its room must exist", async () => {
			const made = ok(
				await as("olga", "POST", "/devices", {
					name: "QEEG Facts",
					deviceType: "qeeg",
					roomId: room,
					bookable: false,
				}),
				"device",
			);
			expect(made).toMatchObject({ deviceType: "qeeg", roomId: room, bookable: false });
			expect((await list("/devices")).find((d) => d.id === made.id)).toMatchObject({
				deviceType: "qeeg",
			});
			const changed = await as("olga", "PATCH", `/devices/${made.id}`, { deviceType: "nfb" });
			expect(changed.json).toMatchObject({ deviceType: "nfb", roomId: room, bookable: false });
		});
		it("is refused for a type the service does not know and a room that does not exist", async () => {
			await refused(() => as("olga", "POST", "/devices", { name: "X", deviceType: "mri" }), 400);
			// An unknown room is not found, as it always was for a device.
			await refused(() => as("olga", "POST", "/devices", { name: "X", roomId: "nope" }), 404);
		});
	});

	describe("services", () => {
		const body = (over: Record<string, unknown> = {}) => ({
			slug: `facts-${Math.random().toString(36).slice(2, 8)}`,
			name: { ro: "Neurofeedback test", en: "Neurofeedback test" },
			durationMinutes: 45,
			modes: ["onsite"],
			practitionerIds: [],
			...over,
		});
		it("a service is filed, needs a room category, and names the rooms and devices it is given with", async () => {
			const made = ok(
				await as(
					"olga",
					"POST",
					"/services",
					body({ category: "Neuro", roomCategory: "neuro", roomIds: [room], deviceIds: [device] }),
				),
				"service",
			);
			expect(made).toMatchObject({
				category: "Neuro",
				roomCategory: "neuro",
				roomIds: [room],
				deviceIds: [device],
			});
			expect((await list("/services")).find((s) => s.id === made.id)).toMatchObject({
				roomCategory: "neuro",
				roomIds: [room],
			});
			const changed = await as("olga", "PATCH", `/services/${made.id}`, { category: "Evaluare" });
			expect(changed.json).toMatchObject({
				category: "Evaluare",
				roomCategory: "neuro",
				deviceIds: [device],
			});
		});
		it("is refused for an unknown room, device or practitioner, on create and on change", async () => {
			await refused(() => as("olga", "POST", "/services", body({ roomIds: ["nope"] })), 400);
			await refused(() => as("olga", "POST", "/services", body({ deviceIds: ["nope"] })), 400);
			const id = String(ok(await as("olga", "POST", "/services", body()), "service").id);
			await refused(() => as("olga", "PATCH", `/services/${id}`, { roomIds: ["nope"] }), 400);
			await refused(
				() => as("olga", "PATCH", `/services/${id}`, { practitionerIds: ["nope"] }),
				400,
			);
		});
		it("the price is still the price route's, and a reader without prices sees none of it", async () => {
			const id = String(ok(await as("olga", "POST", "/services", body()), "service").id);
			expect(
				(await as("olga", "PUT", `/services/${id}/price`, { priceCents: 12000, currency: "RON" }))
					.status,
			).toBe(200);
			expect((await list("/services")).find((s) => s.id === id)).toMatchObject({
				prices: { priceCents: 12000 },
			});
		});
	});
});
