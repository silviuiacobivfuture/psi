import type { Context } from "hono";
import type { Auth } from "../../auth";
import { noteFailure } from "../../lib/failures";
import { noteServiceTiming, timed } from "../../lib/timings";
import { PortError, type PortSource } from "../port";
import { createSdkPort, type SdkPortOptions } from "./index";

export interface SdkSourceOptions {
	baseUrl: string;
	auth: Pick<Auth, "bearer">;
	fetch?: typeof globalThis.fetch;
	backoff?: SdkPortOptions["backoff"];
}

/** The capabilities call (`GET /v1/apps/:app/me`), timed on its own: it is the service's dearest answer. */
const CAPABILITIES_PATH = /^\/v1\/apps\/[^/]+\/me$/;

function pathOf(input: RequestInfo | URL): string {
	const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	try {
		return new URL(raw).pathname;
	} catch {
		return "";
	}
}

/** Every call to the service, timed for the page's `Server-Timing`, with the service's own timing folded in. */
function timedFetch(c: Context, base: typeof globalThis.fetch): typeof globalThis.fetch {
	return (input, init) =>
		timed(c.req.raw, CAPABILITIES_PATH.test(pathOf(input)) ? "caps" : "api", async () => {
			const res = await base(input, init);
			noteServiceTiming(c.req.raw, res.headers.get("server-timing"));
			return res;
		});
}

/**
 * A port per request, calling the scheduling service with THAT request's person's token. With no token (signed out, or
 * the session ended) the call is refused as `unauthenticated` and the console sends the person through sign-in.
 */
export function sdkPortSource(options: SdkSourceOptions): PortSource {
	// The global fetch as it is at each call (never the one at boot).
	const base: typeof globalThis.fetch = options.fetch ?? ((input, init) => fetch(input, init));
	return {
		async forPerson(c: Context, viewAs) {
			const token = await options.auth.bearer(c);
			if (token === null) throw new PortError("unauthenticated", "no session");
			return createSdkPort({
				baseUrl: options.baseUrl,
				viewAs,
				bearer: async () => token,
				onError: (error) => noteFailure(c.req.raw, error),
				fetch: timedFetch(c, base),
				...(options.backoff === undefined ? {} : { backoff: options.backoff }),
			});
		},
	};
}
