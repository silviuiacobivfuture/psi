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
	| { kind: "list"; type: SchedType }
	/**
	 * Authorized by the handler after it loads what the path names: the permission depends on a row (a record's form
	 * decides its resource; a payment belongs to a package or a client). The handler calls `ctx.authorize` BEFORE it
	 * writes; a handler that returns without having asked is refused by the pipeline, and the matrix tests cover each.
	 */
	| {
			kind: "dynamic";
			type: SchedType;
			/**
			 * Before anything is parsed, the caller must hold at least one of these (at any scope) in the app: a role
			 * with none of them is refused (403) like on any other route. Which one decides is the handler's to ask.
			 */
			candidates: readonly string[];
	  };
export interface Permission {
	/**
	 * A catalogue permission without its scope (`clients_edit`, `clients_view_clinical`): held as
	 * `<resource>_<action>_<scope>[_<group>]`. `record:dynamic` names the five record resources, chosen by the form.
	 */
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
	/**
	 * Needs the estate's platform administrator: alone where there is no app yet (creating one), and on top of the app's
	 * own membership checks where the path names one ("Vezi ca…").
	 */
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
	params: S["params"] extends z.ZodObject ? z.output<S["params"]> : Record<string, unknown>;
	query: S["query"] extends z.ZodObject ? z.output<S["query"]> : Record<string, unknown>;
	body: S["body"] extends z.ZodObject ? z.output<S["body"]> : Record<string, unknown>;
}
