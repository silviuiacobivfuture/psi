import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

let k: SdkConsole;
let olga: Session;
let vera: Session;
beforeAll(async () => {
	k = await startSdkConsole();
	olga = await k.as("olga");
	vera = await k.as("vera");
});
afterAll(async () => {
	await k.close();
});

const urlencoded = { "content-type": "application/x-www-form-urlencoded" };
const post = (s: Session, path: string, values: Record<string, string | string[]>) =>
	s.post(
		path,
		new URLSearchParams(
			Object.entries(values).flatMap(([k2, v]) =>
				Array.isArray(v) ? v.map((x) => [k2, x]) : [[k2, v]],
			),
		),
		urlencoded,
	);
const text = async (r: Response): Promise<string> => r.text();
const api = (method: string, path: string, body?: unknown) =>
	k.api.world.call("olga", method, `/v1/apps/psizone${path}`, body);

describe("the Setări tabs over the real service keep what the team says", () => {
	it("a room with floor, purpose, category and a home practitioner is saved and shown", async () => {
		const people =
			((await api("GET", "/people")).json.items as Array<{ id: string; displayName: string }>) ??
			[];
		const home = people[0]?.id ?? "";
		await post(olga, "/settings/rooms/save", {
			name: "Cabinet Real",
			floor: "Etajul 2",
			purpose: "Psihoterapie",
			category: "therapy",
			capacity: "2",
			homeOf: home,
			bookable: "on",
		});
		const rooms = (await api("GET", "/rooms")).json.items as Array<Record<string, unknown>>;
		expect(rooms.find((r) => r.name === "Cabinet Real")).toMatchObject({
			floor: "Etajul 2",
			purpose: "Psihoterapie",
			kind: "therapy",
			homePractitionerId: home,
		});
		const page = await text(await olga.get("/settings/rooms"));
		expect(page).toContain("Cabinet Real");
		expect(page).toContain("Etajul 2");
	});
	it("a therapist is saved with specialty, hours and rooms; editing shows them back", async () => {
		const room = (
			(await api("GET", "/rooms")).json.items as Array<{ id: string; name: string }>
		).find((r) => r.name === "Cabinet Real");
		await post(olga, "/settings/people/save", {
			name: "Terapeut Real",
			practitioner: "on",
			colour: "2",
			specialty: "Logopedie",
			h0_from: "09:00",
			h0_to: "17:00",
			roomIds: room?.id ?? "",
			active: "on",
		});
		const person = (
			(await api("GET", "/people")).json.items as Array<Record<string, unknown>>
		).find((p) => p.displayName === "Terapeut Real");
		expect(person).toMatchObject({
			specialty: "Logopedie",
			kind: "practitioner",
			roomIds: [room?.id],
		});
		expect((person?.hours as Array<unknown>)[0]).toEqual({ from: 540, to: 1020 });
		const edit = await text(await olga.get(`/settings/people?edit=${person?.id}`));
		expect(edit).toContain('value="Logopedie"');
		expect(edit).toContain('name="h0_from"');
	});
	it("a device with a type and a service with a price, category, rooms and devices", async () => {
		const room = (
			(await api("GET", "/rooms")).json.items as Array<{ id: string; name: string }>
		).find((r) => r.name === "Cabinet Real");
		await post(olga, "/settings/devices/save", {
			name: "NFB Real",
			type: "nfb",
			roomId: room?.id ?? "",
			bookable: "on",
		});
		const device = (
			(await api("GET", "/devices")).json.items as Array<Record<string, unknown>>
		).find((d) => d.name === "NFB Real");
		expect(device).toMatchObject({ deviceType: "nfb", roomId: room?.id });
		await post(olga, "/settings/services/save", {
			name: "Evaluare Reala",
			durationMin: "90",
			price: "350",
			category: "Evaluare",
			roomCategory: "neuro",
			online: "on",
			active: "on",
			roomIds: room?.id ?? "",
			deviceIds: String(device?.id),
		});
		const svc = ((await api("GET", "/services")).json.items as Array<Record<string, unknown>>).find(
			(s) => s.slug === "evaluare-reala",
		);
		expect(svc).toMatchObject({
			category: "Evaluare",
			roomCategory: "neuro",
			durationMinutes: 90,
			prices: { priceCents: 35000 },
		});
		expect(svc?.modes).toContain("online");
	});
	it("a value the service refuses writes nothing: an unknown room, a bad day", async () => {
		const before = await k.api.world.fingerprint();
		await post(olga, "/settings/people/save", {
			name: "X",
			practitioner: "on",
			roomIds: "nope",
			active: "on",
		});
		await post(olga, "/settings/people/save", {
			name: "Y",
			practitioner: "on",
			h0_from: "17:00",
			h0_to: "09:00",
			active: "on",
		});
		await post(olga, "/settings/rooms/save", {
			name: "Z",
			category: "therapy",
			homeOf: "nope",
			bookable: "on",
		});
		expect(await k.api.world.fingerprint()).toBe(before);
	});
	it("someone who may not edit the catalogue is refused, writing nothing", async () => {
		const before = await k.api.world.fingerprint();
		expect(
			(await post(vera, "/settings/people/save", { name: "Nope", practitioner: "on" })).status,
		).toBe(403);
		expect(await k.api.world.fingerprint()).toBe(before);
	});
});
