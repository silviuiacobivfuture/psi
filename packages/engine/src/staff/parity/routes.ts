import type { z } from "zod/v4";

/**
 * A row of the scheduling service's route table, as far as the assistant needs it. The SDK's
 * `ROUTES` (`@psi/scheduling-sdk/contract`) fits this shape, so a route added to the contract
 * becomes a tool without a line here.
 */
export interface RouteLike {
	readonly id: string;
	readonly method: string;
	readonly path: string;
	readonly side: string;
	readonly summary: string;
	readonly params?: z.ZodObject;
	readonly query?: z.ZodObject;
	readonly body?: z.ZodObject;
	readonly permission?: { readonly key: string };
	readonly audit?: string;
	readonly platform?: true;
	readonly stream?: true;
}

/**
 * Routes the assistant never offers as tools: the service's own and the visitor side, the
 * estate-administrator ones, live streams (no place in a chat), and the browser-only file upload
 * handshake; nor switching who the console looks as (the assistant never changes whose rights it uses), nor its
 * own metering (counted by the engine, never by the model). Everything else the console can do is a tool.
 * Each with why: the guard in the console (`parity-guard.test.ts`) reads this list.
 */
export const NEVER_REASONS: Readonly<Record<string, string>> = {
	"files.init":
		"the browser-only upload handshake: bytes go from the device to storage, never through a chat",
	"files.complete": "the second half of the browser-only upload handshake",
	"viewAs.start": "the assistant never changes whose rights it acts with",
	"viewAs.stop": "the assistant never changes whose rights it acts with",
	"me.assistantUsage":
		"the assistant's own metering, recorded by the engine after each turn and never by the model",
};
const NEVER = new Set(Object.keys(NEVER_REASONS));

export function isParityRoute(route: RouteLike): boolean {
	return (
		route.side === "team" &&
		route.platform !== true &&
		route.stream !== true &&
		!NEVER.has(route.id)
	);
}

/** Groups whose answers carry text strangers wrote (the website form, the visitor chat). */
const STRANGER_GROUPS = new Set(["requests", "inbox", "visitor"]);

export function writtenByStrangers(route: RouteLike): boolean {
	return STRANGER_GROUPS.has(route.id.split(".")[0] ?? "");
}

export function isWrite(route: RouteLike): boolean {
	return route.method !== "GET";
}
