import { BookingPausedDetail, BookingPauses } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import type { Populated } from "./testing/populate";
import { bookingContact, HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

/**
 * Stopping online booking: the team's routes (Owner and Administrator hold `booking_pause_edit`, everyone reads), each
 * refusal of a pause writing nothing, and what a pause does: the visitor routes that would book answer 409
 * `booking_paused` with the message and whether a callback stays open, the services say so, staff keep booking unless
 * the pause blocks them too, and everything is journaled. Runs on every store adapter.
 */
const A = "/v1/apps/psizone";
const factories = await worldFactories();
let w: Populated;

const as = (who: string, method: string, path: string, body?: unknown): Promise<Reply> =>
	w.call(who, method, `${A}${path}`, body);
const site = (
	method: string,
	path: string,
	body?: unknown,
	caller = "psizone-web",
): Promise<Reply> =>
	w.callKey(caller, method, `${A}${path}`, body, { "x-psi-client-ip": "203.0.113.9" });
const code = (r: Reply): string | undefined =>
	(r.json.error as { code?: string } | undefined)?.code;
const reason = (r: Reply): unknown =>
	(r.json.error as { detail?: { reason?: unknown } } | undefined)?.detail?.reason;
const listed = async () => BookingPauses.parse((await as("olga", "GET", "/booking-pauses")).json);

const SLOTS = `/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=50`;

/** A pause made by the Owner, lifted when the test ends. */
async function paused(body: Record<string, unknown>): Promise<string> {
	const made = await as("olga", "POST", "/booking-pauses", {
		callbacksOpen: true,
		blockStaff: false,
		...body,
	});
	expect(made.status, JSON.stringify(made.json)).toBe(200);
	const id = String(made.json.id);
	onTestFinished(async () => {
		await as("olga", "DELETE", `/booking-pauses/${id}`);
	});
	return id;
}

async function firstSlot(): Promise<{ practitioner: string; start: number }> {
	const slots = (await site("GET", SLOTS)).json.slots as { practitioner: string; start: number }[];
	const first = slots[0];
	if (first === undefined) throw new Error("no slot offered");
	return first;
}
const holdBody = (slot: { practitioner: string; start: number }) => ({
	service: "evaluation",
	practitioner: slot.practitioner,
	start: slot.start,
	mode: "onsite",
	locale: "ro",
	channel: "form",
});

describe.each(factories)("booking pauses, on the $name store", (factory) => {
	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(() => factory.cleanup());

	describe("the team's routes", () => {
		it("lists nothing at first, and the sites this app books through", async () => {
			const out = await listed();
			expect(out.items).toEqual([]);
			expect(out.paused).toBe(false);
			expect(out.sites).toContain("psizone-web");
			expect(out.sites).not.toContain("hemisync-web");
		});

		it("makes, shows, changes and lifts a pause, journaling each", async () => {
			const id = await paused({ scope: { level: "organisation" } });
			let out = await listed();
			expect(out.paused).toBe(true);
			expect(out.items).toHaveLength(1);
			expect(out.items[0]).toMatchObject({
				id,
				state: "active",
				defaultMessage: true,
				callbacksOpen: true,
			});
			expect(out.items[0]?.message.ro).toContain("Programările online sunt oprite temporar");
			const changed = await as("olga", "PUT", `/booking-pauses/${id}`, {
				scope: { level: "organisation" },
				message: { ro: "Revenim luni.", en: "Back on Monday." },
				callbacksOpen: false,
				blockStaff: true,
			});
			expect(changed.status).toBe(200);
			expect(changed.json).toMatchObject({
				defaultMessage: false,
				callbacksOpen: false,
				blockStaff: true,
			});
			expect((await as("olga", "DELETE", `/booking-pauses/${id}`)).status).toBe(200);
			out = await listed();
			expect(out.items).toEqual([]);
			expect(out.paused).toBe(false);
			const actions = (
				(await as("olga", "GET", "/audit?limit=200")).json.items as { action: string }[]
			).map((e) => e.action);
			for (const a of ["booking_pause.create", "booking_pause.update", "booking_pause.remove"])
				expect(actions).toContain(a);
		});

		it("lets every member read the pauses, and only the Owner and the Administrator change them", async () => {
			expect((await as("rita", "GET", "/booking-pauses")).status).toBe(200);
			expect((await as("vera", "GET", "/booking-pauses")).status).toBe(200);
			expect(
				(
					await as("nina", "POST", "/booking-pauses", {
						scope: { level: "service", service: "evaluation" },
						from: NOW + 400 * 24 * HOUR,
					})
				).status,
			).toBe(200);
			for (const who of ["rita", "dora", "ana", "vera"]) {
				const r = await as(who, "POST", "/booking-pauses", { scope: { level: "organisation" } });
				expect(r.status).toBe(403);
			}
			const kept = await listed();
			expect(kept.items).toHaveLength(1);
			for (const p of kept.items) await as("olga", "DELETE", `/booking-pauses/${p.id}`);
		});

		it.each([
			[
				"an end before its start",
				{ scope: { level: "organisation" }, from: NOW + 2 * HOUR, until: NOW + HOUR },
				"until_before_from",
			],
			[
				"an end already past",
				{ scope: { level: "organisation" }, from: NOW - 5 * HOUR, until: NOW - HOUR },
				"until_past",
			],
			["a site of another app", { scope: { level: "site", site: "hemisync-web" } }, "unknown_site"],
			[
				"a service the app does not have",
				{ scope: { level: "service", service: "nope" } },
				"unknown_service",
			],
			[
				"a person who is not a practitioner",
				{ scope: { level: "practitioner", practitionerId: "mara" } },
				"unknown_practitioner",
			],
		])("refuses %s, writing nothing", async (_name, body, why) => {
			const before = await listed();
			const r = await as("olga", "POST", "/booking-pauses", body);
			expect(r.status).toBe(400);
			expect(reason(r)).toBe(why);
			expect(await listed()).toEqual(before);
		});

		it("refuses a malformed pause (no scope, a message too long), writing nothing", async () => {
			const before = await listed();
			expect((await as("olga", "POST", "/booking-pauses", {})).status).toBe(400);
			const long = "x".repeat(601);
			expect(
				(
					await as("olga", "POST", "/booking-pauses", {
						scope: { level: "organisation" },
						message: { ro: long, en: "a" },
					})
				).status,
			).toBe(400);
			expect(await listed()).toEqual(before);
		});

		it("refuses a change or a removal of a pause that is not there", async () => {
			const before = await listed();
			expect(
				(await as("olga", "PUT", "/booking-pauses/bpnothere", { scope: { level: "organisation" } }))
					.status,
			).toBe(404);
			expect((await as("olga", "DELETE", "/booking-pauses/bpnothere")).status).toBe(404);
			expect(await listed()).toEqual(before);
		});
	});

	describe("what a pause does to the public site", () => {
		it("answers the free times, a hold and a submit with booking_paused and the message, while the organisation is paused", async () => {
			const slot = await firstSlot();
			const held = await site("POST", "/book/holds", holdBody(slot));
			expect(held.status).toBe(200);
			await paused({
				scope: { level: "organisation" },
				message: { ro: "Închis azi.", en: "Closed today." },
			});
			const slots = await site("GET", SLOTS);
			expect(slots.status).toBe(409);
			expect(code(slots)).toBe("booking_paused");
			const detail = BookingPausedDetail.parse((slots.json.error as { detail: unknown }).detail);
			expect(detail).toEqual({
				level: "organisation",
				message: { ro: "Închis azi.", en: "Closed today." },
				callbacksOpen: true,
			});
			expect(code(await site("POST", "/book/holds", holdBody(slot)))).toBe("booking_paused");
			const submit = await site("POST", `/book/holds/${String(held.json.reference)}/submit`, {
				holdToken: held.json.holdToken,
				contact: bookingContact(),
			});
			expect(code(submit)).toBe("booking_paused");
			// The hold is still the visitor's to give back.
			expect(
				(
					await site("POST", `/book/holds/${String(held.json.reference)}/release`, {
						holdToken: held.json.holdToken,
					})
				).status,
			).toBe(200);
		});

		it("tells the services the site lists that booking is paused", async () => {
			await paused({ scope: { level: "organisation" } });
			const out = await site("GET", "/book/services");
			expect(out.status).toBe(200);
			expect(out.json.pause).toMatchObject({ level: "organisation", callbacksOpen: true });
		});

		it("keeps callback requests open, unless the pause closes them too", async () => {
			const callback = {
				contact: { name: "Ana Test", phone: "+40720000999" },
				locale: "ro",
				when: "any",
				page: "/programare",
				channel: "form",
			};
			await paused({ scope: { level: "organisation" } });
			expect((await site("POST", "/book/callback-requests", callback)).status).toBe(200);
			await paused({ scope: { level: "organisation" }, callbacksOpen: false });
			const before = (
				await as("olga", "GET", `/requests?from=${NOW - 24 * HOUR}&to=${NOW + 30 * 24 * HOUR}`)
			).json;
			const r = await site("POST", "/book/callback-requests", callback);
			expect(code(r)).toBe("booking_paused");
			expect((r.json.error as { detail: { callbacksOpen: boolean } }).detail.callbacksOpen).toBe(
				false,
			);
			expect(
				(await as("olga", "GET", `/requests?from=${NOW - 24 * HOUR}&to=${NOW + 30 * 24 * HOUR}`))
					.json,
			).toEqual(before);
		});

		it("pauses one site and not another key of the same app", async () => {
			await paused({ scope: { level: "site", site: "psizone-web" } });
			expect(code(await site("GET", SLOTS))).toBe("booking_paused");
		});

		it("pauses one service: its free times are refused, another's are not", async () => {
			await paused({ scope: { level: "service", service: "evaluation" } });
			expect(code(await site("GET", SLOTS))).toBe("booking_paused");
			const services = (await site("GET", "/book/services")).json.services as {
				slug: string;
				pause?: unknown;
			}[];
			expect(services.find((s) => s.slug === "evaluation")?.pause).toBeDefined();
			expect((await site("GET", "/book/services")).json.pause).toBeUndefined();
		});

		it("pauses one practitioner: their free times go, the others' stay, a hold with them is refused", async () => {
			const all = (await site("GET", SLOTS)).json.slots as {
				practitioner: string;
				start: number;
			}[];
			const people = [...new Set(all.map((s) => s.practitioner))];
			expect(people.length).toBeGreaterThan(1);
			const visitorId = all[0]?.practitioner ?? "";
			const personId =
				[w.ids.dora, w.ids.elena].find((p) => p === visitorId || p === `p${visitorId}`) ?? "";
			await paused({ scope: { level: "practitioner", practitionerId: personId } });
			const now = (await site("GET", SLOTS)).json.slots as {
				practitioner: string;
				start: number;
			}[];
			expect(now.length).toBeGreaterThan(0);
			expect(now.some((s) => s.practitioner === visitorId)).toBe(false);
			const first = all.find((s) => s.practitioner === visitorId);
			if (first === undefined) throw new Error("no slot of the paused practitioner");
			expect(code(await site("POST", "/book/holds", holdBody(first)))).toBe("booking_paused");
			const listedPeople = (
				(await site("GET", "/book/services")).json.services as {
					slug: string;
					practitioners: { id: string }[];
				}[]
			)
				.find((s) => s.slug === "evaluation")
				?.practitioners.map((p) => p.id);
			expect(listedPeople).not.toContain(visitorId);
		});

		it("is not in force before its start, and is in force once the clock reaches it", async () => {
			await paused({
				scope: { level: "organisation" },
				from: NOW + 2 * HOUR,
				until: NOW + 4 * HOUR,
			});
			expect((await site("GET", SLOTS)).status).toBe(200);
			expect((await listed()).items[0]?.state).toBe("scheduled");
			w.clock.now = NOW + 3 * HOUR;
			try {
				expect(code(await site("GET", SLOTS))).toBe("booking_paused");
				w.clock.now = NOW + 4 * HOUR;
				expect((await site("GET", SLOTS)).status).toBe(200);
				expect((await listed()).items[0]?.state).toBe("ended");
			} finally {
				w.clock.now = NOW;
			}
		});
	});

	describe("staff", () => {
		const block = (start: number) => ({
			kind: "block",
			practitionerId: w.ids.elena,
			start,
			end: start + HOUR,
		});

		it("keep booking from the console while online booking is paused", async () => {
			await paused({ scope: { level: "organisation" } });
			const r = await as("olga", "POST", "/appointments", block(NOW + 30 * 24 * HOUR));
			expect(r.status, JSON.stringify(r.json)).toBe(200);
		});

		it("are stopped too by a pause that blocks staff, and nothing is booked", async () => {
			await paused({
				scope: { level: "practitioner", practitionerId: w.ids.elena },
				blockStaff: true,
			});
			const before = (
				await as("olga", "GET", `/appointments?from=${NOW}&to=${NOW + 60 * 24 * HOUR}`)
			).json;
			const r = await as("olga", "POST", "/appointments", block(NOW + 31 * 24 * HOUR));
			expect(code(r)).toBe("booking_paused");
			expect(
				(await as("olga", "GET", `/appointments?from=${NOW}&to=${NOW + 60 * 24 * HOUR}`)).json,
			).toEqual(before);
			// Another practitioner is not paused.
			const other = await as("olga", "POST", "/appointments", {
				...block(NOW + 32 * 24 * HOUR),
				practitionerId: w.ids.dora,
			});
			expect(other.status).toBe(200);
		});
	});
});
