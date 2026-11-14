import { createHash } from "node:crypto";
import { APP_KEYS, CHANNELS, type DeliveryEvent, type DeliverySink, EVENT_IDS } from "@psi/notify";
import { z } from "zod";
import type { KeyedPort } from "../store/ports";
import { StoreRefused } from "../store/types";
import { json } from "./records";

/**
 * The delivery log: one entry per STEP of a notification's life (`queued`, `retrying`, `sent`, `given_up`,
 * `suppressed`), keyed `<UTC day>/<hash of the delivery's key>/<status>-<attempts>`. An entry holds ids, a short hash of
 * the recipient and the outcome: never an address, a name, a payload or a reason a person gave. A repeat of the same step
 * (a replayed trigger) finds its entry there and writes nothing.
 */
const Channels = z.object({ in_app: z.boolean(), push: z.boolean(), email: z.boolean() });
const Why = z.enum([
	"preference",
	"quiet-hours",
	"no-address",
	"event-off",
	"receipts-off",
	"no-channel",
	"no-recipient",
]);
export const DeliveryStep = z.object({
	app: z.enum(APP_KEYS),
	event: z.enum(EVENT_IDS),
	audience: z.string().min(1).max(40),
	key: z.string().min(1).max(200),
	to: z.string().min(1).max(40),
	ref: z.string().min(1).max(120).optional(),
	status: z.enum(["queued", "retrying", "sent", "given_up", "suppressed"]),
	channels: Channels,
	suppressed: z.record(z.enum(CHANNELS), Why),
	why: Why.optional(),
	attempts: z.number().int().min(0).max(1000),
	httpStatus: z.number().int().min(0).max(999).optional(),
	at: z.number(),
});
export type DeliveryStep = z.infer<typeof DeliveryStep>;

const day = (at: number): string => new Date(at).toISOString().slice(0, 10);
const hash = (key: string): string => createHash("sha256").update(key).digest("hex").slice(0, 12);
const entryKey = (step: Pick<DeliveryStep, "at" | "key" | "status" | "attempts">): string =>
	`${day(step.at)}/${hash(step.key)}/${step.status}-${step.attempts}`;

export interface DeliveryLogOptions {
	keyed: KeyedPort;
	/** Called after a step that ended a delivery badly (`given_up`), so the people who run the account can be told. */
	onGivenUp?: (step: DeliveryStep) => Promise<void>;
}

/** Where `@psi/notify` records each step. A failure to write is the notifier's to swallow; this never throws on a repeat. */
export function createDeliveryLog(options: DeliveryLogOptions): DeliverySink {
	return {
		async record(event: DeliveryEvent) {
			const step = DeliveryStep.parse({ ...event, suppressed: event.suppressed });
			try {
				await options.keyed.put(step.app, "delivery", entryKey(step), 0, JSON.stringify(step));
			} catch (error) {
				// The same step again (a replay): already written.
				if (error instanceof StoreRefused && error.reason === "stale") return;
				throw error;
			}
			if (step.status === "given_up") await options.onGivenUp?.(step);
		},
	};
}

/** The steps logged on one UTC day, oldest first; optionally only one status. */
export async function listDeliveries(
	keyed: KeyedPort,
	app: string,
	onDay: string,
	status?: DeliveryStep["status"],
): Promise<DeliveryStep[]> {
	const entries = await keyed.list(app, "delivery", { prefix: `${onDay}/`, limit: 1000 });
	return entries
		.flatMap((e) => {
			const parsed = DeliveryStep.safeParse(json(e.body));
			return parsed.success && (status === undefined || parsed.data.status === status)
				? [parsed.data]
				: [];
		})
		.sort((a, b) => a.at - b.at);
}

/** Drops the log of days before `keepFrom` (a UTC day): the log is for following up, not for keeping. */
export async function purgeDeliveries(
	keyed: KeyedPort,
	app: string,
	keepFrom: string,
): Promise<number> {
	let removed = 0;
	for (;;) {
		const entries = await keyed.list(app, "delivery", { limit: 1000 });
		const old = entries.filter((e) => e.key.slice(0, 10) < keepFrom);
		for (const e of old) if (await keyed.remove(app, "delivery", e.key)) removed++;
		if (old.length === 0 || entries.length < 1000) return removed;
	}
}
