import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { CONVEX_DATA, CONVEX_URL } from "./backend";

/** Calls the public (server-keyed) Convex functions the way psi's servers do. */
const KEY_FILE = join(CONVEX_DATA, "secrets/server-key");
export const serverKey: string = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8").trim() : "";

const http = new ConvexHttpClient(CONVEX_URL);

export async function callQuery(
	name: string,
	args: Record<string, unknown>,
	key: string | null = serverKey,
): Promise<unknown> {
	return http.query(makeFunctionReference<"query">(name), {
		...(key === null ? {} : { key }),
		...args,
	});
}

export async function callMutation(
	name: string,
	args: Record<string, unknown>,
	key: string | null = serverKey,
): Promise<unknown> {
	return http.mutation(makeFunctionReference<"mutation">(name), {
		...(key === null ? {} : { key }),
		...args,
	});
}

/** A live subscription (WebSocket) to a public query, as a console would hold. */
export function subscribe(
	name: string,
	args: Record<string, unknown>,
	onResult: (value: unknown) => void,
): { close: () => Promise<void> } {
	const client = new ConvexClient(CONVEX_URL);
	client.onUpdate(makeFunctionReference<"query">(name), { key: serverKey, ...args }, onResult);
	return { close: () => client.close() };
}
