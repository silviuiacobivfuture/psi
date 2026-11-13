import { type ErrorCode, ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Context } from "hono";
import { type Principal, subjectOf, visitorSubject } from "../auth/principal";
import { verifyServiceKey } from "../auth/service-keys";
import { NONE, type Reach } from "../authz/access";
import { AuthzUnavailable } from "../authz/port";
import { MailUnavailable } from "../ports/mail";
import { NotAvailableYet, StoreConflict } from "../store/types";
import { writeAudit } from "./audit";
import type { Ctx, Deps, HttpEnv } from "./context";
import { ApiError, fail, forbidden, notFound } from "./errors";

export interface Prepared {
	spec: RouteSpec;
	ctx: Ctx<RouteSpec>;
	principal: Principal;
	/** What the handler asked to be audited. */
	audit: { id: string | undefined; detail: Record<string, unknown> };
}

type Parsed = {
	params: Record<string, unknown>;
	query: Record<string, unknown>;
	body: Record<string, unknown>;
};

function problems(error: {
	issues: ReadonlyArray<{ path: PropertyKey[] }>;
}): Record<string, unknown> {
	// The paths of the offending fields, never their values.
	return { fields: error.issues.map((i) => i.path.map(String).join(".")) };
}

function parseParams(spec: RouteSpec, c: Context<HttpEnv>): Record<string, unknown> {
	if (spec.params === undefined) return {};
	const r = spec.params.safeParse(c.req.param());
	if (!r.success) throw fail("invalid", "invalid path", problems(r.error));
	return r.data;
}

async function parseBody(spec: RouteSpec, c: Context<HttpEnv>): Promise<Record<string, unknown>> {
	if (spec.body === undefined) return {};
	const raw: unknown = await c.req.json().catch(() => undefined);
	const r = spec.body.safeParse(raw);
	if (!r.success) throw fail("invalid", "invalid body", problems(r.error));
	return r.data;
}

function parseQuery(spec: RouteSpec, c: Context<HttpEnv>): Record<string, unknown> {
	if (spec.query === undefined) return {};
	const r = spec.query.safeParse(c.req.query());
	if (!r.success) throw fail("invalid", "invalid query", problems(r.error));
	return r.data;
}

/** Who is calling. A bearer and a service key together are refused: one credential per call. */
async function authenticate(deps: Deps, c: Context<HttpEnv>): Promise<Principal> {
	const header = c.req.header("authorization");
	const key = c.req.header("x-service-key");
	if (header !== undefined && key !== undefined)
		throw fail("invalid_token", "one credential per call");
	if (header !== undefined) {
		const token = /^Bearer (.+)$/i.exec(header)?.[1];
		if (token === undefined) throw fail("invalid_token", "not a bearer token");
		const result = await deps.verifier.verify(token);
		if (!result.ok) {
			deps.log({
				level: "warn",
				event: "token_refused",
				requestId: c.get("requestId"),
				reason: result.reason,
			});
			throw fail("invalid_token", "the token was refused");
		}
		return {
			kind: "person",
			subject: result.subject,
			...(result.name === undefined ? {} : { name: result.name }),
		};
	}
	if (key !== undefined) {
		const result = verifyServiceKey(key, deps.config.callers, deps.config.callerHashes);
		if (!result.ok) throw fail("invalid_token", "the service key was refused");
		const onBehalfOf = c.req.header("x-psi-subject");
		return {
			kind: "service",
			callerId: result.callerId,
			app: result.app,
			...(onBehalfOf === undefined || onBehalfOf === "" ? {} : { onBehalfOf }),
		};
	}
	throw fail("unauthenticated", "sign in or present a service key");
}

/** Everything before the handler: credential, side, app, membership, permission. Nothing is written here. */
export async function prepare(deps: Deps, spec: RouteSpec, c: Context<HttpEnv>): Promise<Prepared> {
	const requestId: string = c.get("requestId");
	// Order matters: who is calling, then the path, then membership and permission, and only then the rest of the
	// input. A caller who may not do this learns nothing about what a valid request looks like.
	const principal = await authenticate(deps, c);
	const parsed: Parsed = { params: parseParams(spec, c), query: {}, body: {} };
	const subject = subjectOf(principal);
	const app = typeof parsed.params.app === "string" ? parsed.params.app : "";
	let reach: Reach = NONE;

	if (spec.side === "team") {
		if (principal.kind === "service") throw forbidden("service keys reach the visitor routes only");
		if (spec.platform === true) {
			if (!(await deps.access.isPlatformAdmin(subject)))
				throw forbidden("estate administrators only");
		} else if (app !== "") {
			if (!(await deps.access.isMember(subject, app))) throw notFound("app");
			const row = await deps.store.c.apps.get(app, app);
			if (row === undefined) throw notFound("app");
			if (row.status === "suspended" && spec.method !== "GET" && spec.id !== "apps.update")
				throw forbidden("the app is suspended", { reason: "app_suspended" });
		}
		const permission = spec.permission;
		if (permission !== undefined) {
			const target = permission.target;
			if (target.kind === "app") {
				if (!(await deps.access.canAll(subject, app, permission.key)))
					throw forbidden("the role does not allow this", { permission: permission.key });
			} else if (target.kind === "list") {
				reach = await deps.access.reach(subject, app, permission.key, target.type);
				if (reach.kind === "none")
					throw forbidden("the role does not allow this", { permission: permission.key });
			} else {
				if (target.idFrom?.in === "body") parsed.body = await parseBody(spec, c);
				const source = target.idFrom?.in === "body" ? parsed.body : parsed.params;
				const id = source[target.idFrom?.key ?? "id"];
				if (typeof id !== "string") throw fail("invalid", "missing the object id");
				if (!(await deps.access.canOn(subject, app, permission.key, target.type, id)))
					throw notFound("object");
			}
		}
	} else if (spec.side === "visitor") {
		if (principal.kind === "service" && principal.app !== app)
			throw forbidden("this key is for another app");
		// One bucket per service key and visitor (the site forwards the visitor's address), or per signed-in person.
		const bucket =
			principal.kind === "service"
				? `svc:${principal.callerId}:${c.req.header("x-psi-client-ip") ?? "-"}`
				: `sub:${principal.subject}`;
		const taken = deps.limiter.take(bucket);
		if (!taken.ok)
			throw fail("rate_limited", "too many requests", {
				retryAfterSeconds: taken.retryAfterSeconds,
			});
		const row = await deps.store.c.apps.get(app, app);
		if (row === undefined || row.status !== "active") throw notFound("app");
		if (spec.path.includes("/me/") && visitorSubject(principal) === undefined)
			throw fail("invalid", "name the visitor in x-psi-subject");
	}

	parsed.query = parseQuery(spec, c);
	if (Object.keys(parsed.body).length === 0) parsed.body = await parseBody(spec, c);
	const audit: Prepared["audit"] = { id: undefined, detail: {} };
	const now = deps.clock();
	const ctx: Ctx<RouteSpec> = {
		deps,
		principal,
		subject,
		app,
		params: parsed.params,
		query: parsed.query,
		body: parsed.body,
		requestId,
		now,
		reach,
		canAll: (key) => deps.access.canAll(subject, app, key),
		canOn: (key, type, id) => deps.access.canOn(subject, app, key, type, id),
		reachOf: (key, type) => deps.access.reach(subject, app, key, type),
		note(d) {
			audit.detail = { ...audit.detail, ...d };
		},
		auditTarget(id) {
			audit.id = id;
		},
		auditNow: (action, target, d) =>
			writeAudit(deps, {
				app,
				actor: { subject, kind: principal.kind === "person" ? "person" : "service" },
				action,
				target,
				detail: d,
			}),
		async notify(event, to, payload, key) {
			try {
				await deps.notifier.notify({
					app,
					event,
					to,
					payload,
					idempotencyKey: `${app}:${event}:${key}`,
				});
			} catch {
				deps.log({ level: "error", event: "notify_failed", requestId, notification: event });
			}
		},
		changed: (kind, op, id) => deps.store.changes.append(app, { kind, op, id }),
	};
	return { spec, ctx, principal, audit };
}

/** The mutation's audit event, written once the handler succeeded. */
export async function finish(deps: Deps, prepared: Prepared, result: unknown): Promise<unknown> {
	const { spec, ctx, principal, audit } = prepared;
	const parsed = spec.response.safeParse(result);
	if (!parsed.success) {
		deps.log({
			level: "error",
			event: "response_mismatch",
			requestId: ctx.requestId,
			route: spec.id,
		});
		throw fail("internal", "the answer does not match the contract");
	}
	if (spec.audit !== undefined) {
		const out = parsed.data;
		const own =
			typeof out === "object" && out !== null
				? (Object.getOwnPropertyDescriptor(out, "id")?.value ??
					Object.getOwnPropertyDescriptor(out, "reference")?.value)
				: undefined;
		const id =
			audit.id ??
			(typeof own === "string"
				? own
				: String(ctx.params.id ?? ctx.params.subject ?? ctx.params.reference ?? ctx.app));
		await writeAudit(deps, {
			app: ctx.app,
			actor: { subject: ctx.subject, kind: principal.kind === "person" ? "person" : "service" },
			action: spec.audit,
			target: { type: spec.id.split(".")[0] ?? spec.id, id },
			...(Object.keys(audit.detail).length > 0 ? { detail: audit.detail } : {}),
		});
	}
	return parsed.data;
}

/** Turns anything thrown into the contract's refusal; nothing else leaves the process. */
export function refusal(
	deps: Deps,
	error: unknown,
	requestId: string,
): {
	status: number;
	body: {
		error: {
			code: ErrorCode;
			message: string;
			requestId: string;
			detail?: Record<string, unknown>;
		};
	};
} {
	const make = (e: ApiError) => ({
		status: e.status,
		body: {
			error: {
				code: e.code,
				message: e.message,
				requestId,
				...(e.detail === undefined ? {} : { detail: e.detail }),
			},
		},
	});
	if (error instanceof ApiError) return make(error);
	if (error instanceof AuthzUnavailable) {
		deps.log({ level: "error", event: "authz_unavailable", requestId });
		return make(fail("unavailable", "authorization is unavailable; refusing"));
	}
	if (error instanceof NotAvailableYet) return make(fail("not_available_yet", error.message));
	if (error instanceof MailUnavailable) return make(fail("unavailable", "mail is unavailable"));
	if (error instanceof StoreConflict) return make(fail("conflict", "already exists"));
	deps.log({
		level: "error",
		event: "unhandled",
		requestId,
		name: error instanceof Error ? error.name : "unknown",
	});
	return make(fail("internal", "internal error"));
}

export const ROUTE_TABLE: ReadonlyArray<RouteSpec> = ROUTES;
