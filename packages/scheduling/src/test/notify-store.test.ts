import { describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady } from "./admin";
import { callMutation, callQuery } from "./server";

/**
 * The durable notify outbox and the used-links record, against the local backend. Every function is refused without the
 * key and then writes nothing; with it, the outbox hands jobs out oldest first, and exactly one of many concurrent claims
 * of a link wins.
 */
if (!backendReady) console.warn("notify-store.test: no local backend; see README");

const WRONG = "x".repeat(40);
const run = Date.now().toString(36);
const job = (n: number, dueAt: number) => ({
	id: `job-${run}-${n}`,
	idempotencyKey: `idem-${run}-${n}`,
	app: "psizone",
	event: "request.new",
	bodyJson: JSON.stringify({ workflow: "w", to: { topicKey: "t" }, payload: { n } }),
	attempts: 0,
	replays: 0,
	dueAt,
});
const Out = z.record(z.string(), z.unknown());
const Jobs = z.object({
	jobs: z.array(z.object({ id: z.string(), dueAt: z.number(), attempts: z.number() })),
});
const size = async (): Promise<number> =>
	z.object({ size: z.number() }).parse(await callQuery("notifyStore:outboxSize", {})).size;
const links = async (): Promise<number> =>
	z.object({ count: z.number() }).parse(await callQuery("notifyStore:linkCount", {})).count;
const mine = async (now: number) =>
	Jobs.parse(await callQuery("notifyStore:outboxDue", { now, limit: 200 })).jobs.filter((j) =>
		j.id.startsWith(`job-${run}-`),
	);

describe.skipIf(!backendReady)("the durable notify stores", () => {
	it("refuses every function without the key, and writes nothing", async () => {
		const before = [await size(), await links()];
		const calls: [string, Record<string, unknown>, "q" | "m"][] = [
			["outboxAdd", { job: job(0, 1) }, "m"],
			["outboxReschedule", { id: "a", attempts: 1, dueAt: 1, replays: 0 }, "m"],
			["outboxRemove", { id: "a" }, "m"],
			["linkClaim", { jti: `jti-${run}-x`, expiresAt: 9, now: 1 }, "m"],
			["linkRelease", { jti: "a" }, "m"],
			["outboxDue", { now: 1, limit: 1 }, "q"],
			["outboxSize", {}, "q"],
			["linkCount", {}, "q"],
		];
		for (const [name, args, kind] of calls)
			for (const key of [null, WRONG]) {
				const call = kind === "m" ? callMutation : callQuery;
				await expect(call(`notifyStore:${name}`, args, key), `${name} ${key}`).rejects.toThrow();
			}
		expect([await size(), await links()]).toEqual(before);
	});

	it("hands jobs out oldest first, only the due ones, and adding the same id twice keeps one", async () => {
		const base = Date.now() - 10_000;
		for (const [n, at] of [
			[1, base + 30],
			[2, base + 10],
			[3, base + 20],
			[4, Date.now() + 3_600_000],
		] as const)
			expect(
				Out.parse(await callMutation("notifyStore:outboxAdd", { job: job(n, at) })).added,
			).toBe(true);
		expect(
			Out.parse(await callMutation("notifyStore:outboxAdd", { job: job(1, base) })).added,
		).toBe(false);
		const due = await mine(Date.now());
		expect(due.map((j) => j.id)).toEqual([2, 3, 1].map((n) => `job-${run}-${n}`));
		expect(due[2]?.dueAt).toBe(base + 30);
	});

	it("reschedules (attempts, due time) and removes; rescheduling a job that is gone is refused", async () => {
		const id = `job-${run}-2`;
		const later = Date.now() + 60_000;
		await callMutation("notifyStore:outboxReschedule", {
			id,
			attempts: 3,
			dueAt: later,
			replays: 1,
		});
		expect((await mine(Date.now())).map((j) => j.id)).not.toContain(id);
		const all = await mine(later + 1);
		expect(all.find((j) => j.id === id)).toMatchObject({ attempts: 3, dueAt: later });
		await callMutation("notifyStore:outboxRemove", { id });
		expect((await mine(later + 1)).map((j) => j.id)).not.toContain(id);
		expect(
			Out.parse(
				await callMutation("notifyStore:outboxReschedule", {
					id,
					attempts: 1,
					dueAt: 1,
					replays: 0,
				}),
			),
		).toEqual({
			ok: false,
			reason: "not_found",
		});
		for (const n of [1, 3, 4])
			await callMutation("notifyStore:outboxRemove", { id: `job-${run}-${n}` });
		expect(await mine(Date.now() + 10_000_000)).toEqual([]);
	});

	it("of 25 concurrent claims of one link exactly one wins; a release lets it be claimed again", async () => {
		const jti = `jti-${run}-race`;
		const now = Date.now();
		const outcomes = await Promise.all(
			Array.from({ length: 25 }, () =>
				callMutation("notifyStore:linkClaim", { jti, expiresAt: now + 60_000, now }),
			),
		);
		expect(outcomes.map((o) => Out.parse(o).claimed).filter((c) => c === true)).toHaveLength(1);
		expect(
			Out.parse(await callMutation("notifyStore:linkClaim", { jti, expiresAt: now + 60_000, now }))
				.claimed,
		).toBe(false);
		await callMutation("notifyStore:linkRelease", { jti });
		expect(
			Out.parse(await callMutation("notifyStore:linkClaim", { jti, expiresAt: now + 60_000, now }))
				.claimed,
		).toBe(true);
		await callMutation("notifyStore:linkRelease", { jti });
	});

	it("drops links that have expired when the next one is claimed, and keeps live ones", async () => {
		const now = Date.now();
		const [old, live, next] = [`jti-${run}-old`, `jti-${run}-live`, `jti-${run}-next`];
		await callMutation("notifyStore:linkClaim", { jti: old, expiresAt: now + 1, now });
		await callMutation("notifyStore:linkClaim", { jti: live, expiresAt: now + 600_000, now });
		// time passes: the old link has expired, so its record is purged and it can be claimed again (it is dead by its token anyway)
		await callMutation("notifyStore:linkClaim", {
			jti: next,
			expiresAt: now + 700_000,
			now: now + 1_000,
		});
		expect(
			Out.parse(
				await callMutation("notifyStore:linkClaim", {
					jti: old,
					expiresAt: now + 5_000,
					now: now + 1_000,
				}),
			).claimed,
		).toBe(true);
		expect(
			Out.parse(
				await callMutation("notifyStore:linkClaim", {
					jti: live,
					expiresAt: now + 600_000,
					now: now + 1_000,
				}),
			).claimed,
		).toBe(false);
		for (const j of [old, live, next]) await callMutation("notifyStore:linkRelease", { jti: j });
	});
});
