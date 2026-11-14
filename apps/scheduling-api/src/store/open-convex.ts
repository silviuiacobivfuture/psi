import {
	createSchedulingClient,
	createStaffSchedulingClient,
	DEFAULT_TIMEOUT_MS,
} from "@psi/scheduling";
import { ConvexClient } from "convex/browser";
import { createConvexStore } from "./convex";
import { createRpc, type Rpc } from "./convex/rpc";
import type { StorePort } from "./types";

export interface OpenConvex {
	store: StorePort;
	rpc: Rpc;
	/** Closes the live-query connection the store holds. */
	close(): Promise<void>;
}

/** The service's own Convex store, wired the one way the service wires it (the server and the ops tools share this). */
export function openConvexStore(options: { url: string; serverKey: string }): OpenConvex {
	const rpc = createRpc({ url: options.url, serverKey: options.serverKey });
	const live = new ConvexClient(options.url, { skipConvexDeploymentUrlCheck: true, logger: false });
	const clientOptions = {
		url: options.url,
		serverKey: options.serverKey,
		timeoutMs: DEFAULT_TIMEOUT_MS,
	};
	const store = createConvexStore({
		rpc,
		live,
		serverKey: options.serverKey,
		visitor: createSchedulingClient(clientOptions),
		staff: createStaffSchedulingClient(clientOptions),
	});
	return { store, rpc, close: () => live.close() };
}
