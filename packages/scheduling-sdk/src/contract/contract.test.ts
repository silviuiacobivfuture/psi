import { describe, expect, it } from "vitest";
import { buildOpenApi, ERROR_STATUS, ROUTES, type RouteSpec } from "./index";

const ALL: ReadonlyArray<RouteSpec> = ROUTES;

/** Team mutations that write no audit row, each with why. */
const UNAUDITED: Readonly<Record<string, string>> = {
	"me.assistantUsage":
		"metering only: it adds to counters the meters show, changes nothing a person made, and one journal row per assistant turn would drown the journal",
};

describe("the route table", () => {
	it("has unique ids and unique method+path pairs", () => {
		expect(new Set(ALL.map((r) => r.id)).size).toBe(ALL.length);
		expect(new Set(ALL.map((r) => `${r.method} ${r.path}`)).size).toBe(ALL.length);
	});

	it("flattens into one input: params, query and body never share a key", () => {
		for (const r of ALL) {
			const keys = [
				...Object.keys(r.params?.shape ?? {}),
				...Object.keys(r.query?.shape ?? {}),
				...Object.keys(r.body?.shape ?? {}),
			];
			expect(new Set(keys).size, r.id).toBe(keys.length);
		}
	});

	it("names every path parameter in its params schema, and nothing else", () => {
		for (const r of ALL) {
			const inPath = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]).sort();
			expect(Object.keys(r.params?.shape ?? {}).sort(), r.id).toEqual(inPath);
		}
	});

	it("authorizes every team route (permission, or platform/me) and no visitor or meta route has a permission", () => {
		for (const r of ALL) {
			if (r.side === "team")
				expect(
					r.permission !== undefined ||
						r.platform === true ||
						r.id === "me.get" ||
						r.id === "me.capabilities" ||
						// The caller's own assistant: what governs their next turn, and what their turn used (membership only).
						r.id === "me.assistant" ||
						r.id === "me.assistantUsage",
					r.id,
				).toBe(true);
			else expect(r.permission, r.id).toBeUndefined();
		}
	});

	it("audits every mutation of the team side", () => {
		for (const r of ALL.filter(
			(x) => x.side === "team" && x.method !== "GET" && !(x.id in UNAUDITED),
		))
			expect(r.audit, r.id).toBeDefined();
	});

	it("leaves a team mutation unaudited only with its reason, and only one that exists", () => {
		const ids = new Set<string>(ALL.map((r) => r.id));
		for (const [id, why] of Object.entries(UNAUDITED)) {
			expect(ids.has(id), id).toBe(true);
			expect(why.length, id).toBeGreaterThan(20);
		}
	});

	it("keeps every route under /v1 except the meta health probe", () => {
		for (const r of ALL)
			expect(r.path.startsWith("/v1/") || r.id === "meta.health", r.id).toBe(true);
	});

	it("only the stream is a stream, and only meta routes may be public", () => {
		expect(
			ALL.filter((r) => r.stream === true)
				.map((r) => r.id)
				.sort(),
		).toEqual(["calendar.stream", "inbox.stream", "requests.stream"]);
		expect(
			ALL.filter((r) => r.publicReason !== undefined)
				.map((r) => r.id)
				.sort(),
		).toEqual(["meta.health", "meta.openapi"]);
	});

	it("gives every refusal code one status", () => {
		for (const status of Object.values(ERROR_STATUS)) expect(status).toBeGreaterThanOrEqual(400);
	});
});

describe("the OpenAPI document", () => {
	const doc = buildOpenApi(ALL, { title: "t", version: "1" });
	const paths = doc.paths as Record<
		string,
		Record<
			string,
			{ operationId: string; parameters: unknown[]; requestBody?: unknown; security: unknown[] }
		>
	>;

	it("has an operation per route, with the path in braces", () => {
		const ids = Object.values(paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
		expect(ids.sort()).toEqual(ALL.map((r) => r.id).sort());
		expect(paths["/v1/apps/{app}/clients/{id}"]?.patch?.operationId).toBe("clients.update");
	});

	it("derives parameters and bodies from the schemas", () => {
		const slots = paths["/v1/apps/{app}/book/slots"]?.get;
		expect(slots?.parameters).toContainEqual(
			expect.objectContaining({ name: "service", in: "query", required: true }),
		);
		expect(slots?.parameters).toContainEqual(
			expect.objectContaining({ name: "app", in: "path", required: true }),
		);
		expect(paths["/v1/apps/{app}/clients"]?.post?.requestBody).toBeDefined();
	});

	it("marks who may call: visitor routes take a service key, team routes do not", () => {
		expect(paths["/v1/apps/{app}/book/holds"]?.post?.security).toContainEqual({ serviceKey: [] });
		expect(paths["/v1/apps/{app}/clients"]?.get?.security).toEqual([{ bearerAuth: [] }]);
		expect(paths["/health"]?.get?.security).toEqual([]);
	});
});
