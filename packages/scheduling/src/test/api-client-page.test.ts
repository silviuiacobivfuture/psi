import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { DAY, enc, HOUR, harness, id } from "./api-harness";
import { callMutation, callQuery } from "./server";

/**
 * `apiClientPage:page`, the numbered client list, against the local backend in a throwaway `test-page-…` app: the page
 * boundaries (empty, one, an exact multiple, a last partial page, past the end), the total from the same read, the
 * search folded (diacritics, case, every word), each filter alone and combined with the search and an order, the reach
 * (`within`) narrowing the count, erased clients never counted, another app's clients never seen. Every call is
 * refused without the key and writes nothing (the harness checks). Synthetic data.
 */
if (!backendReady) console.warn("api-client-page.test: no local backend; see README");

const { TENANT, mut, qry } = harness("page");
const OTHER = `${TENANT}-other`;

const Page = z.object({
	clients: z.array(
		z.object({
			client: z.object({
				id: z.string(),
				name: z.string(),
				createdAt: z.number(),
			}),
			treating: z.array(z.string()),
			lastVisit: z.number().nullable(),
		}),
	),
	total: z.number(),
	offset: z.number(),
});
type Ask = Record<string, unknown>;

describe.skipIf(!backendReady)("the numbered client list", () => {
	const ids: Record<string, string> = {};
	const NAMES = [
		"Test Ana Pop",
		"Test Bogdan Ionescu",
		"Test Ștefan Marin",
		"Test Șerban Pop",
		"Test Zoe Ene",
		"Test ana Lazăr",
		"Test Radu Pop",
	];
	const visitAt = Date.now() + 5 * DAY;
	const now = visitAt + 30 * DAY;
	const ask = (extra: Ask): Ask => ({
		standing: "active",
		sort: "name",
		offset: 0,
		size: 25,
		now,
		...extra,
	});
	const page = async (extra: Ask) => Page.parse(await qry("apiClientPage:page", ask(extra)));
	const names = (p: z.infer<typeof Page>) => p.clients.map((c) => c.client.name);

	beforeAll(async () => {
		if (!backendReady) return;
		for (const slug of [TENANT, OTHER])
			await runMutation(
				"clinicApps:ensureApp",
				{
					slug,
					name: "T",
					kind: "clinic",
					defaultLocale: "ro",
					currency: "RON",
				},
				z.unknown(),
			);
		const people = await runMutation(
			"importPeople:upsertPractitioners",
			{
				tenant: TENANT,
				rows: [1, 2].map((i) => ({
					legacyId: `therapists:${i}`,
					fingerprint: String(i),
					slug: `t-${i}`,
					displayName: `Test Therapist ${i}`,
					active: true,
				})),
			},
			z.array(z.object({ id: z.string() })),
		);
		ids.p1 = people[0]?.id ?? "";
		ids.p2 = people[1]?.id ?? "";
		let n = 0;
		for (const name of NAMES) {
			n += 1;
			ids[name] = id(
				await mut("apiClients:create", {
					client: {
						name,
						kind: "adult",
						phone: `0700 000 2${String(n).padStart(2, "0")}`,
						consent: { contact: true, reminders: false },
						diagnosisEnc: enc,
					},
					practitioners: name.endsWith("Pop") ? [ids.p1] : name.includes("Bogdan") ? [ids.p2] : [],
				}),
			);
		}
		// Archived: Zoe. Erased: an extra client who must never be counted.
		await mut("apiClients:standing", {
			client: ids["Test Zoe Ene"],
			action: "archive",
		});
		const gone = id(
			await mut("apiClients:create", {
				client: {
					name: "Test Gone Pop",
					kind: "adult",
					consent: { contact: false, reminders: false },
				},
				practitioners: [ids.p1],
			}),
		);
		const erased = z.object({ ok: z.boolean() }).parse(
			await callMutation("staffClients:eraseClient", {
				tenant: TENANT,
				client: gone,
				actor: { subject: "sub-test" },
			}),
		);
		expect(erased.ok).toBe(true);
		// Visits: Radu came last (latest), Ana before him, Bogdan's one was marked absent (does not count).
		const visit = async (client: string, start: number) =>
			id(
				await mut("apiVisits:create", {
					column: { kind: "practitioner", id: ids.p1 },
					client,
					start,
					end: start + HOUR,
					sessionType: "ABA",
				}),
			);
		await visit(ids["Test Ana Pop"] ?? "", visitAt);
		await visit(ids["Test Radu Pop"] ?? "", visitAt + 2 * DAY);
		const absent = await visit(ids["Test Bogdan Ionescu"] ?? "", visitAt + 4 * DAY);
		await mut("apiVisits:setAttendance", {
			visit: absent,
			attendance: "absent",
		});
		await mut("apiBlacklist:create", {
			entry: {
				client: ids["Test Ștefan Marin"],
				reason: "test",
				category: "other",
				severity: "warn",
			},
		});
		await mut("apiMoney:createPackage", {
			client: ids["Test Bogdan Ionescu"],
			sessionType: "ABA",
			totalSessions: 4,
			bonusSessions: 0,
			priceMinor: 1000,
		});
	});
	afterAll(async () => {
		if (!backendReady) return;
		for (const tenant of [TENANT, OTHER])
			await runMutation("seed:dropFixture", { tenant }, z.unknown());
	});

	it("orders by the folded name (Ș among the S, case ignored) and counts the current clients only", async () => {
		const out = await page({});
		expect(out.total).toBe(6);
		expect(names(out)).toEqual([
			"Test ana Lazăr",
			"Test Ana Pop",
			"Test Bogdan Ionescu",
			"Test Radu Pop",
			"Test Șerban Pop",
			"Test Ștefan Marin",
		]);
		expect((await page({ sort: "-name" })).clients.map((c) => c.client.name)[0]).toBe(
			"Test Ștefan Marin",
		);
	});

	it("cuts pages: one per page, an exact multiple, a last partial page, and past the end shows the last", async () => {
		const ones = await Promise.all([0, 1, 5].map((offset) => page({ size: 1, offset })));
		expect(ones.map((p) => p.clients.length)).toEqual([1, 1, 1]);
		expect(ones.map((p) => p.total)).toEqual([6, 6, 6]);
		const third = await page({ size: 3, offset: 3 });
		expect([third.clients.length, third.offset]).toEqual([3, 3]);
		const partial = await page({ size: 4, offset: 4 });
		expect([partial.clients.length, partial.offset]).toEqual([2, 4]);
		const past = await page({ size: 4, offset: 40 });
		expect([partial.clients.map((c) => c.client.id), past.offset]).toEqual([
			past.clients.map((c) => c.client.id),
			4,
		]);
		const unaligned = await page({ size: 4, offset: 5 });
		expect(unaligned.offset).toBe(4);
	});

	it("answers an empty list as zero rows, total 0, offset 0", async () => {
		const out = await page({ q: "nobody-is-called-this" });
		expect([out.clients, out.total, out.offset]).toEqual([[], 0, 0]);
	});

	it("searches every word, without diacritics or case", async () => {
		expect(names(await page({ q: "stefan" }))).toEqual(["Test Ștefan Marin"]);
		expect(names(await page({ q: "ANA" }))).toEqual(["Test ana Lazăr", "Test Ana Pop"]);
		expect(names(await page({ q: "pop ana" }))).toEqual(["Test Ana Pop"]);
	});

	it("filters by practitioner, by blacklist, by nobody treating, by package, and reads the archive apart", async () => {
		expect(names(await page({ practitioners: [ids.p2] }))).toEqual(["Test Bogdan Ionescu"]);
		expect((await page({ practitioners: [ids.p1] })).total).toBe(3);
		expect(names(await page({ flag: "listed" }))).toEqual(["Test Ștefan Marin"]);
		expect(names(await page({ flag: "unassigned" }))).toEqual([
			"Test ana Lazăr",
			"Test Ștefan Marin",
		]);
		expect(names(await page({ packages: "with" }))).toEqual(["Test Bogdan Ionescu"]);
		expect((await page({ packages: "without" })).total).toBe(5);
		expect(names(await page({ standing: "archived" }))).toEqual(["Test Zoe Ene"]);
		expect((await page({ standing: "archived", practitioners: [ids.p1] })).total).toBe(0);
	});

	it("combines the search, a filter and an order, the total counting the combination", async () => {
		const out = await page({
			q: "pop",
			practitioners: [ids.p1],
			sort: "-name",
			size: 2,
		});
		expect(out.total).toBe(3);
		expect(names(out)).toEqual(["Test Șerban Pop", "Test Radu Pop"]);
	});

	it("orders by the latest visit that counts, those who never came last, and answers it per row", async () => {
		const out = await page({ sort: "-last" });
		expect(names(out).slice(0, 2)).toEqual(["Test Radu Pop", "Test Ana Pop"]);
		expect(out.clients[0]?.lastVisit).toBe(visitAt + 2 * DAY);
		expect(out.clients.at(-1)?.lastVisit).toBeNull();
		const asc = await page({ sort: "last" });
		expect(names(asc).slice(0, 2)).toEqual(["Test Ana Pop", "Test Radu Pop"]);
	});

	it("orders by creation, newest first", async () => {
		expect(names(await page({ sort: "-created" }))[0]).toBe("Test Radu Pop");
		expect(names(await page({ sort: "created" }))[0]).toBe("Test Ana Pop");
	});

	it("narrows to the reach: the rows AND the total are the reach's", async () => {
		const within = [ids["Test Ana Pop"], ids["Test Zoe Ene"], ids["Test Radu Pop"], "not-an-id"];
		const out = await page({ within });
		expect([names(out), out.total]).toEqual([["Test Ana Pop", "Test Radu Pop"], 2]);
		const empty = await page({ within: [] });
		expect([empty.clients, empty.total]).toEqual([[], 0]);
		const filtered = await page({ within, practitioners: [ids.p2] });
		expect(filtered.total).toBe(0);
	});

	it("never answers another app's clients", async () => {
		const out = Page.parse(await callQuery("apiClientPage:page", { tenant: OTHER, ...ask({}) }));
		expect(out.total).toBe(0);
		const foreign = Page.parse(
			await callQuery("apiClientPage:page", {
				tenant: OTHER,
				...ask({ within: [ids["Test Ana Pop"]] }),
			}),
		);
		expect(foreign.total).toBe(0);
	});

	it("refuses a page size of 0 or over 500, and a negative offset (`invalid`), writing nothing", async () => {
		for (const bad of [{ size: 0 }, { size: 501 }, { offset: -1 }]) {
			const out = await qry("apiClientPage:page", ask(bad), {
				ok: false,
				same: true,
			});
			expect(out.reason).toBe("invalid");
		}
		expect((await page({ size: 500 })).total).toBe(6);
	});
});
