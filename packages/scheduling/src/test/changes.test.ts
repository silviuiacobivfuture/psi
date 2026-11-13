import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, dumpTable, runMutation } from "./admin";
import { callQuery, serverKey, subscribe } from "./server";

/**
 * The live change feed against the local backend: entries appended by every clinic mutation with no
 * content, read by cursor and by kind, refused without the server key, pushed to a subscriber, and
 * kept 7 days. Synthetic data, in a throwaway `test-feed-…` app.
 */
if (!backendReady) console.warn("changes.test: no local backend; see README");

const TENANT = `test-feed-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const feed = z.object({
	changes: z.array(
		z.object({ kind: z.string(), entityId: z.string(), at: z.number(), version: z.number() }),
	),
	cursor: z.number(),
	hasMore: z.boolean(),
});
const since = async (cursor: number, extra: Record<string, unknown> = {}) =>
	feed.parse(await callQuery("changes:since", { tenant: TENANT, cursor, ...extra }));
const created = z.object({ id: z.string().optional(), ok: z.boolean() });

describe.skipIf(!backendReady)("the live change feed", () => {
	const ids: Record<string, string> = {};
	const upsert = (fn: string, rows: Array<Record<string, unknown>>) =>
		runMutation(
			fn,
			{ tenant: TENANT, rows },
			z.array(z.object({ id: z.string().optional(), outcome: z.string() })),
		);

	beforeAll(async () => {
		if (!backendReady) return;
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
		const [p] = await upsert("importPeople:upsertPractitioners", [
			{
				legacyId: "therapists:1",
				fingerprint: "p",
				slug: "t-one",
				displayName: "Test Therapist",
				active: true,
			},
		]);
		ids.p = p?.id ?? "";
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("is refused without the server key, or with a wrong one", async () => {
		await expect(callQuery("changes:since", { tenant: TENANT, cursor: 0 }, null)).rejects.toThrow();
		await expect(
			callQuery("changes:since", { tenant: TENANT, cursor: 0 }, "x".repeat(40)),
		).rejects.toThrow();
		expect(serverKey.length).toBeGreaterThan(30);
	});

	it("records what a mutation changed, by kind, entity and version, and nothing more", async () => {
		const start = (await since(0)).cursor;
		const [c] = await upsert("importClients:upsertClients", [
			{
				legacyId: "clients:1",
				fingerprint: "c1",
				name: "Test Client A",
				kind: "adult",
				phone: "0700 000 001",
				consent: { contact: true, reminders: false },
				status: "active",
				createdAt: 1,
			},
		]);
		ids.c = c?.id ?? "";
		const made = await runMutation(
			"clinicVisits:create",
			{
				tenant: TENANT,
				practitioner: ids.p,
				client: ids.c,
				start: Date.now() + 9 * DAY,
				end: Date.now() + 9 * DAY + 3_600_000,
				sessionType: "SENTINEL-TYPE",
				actor: "sub-test",
			},
			created,
		);
		expect(made.ok).toBe(true);
		await runMutation(
			"clinicStanding:change",
			{ tenant: TENANT, client: ids.c, action: "archive", actor: "sub-test" },
			z.unknown(),
		);
		const page = await since(start);
		expect(page.changes.map((x) => [x.kind, x.version])).toEqual([
			["client", 1],
			["visit", 1],
			["client", 1 + 1],
		]);
		expect(page.changes[1]?.entityId).toBe(made.id);
		// A re-import of the same row appends nothing.
		await upsert("importClients:upsertClients", [
			{
				legacyId: "clients:1",
				fingerprint: "c1",
				name: "Test Client A",
				kind: "adult",
				phone: "0700 000 001",
				consent: { contact: true, reminders: false },
				status: "active",
				createdAt: 1,
			},
		]);
		expect((await since(page.cursor)).changes).toEqual([]);
		// Content never reaches the log.
		const dump = dumpTable("changeLog");
		for (const secret of ["Test Client", "0700 000", "SENTINEL-TYPE"])
			expect(dump).not.toContain(secret);
	});

	it("pages by cursor without gaps or repeats, and narrows by kind", async () => {
		const all = await since(0);
		const seen: string[] = [];
		let cursor = 0;
		for (let i = 0; i < 20; i += 1) {
			const page = await since(cursor, { limit: 2 });
			seen.push(...page.changes.map((x) => `${x.kind}:${x.entityId}:${x.version}`));
			cursor = page.cursor;
			if (!page.hasMore) break;
		}
		expect(seen).toEqual(all.changes.map((x) => `${x.kind}:${x.entityId}:${x.version}`));
		expect(seen.length).toBeGreaterThan(3);
		const visits = await since(0, { kinds: ["visit"] });
		expect(visits.changes.every((x) => x.kind === "visit")).toBe(true);
		expect(visits.changes).toHaveLength(1);
		expect((await since(0, { kinds: ["role"] })).changes).toEqual([]);
		expect((await since(all.cursor)).changes).toEqual([]);
	});

	it("is per app: another app's changes are never seen", async () => {
		const other = feed.parse(
			await callQuery("changes:since", { tenant: `${TENANT}-other`, cursor: 0 }),
		);
		expect(other.changes).toEqual([]);
	});

	it("pushes a new entry to a subscriber (ConvexClient.onUpdate)", async () => {
		const cursor = (await since(0)).cursor;
		const received: Array<z.infer<typeof feed>> = [];
		const sub = subscribe("changes:since", { tenant: TENANT, cursor }, (value) =>
			received.push(feed.parse(value)),
		);
		await new Promise((r) => setTimeout(r, 500));
		await runMutation(
			"clinicStanding:change",
			{ tenant: TENANT, client: ids.c, action: "unarchive", actor: "sub-test" },
			z.unknown(),
		);
		for (let i = 0; i < 40 && !received.some((r) => r.changes.length > 0); i += 1)
			await new Promise((r) => setTimeout(r, 100));
		await sub.close();
		expect(received[0]?.changes).toEqual([]);
		expect(received.find((r) => r.changes.length > 0)?.changes.map((x) => x.kind)).toEqual([
			"client",
		]);
	});

	it("keeps the log 7 days: a purge a week on removes this app's entries and only its", async () => {
		const before = await since(0);
		expect(before.changes.length).toBeGreaterThan(0);
		const early = await runMutation(
			"changes:purgePage",
			{ now: Date.now() + 6 * DAY, tenant: TENANT },
			z.object({ deleted: z.number() }),
		);
		expect(early.deleted).toBe(0);
		const late = await runMutation(
			"changes:purgePage",
			{ now: Date.now() + 8 * DAY, tenant: TENANT },
			z.object({ deleted: z.number(), more: z.boolean() }),
		);
		expect(late).toEqual({ deleted: before.changes.length, more: false });
		expect((await since(0)).changes).toEqual([]);
	});
});
