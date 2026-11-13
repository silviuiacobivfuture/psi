import type { z } from "zod/v4";
import type { SchedType } from "./primitives";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Who may call. `visitor` routes take an estate SSO token or a service key scoped to the app and to
 * these routes only; `team` routes take an SSO token only and every call is authorized with OpenFGA;
 * `meta` routes are the service's own (health, the OpenAPI document).
 */
export type Side = "visitor" | "team" | "meta";

/** What the call is authorized against. A list resolves the caller's reach (all, or the objects ListObjects names). */
export type Target =
	| { kind: "app" }
	| { kind: "object"; type: SchedType; idFrom?: { in: "params" | "body"; key: string } }
	| { kind: "list"; type: SchedType };

export interface Permission {
	/** A catalogue permission key (`clients_edit`); a scoped one is checked as `<key>_all|_assigned|_own`. */
	key: string;
	target: Target;
}

export interface RouteSpec {
	/** `<group>.<operation>`: the SDK method is `client.<group>.<operation>`. */
	id: `${string}.${string}`;
	method: HttpMethod;
	/** Express-style, always under /v1 (except the meta routes): `/v1/apps/:app/clients/:id`. */
	path: string;
	side: Side;
	summary: string;
	params?: z.ZodObject;
	query?: z.ZodObject;
	body?: z.ZodObject;
	response: z.ZodType;
	permission?: Permission;
	/** The audit action every successful mutation writes. */
	audit?: string;
	/** Needs the estate's platform administrator, not membership of an app (creating an app). */
	platform?: true;
	/** Server-sent events: `response` is one event. */
	stream?: true;
	/** Why a route with no sign-in exists (meta routes only). */
	publicReason?: string;
}

/** Declares a route; the literal type is kept so the SDK and the server derive from it. */
export function route<const S extends RouteSpec>(spec: S): S {
	return spec;
}

type Obj<S, K extends keyof S> = S[K] extends z.ZodObject ? z.input<S[K]> : unknown;
type Flat<T> = { [K in keyof T]: T[K] } & unknown;

/** The one object an SDK call takes: path parameters, query and body, flattened (their keys never collide). */
export type InputOf<S extends RouteSpec> = Flat<
	Obj<S, "params"> & Obj<S, "query"> & Obj<S, "body">
>;
export type OutputOf<S extends RouteSpec> = z.output<S["response"]>;
/** What a server handler receives: the parsed parts, separate. */
export interface ParsedOf<S extends RouteSpec> {
	params: S["params"] extends z.ZodObject ? z.output<S["params"]> : Record<string, never>;
	query: S["query"] extends z.ZodObject ? z.output<S["query"]> : Record<string, never>;
	body: S["body"] extends z.ZodObject ? z.output<S["body"]> : Record<string, never>;
}
