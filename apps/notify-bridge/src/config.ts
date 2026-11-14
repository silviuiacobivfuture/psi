import { z } from "zod";

/**
 * The bridge's environment, parsed once at start: the Novu environment it serves (its API, and the secret key Novu signs
 * every request to the bridge with) and the port. A missing or malformed value stops the start, by name.
 */
const Env = z.object({
	NOVU_SECRET_KEY: z.string().min(1),
	NOVU_API_URL: z.string().url(),
	PORT: z.coerce.number().int().min(1).max(65535).default(8080),
});

export type BridgeConfig = z.infer<typeof Env>;

export class BridgeConfigError extends Error {
	override readonly name = "BridgeConfigError";
}

export function loadBridgeConfig(env: Record<string, string | undefined>): BridgeConfig {
	const parsed = Env.safeParse(env);
	if (!parsed.success)
		throw new BridgeConfigError(
			parsed.error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`).join("; "),
		);
	return parsed.data;
}
