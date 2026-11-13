import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { DAY, HOUR, harness, id } from "./api-harness";
import { callQuery } from "./server";

/**
 * The additions the staff API needs on visits and money (apiMoneyExtra): each is refused without the key and then writes
 * NOTHING; with it a write appends exactly one audit event. Throwaway `test-money-…` app, synthetic data.
 */
if (!backendReady) console.warn("api-money-extra.test: no local backend; see README");

const { TENANT, mut, qry } = harness("money");
const META = { kind: "session", practitioner: "pAPI-PRACTITIONER", service: "svc-1" } as const;

describe.skipIf(!backendReady)("visit facts, package offers and the payments ledger", () => {
	const ids: Record<string, string> = {};
	const base = Date.UTC(2030, 5, 3, 8);

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
		ids.v1 = id(
			await mut("apiVisits:create", {
				column: { kind: "practitioner", id: ids.p1 },
				start: base,
				end: base + HOUR,
				client: ids.c1,
				sessionType: "session",
				priceMinor: 15000,
			}),
		);
		ids.pkg = id(
			await mut("apiMoney:createPackage", {
				client: ids.c1,
				sessionType: "ABA",
				totalSessions: 10,
				bonusSessions: 1,
				priceMinor: 120000,
			}),
		);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("keeps the API's facts about a visit, replaced as a whole, and says so in the audit", async () => {
		await mut("apiMoneyExtra:setVisitMeta", { visit: ids.v1, meta: META });
		await mut("apiMoneyExtra:setVisitMeta", { visit: "nope", meta: META }, { audit: 0, ok: false });
		await mut(
			"apiMoneyExtra:setVisitMeta",
			{ visit: ids.v1, meta: { ...META, practitioner: " " } },
			{ audit: 0, ok: false },
		);
		const got = await qry("apiVisits:get", { visit: ids.v1 });
		expect(got.visit).toMatchObject({ meta: META });
	});

	it("searches visits without a window cap, by what the API asks, soft-deleted ones marked", async () => {
		const wide = await qry("apiMoneyExtra:searchVisits", {});
		expect((wide.visits as { id: string }[]).map((v) => v.id)).toContain(ids.v1);
		const by = async (args: Record<string, unknown>) =>
			((await qry("apiMoneyExtra:searchVisits", args)).visits as { id: string }[]).length;
		expect(await by({ practitioner: META.practitioner })).toBe(1);
		expect(await by({ practitioner: "other" })).toBe(0);
		expect(await by({ service: "svc-1", client: ids.c1 })).toBe(1);
		expect(await by({ client: ids.c2 })).toBe(0);
		expect(await by({ from: base + DAY * 400 })).toBe(0);
		expect(await by({ reminded: true })).toBe(0);
		await mut("apiVisits:update", { visit: ids.v1, patch: { reminderSent: true } });
		expect(await by({ reminded: true })).toBe(1);
		await mut("apiVisits:remove", { visit: ids.v1, action: "delete" });
		const all = (await qry("apiMoneyExtra:searchVisits", {})).visits as {
			id: string;
			deletedAt?: number;
		}[];
		expect(all.find((v) => v.id === ids.v1)?.deletedAt).toBeTypeOf("number");
		expect(await by({ reminded: true })).toBe(0);
		await mut("apiVisits:remove", { visit: ids.v1, action: "restore" });
	});

	it("sets the offer on a package: bounded by the price, a repeat is no change", async () => {
		await mut("apiMoneyExtra:setPackageDiscount", { package: ids.pkg, discountMinor: 10000 });
		await mut(
			"apiMoneyExtra:setPackageDiscount",
			{ package: ids.pkg, discountMinor: 10000 },
			{ audit: 0 },
		);
		await mut(
			"apiMoneyExtra:setPackageDiscount",
			{ package: ids.pkg, discountMinor: 999999 },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiMoneyExtra:setPackageDiscount",
			{ package: ids.pkg, discountMinor: -1 },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiMoneyExtra:setPackageDiscount",
			{ package: "nope", discountMinor: 1 },
			{ audit: 0, ok: false },
		);
		const got = await qry("apiMoneyExtra:packageById", { package: ids.pkg });
		expect(got.package).toMatchObject({ discountMinor: 10000, priceMinor: 120000 });
		expect(
			await callQuery("apiMoneyExtra:packageById", { tenant: TENANT, package: "nope" }),
		).toMatchObject({
			ok: false,
		});
	});

	it("adds ledger lines with a note; one taken for a visit moves the visit's amount paid with it", async () => {
		ids.pay1 = id(
			await mut("apiMoneyExtra:addLedgerPayment", {
				client: ids.c1,
				package: ids.pkg,
				amountMinor: 50000,
				method: "cash",
				note: "first",
			}),
		);
		ids.pay2 = id(
			await mut("apiMoneyExtra:addLedgerPayment", {
				client: ids.c1,
				visit: ids.v1,
				amountMinor: 5000,
				method: "card",
			}),
		);
		const visit = (await qry("apiVisits:get", { visit: ids.v1 })).visit;
		expect(visit).toMatchObject({ amountPaidMinor: 5000, paymentMethod: "card" });
		const lines = async (args: Record<string, unknown>) =>
			(await qry("apiMoneyExtra:ledger", args)).lines as { id: string; note?: string }[];
		expect((await lines({ package: ids.pkg })).map((l) => l.id)).toEqual([ids.pay1]);
		expect((await lines({ package: ids.pkg }))[0]?.note).toBe("first");
		expect((await lines({ visit: ids.v1 })).map((l) => l.id)).toEqual([ids.pay2]);
		expect((await lines({ client: ids.c1 })).length).toBe(2);
		expect((await lines({ payment: ids.pay1 })).length).toBe(1);
		expect((await lines({ payment: "nope" })).length).toBe(0);
		expect(await lines({})).toHaveLength(2);
		expect((await qry("apiMoneyExtra:packages", {})).packages).toHaveLength(1);
		expect((await qry("apiMoneyExtra:packages", { client: ids.c2 })).packages).toHaveLength(0);
	});

	it("refuses a ledger line for something that is not the client's, or a zero amount, writing nothing", async () => {
		const bad = (args: Record<string, unknown>) =>
			mut(
				"apiMoneyExtra:addLedgerPayment",
				{ client: ids.c1, amountMinor: 100, ...args },
				{
					audit: 0,
					ok: false,
				},
			);
		await bad({ client: ids.c2, package: ids.pkg });
		await bad({ client: ids.c2, visit: ids.v1 });
		await bad({ client: "nope" });
		await bad({ package: "nope" });
		await bad({ visit: "nope" });
		await bad({ amountMinor: 0 });
		await bad({ amountMinor: 1.5 });
	});

	it("deletes a ledger line (audited), and the visit's amount paid follows; a missing one is refused", async () => {
		await mut("apiMoneyExtra:removeLedgerPayment", { payment: ids.pay2 });
		expect((await qry("apiVisits:get", { visit: ids.v1 })).visit).toMatchObject({
			amountPaidMinor: 0,
		});
		await mut("apiMoneyExtra:removeLedgerPayment", { payment: ids.pay2 }, { audit: 0, ok: false });
		await mut("apiMoneyExtra:removeLedgerPayment", { payment: ids.pay1 });
		expect(
			(((await qry("apiMoneyExtra:ledger", { package: ids.pkg })).lines as unknown[]) ?? []).length,
		).toBe(0);
	});

	it("a package with a payment line is kept; one without can go", async () => {
		await mut("apiMoneyExtra:addLedgerPayment", {
			client: ids.c1,
			package: ids.pkg,
			amountMinor: 100,
		});
		await mut("apiMoney:removePackage", { package: ids.pkg }, { audit: 0, ok: false });
	});
});
