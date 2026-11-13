import type { Outbox } from "@psi/notify";
import { describe, expect, it } from "vitest";
import type { ContractSection } from "./env";

type Job = Parameters<Outbox["add"]>[0];

/** The notification layer's durable halves: the outbox of triggers and the record of used reminder links. */
export const notifyContract: ContractSection = (env) => {
	let n = 0;
	const tag = Date.now().toString(36);
	const job = (dueAt: number, extra: Partial<Job> = {}): Job => {
		n += 1;
		return {
			id: `job-${tag}-${n}`,
			idempotencyKey: `idem-${tag}-${n}`,
			app: "psizone",
			event: "request.new",
			body: {
				workflow: "request-new",
				to: { topicKey: "psizone:team" },
				payload: { requestId: `r${n}` },
			},
			attempts: 0,
			replays: 0,
			dueAt,
			...extra,
		};
	};
	const mine = async (now: number, ids: readonly string[]) =>
		(await env().notify.outbox.due(now, 200)).filter((j) => ids.includes(j.id));

	describe("notify outbox", () => {
		it("hands out due jobs oldest first, with their body intact, and keeps the future ones back", async () => {
			const { outbox } = env().notify;
			const base = Date.now() - 100_000;
			const [a, b, c, future] = [
				job(base + 30),
				job(base + 10),
				job(base + 20),
				job(Date.now() + 3_600_000),
			];
			for (const j of [a, b, c, future]) await outbox.add(j);
			const due = await mine(Date.now(), [a.id, b.id, c.id, future.id]);
			expect(due.map((j) => j.id)).toEqual([b.id, c.id, a.id]);
			expect(due[0]).toMatchObject({
				idempotencyKey: b.idempotencyKey,
				app: "psizone",
				event: "request.new",
				attempts: 0,
				replays: 0,
				body: b.body,
			});
			for (const j of [a, b, c, future]) await outbox.remove(j.id);
		});

		it("adding the same id twice keeps the first", async () => {
			const { outbox } = env().notify;
			const first = job(Date.now() - 1000);
			await outbox.add(first);
			await outbox.add({ ...first, attempts: 9, idempotencyKey: "other" });
			const [held] = await mine(Date.now(), [first.id]);
			expect(held).toMatchObject({ attempts: 0, idempotencyKey: first.idempotencyKey });
			await outbox.remove(first.id);
		});

		it("reschedules, so the job is not due until its new time, and removes; size follows", async () => {
			const { outbox } = env().notify;
			const before = await outbox.size();
			const j = job(Date.now() - 1000);
			await outbox.add(j);
			expect(await outbox.size()).toBe(before + 1);
			const later = Date.now() + 60_000;
			await outbox.reschedule(j.id, 3, later, 2);
			expect(await mine(Date.now(), [j.id])).toEqual([]);
			expect((await mine(later + 1, [j.id]))[0]).toMatchObject({
				attempts: 3,
				replays: 2,
				dueAt: later,
			});
			await outbox.remove(j.id);
			expect(await outbox.size()).toBe(before);
			// both are no-ops for a job that is gone
			await outbox.remove(j.id);
			await outbox.reschedule(j.id, 1, later, 0);
			expect(await mine(later + 1, [j.id])).toEqual([]);
		});
	});

	describe("used reminder links", () => {
		it("of many concurrent claims of one link exactly one wins", async () => {
			const { used } = env().notify;
			const id = `jti-${tag}-race`;
			const results = await Promise.all(
				Array.from({ length: 20 }, () => used.claim(id, Date.now() + 60_000)),
			);
			expect(results.filter(Boolean)).toHaveLength(1);
			await used.release(id);
		});

		it("a released link can be used again; another link is independent", async () => {
			const { used } = env().notify;
			const [a, b] = [`jti-${tag}-a`, `jti-${tag}-b`];
			expect(await used.claim(a, Date.now() + 60_000)).toBe(true);
			expect(await used.claim(a, Date.now() + 60_000)).toBe(false);
			expect(await used.claim(b, Date.now() + 60_000)).toBe(true);
			await used.release(a);
			expect(await used.claim(a, Date.now() + 60_000)).toBe(true);
			await used.release(a);
			await used.release(b);
		});
	});
};
