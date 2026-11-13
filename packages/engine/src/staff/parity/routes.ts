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
 * handshake. Everything else the console can do is a tool.
 */
const NEVER = new Set(["files.init", "files.complete"]);

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

/** `clients.archive` → `staffApiClientsArchive`. */
export function parityToolId(route: RouteLike): string {
	const [group = "", ...rest] = route.id.split(".");
	const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
	return `staffApi${cap(group)}${rest.map(cap).join("")}`;
}
