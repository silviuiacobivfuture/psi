import { ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthzUnavailable } from "./authz/port";
import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const SPECS = (ROUTES as ReadonlyArray<RouteSpec>).filter((r) => r.side !== "meta");
const TEAM = SPECS.filter((r) => r.side === "team");
const VISITOR = SPECS.filter((r) => r.side === "visitor");

/** Valid-looking path values: refusals happen before any lookup, so none of them needs to exist. */
const PARAMS: Record<string, string> = {
	app: "psizone",
	id: "x00000000001",
	subject: "someone",
	appointmentId: "x00000000002",
	seriesId: "x00000000004",
	report: "appointments",
	reference: "ABCD-EFGH",
	date: "2026-11-14",
	kind: "forms",
};
const pathOf = (spec: RouteSpec, app = "psizone"): string =>
	spec.path.replace(/:(\w+)/g, (_m, name: string) =>
		name === "app" ? app : (PARAMS[name] ?? "x"),
	);
/** The two routes whose permission target is named in the body need one to get as far as the check. */
const BODIES: Record<string, unknown> = {
	"appointments.create": { practitionerId: "x00000000003", start: 1, end: 2 },
	"series.create": {
		practitionerId: "x00000000003",
		start: 1,
		end: 2,
		recurrence: { count: 2 },
	},
	"leave.create": { personId: "x00000000003", from: "2026-12-01", to: "2026-12-02", kind: "co" },
};
const bodyOf = (spec: RouteSpec): unknown =>
	BODIES[spec.id] ?? (spec.body === undefined ? undefined : {});
const JSON_METHODS = new Set(["POST", "PUT", "PATCH"]);

const factories = await worldFactories();

describe.each(factories)("on the $name store", (factory) => {
	let w: Populated;
	beforeAll(async () => {
		w = await factory.create();
		// A member with no role at all: signed in, in the app, allowed nothing.
		await w.call("olga", "PUT", "/v1/apps/psizone/members/blank", {
			displayName: "Blank",
			roles: [],
			coordinates: [],
		});
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	/** Runs a refusing call and asserts it changed nothing anywhere: rows, change feed, audit, tuples, mail, signed links, notifications. */
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<void> {
		const before = await w.fingerprint();
		const reply = await run();
		expect({
			status: reply.status,
			code: (reply.json.error as { code?: string } | undefined)?.code,
		}).toEqual({ status, code });
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
	}

	describe("every team route refuses, and writes nothing", () => {
		for (const spec of TEAM) {
			const call = (as: string | null, options?: Parameters<Populated["call"]>[4]) =>
				w.call(
					as,
					spec.method,
					pathOf(spec),
					JSON_METHODS.has(spec.method) ? bodyOf(spec) : undefined,
					options,
				);
			describe(spec.id, () => {
				it("unauthenticated", () => refused(() => call(null), 401, "unauthenticated"));
				it("an expired token", () =>
					refused(() => call("olga", { mint: { expiresIn: -60 } }), 401, "invalid_token"));
				it("a token for another audience", () =>
					refused(() => call("olga", { mint: { audience: "cms" } }), 401, "invalid_token"));
				it("a token from an issuer the service does not know", () =>
					refused(
						() => call("olga", { mint: { issuer: "https://elsewhere.test/" } }),
						401,
						"invalid_token",
					));
				it("a token signed with another key", () =>
					refused(() => call("olga", { mint: { foreignKey: true } }), 401, "invalid_token"));
				it("a service key on a team route", () =>
					refused(
						() =>
							w.callKey(
								"psizone-web",
								spec.method,
								pathOf(spec),
								JSON_METHODS.has(spec.method) ? bodyOf(spec) : undefined,
							),
						403,
						"forbidden",
					));
				if (spec.platform === true) {
					it("a signed-in person who is not an estate administrator", () =>
						refused(() => call("olga"), 403, "forbidden"));
					return;
				}
				if (spec.id === "me.get" || spec.id === "me.capabilities") return;
				it("a member of another app is told the app is not there", () =>
					refused(() => call("hugo"), 404, "not_found"));
				it("a stranger is told the app is not there", () =>
					refused(() => call("mallory"), 404, "not_found"));
				// The routes about oneself (what governs my assistant's turn and what it used, how I want to be told) and the
				// roles every member may compare need membership and nothing more: there is no permission to lack.
				if (spec.permission === undefined) {
					it("is the caller's own or every member's, and needs no permission past membership", () =>
						expect([
							"me.assistant",
							"me.assistantUsage",
							"me.notifications",
							"me.notificationsSave",
							"roles.summary",
						]).toContain(spec.id));
					return;
				}
				it("a role that lacks the permission", () => {
					// An object the caller cannot reach is "not found" (no leak); a dynamic route first asks for ANY candidate.
					const target = spec.permission?.target.kind;
					return refused(
						() => call("blank"),
						target === "object" ? 404 : 403,
						target === "object" ? "not_found" : "forbidden",
					);
				});
			});
		}
	});

	describe("view-as is read-only", () => {
		// The estate administrator browses as another member with `x-psi-view-as`: nothing sent that way may write.
		// Ending the view is the one write allowed while viewing as someone else.
		for (const spec of TEAM.filter(
			(r) =>
				r.method !== "GET" &&
				r.platform !== true &&
				r.id !== "viewAs.stop" &&
				r.id !== "me.assistantUsage",
		)) {
			it(`${spec.id}: a write with the view-as header is refused and writes nothing`, () =>
				refused(
					() =>
						w.call("olga", spec.method, pathOf(spec), bodyOf(spec), {
							headers: { "x-psi-view-as": "rita" },
						}),
					403,
					"forbidden",
				));
		}
		it("the refusal names its reason", async () => {
			const r = await w.call(
				"olga",
				"POST",
				"/v1/apps/psizone/rooms",
				{ name: "X", kind: "y" },
				{
					headers: { "x-psi-view-as": "rita" },
				},
			);
			expect(r.json.error).toMatchObject({ detail: { reason: "view_as_readonly" } });
		});
	});

	describe("every visitor route refuses, and writes nothing", () => {
		for (const spec of VISITOR) {
			const body = spec.body === undefined || !JSON_METHODS.has(spec.method) ? undefined : {};
			it(`${spec.id}: unauthenticated`, () =>
				refused(() => w.call(null, spec.method, pathOf(spec), body), 401, "unauthenticated"));
			it(`${spec.id}: a wrong service key`, () =>
				refused(
					() =>
						w.call(null, spec.method, pathOf(spec), body, {
							headers: { "x-service-key": "psizone-web.not-the-secret" },
						}),
					401,
					"invalid_token",
				));
			it(`${spec.id}: an unknown caller`, () =>
				refused(
					() =>
						w.call(null, spec.method, pathOf(spec), body, {
							headers: { "x-service-key": "ghost.psizone-web-secret-0001" },
						}),
					401,
					"invalid_token",
				));
			it(`${spec.id}: another app's key`, () =>
				refused(
					() => w.callKey("hemisync-web", spec.method, pathOf(spec), body),
					403,
					"forbidden",
				));
			it(`${spec.id}: an expired token`, () =>
				refused(
					() => w.call("rita", spec.method, pathOf(spec), body, { mint: { expiresIn: -60 } }),
					401,
					"invalid_token",
				));
			it(`${spec.id}: an app that does not exist`, () =>
				refused(
					() => w.call("rita", spec.method, pathOf(spec, "nowhere"), body),
					404,
					"not_found",
				));
		}

		it("a bearer and a service key together are one credential too many", () =>
			refused(
				async () =>
					w.call("rita", "GET", "/v1/apps/psizone/book/services", undefined, {
						headers: { "x-service-key": "psizone-web.psizone-web-secret-0001" },
					}),
				401,
				"invalid_token",
			));

		it("a suspended app is not bookable", async () => {
			await w.call("root", "PATCH", "/v1/apps/hemisync", { status: "suspended" });
			await refused(
				() => w.callKey("hemisync-web", "GET", "/v1/apps/hemisync/book/services"),
				404,
				"not_found",
			);
			await w.call("root", "PATCH", "/v1/apps/hemisync", { status: "active" });
		});
	});

	describe("input is checked after who is asking, and says which field, never its value", () => {
		it("a permitted caller sending a bad body is told the field", async () => {
			const reply = await w.call("olga", "POST", "/v1/apps/psizone/clients", {
				name: "",
				secret: "do-not-echo",
			});
			expect(reply.status).toBe(400);
			expect(JSON.stringify(reply.json)).not.toContain("do-not-echo");
			expect((reply.json.error as { detail: { fields: string[] } }).detail.fields).toContain(
				"name",
			);
		});

		it("a bad path value is a 400 for a signed-in caller", async () => {
			expect((await w.call("olga", "GET", "/v1/apps/psizone/clients/!")).status).toBe(400);
		});

		it("a body that is not JSON is a 400", async () => {
			const res = await w.app.request("/v1/apps/psizone/clients", {
				method: "POST",
				headers: {
					authorization: `Bearer ${await w.issuer.mint("olga")}`,
					"content-type": "application/json",
				},
				body: "{not json",
			});
			expect(res.status).toBe(400);
		});

		it("an unknown route is a contract-shaped 404", async () => {
			const reply = await w.call("olga", "GET", "/v1/nothing");
			expect(reply.status).toBe(404);
			expect(reply.json.error).toMatchObject({ code: "not_found" });
		});

		it("an oversized body is refused before it is read", async () => {
			const res = await w.app.request("/v1/apps/psizone/clients", {
				method: "POST",
				headers: { "content-length": "2000000", authorization: "Bearer x" },
				body: "{}",
			});
			expect(res.status).toBe(413);
		});
	});

	describe("authorization fails closed", () => {
		it("an OpenFGA outage is a 503 and nothing is written", async () => {
			const real = w.deps.authz.check;
			w.deps.authz.check = () => Promise.reject(new AuthzUnavailable("down"));
			try {
				await refused(
					() => w.call("olga", "POST", "/v1/apps/psizone/clients", { name: "Never Written" }),
					503,
					"unavailable",
				);
			} finally {
				w.deps.authz.check = real;
			}
		});

		it("a response that breaks the contract is a 500 the caller cannot read into", async () => {
			const real = w.deps.store.c.rooms.list;
			w.deps.store.c.rooms.list = () => Promise.resolve([{ id: "x" } as never]);
			try {
				const reply = await w.call("olga", "GET", "/v1/apps/psizone/rooms");
				expect(reply.status).toBe(500);
				expect(JSON.stringify(reply.json)).not.toContain('"x"');
			} finally {
				w.deps.store.c.rooms.list = real;
			}
		});
	});
});
