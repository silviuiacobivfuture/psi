import { ActionInfoSchema, type StaffPage } from "@psi/engine/staff";
import { describe, expect, it } from "vitest";
import { listActions } from "../actions/engine";
import { ACTIONS } from "../actions/registry";
import type { ActionCtx, EntityState, Screen } from "../actions/types";
import { canOf } from "../lib/can";
import { createFakePort } from "../port/fake";
import { PortError } from "../port/port";
import { createActionsSource } from "./actions-source";

async function ctxFor(roles: string[], readOnly = false): Promise<ActionCtx> {
	const port = createFakePort({
		today: "2026-11-16",
		members: { s1: [{ app: "psizone", roles }] },
	});
	const caps = await port.capabilities("s1", "psizone");
	return {
		port,
		app: "psizone",
		can: canOf(caps, readOnly),
		actor: { subject: "s1", name: "Ana Test" },
		locale: "ro",
		today: "2026-11-16",
	};
}

/** The assistant's page for a registry screen, and what is shown on it. */
function pageOf(screen: Screen): { page: StaffPage; entity: EntityState } {
	if (screen.startsWith("client."))
		return { page: { screen: "client", clientId: "c1" }, entity: { clientId: "c1" } };
	if (screen === "client")
		return { page: { screen: "client", clientId: "c1" }, entity: { clientId: "c1" } };
	if (screen.startsWith("settings") || screen === "platform")
		return { page: { screen: "settings" }, entity: {} };
	if (screen === "global") return { page: { screen: "other" }, entity: {} };
	if (screen === "appointment")
		return { page: { screen: "appointment", appointmentId: "a1" }, entity: {} };
	return { page: { screen: screen as StaffPage["screen"] }, entity: {} };
}

const screensOf = (id: string): ReadonlyArray<Screen> => {
	const def = ACTIONS.find((a) => a.id === id);
	return [...new Set(Object.values(def?.placements ?? {}).flat())] as Array<Screen>;
};

describe("the assistant's discovery is the console registry's own listing", () => {
	it("every registry action reads as an action the assistant understands", async () => {
		const ctx = await ctxFor(["owner"]);
		const source = createActionsSource(ctx);
		const seen = new Set<string>();
		for (const def of ACTIONS)
			for (const screen of screensOf(def.id)) {
				const { page } = pageOf(screen);
				for (const info of await source.listActions(page)) {
					ActionInfoSchema.parse(info);
					seen.add(info.id);
				}
			}
		expect(seen.size).toBeGreaterThan(10);
	});

	it("each action the owner is offered on a screen is found by the assistant on that screen", async () => {
		const ctx = await ctxFor(["owner"]);
		const source = createActionsSource(ctx);
		let checked = 0;
		for (const def of ACTIONS)
			for (const screen of screensOf(def.id)) {
				const { page, entity } = pageOf(screen);
				const offered = listActions(ctx, { screen, entity }).some((a) => a.id === def.id);
				if (!offered) continue;
				const found = (await source.listActions(page)).map((a) => a.id);
				expect(found, `${def.id} on ${screen}`).toContain(def.id);
				checked += 1;
			}
		expect(checked).toBeGreaterThan(ACTIONS.length / 2);
	});

	it("a role without the capability is never shown the action, and looking as someone else shows no change", async () => {
		const owner = await ctxFor(["owner"]);
		const bare = await ctxFor(["accountant"]);
		const viewing = await ctxFor(["owner"], true);
		for (const def of ACTIONS)
			for (const screen of screensOf(def.id)) {
				const { page, entity } = pageOf(screen);
				const bareIds = (await createActionsSource(bare).listActions(page)).map((a) => a.id);
				const registry = listActions(bare, { screen, entity }).map((a) => a.id);
				if (!registry.includes(def.id))
					expect(bareIds, `${def.id} on ${screen}`).not.toContain(def.id);
				const viewIds = await createActionsSource(viewing).listActions(page);
				for (const info of viewIds.filter((i) => i.kind === "write"))
					expect(
						ACTIONS.find((a) => a.id === info.id)?.needs.write === undefined ||
							listActions(viewing, { screen, entity }).some((a) => a.id === info.id),
					).toBe(true);
			}
		const ownerClient = (
			await createActionsSource(owner).listActions({ screen: "client", clientId: "c1" })
		).map((a) => a.id);
		const bareClient = (
			await createActionsSource(bare).listActions({ screen: "client", clientId: "c1" })
		).map((a) => a.id);
		expect(ownerClient).toContain("note.add");
		expect(bareClient).not.toContain("note.add");
	});

	it("the parameters of an action are read from its own schema", async () => {
		const source = createActionsSource(await ctxFor(["owner"]));
		const note = (await source.listActions({ screen: "client", clientId: "c1" })).find(
			(a) => a.id === "note.add",
		);
		expect(note?.kind).toBe("write");
		expect(note?.params).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "clientId", kind: "id", required: true }),
				expect.objectContaining({ name: "body", kind: "text", required: true }),
				expect.objectContaining({ name: "category", kind: "choice", required: false }),
			]),
		);
	});
});

describe("running an action goes through the registry's one path", () => {
	it("adds the note the console would, audits it as the assistant's, and says where it went", async () => {
		const ctx = await ctxFor(["owner"]);
		const source = createActionsSource(ctx);
		const before = (await ctx.port.client("psizone", "c1")) !== null;
		expect(before).toBe(true);
		const out = await source.runAction("note.add", { clientId: "c1", body: "A venit relaxată." });
		expect(out.href).toBe("/clients/c1/notes");
		expect((await ctx.port.audit("psizone")).map((e) => e.action)).toContain("assistant.note.add");
	});

	it("refuses, writing nothing, what the person may not do, what does not parse and what does not exist", async () => {
		const bare = createActionsSource(await ctxFor(["accountant"]));
		await expect(bare.runAction("note.add", { clientId: "c1", body: "x" })).rejects.toMatchObject({
			code: "forbidden",
		});
		const owner = createActionsSource(await ctxFor(["owner"]));
		await expect(owner.runAction("note.add", { clientId: "c1" })).rejects.toMatchObject({
			code: "invalid",
		});
		await expect(owner.runAction("nope.nothing", {})).rejects.toBeInstanceOf(PortError);
	});

	it("looking as someone else, nothing is changed", async () => {
		const viewing = createActionsSource(await ctxFor(["owner"], true));
		await expect(
			viewing.runAction("note.add", { clientId: "c1", body: "x" }),
		).rejects.toMatchObject({
			code: "forbidden",
		});
	});
});
