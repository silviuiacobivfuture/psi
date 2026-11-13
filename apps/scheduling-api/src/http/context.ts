import type { ParsedOf, Route, RouteId, RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Principal } from "../auth/principal";
import type { TokenVerifier } from "../auth/tokens";
import type { Access, Reach } from "../authz/access";
import type { AuthzPort } from "../authz/port";
import type { Config } from "../config";
import type { FieldCrypto } from "../ports/crypto";
import type { Mailer } from "../ports/mail";
import type { Notification, NotifyPort } from "../ports/notify";
import type { ObjectStore } from "../ports/objects";
import type { Limiter } from "../ports/ratelimit";
import type { StorePort } from "../store/types";

export interface LogEvent {
	level: "info" | "warn" | "error";
	event: string;
	requestId: string;
	/** Never data: codes, route ids, reasons. */
	[key: string]: unknown;
}

/** Everything the service is built from. Tests pass the in-memory adapters; the server passes the live ones. */
export interface Deps {
	config: Config;
	store: StorePort;
	authz: AuthzPort;
	access: Access;
	verifier: TokenVerifier;
	crypto: FieldCrypto;
	mailer: Mailer | undefined;
	objects: ObjectStore | undefined;
	notifier: NotifyPort;
	/** The signed reminder links (`/v1/public/reminders`), when the service can sign them. */
	reminders?: import("hono").Hono | undefined;
	/** Per caller and visitor, on the visitor routes. */
	limiter: Limiter;
	clock: () => number;
	log: (event: LogEvent) => void;
	streamHeartbeatMs: number;
}

/** What a handler is given. `reach` is set on list routes: the objects the caller may see. */
export interface Ctx<S extends RouteSpec> {
	deps: Deps;
	principal: Principal;
	/** The OpenFGA subject: the person's, or `service:<caller>`. */
	subject: string;
	app: string;
	params: ParsedOf<S>["params"];
	query: ParsedOf<S>["query"];
	body: ParsedOf<S>["body"];
	requestId: string;
	now: number;
	reach: Reach;
	/** Does the caller hold this permission on the whole app (the key, or `<key>_all`)? */
	canAll(key: string): Promise<boolean>;
	/** On one object (scope-aware). */
	canOn(
		key: string,
		type: import("@psi/scheduling-sdk/contract").SchedType,
		id: string,
	): Promise<boolean>;
	/**
	 * For a route whose target is `dynamic`: asks the question the route could not ask before loading the row, and
	 * refuses (404, as for any object the caller may not reach) when the answer is no. A dynamic route's handler MUST
	 * call it before it writes; the pipeline refuses to answer a handler that never did.
	 */
	authorize(
		key: string,
		type: import("@psi/scheduling-sdk/contract").SchedType,
		id: string,
	): Promise<void>;
	/** Like `authorize`, for several keys at once: returns the ones the caller holds on the object, 404 when none. */
	authorizeAny(
		keys: readonly string[],
		type: import("@psi/scheduling-sdk/contract").SchedType,
		id: string,
	): Promise<string[]>;
	/** The reach for a permission other than the route's own (a field group). */
	reachOf(key: string, type: import("@psi/scheduling-sdk/contract").SchedType): Promise<Reach>;
	/** Adds to this call's audit event (ids and counts, never values). */
	note(detail: Record<string, unknown>): void;
	/** Overrides the audited target id (default: the answer's `id`, else the path's id). */
	auditTarget(id: string): void;
	/** Writes an audit event right now (a clinical read is audited whether or not the call mutates). */
	auditNow(
		action: string,
		target: { type: string; id: string },
		detail?: Record<string, unknown>,
	): Promise<void>;
	/** Tells the team or the person. A failure is logged and swallowed: it never fails the user's action. */
	notify(
		event: Notification["event"],
		to: Notification["to"],
		payload: Notification["payload"],
		key: string,
	): Promise<void>;
	/** Tells the calendar's streams something changed. */
	changed(
		kind: "appointment" | "client" | "roster" | "request",
		op: "created" | "updated" | "deleted",
		id: string,
	): Promise<void>;
}

type Out<S extends RouteSpec> = import("zod/v4").output<S["response"]>;
export type Handler<S extends RouteSpec> = {
	bivarianceHack(ctx: Ctx<S>): Promise<Out<S>>;
}["bivarianceHack"];

type Plain = Exclude<Route, { stream: true } | { side: "meta" }>;
/** One handler per route of the contract: a route without one is a compile error. */
export type Handlers = { [S in Plain as S["id"]]: Handler<S> };
export type HandlersOf<K extends RouteId> = {
	[S in Plain as S["id"] extends K ? S["id"] : never]: Handler<S>;
};

export type HttpEnv = { Variables: { requestId: string } };
