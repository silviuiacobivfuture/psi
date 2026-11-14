import { afterEach, describe, expect, it } from "vitest";
import { listActions, runAction } from "../actions/engine";
import { ACTIONS } from "../actions/registry";
import type { ActionCtx } from "../actions/types";
import { canOf } from "../lib/can";
import { createFakePort } from "../port/fake";
import type { FakeLinkSeed } from "../port/fake-links";
import { type Console, MEMBER, startConsole } from "./harness";

const ONE = "a".repeat(64);
const TWO = "b".repeat(64);
const SEEDS: ReadonlyArray<FakeLinkSeed> = [
	{ app: "psizone", id: ONE, via: "email", reference: "ABCD-EFGH", candidates: ["c1", "c2"] },
	{ app: "psizone", id: TWO, via: "phone", candidates: ["c3"] },
];

let c: Console;
afterEach(() => c.close());

const open = async (roles: string[] = ["owner"], seeds = SEEDS): Promise<void> => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16", accountLinks: seeds },
		{ [MEMBER.sub]: [{ app: "psizone", roles }] },
	);
	await c.signIn();
};
const form = { "content-type": "application/x-www-form-urlencoded" };
const post = (path: string, values: Record<string, string> = {}) =>
	c.post(path, new URLSearchParams(values), form);

describe("Conturi online de confirmat: the page", () => {
	it("lists each account with what matched, the booking, and its candidates as links to their pages", async () => {
		await open();
		const html = await (await c.get("/account-links")).text();
		expect(html).toContain("Conturi online de confirmat");
		expect(html).toContain(`data-account-link="${ONE}"`);
		expect(html).toContain("Același e-mail ca:");
		expect(html).toContain("Rezervarea ABCD-EFGH");
		expect(html).toContain('href="/clients/c1"');
		expect(html).toContain('href="/clients/c2"');
		expect(html).toContain("Același telefon ca:");
		expect(html).toContain('data-action="client.linkAccount"');
		expect(html).toContain('data-action="client.dismissAccountLink"');
		// One candidate is chosen already; of two, none is.
		const two = html.slice(html.indexOf(`data-account-link="${TWO}"`));
		expect(two.slice(0, two.indexOf("</li>"))).toMatch(
			/value="c3"[^>]*checked|checked[^>]*value="c3"/,
		);
	});

	it("says so when nobody waits", async () => {
		await open(["owner"], []);
		expect(await (await c.get("/account-links")).text()).toContain(
			"Niciun cont nu așteaptă confirmare.",
		);
	});

	it("the clients page tells a person who may invite how many wait, and nobody else", async () => {
		await open();
		const html = await (await c.get("/clients")).text();
		expect(html).toContain("Conturi online de confirmat: 2");
		expect(html).toContain('href="/account-links"');
		await c.close();
		await open(["therapist"]);
		expect(await (await c.get("/clients")).text()).not.toContain("data-account-links");
	});
});

describe("Conturi online de confirmat: answering", () => {
	it("confirming a candidate links it, says so, and the account no longer waits", async () => {
		await open();
		const res = await post(`/account-links/${ONE}/confirm`, { clientId: "c2" });
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Contul a fost legat de client.");
		expect(html).not.toContain(`data-account-link="${ONE}"`);
		expect((await c.port.accountLinks("psizone")).map((l) => l.id)).toEqual([TWO]);
		const journal = await c.port.audit("psizone");
		expect(journal.some((e) => e.action === "client.account_link" && e.target === "c2")).toBe(true);
	});

	it("dismissing removes it and says so", async () => {
		await open();
		const res = await post(`/account-links/${TWO}/dismiss`);
		expect(await res.text()).toContain("Am reținut: nu e niciunul dintre ei.");
		expect((await c.port.accountLinks("psizone")).map((l) => l.id)).toEqual([ONE]);
	});

	it("a client that is not a candidate, or an account not waiting, is not found and nothing changes", async () => {
		await open();
		expect((await post(`/account-links/${ONE}/confirm`, { clientId: "c9" })).status).toBe(404);
		expect((await post(`/account-links/${"c".repeat(64)}/dismiss`)).status).toBe(404);
		expect((await c.port.accountLinks("psizone")).length).toBe(2);
	});

	it("a client another account has comes back saying so, nothing changed", async () => {
		await open(
			["owner"],
			[
				{ app: "psizone", id: ONE, via: "email", candidates: ["c1"] },
				{ app: "psizone", id: TWO, via: "email", candidates: ["c1"] },
			],
		);
		await post(`/account-links/${ONE}/confirm`, { clientId: "c1" });
		const res = await post(`/account-links/${TWO}/confirm`, { clientId: "c1" });
		expect(await res.text()).toContain("Clientul are deja alt cont online.");
		expect((await c.port.accountLinks("psizone")).map((l) => l.id)).toEqual([TWO]);
	});

	it("a malformed account id or a missing choice is refused before anything is asked", async () => {
		await open();
		expect((await post("/account-links/not-an-account/confirm", { clientId: "c1" })).status).toBe(
			400,
		);
		expect((await post(`/account-links/${ONE}/confirm`)).status).toBe(400);
		expect((await c.port.accountLinks("psizone")).length).toBe(2);
	});
});

describe("the account-link actions in the registry", () => {
	const ctxFor = async (roles: string[]): Promise<ActionCtx> => {
		const port = createFakePort({
			today: "2026-11-16",
			members: { s1: [{ app: "psizone", roles }] },
			accountLinks: SEEDS,
		});
		return {
			port,
			app: "psizone",
			can: canOf(await port.capabilities("s1", "psizone"), false),
			actor: { subject: "s1", name: "Ana Test" },
			locale: "ro",
			today: "2026-11-16",
		};
	};

	it("both are registered with their routes, need the invite permission, and are offered to whoever holds it", async () => {
		for (const [id, path] of [
			["client.linkAccount", "/account-links/:id/confirm"],
			["client.dismissAccountLink", "/account-links/:id/dismiss"],
		] as const) {
			const a = ACTIONS.find((x) => x.id === id);
			expect(a?.route).toEqual({ method: "POST", path });
			expect(a?.needs).toEqual({ write: ["clients_invite"] });
		}
		const owner = listActions(await ctxFor(["owner"]), { screen: "global" }).map((a) => a.id);
		expect(owner).toEqual(
			expect.arrayContaining(["client.linkAccount", "client.dismissAccountLink"]),
		);
		const therapist = listActions(await ctxFor(["therapist"]), { screen: "global" }).map(
			(a) => a.id,
		);
		expect(therapist).not.toContain("client.linkAccount");
	});

	it("the assistant links an account the same way, and is refused for a role without the permission", async () => {
		const ctx = await ctxFor(["owner"]);
		expect(
			await runAction(ctx, "client.linkAccount", { id: TWO, clientId: "c3" }, { confirmed: true }),
		).toMatchObject({ status: "ok" });
		expect((await ctx.port.accountLinks("psizone")).map((l) => l.id)).toEqual([ONE]);
		const weak = await ctxFor(["therapist"]);
		expect(
			await runAction(weak, "client.dismissAccountLink", { id: ONE }, { confirmed: true }),
		).toMatchObject({ status: "refused", code: "forbidden" });
		expect((await weak.port.accountLinks("psizone")).length).toBe(2);
	});
});
