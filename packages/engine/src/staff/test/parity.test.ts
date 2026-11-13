import { RequestContext } from "@mastra/core/request-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatBody, type FakeOpenRouter, startFakeOpenRouter } from "../../testing";
import { createStaffEngine } from "../engine";
import { confirmProposal } from "../execute";
import { FENCE_OPEN } from "../fence";
import { fenceDeep, inputSchemaOf } from "../parity/generate";
import { baseKeys, NEEDS, offered } from "../parity/needs";
import { isParityRoute, parityToolId } from "../parity/routes";
import { SESSION_KEY } from "../session";
import {
	FAKE_NOW,
	FakeIssuesPort,
	FakeStaffPort,
	OWNER_PERMISSIONS,
	RECEPTION_PERMISSIONS,
} from "../testing";
import { STAFF_TOOL_IDS } from "../tool-ids";
import { staffTools } from "../tools";
import { sessionFor } from "./helpers";
import { FIXTURE_ROUTES } from "./routes-fixture";

async function offeredTo(port: FakeStaffPort, withIssues = false): Promise<Array<string>> {
	const session = await sessionFor(port, {
		routes: FIXTURE_ROUTES,
		...(withIssues ? { issues: new FakeIssuesPort() } : {}),
	});
	const caps = await session.port.capabilities();
	session.caps = caps.ok ? baseKeys(caps.value.permissions) : undefined;
	const tools = await staffTools({ requestContext: new RequestContext([[SESSION_KEY, session]]) });
	return Object.keys(tools);
}

describe("a tool for every route the console can use", () => {
	it("is generated from the table: team routes only, no platform, stream or upload handshake", () => {
		const generated = FIXTURE_ROUTES.filter(isParityRoute).map((r) => r.id);
		expect(generated).toEqual([
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
		expect(
			parityToolId({
				id: "clients.archive",
				method: "POST",
				path: "/x",
				side: "team",
				summary: "x",
			}),
		).toBe("staffApiClientsArchive");
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

	it("a new route in the table becomes a tool with nothing else changed", async () => {
		const extra = {
			id: "widgets.list",
			method: "GET",
			path: "/v1/apps/:app/widgets",
			side: "team",
			summary: "Widgets",
			permission: { key: "widgets_view" },
		} as const;
		const session = await sessionFor(new FakeStaffPort(), { routes: [...FIXTURE_ROUTES, extra] });
		session.caps = baseKeys(["widgets_view"]);
		const tools = await staffTools({
			requestContext: new RequestContext([[SESSION_KEY, session]]),
		});
		expect(Object.keys(tools)).toContain("staffApiWidgetsList");
	});
});

describe("capability filtering: a tool the person cannot use is not offered", () => {
	it("Reception never sees clinical, roles, audit, builder, import or delete tools", async () => {
		const names = await offeredTo(new FakeStaffPort());
		const api = names.filter((n) => n.startsWith("staffApi"));
		expect(api).toEqual(
			expect.arrayContaining([
				"staffApiMeGet",
				"staffApiClientsList",
				"staffApiClientsGet",
				"staffApiClientsArchive",
				"staffApiRequestsList",
				"staffApiAppointmentsCancel",
			]),
		);
		for (const hidden of [
			"staffApiRecordsGet",
			"staffApiRolesList",
			"staffApiRolesUpdate",
			"staffApiAuditList",
			"staffApiBuilderPut",
			"staffApiImportsList",
			"staffApiClientsRemove",
		]) {
			expect(names, hidden).not.toContain(hidden);
		}
		expect(names).not.toContain("staffSearchNotes");
		expect(names).not.toContain("staffActivity");
		expect(names).not.toContain("staffSiteIssues");
		expect(names).toContain("staffAgenda");
	});

	it("an owner is offered all of them", async () => {
		const port = new FakeStaffPort();
		port.permissions = OWNER_PERMISSIONS;
		const names = await offeredTo(port, true);
		for (const id of [
			"staffApiRecordsGet",
			"staffApiRolesList",
			"staffApiAuditList",
			"staffApiBuilderPut",
			"staffApiImportsList",
			"staffApiClientsRemove",
			"staffSearchNotes",
			"staffActivity",
			"staffSiteIssues",
		])
			expect(names, id).toContain(id);
	});

	it("scoped permissions count: clients_view_own offers the client tools", async () => {
		const port = new FakeStaffPort();
		port.permissions = ["clients_view_own"];
		const names = await offeredTo(port);
		expect(names).toContain("staffApiClientsGet");
		expect(names).toContain("staffFindClient");
		expect(names).not.toContain("staffApiClientsArchive");
		expect(names).not.toContain("staffAgenda");
	});

	it("a person with no capability gets only the calculation and their identity", async () => {
		const port = new FakeStaffPort();
		port.permissions = [];
		const names = await offeredTo(port);
		expect(names.sort()).toEqual(["staffApiMeGet", "staffResolveDate"]);
	});

	it("when the service cannot say what the person may do, no generated tool is offered", async () => {
		const port = new FakeStaffPort();
		port.permissions = null;
		const names = await offeredTo(port);
		expect(names.some((n) => n.startsWith("staffApi"))).toBe(false);
		expect(names).toContain("staffAgenda");
	});

	it("the site-issues tool also needs the log store", async () => {
		const port = new FakeStaffPort();
		port.permissions = OWNER_PERMISSIONS;
		expect(await offeredTo(port, false)).not.toContain("staffSiteIssues");
		const reception = new FakeStaffPort();
		expect(await offeredTo(reception, true)).not.toContain("staffSiteIssues");
	});

	it("every curated tool has a stated need, and a need is judged on base keys", () => {
		for (const [key, need] of Object.entries(NEEDS)) expect(need, key).toBeDefined();
		expect(offered({ any: ["a", "b"] }, baseKeys(["b_own"]))).toBe(true);
		expect(offered({ any: ["a", "b"] }, baseKeys(["c_own"]))).toBe(false);
		expect(offered({ any: ["a", "b"] }, baseKeys(["b"]))).toBe(true);
		expect(offered({ all: ["a", "b"] }, baseKeys(["a"]))).toBe(false);
		expect(offered("open", baseKeys([]))).toBe(true);
		expect(offered({ all: ["a"] }, undefined)).toBe(true);
	});
});

describe("generated tools run as the person", () => {
	async function owner() {
		const port = new FakeStaffPort();
		port.permissions = OWNER_PERMISSIONS;
		const session = await sessionFor(port, { routes: FIXTURE_ROUTES });
		const caps = await session.port.capabilities();
		session.caps = caps.ok ? baseKeys(caps.value.permissions) : undefined;
		const tools = await staffTools({
			requestContext: new RequestContext([[SESSION_KEY, session]]),
		});
		const run = async (id: string, input: Record<string, unknown>) => {
			const tool = tools[id];
			if (tool === undefined || !("execute" in tool) || typeof tool.execute !== "function")
				throw new Error(`no ${id}`);
			return tool.execute(input, {});
		};
		return { port, session, run };
	}

	it("a read calls the route with the app added, fences free text and keeps structure", async () => {
		const { port, run } = await owner();
		port.routeAnswers.set("clients.get", {
			id: "c1",
			name: "Maria <b>Test</b>",
			createdAt: "2026-11-13T07:00:00Z",
			status: "current",
		});
		const out = await run("staffApiClientsGet", { id: "c1" });
		expect(port.callsTo("callRoute")[0]?.args).toEqual({
			routeId: "clients.get",
			input: { app: "psizone", id: "c1" },
		});
		expect(out).toMatchObject({
			status: "ok",
			truncated: false,
			data: { id: "c1", status: "current", createdAt: "2026-11-13T07:00:00Z" },
		});
		expect(JSON.stringify(out)).toContain(`${FENCE_OPEN}Maria ‹b›Test‹/b›`);
	});

	it("cuts long lists and says so", () => {
		const big = Array.from({ length: 90 }, (_, i) => ({ id: `c${i}`, name: "x y" }));
		expect((fenceDeep(big) as unknown[]).length).toBe(40);
		expect(fenceDeep("c1")).toBe("c1");
		expect(fenceDeep("a note with spaces")).toContain(FENCE_OPEN);
		expect(fenceDeep(5)).toBe(5);
	});

	it("reading website requests taints the turn, so no change is prepared after it", async () => {
		const { session, run } = await owner();
		await run("staffApiRequestsList", {});
		expect(session.taint.stranger).toBe(true);
		expect(await run("staffApiClientsArchive", { id: "c1" })).toMatchObject({
			status: "refused",
			reason: "tainted",
		});
	});

	it("a write only prepares: destructive for a delete, executed by the confirmation with the stored input", async () => {
		const { port, session, run } = await owner();
		const del = await run("staffApiClientsRemove", { id: "c2" });
		expect(del).toMatchObject({ status: "needs_confirmation" });
		expect(session.cards.at(-1)).toMatchObject({ kind: "proposal", destructive: true });
		expect(port.callsTo("callRoute")).toEqual([]);
		const id = String((del as { proposalId: string }).proposalId);
		const done = await confirmProposal(session, id);
		expect(done.status).toBe("done");
		expect(port.callsTo("callRoute")).toHaveLength(1);
		expect(port.callsTo("callRoute")[0]?.args).toEqual({
			routeId: "clients.remove",
			input: { app: "psizone", id: "c2" },
		});
		expect((await confirmProposal(session, id)).status).toBe("already_done");
		expect(port.callsTo("callRoute")).toHaveLength(1);
	});

	it("the service's refusal is explained, never retried around", async () => {
		const { port, run } = await owner();
		port.denied.add("route:clients.get");
		expect(await run("staffApiClientsGet", { id: "c1" })).toMatchObject({
			status: "refused",
			reason: "forbidden",
		});
		expect(await run("staffApiClientsGet", { id: "c2" })).toMatchObject({
			status: "refused",
			reason: "repeat",
		});
		expect(port.callsTo("callRoute")).toHaveLength(1);
	});

	it("a refusal at confirmation is final", async () => {
		const { port, session, run } = await owner();
		const out = await run("staffApiAppointmentsCancel", { id: "a1" });
		port.denied.add("route:appointments.cancel");
		const done = await confirmProposal(session, String((out as { proposalId: string }).proposalId));
		expect(done.status).toBe("forbidden");
		expect(port.callsTo("callRoute")).toHaveLength(1);
	});

	it("the audit of every call holds ids only", async () => {
		const { port, run } = await owner();
		port.routeAnswers.set("clients.get", { name: "Maria Test" });
		await run("staffApiClientsGet", { id: "c1" });
		expect(JSON.stringify(port.audits)).not.toContain("Maria");
		expect(port.audits.at(-1)).toMatchObject({
			tool: "staffApiClientsGet",
			phase: "read",
			outcome: "ok",
			subjects: ["c1"],
		});
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

	it("a Reception user's agent never sees clinical or roles tools", async () => {
		const names = await offeredToModel(RECEPTION_PERMISSIONS);
		expect(names).toContain("staffApiClientsList");
		for (const hidden of [
			"staffApiRecordsGet",
			"staffApiRolesList",
			"staffApiRolesUpdate",
			"staffApiAuditList",
			"staffApiBuilderPut",
			"staffSiteIssues",
			"staffActivity",
		])
			expect(names).not.toContain(hidden);
	});

	it("an owner's sees them all", async () => {
		const names = await offeredToModel(OWNER_PERMISSIONS);
		for (const id of [
			"staffApiRecordsGet",
			"staffApiRolesList",
			"staffApiAuditList",
			"staffSiteIssues",
			"staffActivity",
		])
			expect(names).toContain(id);
		expect(names.filter((n) => STAFF_TOOL_IDS.includes(n) || n.startsWith("staffApi")).length).toBe(
			names.length,
		);
	});
});
