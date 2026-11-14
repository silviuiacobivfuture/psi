import type { VisitorAssistantPort, VisitorStoreRead, VisitorUsageRecord } from "@psi/engine";
import { z } from "zod";

/**
 * How long one read of the organisation's settings and meters is kept before the service is asked again. A turn's own
 * use empties it, so the next turn of this instance sees the meters it just moved; another instance's turns show up
 * within it.
 */
export const VISITOR_CONFIG_TTL_MS = 10_000;

/**
 * Where a site reads what governs its visitor assistant and reports what a turn used: the scheduling service's
 * `visitor.assistant` routes with the site's service key (`@psi/ui`'s `createSiteAssistant`). `read` answers the
 * settings the service merged and the meters, or undefined when the service has no such app.
 */
export interface VisitorAssistantSource {
	read(
		tenant: string,
	): Promise<{ settings: unknown; usage: VisitorStoreRead["usage"] } | undefined>;
	record(tenant: string, usage: VisitorUsageRecord): Promise<void>;
}

/** The part of the settings the booking page reads; the rest is the engine's to parse. */
const BookingPart = z.object({ booking: z.object({ offerCallback: z.boolean() }) });

/** The engine's port to the organisation's visitor assistant settings and meters, kept `ttlMs` between reads. */
export function visitorAssistantPort(
	source: VisitorAssistantSource,
	ttlMs: number = VISITOR_CONFIG_TTL_MS,
	now: () => number = Date.now,
): VisitorAssistantPort & {
	/** Whether the organisation lets the site offer a call back (`booking.offerCallback`); yes when it cannot say. */
	callbackOffered(tenant: string): Promise<boolean>;
} {
	const held = new Map<string, { at: number; read: VisitorStoreRead | undefined }>();
	async function read(tenant: string): Promise<VisitorStoreRead | undefined> {
		const hit = held.get(tenant);
		if (hit !== undefined && now() - hit.at < ttlMs) return hit.read;
		const found = await source.read(tenant);
		const got = found === undefined ? undefined : { settings: found.settings, usage: found.usage };
		held.set(tenant, { at: now(), read: got });
		return got;
	}
	return {
		read,
		async record(tenant, usage) {
			held.delete(tenant);
			await source.record(tenant, usage);
		},
		async callbackOffered(tenant) {
			try {
				const part = BookingPart.safeParse((await read(tenant))?.settings);
				return !part.success || part.data.booking.offerCallback;
			} catch {
				return true;
			}
		},
	};
}
