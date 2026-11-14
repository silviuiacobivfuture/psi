import { CryptoError } from "@psi/scheduling/crypto";
import {
	type ErrorCode,
	ROUTES,
	type RouteSpec,
	VIEW_AS_HEADER,
} from "@psi/scheduling-sdk/contract";
import type { Context } from "hono";
import { z } from "zod";
import { type Principal, subjectOf, visitorSubject } from "../auth/principal";
import { verifyServiceKey } from "../auth/service-keys";
import { NONE, type Reach } from "../authz/access";
import { AuthzUnavailable } from "../authz/port";
import { tellOwners } from "../engagement/security";
import { MailUnavailable } from "../ports/mail";
import { SsoUnavailable } from "../ports/sso";
import { StoreConflict, StoreRefused, StoreUnavailable } from "../store/types";
import { timed } from "../timing";
import { writeAudit } from "./audit";
import type { Ctx, Deps, HttpEnv } from "./context";
import { ApiError, fail, forbidden, notFound } from "./errors";

export interface Prepared {
	spec: RouteSpec;
	ctx: Ctx<RouteSpec>;
	principal: Principal;
	/** What the handler asked to be audited. */
	audit: { id: string | undefined; detail: Record<string, unknown>; skip: boolean };
	/** A dynamic route is answered only once its handler has asked `ctx.authorize`. */
	dynamic: { required: boolean; asked: boolean };
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

const VouchedEmail = z.string().trim().email().max(254).optional();

/** Who is calling. A bearer and a service key together are refused: one credential per call. */
async function authenticate(deps: Deps, c: Context<HttpEnv>): Promise<Principal> {
	const header = c.req.header("authorization");
	const key = c.req.header("x-service-key");
	if (header !== undefined && key !== undefined)
		throw fail("invalid_token", "one credential per call");
	if (header !== undefined) {
		const token = /^Bearer (.+)$/i.exec(header)?.[1];
		if (token === undefined) throw fail("invalid_token", "not a bearer token");
		const result = await timed("auth", () => deps.verifier.verify(token));
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
			...(result.verifiedEmail === undefined ? {} : { verifiedEmail: result.verifiedEmail }),
		};
	}
	if (key !== undefined) {
		const result = verifyServiceKey(key, deps.config.callers, deps.config.callerHashes);
		if (!result.ok) throw fail("invalid_token", "the service key was refused");
		const onBehalfOf = c.req.header("x-psi-subject");
		const named = onBehalfOf !== undefined && onBehalfOf !== "";
		// A site may vouch for its visitor's e-mail only together with naming the visitor.
		const vouched = VouchedEmail.safeParse(c.req.header("x-psi-verified-email"));
		return {
			kind: "service",
			callerId: result.callerId,
			app: result.app,
			...(named ? { onBehalfOf } : {}),
			...(named && vouched.success && vouched.data !== undefined
				? { verifiedEmail: vouched.data }
				: {}),
		};
	}
	throw fail("unauthenticated", "sign in or present a service key");
}

/** Everything before the handler: credential, side, app, membership, permission. Nothing is written here. */
export async function prepare(
	shared: Deps,
	spec: RouteSpec,
	c: Context<HttpEnv>,
): Promise<Prepared> {
	const requestId: string = c.get("requestId");
	// One request asks each authorization question once (a list asks it for every row): its own remembering view.
	const scoped = shared.access.forRequest();
	const deps: Deps = { ...shared, access: scoped.access, authz: scoped.authz };
	// Order matters: who is calling, then the path, then membership and permission, and only then the rest of the
	// input. A caller who may not do this learns nothing about what a valid request looks like.
	const principal = await authenticate(deps, c);
	// A console that is looking at the app as someone else is read-only: a write that says so is refused outright, so a
	// console that forgot to disable a button still cannot change anything. Only ending the view is allowed.
	if (
		c.req.header(VIEW_AS_HEADER) !== undefined &&
		spec.method !== "GET" &&
		spec.id !== "viewAs.stop" &&
		// What the real caller's own assistant turn used is metered whoever they are looking as: the budget must hold.
		spec.id !== "me.assistantUsage"
	)
		throw forbidden("viewing as someone else is read-only", { reason: "view_as_readonly" });
	const parsed: Parsed = { params: parseParams(spec, c), query: {}, body: {} };
	const subject = subjectOf(principal);
	const app = typeof parsed.params.app === "string" ? parsed.params.app : "";
	let reach: Reach = NONE;

	if (spec.side === "team") {
		if (principal.kind === "service") throw forbidden("service keys reach the visitor routes only");
		// An estate-administrator route on an app (view-as) is ALSO held to the app's membership checks below.
		if (spec.platform === true && !(await deps.access.isPlatformAdmin(subject)))
			throw forbidden("estate administrators only");
		if (app !== "") {
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
			} else if (target.kind === "dynamic") {
				// The question proper is the handler's (ctx.authorize, after it loads the row; `finish` refuses a handler that
				// did not ask). Here the caller must hold SOME candidate in this app, so a role with none learns nothing.
				let any = false;
				for (const key of target.candidates)
					if ((await deps.access.scopesHeld(subject, app, key)).length > 0) any = true;
				if (!any) throw forbidden("the role does not allow this", { permission: permission.key });
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
	const audit: Prepared["audit"] = { id: undefined, detail: {}, skip: false };
	const dynamic = { required: spec.permission?.target.kind === "dynamic", asked: false };
	const scopes = new Map<string, Promise<("all" | "assigned" | "own")[]>>();
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
		async scopesOf(key) {
			dynamic.asked = true;
			// Asked once per key and request: a list of notes asks it for every note, and each ask is OpenFGA checks.
			const held = scopes.get(key) ?? deps.access.scopesHeld(subject, app, key);
			scopes.set(key, held);
			return held;
		},
		async authorizeAny(keys, type, id) {
			dynamic.asked = true;
			const held: string[] = [];
			for (const key of keys)
				if (await deps.access.canOn(subject, app, key, type, id)) held.push(key);
			if (held.length === 0) throw notFound("object");
			return held;
		},
		async authorize(key, type, id) {
			dynamic.asked = true;
			if (!(await deps.access.canOn(subject, app, key, type, id))) throw notFound("object");
		},
		note(d) {
			audit.detail = { ...audit.detail, ...d };
		},
		auditTarget(id) {
			audit.id = id;
		},
		unchanged() {
			audit.skip = true;
		},
		auditNow: async (action, target, d) => {
			await writeAudit(deps, {
				app,
				actor: { subject, kind: principal.kind === "person" ? "person" : "service" },
				action,
				target,
				detail: d,
			});
			await tellOwners(deps, {
				app,
				requestId,
				subject,
				auditAction: action,
				targetType: target.type,
			});
		},
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
	return { spec, ctx, principal, audit, dynamic };
}

/** A dynamic route is answered only when its handler asked; a handler that forgot would be an open route. */
export function requireAsked(dynamic: Prepared["dynamic"]): void {
	if (dynamic.required && !dynamic.asked)
		throw fail("internal", "the route did not authorize itself");
}

/** The mutation's audit event, written once the handler succeeded. */
export async function finish(deps: Deps, prepared: Prepared, result: unknown): Promise<unknown> {
	const { spec, ctx, principal, audit } = prepared;
	try {
		requireAsked(prepared.dynamic);
	} catch (error) {
		deps.log({
			level: "error",
			event: "dynamic_route_not_authorized",
			requestId: ctx.requestId,
			route: spec.id,
		});
		throw error;
	}
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
	if (spec.audit !== undefined && !audit.skip) {
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
		await tellOwners(deps, {
			app: ctx.app,
			requestId: ctx.requestId,
			subject: ctx.subject,
			auditAction: spec.audit,
			targetType: spec.id.split(".")[0] ?? spec.id,
		});
	}
	return parsed.data;
}

/** The wrappers' refusal reasons as the contract's codes: the state forbids it (409), it is not there (404), or it is malformed (400). */
const CONFLICTS = new Set([
	"stale",
	"exists",
	"overlaps",
	"in_use",
	"already_deleted",
	"not_deleted",
	"recovery_expired",
	"not_allowed",
	"not_requested",
	"conflicts",
	"slot_taken",
	"warning",
	"blocked",
	"limit",
	"closed",
	"not_closed",
	"already_rated",
	"not_eligible",
]);
function refusedByStore(reason: string, detail: Readonly<Record<string, unknown>> = {}): ApiError {
	if (reason === "not_found") return notFound("object");
	return CONFLICTS.has(reason)
		? fail("conflict", "the store refused the change", { ...detail, reason })
		: fail("invalid", "the store refused the change", { ...detail, reason });
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
	if (error instanceof MailUnavailable) return make(fail("unavailable", "mail is unavailable"));
	if (error instanceof SsoUnavailable) {
		deps.log({ level: "error", event: "sso_unavailable", requestId });
		return make(fail("unavailable", "the sign-in is unavailable"));
	}
	if (error instanceof StoreRefused) return make(refusedByStore(error.reason, error.detail));
	if (error instanceof StoreUnavailable) {
		deps.log({ level: "error", event: "store_unavailable", requestId });
		return make(fail("unavailable", "the store is unavailable"));
	}
	if (error instanceof StoreConflict) return make(fail("conflict", "already exists"));
	if (error instanceof CryptoError) {
		// Clinical text that cannot be opened (a wrong master key, an app without keys, a damaged value): nothing is
		// returned in its place. The cause class is named; no key and no text ever is.
		deps.log({ level: "error", event: "crypto_failed", requestId, code: error.code });
		return make(fail("internal", `clinical data cannot be opened (${error.code})`));
	}
	deps.log({
		level: "error",
		event: "unhandled",
		requestId,
		name: error instanceof Error ? error.name : "unknown",
	});
	return make(fail("internal", "internal error"));
}

export const ROUTE_TABLE: ReadonlyArray<RouteSpec> = ROUTES;
