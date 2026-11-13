import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { DAY, enc, HOUR, harness, id } from "./api-harness";

/**
 * Server-keyed clinic wrappers, part 1 (settings, resources, clients, visits, packages, roster), against the local backend in a throwaway `test-api-…` app: each is refused without the key (and with a wrong one) and then writes NOTHING; with the key a write appends exactly one audit event and a change-log entry. Synthetic data.
 */
if (!backendReady) console.warn("api-wrappers.test: no local backend; see README");

const { TENANT, mut, qry } = harness("api");

describe.skipIf(!backendReady)("the server-keyed clinic wrappers", () => {
	const ids: Record<string, string> = {};

	beforeAll(async () => {
		if (!backendReady) return;
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
		const people = await runMutation(
			"importPeople:upsertPractitioners",
			{
				tenant: TENANT,
				rows: [
					{
						legacyId: "therapists:1",
						fingerprint: "a",
						slug: "t-one",
						displayName: "Test Therapist One",
						active: true,
					},
					{
						legacyId: "therapists:2",
						fingerprint: "b",
						slug: "t-two",
						displayName: "Test Therapist Two",
						active: true,
					},
				],
			},
			z.array(z.object({ id: z.string() })),
		);
		ids.p1 = people[0]?.id ?? "";
		ids.p2 = people[1]?.id ?? "";
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("settings", async () => {
		await mut("apiSettings:set", { name: "Test App", currency: "RON", address: "Test address" });
		const got = await qry("apiSettings:get", {});
		expect(got.name).toBe("Test App");
		await mut("apiSettings:set", { currency: "ron" }, { audit: 0, ok: false });
	});

	it("rooms, devices, groups and staff", async () => {
		ids.room = id(
			await mut("staffRooms:createRoom", {
				slug: "cabinet-1",
				name: "Cabinet 1",
				kind: "therapy",
				capacity: 2,
				suits: ["adult"],
				equipment: [],
			}),
		);
		await mut("staffRooms:updateRoom", { room: ids.room, patch: { capacity: 3 } });
		await mut("staffRooms:addRoomClosure", {
			room: ids.room,
			from: "2030-01-01",
			to: "2030-01-02",
		});
		ids.device = id(
			await mut("apiResources:createDevice", {
				slug: "nfb-1",
				name: "NFB 1",
				kind: "neurofeedback",
			}),
		);
		await mut(
			"apiResources:createDevice",
			{ slug: "nfb-1", name: "Again", kind: "other" },
			{ audit: 0, ok: false },
		);
		await mut("apiResources:updateDevice", { device: ids.device, patch: { active: false } });
		await mut(
			"apiResources:updateDevice",
			{ device: ids.device, patch: { active: false } },
			{ audit: 0 },
		);
		await mut("apiResources:updateDevice", { device: ids.device, patch: { active: true } });
		expect(((await qry("apiResources:devices", {})).devices as unknown[]).length).toBe(1);
		ids.group = id(await mut("apiResources:createGroup", { slug: "racemeup", name: "RaceMeUp" }));
		await mut("apiResources:updateGroup", { group: ids.group, patch: { shortName: "RMU" } });
		expect(((await qry("apiResources:groups", {})).groups as unknown[]).length).toBe(1);
		ids.staff = id(
			await mut("apiResources:createStaff", { name: "Test Reception", kind: "reception" }),
		);
		await mut("apiResources:updateStaff", { staff: ids.staff, patch: { active: false } });
		expect(((await qry("apiResources:staff", {})).staff as unknown[]).length).toBe(1);
		const closures = await qry("staffRooms:rooms", { fromDate: "2029-12-01" });
		expect(closures.ok).toBe(true);
	});

	it("clients: create, update, standing, treating, reads", async () => {
		const client = {
			name: "Test Client A",
			kind: "adult",
			phone: "0700 000 001",
			consent: { contact: true, reminders: false },
			diagnosisEnc: enc,
		};
		ids.c1 = id(await mut("apiClients:create", { client, practitioners: [ids.p1] }));
		ids.c2 = id(
			await mut("apiClients:create", {
				client: { ...client, name: "Test Client B", phone: "0700 000 002" },
			}),
		);
		await mut("apiClients:create", { client: { ...client, name: " " } }, { audit: 0, ok: false });
		await mut("apiClients:create", { client, practitioners: ["nope"] }, { audit: 0, ok: false });
		const upd = await mut("apiClients:update", {
			client: ids.c1,
			patch: { occupation: "tester" },
			expectedVersion: 1,
		});
		expect(upd).toMatchObject({ changed: true, version: 2 });
		expect(
			await mut(
				"apiClients:update",
				{ client: ids.c1, patch: { occupation: "tester" } },
				{ audit: 0 },
			),
		).toMatchObject({ changed: false });
		expect(
			await mut(
				"apiClients:update",
				{ client: ids.c1, patch: { occupation: "x" }, expectedVersion: 1 },
				{ audit: 0, ok: false },
			),
		).toMatchObject({ reason: "stale" });
		await mut("apiClients:update", { client: ids.c1, patch: {}, clear: ["occupation"] });
		await mut(
			"apiClients:update",
			{ client: ids.c1, patch: {}, clear: ["name"] },
			{ audit: 0, ok: false },
		);
		expect(await mut("apiClients:standing", { client: ids.c2, action: "archive" })).toMatchObject({
			ok: true,
		});
		await mut(
			"apiClients:standing",
			{ client: ids.c2, action: "archive" },
			{ audit: 0, ok: false },
		);
		await mut("apiClients:standing", { client: ids.c2, action: "unarchive" });
		// Nothing moves a client but this call.
		expect(
			await mut("apiClients:setTreating", { client: ids.c2, practitioners: [ids.p2] }),
		).toMatchObject({ changed: true });
		expect(
			await mut(
				"apiClients:setTreating",
				{ client: ids.c2, practitioners: [ids.p2] },
				{ audit: 0 },
			),
		).toMatchObject({ changed: false });
		const one = await qry("apiClients:get", { client: ids.c1 });
		expect(one.treating).toEqual([ids.p1]);
		expect(JSON.stringify(one)).toContain('"data":"ZGF0YQ=="');
		expect(((await qry("apiClients:list", {})).clients as unknown[]).length).toBe(2);
		expect((await qry("apiClients:treatingFor", { practitioner: ids.p1 })).clients).toEqual([
			ids.c1,
		]);
		expect((await qry("apiClients:treatingFor", { client: ids.c2 })).practitioners).toEqual([
			ids.p2,
		]);
		await qry("apiClients:treatingFor", {}, { audit: 0 }).catch(() => undefined);
	});

	it("visits: create, update, move, attendance, payment, cancel, delete, restore, reads", async () => {
		const start = Date.now() + 5 * DAY;
		const base = {
			column: { kind: "practitioner", id: ids.p1 },
			client: ids.c1,
			start,
			end: start + HOUR,
			sessionType: "ABA",
			therapistNotes: enc,
		};
		ids.v1 = id(await mut("apiVisits:create", base));
		await mut(
			"apiVisits:create",
			{ ...base, start: start + HOUR / 2, end: start + 2 * HOUR },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiVisits:create",
			{ ...base, column: { kind: "practitioner", id: "nope" } },
			{ audit: 0, ok: false },
		);
		await mut("apiVisits:create", { ...base, end: start }, { audit: 0, ok: false });
		ids.v2 = id(
			await mut("apiVisits:create", {
				...base,
				column: { kind: "group", id: ids.group },
				client: undefined,
				start: start + 3 * HOUR,
				end: start + 4 * HOUR,
				device: ids.device,
				room: ids.room,
			}),
		);
		await mut("apiVisits:update", {
			visit: ids.v1,
			patch: { notes: "Test note", priceMinor: 15000 },
			expectedVersion: 1,
		});
		await mut("apiVisits:update", { visit: ids.v1, patch: { notes: "Test note" } }, { audit: 0 });
		await mut(
			"apiVisits:update",
			{ visit: ids.v1, patch: { priceMinor: -1 } },
			{ audit: 0, ok: false },
		);
		await mut("apiVisits:move", { visit: ids.v1, start: start + DAY, end: start + DAY + HOUR });
		await mut(
			"apiVisits:move",
			{ visit: ids.v1, start: start + 3 * HOUR, end: start + 4 * HOUR, device: ids.device },
			{ audit: 0, ok: false },
		);
		await mut("apiVisits:setAttendance", { visit: ids.v1, attendance: "attended" });
		await mut("apiVisits:setAttendance", { visit: ids.v1, attendance: "attended" }, { audit: 0 });
		await mut("apiVisits:recordPayment", { visit: ids.v1, amountPaidMinor: 15000, method: "card" });
		const fetched = await qry("apiVisits:get", { visit: ids.v1 });
		expect(JSON.stringify(fetched)).toContain('"data":"ZGF0YQ=="');
		const listed = await qry("apiVisits:list", { from: start - DAY, to: start + 3 * DAY });
		expect((listed.visits as unknown[]).length).toBe(2);
		await mut("apiVisits:cancel", { visit: ids.v1 });
		await mut("apiVisits:cancel", { visit: ids.v1 }, { audit: 0, ok: false });
		await mut("apiVisits:remove", { visit: ids.v2, action: "delete" });
		await mut("apiVisits:remove", { visit: ids.v2, action: "delete" }, { audit: 0, ok: false });
		await mut(
			"apiVisits:remove",
			{ visit: ids.v2, action: "restore", now: Date.now() + 31 * DAY },
			{ audit: 0, ok: false },
		);
		await mut("apiVisits:remove", { visit: ids.v2, action: "restore" });
		await qry("apiVisits:list", { from: start, to: start + 200 * DAY }, { audit: 0 }).catch(
			() => undefined,
		);
	});

	it("packages and the payments ledger", async () => {
		ids.pk = id(
			await mut("apiMoney:createPackage", {
				client: ids.c1,
				sessionType: "ABA",
				totalSessions: 10,
				bonusSessions: 1,
				priceMinor: 100000,
				startDate: "2030-01-01",
			}),
		);
		await mut(
			"apiMoney:createPackage",
			{ client: ids.c1, sessionType: "ABA", totalSessions: -1, bonusSessions: 0, priceMinor: 1 },
			{ audit: 0, ok: false },
		);
		await mut("apiMoney:updatePackage", {
			package: ids.pk,
			patch: { priceMinor: 120000 },
			expectedVersion: 1,
		});
		await mut(
			"apiMoney:updatePackage",
			{ package: ids.pk, patch: { priceMinor: 120000 }, expectedVersion: 1 },
			{ audit: 0, ok: false },
		);
		await mut("apiMoney:addPayment", {
			client: ids.c1,
			package: ids.pk,
			amountMinor: 50000,
			method: "cash",
		});
		await mut("apiMoney:addPayment", { client: ids.c1, package: ids.pk, amountMinor: -10000 });
		await mut("apiMoney:addPayment", { client: ids.c1, amountMinor: 0 }, { audit: 0, ok: false });
		await mut(
			"apiMoney:addPayment",
			{ client: ids.c2, package: ids.pk, amountMinor: 1 },
			{ audit: 0, ok: false },
		);
		const got = await qry("apiMoney:forClient", { client: ids.c1 });
		expect(JSON.stringify(got)).toContain('"amountMinor":50000');
		await mut("apiMoney:removePackage", { package: ids.pk }, { audit: 0, ok: false });
		const spare = id(
			await mut("apiMoney:createPackage", {
				client: ids.c2,
				sessionType: "ABA",
				totalSessions: 1,
				bonusSessions: 0,
				priceMinor: 1,
			}),
		);
		await mut("apiMoney:removePackage", { package: spare });
	});

	it("roster and blocks", async () => {
		const day = id(
			await mut("apiRoster:setDay", {
				person: { kind: "practitioner", id: ids.p1 },
				date: "2030-02-04",
				status: "works",
				startMinutes: 540,
				endMinutes: 1020,
			}),
		);
		await mut("apiRoster:setDay", {
			person: { kind: "staff", id: ids.staff },
			date: "2030-02-04",
			status: "annual_leave",
		});
		await mut(
			"apiRoster:setDay",
			{
				person: { kind: "practitioner", id: ids.p1 },
				date: "2030-02-04",
				status: "works",
				startMinutes: 1020,
				endMinutes: 540,
			},
			{ audit: 0, ok: false },
		);
		await mut(
			"apiRoster:setDay",
			{ person: { kind: "practitioner", id: ids.p1 }, date: "2030-02-30", status: "free" },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiRoster:setDay",
			{ person: { kind: "staff", id: ids.p1 }, date: "2030-02-05", status: "free" },
			{ audit: 0, ok: false },
		);
		const block = id(
			await mut("apiRoster:addBlock", {
				person: { kind: "practitioner", id: ids.p1 },
				dateStart: "2030-03-01",
				dateEnd: "2030-03-03",
				reason: "training",
			}),
		);
		await mut(
			"apiRoster:addBlock",
			{
				person: { kind: "practitioner", id: ids.p1 },
				dateStart: "2030-03-03",
				dateEnd: "2030-03-01",
				reason: "x",
			},
			{ audit: 0, ok: false },
		);
		const r = await qry("apiRoster:range", { from: "2030-02-01", to: "2030-03-31" });
		expect((r.days as unknown[]).length).toBe(2);
		expect((r.blocks as unknown[]).length).toBe(1);
		await mut("apiRoster:removeBlock", { block });
		await mut("apiRoster:clearDay", { day });
		await mut("apiRoster:clearDay", { day }, { audit: 0, ok: false });
	});
});
