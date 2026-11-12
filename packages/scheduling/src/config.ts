import { z } from "zod";

/** How a server reaches the scheduling store. */
export interface SchedulingConfig {
	/** The Convex deployment: `http://127.0.0.1:3210` locally, the in-cluster Service in the estate. */
	url: string;
	/** The shared key the deployment's functions demand (`PSI_SCHEDULING_KEY`). */
	serverKey: string;
	/** Deadline for one call, in milliseconds. */
	timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 2_500;

const EnvSchema = z.object({
	CONVEX_URL: z.string().trim().url().optional(),
	PSI_SCHEDULING_KEY: z.string().trim().min(32).optional(),
	PSI_SCHEDULING_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).optional(),
});

/** Why scheduling is off, for the app's startup log; never carries a value. */
export type SchedulingEnvProblem = "no_url" | "no_key" | "invalid";

export type SchedulingEnv =
	| { ok: true; config: SchedulingConfig }
	| { ok: false; problem: SchedulingEnvProblem };

/**
 * Reads `CONVEX_URL`, `PSI_SCHEDULING_KEY` and `PSI_SCHEDULING_TIMEOUT_MS`. Without a URL
 * scheduling is off and the app keeps its callback form; with a URL but no key it is off too
 * (the deployment would refuse every call), and the problem says so.
 */
export function readSchedulingEnv(
	env: Readonly<Record<string, string | undefined>>,
): SchedulingEnv {
	const parsed = EnvSchema.safeParse({
		CONVEX_URL: env.CONVEX_URL || undefined,
		PSI_SCHEDULING_KEY: env.PSI_SCHEDULING_KEY || undefined,
		PSI_SCHEDULING_TIMEOUT_MS: env.PSI_SCHEDULING_TIMEOUT_MS || undefined,
	});
	if (!parsed.success) return { ok: false, problem: "invalid" };
	const { CONVEX_URL: url, PSI_SCHEDULING_KEY: serverKey } = parsed.data;
	if (url === undefined) return { ok: false, problem: "no_url" };
	if (serverKey === undefined) return { ok: false, problem: "no_key" };
	return {
		ok: true,
		config: {
			url,
			serverKey,
			timeoutMs: parsed.data.PSI_SCHEDULING_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
		},
	};
}
