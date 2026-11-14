import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { DAY, HOUR, harness, id } from "./api-harness";

/**
 * `apiVisitEdit:edit`, the one all-or-nothing edit of a staff visit, against the local backend in a throwaway
 * `test-edit-…` app (synthetic data). A refusal is its own case and writes NOTHING (no row, no audit event, no version);
 * a change appends exactly one audit event and one version, however many fields it carries.
 */
if (!backendReady) console.warn("api-visit-edit.test: no local backend; see README");

const { TENANT, mut, qry } = harness("edit");
const META = { kind: "session", practitioner: "pAPI-PRACTITIONER", service: "svc-1" } as const;
const NOT_THERE = { audit: 0, ok: false, same: true } as const;

describe.skipIf(!backendReady)("the all-or-nothing edit of a visit", () => {
	const ids: Record<string, string> = {};
	const base = Date.UTC(2030, 5, 3, 8);
	let slot = 0;
	/** An hour of its own on a day of its own. */
	const when = (): { start: number; end: number } => {
		const start = base + ++slot * DAY;
		return { start, end: start + HOUR };
	};
	const make = async (extra: Record<string, unknown> = {}): Promise<string> =>
		id(
			await mut("apiVisits:create", {
				column: { kind: "practitioner", id: ids.p1 },
				...when(),
				client: ids.c1,
				sessionType: "session",
				priceMinor: 10_000,
				...extra,
			}),
		);
	const visit = async (v: string) =>
		(await qry("apiVisits:get", { visit: v })).visit as Record<string, unknown>;

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
				],
			},
			z.array(z.object({ id: z.string() })),
		);
		ids.p1 = people[0]?.id ?? "";
		const client = {
			name: "Test Client A",
			kind: "adult",
			consent: { contact: true, reminders: false },
		};
		ids.c1 = id(await mut("apiClients:create", { client }));
		ids.c2 = id(await mut("apiClients:create", { client: { ...client, name: "Test Client B" } }));
		ids.pkg1 = id(
			await mut("apiMoney:createPackage", {
				client: ids.c1,
				sessionType: "ABA",
				totalSessions: 10,
				bonusSessions: 0,
				priceMinor: 100_000,
			}),
		);
		ids.pkg2 = id(
			await mut("apiMoney:createPackage", {
				client: ids.c2,
				sessionType: "ABA",
				totalSessions: 5,
				bonusSessions: 0,
				priceMinor: 50_000,
			}),
		);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("changes the client, the package, the session type, the price, the note and the facts in ONE write: one audit event, one version", async () => {
		const v = await make({ package: ids.pkg1 });
		const out = await mut("apiVisitEdit:edit", {
			visit: v,
			client: ids.c2,
			package: ids.pkg2,
			sessionType: "svc-2",
			priceMinor: 7_500,
			notes: "moved over",
			meta: { ...META, service: "svc-2", remind: false },
		});
		expect(out).toMatchObject({ changed: true, version: 2 });
		expect(await visit(v)).toMatchObject({
			client: ids.c2,
			package: ids.pkg2,
			sessionType: "svc-2",
			priceMinor: 7_500,
			notes: "moved over",
			version: 2,
			meta: { service: "svc-2", remind: false },
		});
	});

	it("takes a visit out of its package with null, and the credit type goes with it", async () => {
		const v = await make({ package: ids.pkg1, creditType: "bonus" });
		await mut("apiVisitEdit:edit", { visit: v, package: null });
		const got = await visit(v);
		expect(got.package).toBeUndefined();
		expect(got.creditType).toBeUndefined();
		await mut("apiVisitEdit:edit", { visit: v, package: null }, { audit: 0 });
	});

	it("confirms a requested visit, and only a requested one", async () => {
		const v = await make({ status: "requested" });
		expect(await visit(v)).toMatchObject({ status: "requested" });
		await mut("apiVisitEdit:edit", { visit: v, confirm: true });
		expect(await visit(v)).toMatchObject({ status: "confirmed" });
		expect(await mut("apiVisitEdit:edit", { visit: v, confirm: true }, NOT_THERE)).toMatchObject({
			reason: "not_requested",
		});
	});

	it("a requested visit holds the time and is moved like a confirmed one; a cancelled one is not touched", async () => {
		const v = await make({ status: "requested" });
		const to = when();
		await mut("apiVisitEdit:edit", { visit: v, move: to });
		expect(await visit(v)).toMatchObject({ start: to.start, end: to.end, status: "requested" });
		await mut("apiVisits:cancel", { visit: v });
		expect(await mut("apiVisitEdit:edit", { visit: v, notes: "late" }, NOT_THERE)).toMatchObject({
			reason: "not_allowed",
		});
	});

	it("moves with the other fields, and a clash refuses the whole edit: nothing is written", async () => {
		const taken = await make({ client: ids.c2 });
		const takenAt = await visit(taken);
		const v = await make({ notes: "keep" });
		const out = await mut(
			"apiVisitEdit:edit",
			{
				visit: v,
				client: ids.c2,
				notes: "changed",
				priceMinor: 1,
				move: { start: takenAt.start, end: takenAt.end },
			},
			NOT_THERE,
		);
		expect(out).toMatchObject({ reason: "overlaps" });
		expect(await visit(v)).toMatchObject({
			client: ids.c1,
			notes: "keep",
			priceMinor: 10_000,
			version: 1,
		});
	});

	it("an edit that changes nothing writes nothing", async () => {
		const v = await make({ notes: "same" });
		const out = await mut(
			"apiVisitEdit:edit",
			{ visit: v, notes: "same", client: ids.c1 },
			{ audit: 0, same: true },
		);
		expect(out).toMatchObject({ changed: false, version: 1 });
	});

	/** What the edit is asked, given the visit made for the case. */
	type Ask = (visit: string) => Record<string, unknown>;
	const REFUSALS: ReadonlyArray<readonly [string, Ask, string]> = [
		["a client that is not there", (v) => ({ visit: v, client: "nope" }), "unknown_client"],
		["a package that is not there", (v) => ({ visit: v, package: "nope" }), "unknown_package"],
		["a negative price", (v) => ({ visit: v, priceMinor: -1 }), "negative_money"],
		["a price that is not whole", (v) => ({ visit: v, priceMinor: 1.5 }), "negative_money"],
		[
			"another client's package, the client unchanged",
			(v) => ({ visit: v, package: ids.pkg2 }),
			"package_not_clients",
		],
		[
			"a move to a column that is not there",
			(v) => ({ visit: v, move: { ...when(), column: { kind: "room", id: "nope" } } }),
			"unknown_column",
		],
		[
			"a move that ends before it starts",
			(v) => ({ visit: v, move: { start: base + 9 * DAY, end: base + 9 * DAY - HOUR } }),
			"end_not_after_start",
		],
		[
			"facts with no practitioner",
			(v) => ({ visit: v, meta: { kind: "session", practitioner: " " } }),
			"invalid",
		],
		["a version that moved on", (v) => ({ visit: v, expectedVersion: 99, notes: "x" }), "stale"],
	];
	it.each(REFUSALS)("refuses %s, whole: nothing is written", async (_what, ask, reason) => {
		const v = await make();
		expect(await mut("apiVisitEdit:edit", ask(v), NOT_THERE)).toMatchObject({ reason });
		expect(await visit(v)).toMatchObject({ client: ids.c1, priceMinor: 10_000, version: 1 });
	});

	it("refuses a visit that is not there, and one that was deleted", async () => {
		expect(await mut("apiVisitEdit:edit", { visit: "nope", notes: "x" }, NOT_THERE)).toMatchObject({
			reason: "not_found",
		});
		const v = await make();
		await mut("apiVisits:remove", { visit: v, action: "delete" });
		expect(await mut("apiVisitEdit:edit", { visit: v, notes: "x" }, NOT_THERE)).toMatchObject({
			reason: "not_found",
		});
	});

	it("a package must belong to the client the visit will have: moved together it does, apart it does not", async () => {
		const v = await make({ package: ids.pkg1 });
		expect(await mut("apiVisitEdit:edit", { visit: v, client: ids.c2 }, NOT_THERE)).toMatchObject({
			reason: "package_not_clients",
		});
		await mut("apiVisitEdit:edit", { visit: v, client: ids.c2, package: ids.pkg2 });
		expect(await visit(v)).toMatchObject({ client: ids.c2, package: ids.pkg2 });
	});

	it("asks the blacklist about the client the visit is moved to: a warning stops it, a reason lets it through, a block needs more", async () => {
		const flagged = id(
			await mut("apiClients:create", {
				client: {
					name: "Test Flagged",
					kind: "adult",
					consent: { contact: true, reminders: false },
				},
			}),
		);
		const entry = id(
			await mut("apiBlacklist:create", {
				entry: { client: flagged, reason: "a reason", category: "other", severity: "warn" },
			}),
		);
		const v = await make();
		expect(await mut("apiVisitEdit:edit", { visit: v, client: flagged }, NOT_THERE)).toMatchObject({
			reason: "warning",
		});
		expect(await visit(v)).toMatchObject({ client: ids.c1 });
		const ack = { reason: "known", authority: "ack" } as const;
		expect(
			(await mut("apiVisitEdit:edit", { visit: v, client: flagged, override: ack }, { audit: 2 }))
				.ok,
		).toBe(true);
		await mut("apiBlacklist:update", { entry, patch: { severity: "block_online" } });
		const w = await make();
		expect(
			await mut("apiVisitEdit:edit", { visit: w, client: flagged, override: ack }, NOT_THERE),
		).toMatchObject({ reason: "blocked" });
		// A note on the flagged client's own visit is not a booking: the gate stays out of it.
		await mut("apiVisitEdit:edit", { visit: v, notes: "no gate" });
	});
});
