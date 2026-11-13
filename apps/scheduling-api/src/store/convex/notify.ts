import type { Outbox } from "@psi/notify";
import type { createMemoryUsedLinks } from "@psi/notify/reminders";
import { z } from "zod";
import { StoreRefused } from "../types";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * The notification layer's durable halves on Convex (`notifyStore`): triggers waiting for Novu, and the reminder links
 * already used. The ports are `@psi/notify`'s; the rows hold the trigger as JSON text, parsed again here, so a row that
 * is not a trigger is dropped from the queue rather than sent.
 */
type Job = Awaited<ReturnType<Outbox["due"]>>[number];
type UsedLinks = ReturnType<typeof createMemoryUsedLinks>;

const Subscriber = z.object({
	subscriberId: z.string(),
	email: z.string().optional(),
	phone: z.string().optional(),
	firstName: z.string().optional(),
	lastName: z.string().optional(),
	locale: z.string().optional(),
	data: z.record(z.string(), z.string()).optional(),
});
const TriggerBody = z.object({
	workflow: z.string(),
	to: z.union([
		z.object({ subscriberId: z.string(), fields: Subscriber.optional() }),
		z.object({ topicKey: z.string() }),
	]),
	payload: z.record(z.string(), z.unknown()),
	overrides: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

const Row = z.object({
	id: z.string(),
	idempotencyKey: z.string(),
	app: z.string(),
	event: z.string(),
	bodyJson: z.string(),
	attempts: z.number(),
	replays: z.number(),
	dueAt: z.number(),
});
const Due = answer({ jobs: z.array(Row) });
const Added = answer({ added: z.boolean() });
const Plain = answer({});
const Size = answer({ size: z.number() });
const Claimed = answer({ claimed: z.boolean() });

function parseJob(row: z.infer<typeof Row>): Job | undefined {
	let json: unknown;
	try {
		json = JSON.parse(row.bodyJson);
	} catch {
		return undefined;
	}
	const body = TriggerBody.safeParse(json);
	if (!body.success) return undefined;
	const { bodyJson: _text, ...rest } = row;
	return { ...rest, body: body.data } as Job;
}

export function createConvexOutbox(rpc: Rpc): Outbox {
	return {
		async add(job) {
			unwrap(
				await rpc.mutation(
					"notifyStore:outboxAdd",
					{
						job: {
							id: job.id,
							idempotencyKey: job.idempotencyKey,
							app: job.app,
							event: job.event,
							bodyJson: JSON.stringify(job.body),
							attempts: job.attempts,
							replays: job.replays,
							dueAt: job.dueAt,
						},
					},
					Added,
				),
			);
		},
		async due(now, limit) {
			const out = unwrap(await rpc.query("notifyStore:outboxDue", { now, limit }, Due));
			return out.jobs.flatMap((row) => {
				const job = parseJob(row);
				return job === undefined ? [] : [job];
			});
		},
		async reschedule(id, attempts, dueAt, replays) {
			const out = await rpc.mutation(
				"notifyStore:outboxReschedule",
				{ id, attempts, dueAt, replays },
				Plain,
			);
			// A job that is gone (sent by another replica meanwhile) needs no reschedule.
			if (!out.ok && out.reason !== "not_found") throw new StoreRefused(out.reason);
		},
		async remove(id) {
			unwrap(await rpc.mutation("notifyStore:outboxRemove", { id }, Plain));
		},
		async size() {
			return unwrap(await rpc.query("notifyStore:outboxSize", {}, Size)).size;
		},
	};
}

export function createConvexUsedLinks(rpc: Rpc, now: () => number = Date.now): UsedLinks {
	return {
		async claim(id, expiresAt) {
			const out = unwrap(
				await rpc.mutation("notifyStore:linkClaim", { jti: id, expiresAt, now: now() }, Claimed),
			);
			return out.claimed;
		},
		async release(id) {
			unwrap(await rpc.mutation("notifyStore:linkRelease", { jti: id }, Plain));
		},
	};
}
