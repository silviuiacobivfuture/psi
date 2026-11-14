import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatBody, type FakeOpenRouter, startFakeOpenRouter } from "../../testing";
import { createStaffEngine } from "../engine";
import { confirmProposal } from "../execute";
import { FENCE_OPEN } from "../fence";
import { DISCOVERY_TOOLS } from "../parity/discovery";
import { fenceDeep, inputSchemaOf } from "../parity/generate";
import { baseKeys, NEEDS, offered } from "../parity/needs";
import { isParityRoute, type RouteLike } from "../parity/routes";
import { SESSION_KEY, type StaffSession } from "../session";
import {
	FAKE_NOW,
	FakeIssuesPort,
	FakeStaffPort,
	OWNER_PERMISSIONS,
	RECEPTION_PERMISSIONS,
	staffConfigWith,
} from "../testing";
import { STAFF_TOOL_IDS } from "../tool-ids";
import { staffTools } from "../tools";
import { call, opened, PAGED } from "./discovery-harness";
import { sessionFor } from "./helpers";
import { FIXTURE_ROUTES } from "./routes-fixture";

describe("one catalogue, from the service's table and the console's registry", () => {
	it("is generated from the table: team routes only, no platform, stream or upload handshake", () => {
		expect(FIXTURE_ROUTES.filter(isParityRoute).map((r) => r.id)).toEqual([
			"me.get",
			"clients.list",
			"clients.get",
			"clients.archive",
			"clients.remove",
			"requests.list",
			"records.get",
			"roles.list",
			"roles.update",
			"audit.list",
			"builder.put",
			"imports.list",
			"appointments.cancel",
		]);
	});
	it("an owner discovers every route of it and every action they hold, each pointing at the tool that uses it", async () => {
		const { ids, discover } = await opened(OWNER_PERMISSIONS);
		const all = await ids();
		expect(all).toEqual(
			expect.arrayContaining(FIXTURE_ROUTES.filter(isParityRoute).map((r) => r.id)),
		);
		expect(all).toEqual(
			expect.arrayContaining(["clients.addNote", "roles.edit", "reports.noShows"]),
		);
		const page = await discover({ query: "addNote" });
		expect(page.items[0]).toMatchObject({ id: "clients.addNote", use: "staffRunAction" });
		expect((await discover({ query: "clients get" })).items[0]).toMatchObject({
			use: DISCOVERY_TOOLS.call,
		});
	});
	it("a new route in the table is discoverable and callable with nothing else changed", async () => {
		const extra: RouteLike = {
			id: "widgets.list",
			method: "GET",
			path: "/v1/apps/:app/widgets",
			side: "team",
			summary: "Widgets",
			permission: { key: "widgets_view" },
		};
		const { ids, run, port } = await opened(["widgets_view"], {
			routes: [...FIXTURE_ROUTES, extra],
		});
		expect(await ids()).toContain("widgets.list");
		port.routeAnswers.set("widgets.list", [{ id: "w1" }]);
		expect(await run(DISCOVERY_TOOLS.call, call("widgets.list"))).toMatchObject({
			status: "ok",
			data: [{ id: "w1" }],
		});
	});
	it("takes the route's own fields as one input, minus the app, strictly", () => {
		const route = FIXTURE_ROUTES.find((r) => r.id === "appointments.cancel");
		if (route === undefined) throw new Error("fixture");
		const schema = inputSchemaOf(route);
		expect(Object.keys(schema.shape).sort()).toEqual(["id", "reason"]);
		expect(schema.safeParse({ id: "a1" }).success).toBe(true);
		expect(schema.safeParse({ id: "a1", app: "other" }).success).toBe(false);
		expect(schema.safeParse({}).success).toBe(false);
	});
	it("the model is handed three discovery tools, never one per route: the prompt stays small and stable", async () => {
		const { tools } = await opened(OWNER_PERMISSIONS);
		expect(tools).toEqual(expect.arrayContaining(Object.values(DISCOVERY_TOOLS)));
		expect(tools.filter((t) => t.startsWith("staffApi")).sort()).toEqual(
			Object.values(DISCOVERY_TOOLS).sort(),
		);
	});
});

describe("discovery lists only what the person may do", () => {
	const HIDDEN_FROM_RECEPTION = [
		"records.get",
		"roles.list",
		"roles.update",
		"audit.list",
		"builder.put",
		"imports.list",
		"clients.remove",
		"roles.edit",
	];
	it("Reception never discovers clinical, roles, audit, builder, import or delete routes", async () => {
		const all = await (await opened(RECEPTION_PERMISSIONS)).ids();
		expect(all).toEqual(
			expect.arrayContaining([
				"me.get",
				"clients.list",
				"clients.get",
				"clients.archive",
				"requests.list",
				"appointments.cancel",
			]),
		);
		for (const hidden of HIDDEN_FROM_RECEPTION) expect(all, hidden).not.toContain(hidden);
	});
	it("a route not discovered cannot be described or called, and nothing reaches the service", async () => {
		const { run, port } = await opened(RECEPTION_PERMISSIONS);
		for (const hidden of ["records.get", "roles.update", "clients.remove"]) {
			expect(await run(DISCOVERY_TOOLS.describe, { id: hidden })).toMatchObject({
				status: "refused",
				reason: "not_allowed",
			});
		}
		expect(await run(DISCOVERY_TOOLS.call, call("roles.update", { id: "r1" }))).toMatchObject({
			status: "refused",
			reason: "not_allowed",
		});
		expect(port.callsTo("callRoute")).toEqual([]);
		expect(port.writes()).toEqual([]);
	});
	it("scoped permissions count: clients_view_own discovers the client reads, not the archive", async () => {
		const all = await (await opened(["clients_view_own"])).ids();
		expect(all).toContain("clients.get");
		expect(all).not.toContain("clients.archive");
	});
	it("no capability: only their identity, and the tools that are a calculation", async () => {
		const { ids, tools } = await opened([]);
		expect(await ids()).toEqual(["me.get"]);
		expect(tools.sort()).toEqual(
			[
				"staffListActions",
				"staffResolveDate",
				"staffRunAction",
				...Object.values(DISCOVERY_TOOLS),
			].sort(),
		);
	});
	it("when the service cannot say what the person may do, no route is discovered", async () => {
		const { ids, run, port } = await opened(null);
		expect((await ids()).some((id) => FIXTURE_ROUTES.some((r) => r.id === id))).toBe(false);
		expect(await run(DISCOVERY_TOOLS.call, call("me.get"))).toMatchObject({
			status: "refused",
			reason: "not_allowed",
		});
		expect(port.callsTo("callRoute")).toEqual([]);
	});
	it("searches by words (accents and case aside), filters by area and kind, and pages by the configured size", async () => {
		const port = new FakeStaffPort();
		port.config = staffConfigWith({ pageSize: 5 });
		const { discover, ids } = await opened(OWNER_PERMISSIONS, { port });
		expect((await discover({ query: "ROLES" })).items.map((i) => i.id).sort()).toEqual([
			"roles.edit",
			"roles.list",
			"roles.update",
		]);
		expect(
			(await discover({ group: "clients", kind: "write" })).items.map((i) => i.id).sort(),
		).toEqual([
			"clients.addNote",
			"clients.archive",
			"clients.blacklist",
			"clients.remove",
			"files.upload",
		]);
		expect((await discover({ query: "nimic-așa ceva" })).items).toEqual([]);
		const first = await discover();
		expect(first.items).toHaveLength(5);
		expect(first.nextCursor).toBe("o5");
		const all = await ids();
		expect(new Set(all).size).toBe(all.length);
		expect(all.length).toBe(first.total);
		expect((await discover({ cursor: "o99999" })).items).toEqual([]);
	});
	it("marks the changes that destroy as such", async () => {
		const { discover } = await opened(OWNER_PERMISSIONS);
		const page = await discover({ group: "clients", kind: "write" });
		expect(page.items.find((i) => i.id === "clients.remove")?.destructive).toBe(true);
	});
	it("describes a route's inputs as a schema, with what is required", async () => {
		const { run } = await opened(OWNER_PERMISSIONS);
		const out = z
			.object({
				status: z.literal("ok"),
				kind: z.string(),
				input: z
					.object({
						required: z.array(z.string()).optional(),
						properties: z.record(z.string(), z.unknown()),
					})
					.passthrough(),
			})
			.parse(await run(DISCOVERY_TOOLS.describe, { id: "appointments.cancel" }));
		expect(out.kind).toBe("write");
		expect(Object.keys(out.input.properties).sort()).toEqual(["id", "reason"]);
		expect(out.input.required).toContain("id");
	});
	it("a skill that limits its tools narrows discovery and calls to them, and never widens", async () => {
		const { session, ids, run } = await opened(RECEPTION_PERMISSIONS);
		session.allow = new Set(["clients.list", "roles.update"]);
		expect(await ids()).toEqual(["clients.list"]);
		expect(await run(DISCOVERY_TOOLS.call, call("clients.get", { id: "c1" }))).toMatchObject({
			status: "refused",
			reason: "not_allowed",
		});
		expect(await run(DISCOVERY_TOOLS.call, call("roles.update", { id: "r1" }))).toMatchObject({
			status: "refused",
			reason: "not_allowed",
		});
	});
});

describe("a call runs as the person", () => {
	it("a read calls the route with the app added, fences free text and keeps structure", async () => {
		const { port, run } = await opened(OWNER_PERMISSIONS);
		port.routeAnswers.set("clients.get", {
			id: "c1",
			name: "Maria <b>Test</b>",
			createdAt: "2026-11-13T07:00:00Z",
			status: "current",
		});
		const out = await run(DISCOVERY_TOOLS.call, call("clients.get", { id: "c1" }));
		expect(port.callsTo("callRoute")[0]?.args).toEqual({
			routeId: "clients.get",
			input: { app: "psizone", id: "c1" },
		});
		expect(out).toMatchObject({
			status: "ok",
			truncated: false,
			cached: false,
			data: { id: "c1", status: "current", createdAt: "2026-11-13T07:00:00Z" },
		});
		expect(JSON.stringify(out)).toContain(`${FENCE_OPEN}Maria ‹b›Test‹/b›`);
	});
	it("an input the route does not take is refused before the service is asked", async () => {
		const { port, run } = await opened(OWNER_PERMISSIONS);
		expect(
			await run(DISCOVERY_TOOLS.call, call("clients.get", { id: "c1", app: "hemisync" })),
		).toMatchObject({ status: "refused", reason: "invalid" });
		expect(await run(DISCOVERY_TOOLS.call, call("clients.get", {}))).toMatchObject({
			status: "refused",
			reason: "invalid",
		});
		expect(port.callsTo("callRoute")).toEqual([]);
	});
	it("cuts long lists and says so", () => {
		const big = Array.from({ length: 90 }, (_, i) => ({ id: `c${i}`, name: "x y" }));
		expect((fenceDeep(big) as unknown[]).length).toBe(40);
		expect(fenceDeep("c1")).toBe("c1");
		expect(fenceDeep("a note with spaces")).toContain(FENCE_OPEN);
		expect(fenceDeep(5)).toBe(5);
	});
	it("a list the service does not page is paged and searched by the assistant", async () => {
		const port = new FakeStaffPort();
		port.config = staffConfigWith({ pageSize: 5 });
		port.routeAnswers.set(
			"clients.list",
			Array.from({ length: 12 }, (_, i) => ({
				id: `c${i}`,
				name: i === 7 ? "Ioana Popescu" : `Client ${i}`,
			})),
		);
		const { run } = await opened(OWNER_PERMISSIONS, { port });
		const first = z
			.object({ data: z.array(z.object({ id: z.string() })), nextCursor: z.string() })
			.parse(await run(DISCOVERY_TOOLS.call, call("clients.list")));
		expect(first.data.map((r) => r.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
		const last = z
			.object({ data: z.array(z.object({ id: z.string() })), nextCursor: z.string().optional() })
			.parse(await run(DISCOVERY_TOOLS.call, call("clients.list", {}, { cursor: "o10" })));
		expect(last.data.map((r) => r.id)).toEqual(["c10", "c11"]);
		expect(last.nextCursor).toBeUndefined();
		const found = await run(DISCOVERY_TOOLS.call, call("clients.list", {}, { search: "ioana" }));
		expect(found).toMatchObject({ data: [{ id: "c7" }] });
	});
	it("a list the service pages is asked at most the configured page size, its own cursor passed through", async () => {
		const port = new FakeStaffPort();
		port.config = staffConfigWith({ pageSize: 10 });
		port.routeAnswers.set("notes.list", { items: [{ id: "n1" }], nextCursor: "svc-2" });
		const { run } = await opened(OWNER_PERMISSIONS, { port, routes: [...FIXTURE_ROUTES, PAGED] });
		const out = await run(
			DISCOVERY_TOOLS.call,
			call("notes.list", { limit: 500 }, { cursor: "svc-1" }),
		);
		expect(port.callsTo("callRoute")[0]?.args).toEqual({
			routeId: "notes.list",
			input: { app: "psizone", limit: 10, cursor: "svc-1" },
		});
		expect(out).toMatchObject({ nextCursor: "svc-2" });
	});
	it("reading website requests taints the turn, so no change is prepared after it", async () => {
		const { session, run } = await opened(OWNER_PERMISSIONS);
		await run(DISCOVERY_TOOLS.call, call("requests.list"));
		expect(session.taint.stranger).toBe(true);
		expect(await run(DISCOVERY_TOOLS.call, call("clients.archive", { id: "c1" }))).toMatchObject({
			status: "refused",
			reason: "tainted",
		});
	});
	it("a write only prepares: destructive for a delete, executed by the confirmation with the stored input", async () => {
		const { port, session, run } = await opened(OWNER_PERMISSIONS);
		const del = z
			.object({ status: z.literal("needs_confirmation"), proposalId: z.string() })
			.parse(await run(DISCOVERY_TOOLS.call, call("clients.remove", { id: "c2" })));
		expect(session.cards.at(-1)).toMatchObject({ kind: "proposal", destructive: true });
		expect(port.callsTo("callRoute")).toEqual([]);
		expect((await confirmProposal(session, del.proposalId)).status).toBe("done");
		expect(port.callsTo("callRoute")).toEqual([
			{
				method: "callRoute",
				args: { routeId: "clients.remove", input: { app: "psizone", id: "c2" } },
			},
		]);
		expect((await confirmProposal(session, del.proposalId)).status).toBe("already_done");
		expect(port.callsTo("callRoute")).toHaveLength(1);
	});
	it("the service's refusal is explained, never retried around", async () => {
		const { port, run } = await opened(OWNER_PERMISSIONS);
		port.denied.add("route:clients.get");
		expect(await run(DISCOVERY_TOOLS.call, call("clients.get", { id: "c1" }))).toMatchObject({
			status: "refused",
			reason: "forbidden",
		});
		expect(await run(DISCOVERY_TOOLS.call, call("clients.get", { id: "c2" }))).toMatchObject({
			status: "refused",
			reason: "repeat",
		});
		expect(port.callsTo("callRoute")).toHaveLength(1);
	});
	it("a refusal at confirmation is final", async () => {
		const { port, session, run } = await opened(OWNER_PERMISSIONS);
		const out = z
			.object({ proposalId: z.string() })
			.parse(await run(DISCOVERY_TOOLS.call, call("appointments.cancel", { id: "a1" })));
		port.denied.add("route:appointments.cancel");
		expect((await confirmProposal(session, out.proposalId)).status).toBe("forbidden");
		expect(port.callsTo("callRoute")).toHaveLength(1);
	});
	it("the audit of every call holds ids only", async () => {
		const { port, run } = await opened(OWNER_PERMISSIONS);
		port.routeAnswers.set("clients.get", { name: "Maria Test" });
		await run(DISCOVERY_TOOLS.call, call("clients.get", { id: "c1" }));
		expect(JSON.stringify(port.audits)).not.toContain("Maria");
		expect(port.audits.at(-1)).toMatchObject({
			tool: DISCOVERY_TOOLS.call,
			phase: "read",
			outcome: "ok",
			subjects: ["c1"],
		});
	});
});

describe("needs", () => {
	it("every curated tool has a stated need, and a need is judged on base keys", () => {
		for (const [key, need] of Object.entries(NEEDS)) expect(need, key).toBeDefined();
		expect(offered({ any: ["a", "b"] }, baseKeys(["b_own"]))).toBe(true);
		expect(offered({ any: ["a", "b"] }, baseKeys(["c_own"]))).toBe(false);
		expect(offered({ all: ["a", "b"] }, baseKeys(["a"]))).toBe(false);
		expect(offered("open", baseKeys([]))).toBe(true);
		expect(offered({ all: ["a"] }, undefined)).toBe(true);
	});
	it("the site-issues tool also needs the log store", async () => {
		const owner = new FakeStaffPort();
		owner.permissions = OWNER_PERMISSIONS;
		const session: StaffSession = await sessionFor(owner, { routes: FIXTURE_ROUTES });
		session.caps = baseKeys(OWNER_PERMISSIONS);
		const tools = await staffTools({
			requestContext: new RequestContext([[SESSION_KEY, session]]),
		});
		expect(Object.keys(tools)).not.toContain("staffSiteIssues");
		const withIssues = await sessionFor(owner, {
			routes: FIXTURE_ROUTES,
			issues: new FakeIssuesPort(),
		});
		withIssues.caps = baseKeys(OWNER_PERMISSIONS);
		expect(
			Object.keys(
				await staffTools({ requestContext: new RequestContext([[SESSION_KEY, withIssues]]) }),
			),
		).toContain("staffSiteIssues");
	});
});

describe("the model is offered exactly what the person may use", () => {
	let fake: FakeOpenRouter | undefined;
	beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
	afterEach(async () => {
		vi.unstubAllEnvs();
		await fake?.close();
	});
	async function offeredToModel(permissions: ReadonlyArray<string>): Promise<Array<string>> {
		fake = await startFakeOpenRouter(
			[{ kind: "text", chunks: ["Hi."] }],
			{},
			{ autoSearch: false },
		);
		const engine = createStaffEngine({
			model: { id: "fake/model", apiKey: "k", baseURL: fake.baseURL },
			now: () => FAKE_NOW,
			routes: FIXTURE_ROUTES,
			issues: new FakeIssuesPort(),
		});
		const port = new FakeStaffPort();
		port.permissions = permissions;
		for await (const _ of engine.chat(port, { message: "hi" })) void _;
		return chatBody(fake.requests[0]).tools?.map((t) => t.function.name) ?? [];
	}
	it("a Reception user's agent never sees clinical or owner tools, and no route by name", async () => {
		const names = await offeredToModel(RECEPTION_PERMISSIONS);
		for (const hidden of ["staffSearchNotes", "staffSiteIssues", "staffActivity"])
			expect(names).not.toContain(hidden);
		expect(names).toEqual(expect.arrayContaining(Object.values(DISCOVERY_TOOLS)));
	});
	it("an owner's holds the owner tools, and nothing but staff tools", async () => {
		const names = await offeredToModel(OWNER_PERMISSIONS);
		for (const id of ["staffSiteIssues", "staffActivity", "staffSearchNotes"])
			expect(names).toContain(id);
		expect(
			names.every(
				(n) => STAFF_TOOL_IDS.includes(n) || Object.values<string>(DISCOVERY_TOOLS).includes(n),
			),
		).toBe(true);
	});
});
