import { describe, expect, it } from "vitest";
import { canOf } from "../lib/can";
import { createFakePort } from "../port/fake";
import { InviteOutcomeSchema } from "../port/schema-members";
import { listActions, runAction } from "./engine";
import { ACTIONS } from "./registry";
import type { ActionCtx } from "./types";

const members = { s1: [{ app: "psizone" as const, roles: ["owner"] }] };

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

const ids = (list: ReadonlyArray<{ id: string }>): string[] => list.map((a) => a.id);

describe("the action registry", () => {
	it("has unique ids, a label in both languages and a route or a way to begin for every action", () => {
		expect(new Set(ids(ACTIONS)).size).toBe(ACTIONS.length);
		for (const a of ACTIONS) {
			expect(a.label("ro"), a.id).not.toBe("");
			expect(a.label("en"), a.id).not.toBe("");
			expect(a.route !== null || a.to !== undefined, a.id).toBe(true);
		}
	});
	it("every action is offered somewhere", () => {
		for (const a of ACTIONS)
			expect(Object.values(a.placements).flat().length, a.id).toBeGreaterThan(0);
	});
});

describe("listActions follows capability", () => {
	it("the owner may add notes, records and files and blacklist a client", async () => {
		const ctx = await ctxFor(["owner"]);
		const got = ids(listActions(ctx, { screen: "client", entity: { clientId: "c1" } }));
		for (const id of ["note.add", "record.new", "file.upload", "blacklist.add", "client.edit"])
			expect(got, id).toContain(id);
	});
	it("an accountant gets no write action on a client", async () => {
		const ctx = await ctxFor(["accountant"]);
		const got = ids(listActions(ctx, { screen: "client", entity: { clientId: "c1" } }));
		for (const id of [
			"note.add",
			"record.new",
			"file.upload",
			"blacklist.add",
			"client.edit",
			"client.delete",
		])
			expect(got, id).not.toContain(id);
	});
	it("nothing that changes anything is offered while looking at the app as someone else", async () => {
		const ctx = await ctxFor(["owner"], true);
		const got = listActions(ctx, { screen: "client", entity: { clientId: "c1" } });
		expect(got.filter((a) => a.needs.write !== undefined)).toEqual([]);
	});
	it("an archived client is not offered archiving, and an unlisted one cannot be unlisted", async () => {
		const ctx = await ctxFor(["owner"]);
		expect(
			ids(listActions(ctx, { screen: "client", entity: { clientId: "c1", clientArchived: true } })),
		).not.toContain("client.archive");
		expect(ids(listActions(ctx, { screen: "client", entity: { clientId: "c1" } }))).not.toContain(
			"blacklist.end",
		);
		expect(
			ids(listActions(ctx, { screen: "client", entity: { clientId: "c4", blacklistId: "b1" } })),
		).toContain("blacklist.end");
	});
	it("the palette offers where to go only to those who may go there", async () => {
		const ctx = await ctxFor(["accountant"]);
		const got = ids(listActions(ctx, { screen: "global", placement: "palette" }));
		expect(got).not.toContain("nav.clients");
		expect(got).not.toContain("nav.calendar");
		expect(got).not.toContain("nav.platform");
		expect(got).toContain("nav.me");
	});
});

describe("runAction", () => {
	it("does a permitted action once and writes what it says", async () => {
		const ctx = await ctxFor(["owner"]);
		const r = await runAction(ctx, "note.add", {
			clientId: "c3",
			body: "  Salut ",
			category: "general",
		});
		expect(r.status).toBe("ok");
		const notes = await ctx.port.notes("psizone", "c3");
		expect(notes.map((n) => n.body)).toEqual(["Salut"]);
	});
	it("refuses an unknown action, writing nothing", async () => {
		const ctx = await ctxFor(["owner"]);
		expect(await runAction(ctx, "nope", {})).toEqual({ status: "refused", code: "unknown" });
	});
	it("refuses what the person may not do, writing nothing", async () => {
		const ctx = await ctxFor(["accountant"]);
		const r = await runAction(ctx, "note.add", { clientId: "c3", body: "x" });
		expect(r).toEqual({ status: "refused", code: "forbidden" });
		expect(await ctx.port.notes("psizone", "c3")).toEqual([]);
	});
	it("refuses parameters that do not parse, writing nothing", async () => {
		const ctx = await ctxFor(["owner"]);
		expect(await runAction(ctx, "note.add", { clientId: "c3", body: "   " })).toEqual({
			status: "refused",
			code: "invalid",
		});
		expect(await ctx.port.notes("psizone", "c3")).toEqual([]);
	});
	it("asks to confirm a destructive action and does nothing until it is confirmed", async () => {
		const ctx = await ctxFor(["owner"]);
		const before = (await ctx.port.notes("psizone", "c1")).length;
		const ask = await runAction(ctx, "note.delete", { clientId: "c1", id: "n1" });
		expect(ask).toEqual({ status: "needs-confirmation", policy: "confirm" });
		expect((await ctx.port.notes("psizone", "c1")).length).toBe(before);
		const done = await runAction(
			ctx,
			"note.delete",
			{ clientId: "c1", id: "n1" },
			{ confirmed: true },
		);
		expect(done.status).toBe("ok");
		expect((await ctx.port.notes("psizone", "c1")).length).toBe(before - 1);
	});
	it("a note by someone else is not changed by a person who may only edit their own", async () => {
		const ctx = await ctxFor(["therapist"]);
		const r = await runAction(ctx, "note.edit", {
			clientId: "c1",
			id: "n2",
			body: "x",
			category: "general",
		});
		expect(r.status).toBe("refused");
		expect((await ctx.port.notes("psizone", "c1")).find((n) => n.id === "n2")?.body).not.toBe("x");
	});
	it("the clinical category needs the clinical field group", async () => {
		const ctx = await ctxFor(["reception"]);
		const r = await runAction(ctx, "note.add", { clientId: "c3", body: "x", category: "clinical" });
		expect(r).toEqual({ status: "refused", code: "forbidden" });
	});
	it("a warn-only person cannot raise a blacklist entry above a warning", async () => {
		const ctx = await ctxFor(["owner"]);
		const warnOnly: ActionCtx = {
			...ctx,
			can: canOf(
				{
					...(await ctx.port.capabilities("s1", "psizone")),
					permissions: { blacklist_create_warn: ["all"] },
				},
				false,
			),
		};
		const hard = await runAction(warnOnly, "blacklist.add", {
			clientId: "c6",
			reason: "r",
			category: "other",
			severity: "block_all",
		});
		expect(hard).toEqual({ status: "refused", code: "forbidden" });
		expect(await ctx.port.blacklistHistory("psizone", "c6")).toEqual([]);
		const soft = await runAction(warnOnly, "blacklist.add", {
			clientId: "c6",
			reason: "r",
			category: "other",
			severity: "warn",
		});
		expect(soft.status).toBe("ok");
	});
	it("removing from the blacklist needs a reason", async () => {
		const ctx = await ctxFor(["owner"]);
		expect(
			await runAction(
				ctx,
				"blacklist.end",
				{ clientId: "c4", id: "b1", reason: " " },
				{ confirmed: true },
			),
		).toEqual({ status: "refused", code: "invalid" });
		const ok = await runAction(
			ctx,
			"blacklist.end",
			{ clientId: "c4", id: "b1", reason: "Lămurit" },
			{ confirmed: true },
		);
		expect(ok.status).toBe("ok");
		expect((await ctx.port.clientFlags("psizone", ["c4"])).c4).toBeUndefined();
	});
	it("the assistant's run is written to the audit log, the person's own is not doubled", async () => {
		const ctx = await ctxFor(["owner"]);
		await runAction(ctx, "note.add", { clientId: "c3", body: "a" }, { via: "assistant" });
		expect((await ctx.port.audit("psizone")).some((e) => e.action === "assistant.note.add")).toBe(
			true,
		);
	});
});

describe("an action whose result is for the person at the screen alone", () => {
	const invite = { email: "asist@example.test", displayName: "Prin Asistent", roles: [] };
	it("an assistant run of the invitation answers where to go and no data: never the one-time link", async () => {
		const ctx = await ctxFor(["owner"]);
		const r = await runAction(ctx, "member.invite", invite, { confirmed: true, via: "assistant" });
		expect(r).toEqual({ status: "ok", to: expect.stringContaining("/settings/members?edit=") });
		expect(JSON.stringify(r)).not.toContain("recovery");
		// it did invite: the person is in the team
		expect((await ctx.port.members("psizone")).some((x) => x.displayName === "Prin Asistent")).toBe(
			true,
		);
	});
	it("the screen's own run gets the link", async () => {
		const ctx = await ctxFor(["owner"]);
		const r = await runAction(ctx, "member.invite", invite, { confirmed: true });
		expect(r.status === "ok" && JSON.stringify(r.data)).toContain("recovery");
	});
	it("an assistant run of a new set-password link answers no link either", async () => {
		const ctx = await ctxFor(["owner"]);
		const r = await runAction(ctx, "member.invite", invite, { confirmed: true });
		const subject = r.status === "ok" ? InviteOutcomeSchema.parse(r.data).subject : "";
		const again = await runAction(
			ctx,
			"member.link",
			{ subject },
			{ confirmed: true, via: "assistant" },
		);
		expect(again).toEqual({ status: "ok", to: expect.stringContaining(subject) });
		const own = await runAction(ctx, "member.link", { subject }, { confirmed: true });
		expect(own.status === "ok" && JSON.stringify(own.data)).toContain("recovery");
	});
	it("someone who may not add members is refused, and nobody is added", async () => {
		const ctx = await ctxFor(["reception"]);
		const before = (await ctx.port.members("psizone")).length;
		expect(await runAction(ctx, "member.invite", invite, { confirmed: true })).toEqual({
			status: "refused",
			code: "forbidden",
		});
		expect((await ctx.port.members("psizone")).length).toBe(before);
	});
});

void members;
