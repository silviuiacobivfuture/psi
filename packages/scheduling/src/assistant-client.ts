import { z } from "zod";
import { api } from "../convex/_generated/api";
import type { SchedulingConfig } from "./config";
import { createTransport, type Transport } from "./transport";

const Count = z.number().int().min(0);

/** One meter of the assistant (the visitor surface's, for an app's month or day). */
export const VisitorMeterSchema = z.object({
	messages: Count,
	inputTokens: Count,
	outputTokens: Count,
	cachedTokens: Count,
	costMicroUsd: Count,
	limitHits: Count,
});
export type VisitorMeter = z.infer<typeof VisitorMeterSchema>;

const StoredDoc = z.object({ revision: z.number().int().min(0), body: z.string() }).nullable();
const Period = z.object({
	month: z.string().regex(/^\d{4}-\d{2}$/),
	day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const Refused = z.object({ ok: z.literal(false), reason: z.string() });

const RawConfig = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		timeZone: z.string().min(1),
		period: Period,
		platform: StoredDoc,
		org: StoredDoc,
		usage: z.object({ month: VisitorMeterSchema, day: VisitorMeterSchema }),
	}),
	Refused,
]);
const RawAdded = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), period: Period }),
	Refused,
]);

/**
 * What the store holds for an app's visitor assistant: the estate's and the app's documents as stored (JSON text; the
 * caller parses and merges them with the contract's own merge) and the app's visitor meters for this month and today.
 */
export interface VisitorAssistantRead {
	timeZone: string;
	period: { month: string; day: string };
	platform: { revision: number; body: string } | undefined;
	org: { revision: number; body: string } | undefined;
	usage: { month: VisitorMeter; day: VisitorMeter };
}

/** A public site's reads and writes of its assistant's configuration and meters, with the server key. */
export interface VisitorAssistantStore {
	/** Undefined when the app is not there or is switched off. */
	config(tenant: string, now?: number): Promise<VisitorAssistantRead | undefined>;
	/** Adds one turn's use (a refused turn: `limitHits` 1, nothing else) to the month's and the day's meters. */
	record(
		tenant: string,
		delta: VisitorMeter,
		now?: number,
	): Promise<"ok" | "not_found" | "invalid">;
}

export function visitorAssistantOn(transport: Transport): VisitorAssistantStore {
	const key = transport.serverKey;
	return {
		async config(tenant, now = Date.now()) {
			const raw = await transport.call(RawConfig, (c) =>
				c.query(api.apiAssistant.visitorConfig, { key, tenant, now }),
			);
			if (!raw.ok) return undefined;
			return {
				timeZone: raw.timeZone,
				period: raw.period,
				platform: raw.platform ?? undefined,
				org: raw.org ?? undefined,
				usage: raw.usage,
			};
		},
		async record(tenant, delta, now = Date.now()) {
			const parsed = VisitorMeterSchema.safeParse(delta);
			if (!parsed.success) return "invalid";
			const raw = await transport.call(RawAdded, (c) =>
				c.mutation(api.apiAssistant.addVisitorUsage, { key, tenant, now, delta: parsed.data }),
			);
			if (raw.ok) return "ok";
			return raw.reason === "not_found" ? "not_found" : "invalid";
		},
	};
}

/** The visitor assistant's store client, on its own connection. */
export function createVisitorAssistantStore(config: SchedulingConfig): VisitorAssistantStore {
	return visitorAssistantOn(createTransport(config));
}
