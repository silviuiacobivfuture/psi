import type { SchedulingPort } from "@psi/engine";
import {
	createSchedulingClient,
	readSchedulingEnv,
	type SchedulingClient,
	type SchedulingEnvProblem,
} from "@psi/scheduling";

/** psi's scheduling store as an app and the guide use it: one client, also the engine's port. */
export interface PsiScheduling {
	/** For the app's own routes: slots, holds, requests (the confirm step lives here). */
	client: SchedulingClient;
	/** For the engine's tools: find and cancel only (no method books). */
	port: SchedulingPort;
}

/**
 * The engine's port: only finding slots and cancelling with a code. The engine never holds the
 * client itself, so no path from a tool reaches `hold` or `submit` (the app's confirm step).
 */
export function schedulingPort(client: SchedulingClient): SchedulingPort {
	return {
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
	return { ok: true, scheduling: { client, port: schedulingPort(client) } };
}
