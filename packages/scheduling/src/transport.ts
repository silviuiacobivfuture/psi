import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { z } from "zod";
import type { SchedulingConfig } from "./config";

/**
 * The scheduling store could not be asked: unreachable, too slow, a refused key, or an answer of
 * the wrong shape. The message names the cause and never carries a key or a visitor's data.
 */
export class SchedulingUnavailable extends Error {
	override readonly name = "SchedulingUnavailable";
}

/** SHA-256, hex: only hashes of tokens and codes ever reach the store. */
export function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function cause(error: unknown, url: string): string {
	if (error instanceof ConvexError) {
		return error.data === "unauthorized"
			? `Convex at ${url} refused the server key: PSI_SCHEDULING_KEY does not match the deployment's`
			: "the scheduling store refused the call";
	}
	if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
		return `Convex at ${url} did not answer in time`;
	}
	if (error instanceof TypeError) return `Convex at ${url} is unreachable: check CONVEX_URL`;
	return "the scheduling store failed";
}

/** One Convex connection with a deadline per call; every answer is parsed with its schema. */
export interface Transport {
	readonly serverKey: string;
	call<S extends z.ZodTypeAny>(
		schema: S,
		run: (convex: ConvexHttpClient) => Promise<unknown>,
	): Promise<z.infer<S>>;
}

export function createTransport(config: SchedulingConfig): Transport {
	const origin = new URL(config.url).origin;
	const convex = new ConvexHttpClient(config.url, {
		skipConvexDeploymentUrlCheck: true,
		logger: false,
		fetch: (input, init) =>
			fetch(input, { ...init, signal: AbortSignal.timeout(config.timeoutMs) }),
	});
	return {
		serverKey: config.serverKey,
		async call(schema, run) {
			let raw: unknown;
			try {
				raw = await run(convex);
			} catch (error) {
				throw new SchedulingUnavailable(cause(error, origin));
			}
			const parsed = schema.safeParse(raw);
			if (!parsed.success) {
				throw new SchedulingUnavailable("the scheduling store answered in an unexpected shape");
			}
			return parsed.data;
		},
	};
}
