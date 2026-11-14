import {
	createStaffEngine,
	DISCOVERY_TOOLS,
	type StaffEvent,
	type StaffPort,
} from "@psi/engine/staff";
import { startFakeOpenRouter } from "@psi/engine/testing";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { ROUTES } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ViewAsTarget } from "../port/port";
import { createSdkPort } from "../port/sdk";
import { createStaffPort } from "./staff-port";

/**
 * The assistant acts strictly as the signed-in person: the console's real SDK port with THEIR token, the real service,
 * its real authorization. Each role asks the assistant for a change only an Owner may make (a new role) and a read
 * only some may make (the journal); what the assistant may not do is refused, and the service holds exactly what it
 * held before.
 */
let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
	vi.stubEnv("OPENROUTER_API_KEY", "");
});
afterAll(async () => {
	vi.unstubAllEnvs();
	await api.close();
});

async function staffAs(subject: string, viewAs?: ViewAsTarget): Promise<StaffPort> {
	const port = createSdkPort({
		baseUrl: api.url,
		bearer: () => api.tokenFor(subject),
		...(viewAs === undefined ? {} : { viewAs }),
	});
	const me = await port.capabilities(subject, "psizone").catch(() => undefined);
	return createStaffPort({
		port,
		app: "psizone",
		appName: "Psizone",
		person: { subject, name: subject, email: null },
		roles: me?.roles ?? [],
		permissions: Object.keys(me?.permissions ?? {}),
		readOnly: viewAs !== undefined,
		locale: "ro",
	});
}

/**
 * The roles the service holds and the journal of their changes: what a refused "make a role" must leave as it was. (A turn
 * itself writes its meters and its own journal lines of what was asked and refused; those are not the change.)
 */
const rolesHeld = async (): Promise<string> =>
	JSON.stringify([
		(await api.world.call("olga", "GET", "/v1/apps/psizone/roles")).json,
		(await api.world.call("olga", "GET", "/v1/apps/psizone/audit?action=role.create")).json,
	]);

const NEW_ROLE = { id: "roles.create", input: { name: "Rol propus de asistent" } };

/** One turn in which the model asks for the new role, then (when a card was made) the person's Confirm. */
async function askForRole(port: StaffPort): Promise<{ events: StaffEvent[]; confirmed?: string }> {
	const fake = await startFakeOpenRouter(
		[
			{ kind: "tool", query: "", tool: DISCOVERY_TOOLS.call, input: NEW_ROLE },
			{ kind: "text", chunks: ["Gata."] },
		],
		{},
		{ autoSearch: false },
	);
	try {
		const engine = createStaffEngine({
			model: { id: "fake/model", apiKey: "k", baseURL: fake.baseURL },
			routes: ROUTES,
		});
		const events: StaffEvent[] = [];
		for await (const e of engine.chat(port, { message: "Fă un rol nou" })) events.push(e);
		const card = events.find((e) => e.type === "card" && e.card.kind === "proposal");
		if (card === undefined || card.type !== "card" || card.card.kind !== "proposal")
			return { events };
		const outcome = await engine.confirm(port, card.card.proposalId);
		return { events, confirmed: outcome.status };
	} finally {
		await fake.close();
	}
}

const refusedTool = (events: ReadonlyArray<StaffEvent>): boolean =>
	events.some((e) => e.type === "tool" && e.tool === DISCOVERY_TOOLS.call && e.phase === "refused");

describe("the assistant can do exactly what the person can, per role, over the real service", () => {
	it("the Owner's new role is prepared, confirmed and made: the assistant does what the screens do", async () => {
		const before = await api.world.fingerprint();
		const { confirmed } = await askForRole(await staffAs("olga"));
		expect(confirmed).toBe("done");
		expect(await api.world.fingerprint()).not.toBe(before);
	});

	it.each([
		["Reception", "rita"],
		["Therapist", "dora"],
		["Accountant", "ana"],
		["Volunteer", "vera"],
	])("%s may not make a role: the assistant refuses, prepares nothing, writes nothing", async (_role, who) => {
		const port = await staffAs(who);
		const before = await rolesHeld();
		const { events, confirmed } = await askForRole(port);
		expect(refusedTool(events)).toBe(true);
		expect(confirmed).toBeUndefined();
		expect(await rolesHeld()).toBe(before);
	});

	it.each([
		["Reception", "rita"],
		["Therapist", "dora"],
		["Accountant", "ana"],
		["Volunteer", "vera"],
	])("%s: even a call that skips the assistant's own filter is refused by the service, nothing written", async (_role, who) => {
		const port = await staffAs(who);
		const before = await api.world.fingerprint();
		const answer = await port.callRoute({ routeId: "roles.create", input: NEW_ROLE.input });
		expect(answer).toEqual({ ok: false, reason: "forbidden" });
		expect(await api.world.fingerprint()).toBe(before);
	});

	it("reads follow the person too: the journal is the Owner's, not Reception's", async () => {
		expect((await (await staffAs("olga")).callRoute({ routeId: "audit.list", input: {} })).ok).toBe(
			true,
		);
		expect(await (await staffAs("rita")).callRoute({ routeId: "audit.list", input: {} })).toEqual({
			ok: false,
			reason: "forbidden",
		});
	});

	it("while looking as someone else the assistant is read-only, even for the Owner", async () => {
		const port = await staffAs("olga", "role:owner");
		const before = await rolesHeld();
		const { events, confirmed } = await askForRole(port);
		expect(confirmed === undefined || confirmed !== "done").toBe(true);
		expect(events.some((e) => e.type === "done")).toBe(true);
		expect(await port.callRoute({ routeId: "roles.create", input: NEW_ROLE.input })).toEqual({
			ok: false,
			reason: "forbidden",
		});
		expect(await rolesHeld()).toBe(before);
		// Reading still works, as on the screens.
		expect((await port.callRoute({ routeId: "audit.list", input: {} })).ok).toBe(true);
	});

	it("someone with no membership gets nothing: no turn, no read, nothing written", async () => {
		const port = await staffAs("mallory");
		const before = await api.world.fingerprint();
		const { events } = await askForRole(port);
		expect(events.some((e) => e.type === "refusal")).toBe(true);
		expect((await port.callRoute({ routeId: "clients.list", input: {} })).ok).toBe(false);
		expect(await api.world.fingerprint()).toBe(before);
	});

	it("an id the assistant was told by a record (prompt injection) cannot widen what it may do", async () => {
		const port = await staffAs("rita");
		const before = await api.world.fingerprint();
		for (const routeId of [
			"roles.setPermissions",
			"members.put",
			"apps.update",
			"assistantConfig.put",
		])
			expect(
				(await port.callRoute({ routeId, input: { id: "x", subject: "rita", doc: {} } })).ok,
				routeId,
			).toBe(false);
		expect(await api.world.fingerprint()).toBe(before);
	});
});
