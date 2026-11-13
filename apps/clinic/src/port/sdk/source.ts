import type { Context } from "hono";
import type { Auth } from "../../auth";
import { noteFailure } from "../../lib/failures";
import { PortError, type PortSource } from "../port";
import { createSdkPort, type SdkPortOptions } from "./index";

export interface SdkSourceOptions {
	baseUrl: string;
	auth: Pick<Auth, "bearer">;
	fetch?: typeof globalThis.fetch;
	backoff?: SdkPortOptions["backoff"];
}

/**
 * A port per request, calling the scheduling service with THAT request's person's token. With no token (signed out, or
 * the session ended) the call is refused as `unauthenticated` and the console sends the person through sign-in.
 */
export function sdkPortSource(options: SdkSourceOptions): PortSource {
	return {
		async forPerson(c: Context, viewAs) {
			const token = await options.auth.bearer(c);
			if (token === null) throw new PortError("unauthenticated", "no session");
			return createSdkPort({
				baseUrl: options.baseUrl,
				viewAs,
				bearer: async () => token,
				onError: (error) => noteFailure(c.req.raw, error),
				...(options.fetch === undefined ? {} : { fetch: options.fetch }),
				...(options.backoff === undefined ? {} : { backoff: options.backoff }),
			});
		},
	};
}
