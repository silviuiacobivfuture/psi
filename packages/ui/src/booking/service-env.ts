import { z } from "zod";

/** How long one call to the scheduling service may take before the site falls back to the callback form. */
export const SCHEDULING_API_TIMEOUT_MS = 2_500;

/** `psizone-web.<secret>`: the caller id the service knows this site by, then the secret only this site holds. */
const ServiceKey = z.string().regex(/^[a-z][a-z0-9-]{1,40}\.\S{8,200}$/);

const EnvSchema = z.object({
	SCHEDULING_API_URL: z.string().url().optional(),
	SCHEDULING_SERVICE_KEY: ServiceKey.optional(),
	SCHEDULING_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).optional(),
});

export interface SchedulingApiConfig {
	url: string;
	serviceKey: string;
	timeoutMs: number;
}

export type SchedulingApiProblem = "no_url" | "no_key" | "invalid";

/**
 * The scheduling service the site books through (apps/scheduling-api's visitor routes): its in-cluster URL and this
 * site's service key. Without a URL scheduling is off and the forms are the callback form alone; with a URL and no
 * key it is off too (the service would refuse every call), and the problem says so. Never the key in a message.
 */
export function readSchedulingApiEnv(
	env: Readonly<Record<string, string | undefined>>,
): { ok: true; config: SchedulingApiConfig } | { ok: false; problem: SchedulingApiProblem } {
	const parsed = EnvSchema.safeParse({
		SCHEDULING_API_URL: env.SCHEDULING_API_URL || undefined,
		SCHEDULING_SERVICE_KEY: env.SCHEDULING_SERVICE_KEY || undefined,
		SCHEDULING_API_TIMEOUT_MS: env.SCHEDULING_API_TIMEOUT_MS || undefined,
	});
	if (!parsed.success) return { ok: false, problem: "invalid" };
	const { SCHEDULING_API_URL: url, SCHEDULING_SERVICE_KEY: serviceKey } = parsed.data;
	if (url === undefined) return { ok: false, problem: "no_url" };
	if (serviceKey === undefined) return { ok: false, problem: "no_key" };
	return {
		ok: true,
		config: {
			url,
			serviceKey,
			timeoutMs: parsed.data.SCHEDULING_API_TIMEOUT_MS ?? SCHEDULING_API_TIMEOUT_MS,
		},
	};
}
