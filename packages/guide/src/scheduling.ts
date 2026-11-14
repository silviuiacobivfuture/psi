import type { SchedulingPort, ServiceEntry, VisitorAssistantPort } from "@psi/engine";
import {
	createSchedulingClient,
	createVisitorAssistantStore,
	readSchedulingEnv,
	type SchedulingClient,
	type SchedulingEnvProblem,
} from "@psi/scheduling";
import { visitorAssistantPort } from "./visitor-assistant";

/** How long the services list is kept before the store is asked again. */
export const CATALOGUE_TTL_MS = 60_000;

/** psi's scheduling store as an app and the guide use it: one client, also the engine's port. */
export interface PsiScheduling {
	/** For the app's own routes: slots, holds, requests (the confirm step lives here). */
	client: SchedulingClient;
	/** For the engine's tools: find and cancel only (no method books). */
	port: SchedulingPort;
	/**
	 * The organisation's visitor assistant settings and meters (Setări → Asistent, the site's surface): the engine's
	 * `visitorAssistant`, so the store's limits, budget and model govern the brands that schedule.
	 */
	assistant: VisitorAssistantPort;
}

/**
 * The engine's port: only finding slots and cancelling with a code. The engine never holds the
 * client itself, so no path from a tool reaches `hold` or `submit` (the app's confirm step).
 */
export function schedulingPort(
	client: SchedulingClient,
	ttlMs: number = CATALOGUE_TTL_MS,
): SchedulingPort {
	const cache = new Map<string, { at: number; entries: ReadonlyArray<ServiceEntry> }>();
	return {
		/** The tenant's active services, read from the store and kept for a minute: a change the team makes shows up in the chat within it. */
		async catalogue(tenant) {
			const hit = cache.get(tenant);
			if (hit !== undefined && Date.now() - hit.at < ttlMs) return hit.entries;
			const found = await client.services(tenant);
			const entries = (found?.services ?? []).map((s) => ({
				slug: s.slug,
				...(s.name === undefined ? {} : { name: s.name }),
			}));
			cache.set(tenant, { at: Date.now(), entries });
			return entries;
		},
		findSlots: (search) => client.findSlots(search),
		cancel: (input) => client.cancel(input),
	};
}

/**
 * Scheduling from the environment (`CONVEX_URL`, `PSI_SCHEDULING_KEY`), or why it is off. Off
 * means the apps keep today's callback form and no scheduling tool exists.
 */
export function schedulingFromEnv(
	env: Readonly<Record<string, string | undefined>>,
): { ok: true; scheduling: PsiScheduling } | { ok: false; problem: SchedulingEnvProblem } {
	const read = readSchedulingEnv(env);
	if (!read.ok) return read;
	const client = createSchedulingClient(read.config);
	return {
		ok: true,
		scheduling: {
			client,
			port: schedulingPort(client),
			assistant: visitorAssistantPort(createVisitorAssistantStore(read.config)),
		},
	};
}
