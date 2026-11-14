import type { SchedulingClient } from "@psi/scheduling-sdk";
import type { Capabilities as ScheduleCapabilities } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type { PortError } from "../port";
import { toPortError } from "./errors";
import { createPortMemory, type Memo, type PortMemory } from "./memory";

export type CapabilitiesAnswer = z.output<typeof ScheduleCapabilities>;
/** Whose capabilities, when not the caller's own: a role's or a member's (the estate administrator's view-as). */
export type CapabilitiesOf = `role:${string}` | `member:${string}`;

/** What every group of the adapter shares: the typed client (acting as the person), the clinic's zone, the error sink. */
export interface SdkContext {
	api: SchedulingClient;
	/** The app's time zone (from its capabilities), asked once per port. */
	zone(app: string): Promise<string>;
	/**
	 * The caller's capabilities in the app (or, with `as`, a role's or member's): asked once per port (one page), the
	 * same answer the middleware, the zone and the screens read.
	 */
	me(app: string, as?: CapabilitiesOf): Promise<CapabilitiesAnswer>;
	/** A read every part of one page shares (the columns, the services): asked once per port until it writes. */
	memo<V>(): Memo<V>;
	/** Runs one port call: whatever the service or the network does, only a `PortError` leaves. */
	run<T>(call: () => Promise<T>): Promise<T>;
	/** Moves the bytes of a file to and from the store's signed URLs (not the service: no bearer goes there). */
	transfer: typeof globalThis.fetch;
}

export interface ContextOptions {
	onError?: ((error: PortError) => void) | undefined;
	transfer?: typeof globalThis.fetch | undefined;
	/** What this port remembers; made fresh (nothing kept between pages) when not given. */
	memory?: PortMemory | undefined;
}

export function createContext(api: SchedulingClient, options: ContextOptions = {}): SdkContext {
	const memory = options.memory ?? createPortMemory();
	const known = memory.memo<CapabilitiesAnswer>();
	const run = async <T>(call: () => Promise<T>): Promise<T> => {
		try {
			return await call();
		} catch (error) {
			const refusal = toPortError(error);
			options.onError?.(refusal);
			throw refusal;
		}
	};
	return {
		api,
		run,
		transfer: options.transfer ?? globalThis.fetch.bind(globalThis),
		memo: () => memory.memo(),
		me(app, as) {
			return known.get(`${app}\u0000${as ?? ""}`, () =>
				api.me.capabilities({ app, ...(as === undefined ? {} : { as }) }),
			);
		},
		async zone(app) {
			return (await this.me(app)).timeZone;
		},
	};
}
