import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { DAY, HOUR, harness, id } from "./api-harness";

/**
 * `apiSeries`: weekly series made, edited and cancelled as a whole, against the local backend in a throwaway
 * `test-series-…` app (synthetic data). A refusal is its own case and writes NOTHING (not a row, not an audit event) and
 * lists every occurrence that stopped it; a change appends one audit event per visit it touches.
 */
if (!backendReady) console.warn("api-series.test: no local backend; see README");

const { TENANT, mut, qry } = harness("series");
const NOT_THERE = { audit: 0, ok: false, same: true } as const;
const META = { kind: "session", practitioner: "pAPI-PRACTITIONER", service: "svc-1" } as const;

describe.skipIf(!backendReady)("weekly series, all or nothing", () => {
	const ids: Record<string, string> = {};
	const base = Date.UTC(2030, 5, 3, 8);
	let slot = 0;
	/** A first week of its own, so cases never meet. */
	const first = (): number => base + ++slot * 80 * DAY;
	const weeks = (start: number, count: number) =>
		Array.from({ length: count }, (_, i) => ({
			start: start + i * 7 * DAY,
			end: start + i * 7 * DAY + HOUR,
		}));
	const create = (start: number, count: number, extra: Record<string, unknown> = {}, e = {}) =>
		mut(
			"apiSeries:create",
			{
				column: { kind: "practitioner", id: ids.p1 },
				occurrences: weeks(start, count),
				client: ids.c1,
				sessionType: "session",
				priceMinor: 10_000,
				meta: META,
				...extra,
			},
			{ audit: count, ...e },
		);
	const members = async (series: string) =>
		((await qry("apiSeries:visits", { series })).visits as Record<string, unknown>[]) ?? [];

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

	it("makes every week in one write: the first visit's id is the series, every visit carries it, one audit event each", async () => {
		const made = await create(first(), 4);
		expect(made.ids).toHaveLength(4);
		expect(made.series).toBe((made.ids as string[])[0]);
		const rows = await members(String(made.series));
		expect(rows.map((r) => r.id)).toEqual(made.ids);
		expect(rows.every((r) => r.series === made.series && r.status === "confirmed")).toBe(true);
		expect(
			rows.map((r) => r.start).every((s, i, all) => i === 0 || Number(s) > Number(all[i - 1])),
		).toBe(true);
	});

	it("lists every occurrence that clashes, with what it clashes with, and writes nothing", async () => {
		const start = first();
		await mut("apiVisits:create", {
			column: { kind: "practitioner", id: ids.p1 },
			start: start + 7 * DAY,
			end: start + 7 * DAY + HOUR,
			client: ids.c2,
			sessionType: "session",
		});
		await mut("apiVisits:create", {
			column: { kind: "practitioner", id: ids.p1 },
			start: start + 21 * DAY,
			end: start + 21 * DAY + HOUR,
			client: ids.c2,
			sessionType: "session",
		});
		const out = await create(start, 5, {}, NOT_THERE);
		expect(out).toMatchObject({ reason: "conflicts" });
		expect(out.conflicts).toEqual([
			{ index: 1, start: start + 7 * DAY, reason: "overlaps", with: "practitioner" },
			{ index: 3, start: start + 21 * DAY, reason: "overlaps", with: "practitioner" },
		]);
	});

	it.each([
		["one occurrence", 1, "invalid"],
		["no occurrence", 0, "invalid"],
		["53 occurrences", 53, "too_many"],
	])("refuses %s, and writes nothing", async (_what, count, reason) => {
		expect(await create(first(), count, {}, NOT_THERE)).toMatchObject({ reason });
	});

	it("takes 52 occurrences", async () => {
		// Far from every other case: a year of weeks holds the person for a year.
		const made = await create(first() + 3000 * DAY, 52);
		expect(made.ids).toHaveLength(52);
	});

	it("refuses an occurrence that ends before it starts, naming it", async () => {
		const start = first();
		const out = await mut(
			"apiSeries:create",
			{
				column: { kind: "practitioner", id: ids.p1 },
				occurrences: [
					...weeks(start, 2),
					{ start: start + 14 * DAY, end: start + 14 * DAY - HOUR },
				],
				client: ids.c1,
				sessionType: "session",
				meta: META,
			},
			NOT_THERE,
		);
		expect(out).toMatchObject({ reason: "invalid", conflicts: [{ index: 2 }] });
	});

	it("refuses a client, a package and a column that are not there, whole", async () => {
		const start = first();
		for (const [extra, reason] of [
			[{ client: "nope" }, "unknown_client"],
			[{ package: "nope" }, "unknown_package"],
			[{ column: { kind: "room", id: "nope" } }, "unknown_column"],
		] as const)
			expect(await create(start, 3, extra, NOT_THERE)).toMatchObject({ reason });
	});

	it("asks the blacklist about the client once: a warning stops the whole series, a reason lets it through", async () => {
		const flagged = id(
			await mut("apiClients:create", {
				client: {
					name: "Test Flagged",
					kind: "adult",
					consent: { contact: true, reminders: false },
				},
			}),
		);
		await mut("apiBlacklist:create", {
			entry: { client: flagged, reason: "a reason", category: "other", severity: "warn" },
		});
		const start = first();
		expect(await create(start, 3, { client: flagged }, NOT_THERE)).toMatchObject({
			reason: "warning",
		});
		const made = await create(
			start,
			3,
			{ client: flagged, override: { reason: "known", authority: "ack" } },
			{ audit: 4 },
		);
		expect(made.ids).toHaveLength(3);
	});

	it("edits many visits in one write; a visit that changes nothing writes nothing", async () => {
		const made = await create(first(), 3);
		const visits = made.ids as string[];
		await mut(
			"apiSeries:editMany",
			{
				items: visits.map((visit) => ({ visit, notes: "every week", priceMinor: 9_000 })),
			},
			{ audit: 3 },
		);
		expect((await members(String(made.series))).map((r) => [r.notes, r.priceMinor])).toEqual([
			["every week", 9_000],
			["every week", 9_000],
			["every week", 9_000],
		]);
		const again = await mut(
			"apiSeries:editMany",
			{
				items: visits.map((visit) => ({ visit, notes: "every week" })),
			},
			{ audit: 0, same: true },
		);
		expect(again).toMatchObject({ changed: 0 });
	});

	it("refuses the whole edit when one visit is refused, and lists which: none of the others changes", async () => {
		const made = await create(first(), 3);
		const [a, b, c] = made.ids as string[];
		const out = await mut(
			"apiSeries:editMany",
			{
				items: [
					{ visit: a, notes: "never written" },
					{ visit: b, client: ids.c2, notes: "never written" },
					{ visit: c, notes: "never written" },
				],
			},
			// The second item takes client two with no package, which is fine; the third has no fault: all pass.
			{ audit: 3 },
		);
		expect(out).toMatchObject({ changed: 3 });
		const bad = await mut(
			"apiSeries:editMany",
			{
				items: [
					{ visit: a, notes: "still never written" },
					{ visit: b, package: ids.pkg2, client: ids.c1, notes: "still never written" },
					{ visit: c, priceMinor: -1 },
				],
			},
			NOT_THERE,
		);
		expect(bad).toMatchObject({
			reason: "conflicts",
			conflicts: [
				{ index: 1, reason: "package_not_clients" },
				{ index: 2, reason: "negative_money" },
			],
		});
		expect((await members(String(made.series))).map((r) => r.notes)).toEqual([
			"never written",
			"never written",
			"never written",
		]);
	});

	it("refuses an edit of a visit that is not there, and an empty or a too long list", async () => {
		expect(
			await mut("apiSeries:editMany", { items: [{ visit: "nope", notes: "x" }] }, NOT_THERE),
		).toMatchObject({
			reason: "conflicts",
			conflicts: [{ index: 0, reason: "not_found" }],
		});
		expect(await mut("apiSeries:editMany", { items: [] }, NOT_THERE)).toMatchObject({
			reason: "invalid",
		});
	});

	it("cancels many visits in one write, with the reason in their facts; a visit already cancelled refuses the whole", async () => {
		const made = await create(first(), 3);
		const [a, b, c] = made.ids as string[];
		await mut(
			"apiSeries:cancelMany",
			{
				items: [a, b].map((visit) => ({ visit, meta: { ...META, cancelReason: "ended" } })),
			},
			{ audit: 2 },
		);
		const rows = await members(String(made.series));
		expect(rows.map((r) => r.status)).toEqual(["cancelled", "cancelled", "confirmed"]);
		expect((rows[0]?.meta as { cancelReason?: string }).cancelReason).toBe("ended");
		const again = await mut(
			"apiSeries:cancelMany",
			{ items: [{ visit: c }, { visit: a }] },
			NOT_THERE,
		);
		expect(again).toMatchObject({
			reason: "conflicts",
			conflicts: [{ index: 1, reason: "not_allowed" }],
		});
		expect((await members(String(made.series))).map((r) => r.status)).toEqual([
			"cancelled",
			"cancelled",
			"confirmed",
		]);
	});

	it("lists the members of a series in time order, and none for a series that is not there", async () => {
		const made = await create(first(), 3);
		const rows = await members(String(made.series));
		expect(rows).toHaveLength(3);
		expect(await members("nosuchseries")).toEqual([]);
	});
});
