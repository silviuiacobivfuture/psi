import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { DAY, HOUR, harness, id } from "./api-harness";

/**
 * `apiCalendar:columnVisits`, the calendar of a few columns read column by column through the indexes, against the local
 * backend in a throwaway `test-cal-…` app (synthetic data). It answers exactly the window's live visits of the columns
 * named (a group session under who leads it), nothing of the others; a refusal answers nothing.
 */
if (!backendReady) console.warn("api-calendar.test: no local backend; see README");

const { TENANT, mut, qry } = harness("cal");

describe.skipIf(!backendReady)("the visits of a few calendar columns", () => {
	const ids: Record<string, string> = {};
	const base = Date.UTC(2030, 5, 3, 8);
	const week = { from: base - HOUR, to: base + 7 * DAY };
	const visit = async (column: Record<string, string>, start: number, extra = {}) =>
		id(
			await mut("apiVisits:create", {
				column,
				start,
				end: start + HOUR,
				sessionType: "session",
				...extra,
			}),
		);

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
				rows: ["1", "2"].map((n) => ({
					legacyId: `therapists:${n}`,
					fingerprint: n,
					slug: `t-${n}`,
					displayName: `Test Therapist ${n}`,
					active: true,
				})),
			},
			z.array(z.object({ id: z.string() })),
		);
		ids.p1 = people[0]?.id ?? "";
		ids.p2 = people[1]?.id ?? "";
		const client = {
			name: "Test Client A",
			kind: "adult",
			consent: { contact: true, reminders: false },
		};
		ids.c1 = id(await mut("apiClients:create", { client }));
		ids.room = id(
			await mut("staffRooms:createRoom", {
				slug: "cabinet-1",
				name: "Cabinet 1",
				kind: "therapy",
				capacity: 4,
				suits: ["adult"],
				equipment: [],
			}),
		);
		ids.device = id(
			await mut("apiResources:createDevice", {
				slug: "nfb-1",
				name: "NFB 1",
				kind: "neurofeedback",
			}),
		);
		ids.group = id(await mut("apiResources:createGroup", { slug: "racemeup", name: "RaceMeUp" }));
		const p1 = { kind: "practitioner", id: ids.p1 };
		ids.v1 = await visit(p1, base, { client: ids.c1, room: ids.room });
		ids.v1late = await visit(p1, base + 8 * DAY, { client: ids.c1 });
		ids.v1gone = await visit(p1, base + DAY, { client: ids.c1 });
		await mut("apiVisits:remove", { visit: ids.v1gone, action: "delete" });
		ids.v2 = await visit({ kind: "practitioner", id: ids.p2 }, base, {
			client: ids.c1,
			device: ids.device,
		});
		ids.g1 = await visit({ kind: "group", id: ids.group }, base + 2 * DAY);
		await mut("apiMoneyExtra:setVisitMeta", {
			visit: ids.g1,
			meta: { kind: "group", practitioner: "pAPI-ONE", group: ids.group },
		});
		ids.g2 = await visit({ kind: "group", id: ids.group }, base + 3 * DAY);
		await mut("apiMoneyExtra:setVisitMeta", {
			visit: ids.g2,
			meta: { kind: "group", practitioner: "pAPI-TWO", group: ids.group },
		});
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	const visitsOf = async (of: Record<string, unknown>, window = week): Promise<string[]> =>
		((await qry("apiCalendar:columnVisits", { ...window, of })).visits as { id: string }[])
			.map((v) => v.id)
			.sort();

	it("a practitioner's week: their own column and the group sessions they lead, nothing else", async () => {
		expect(
			await visitsOf({ kind: "people", practitioners: [ids.p1], people: ["pAPI-ONE"] }),
		).toEqual([ids.v1, ids.g1].sort());
		expect(await visitsOf({ kind: "people", practitioners: [ids.p2], people: [] })).toEqual([
			ids.v2,
		]);
		expect(
			await visitsOf({
				kind: "people",
				practitioners: [ids.p1, ids.p2, ids.p1],
				people: ["pAPI-ONE", "pAPI-TWO"],
			}),
		).toEqual([ids.v1, ids.v2, ids.g1, ids.g2].sort());
	});

	it("a room's and a device's week", async () => {
		expect(await visitsOf({ kind: "rooms", ids: [ids.room] })).toEqual([ids.v1]);
		expect(await visitsOf({ kind: "devices", ids: [ids.device] })).toEqual([ids.v2]);
	});

	it("the window is half-open on the start, and soft-deleted visits are left out", async () => {
		const one = { kind: "people", practitioners: [ids.p1], people: [] };
		expect(await visitsOf(one, { from: base, to: base + 1 })).toEqual([ids.v1]);
		expect(await visitsOf(one, { from: base + 1, to: base + DAY + HOUR })).toEqual([]);
		expect(await visitsOf(one, { from: base - DAY, to: base })).toEqual([]);
	});

	it("no columns, or ids that name nothing, answer nothing", async () => {
		expect(await visitsOf({ kind: "people", practitioners: [], people: [] })).toEqual([]);
		expect(await visitsOf({ kind: "people", practitioners: ["nope"], people: ["nope"] })).toEqual(
			[],
		);
		expect(await visitsOf({ kind: "rooms", ids: ["not-an-id"] })).toEqual([]);
		expect(await visitsOf({ kind: "devices", ids: [ids.room] })).toEqual([]);
	});

	it("refuses an empty window and too many columns, answering nothing", async () => {
		for (const args of [
			{ from: base, to: base, of: { kind: "rooms", ids: [ids.room] } },
			{ from: base, to: base - 1, of: { kind: "rooms", ids: [ids.room] } },
			{ ...week, of: { kind: "rooms", ids: Array.from({ length: 201 }, (_, i) => `r${i}`) } },
		]) {
			const out = await qry("apiCalendar:columnVisits", args, { ok: false });
			expect(out).toEqual({ ok: false, reason: "invalid" });
		}
	});
});
