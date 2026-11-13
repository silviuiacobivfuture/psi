import type { SchedulingClient } from "@psi/scheduling-sdk";
import type { Capabilities as ScheduleCapabilities } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type { PortError } from "../port";
import { toPortError } from "./errors";

/** What every group of the adapter shares: the typed client (acting as the person), the clinic's zone, the error sink. */
export interface SdkContext {
	api: SchedulingClient;
	/** The app's time zone (from its capabilities), asked once per port. */
	zone(app: string): Promise<string>;
	/** The caller's capabilities in the app, asked once per port (the same answer the zone comes from). */
	me(app: string): Promise<z.output<typeof ScheduleCapabilities>>;
	/** Runs one port call: whatever the service or the network does, only a `PortError` leaves. */
	run<T>(call: () => Promise<T>): Promise<T>;
}

export function createContext(
	api: SchedulingClient,
	onError: ((error: PortError) => void) | undefined,
): SdkContext {
	const known = new Map<string, Promise<z.output<typeof ScheduleCapabilities>>>();
	const run = async <T>(call: () => Promise<T>): Promise<T> => {
		try {
			return await call();
		} catch (error) {
			const refusal = toPortError(error);
			onError?.(refusal);
			throw refusal;
		}
	};
	return {
		api,
		run,
		me(app) {
			let held = known.get(app);
			if (held === undefined) {
				held = api.me.capabilities({ app });
				known.set(app, held);
				// A failed ask is asked again next time, never remembered.
				held.catch(() => known.delete(app));
			}
			return held;
		},
		async zone(app) {
			return (await this.me(app)).timeZone;
		},
	};
}
