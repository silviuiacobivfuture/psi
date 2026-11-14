import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActions, runAction } from "../actions/engine";
import { ACTIONS } from "../actions/registry";
import type { ActionCtx } from "../actions/types";
import { canOf } from "../lib/can";
import { createFakePort } from "../port/fake";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeAll(async () => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
	);
	await c.signIn();
});
afterAll(() => c.close());

const html = async (path: string): Promise<string> => await (await c.get(path)).text();
const post = (path: string, values: Record<string, string>): Promise<Response> =>
	c.post(path, new URLSearchParams(values), {
		"content-type": "application/x-www-form-urlencoded",
	});

describe("emptying a client's phone or e-mail from the edit sheet", () => {
	it("offers a clear button beside a phone and an e-mail that hold something, each in its own form, and says what empty means", async () => {
		const page = await html("/clients/c4?edit=1");
		expect(page).toContain('data-form="client-edit"');
		expect(page).toContain('form="clear-phone-c4"');
		expect(page).toContain('form="clear-email-c4"');
		expect(page).toContain('id="clear-phone-c4"');
		expect(page).toContain('action="/clients/c4/contact/clear"');
		expect(page).toContain("Golește telefonul");
		expect(page).toContain("Golește e-mailul");
		expect(page).toContain("rămâne");
		// The clear buttons belong to their own forms: the edit form's own first submit button (its default, what Enter
		// presses) is "Salvează".
		const edit = page.slice(page.indexOf('data-form="client-edit"'));
		const own = edit.match(/<button(?![^>]*\sform=)[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/);
		expect(own?.[1]).toContain("Salvează");
		for (const b of edit.match(/<button[^>]*cl-clear[^>]*>/g) ?? []) expect(b).toContain(" form=");
	});

	it("clears the e-mail: the sheet reopens saying so, the field is empty and its clear button is gone", async () => {
		const res = await post("/clients/c5/contact/clear", { field: "email" });
		expect(res.status).toBe(200);
		const page = await html("/clients/c5?edit=1&cleared=email");
		expect(page).toContain("E-mailul a fost golit.");
		expect(page).not.toContain('form="clear-email-c5"');
		expect(page).toContain('form="clear-phone-c5"');
		expect(page).not.toContain("client.05@example.test");
	});

	it("refuses to clear the last one: the sheet says nothing changed and the phone is still there", async () => {
		await post("/clients/c6/contact/clear", { field: "email" });
		const res = await post("/clients/c6/contact/clear", { field: "phone" });
		expect(res.status).toBe(200);
		const page = await res.text();
		expect(page).toContain("Nu s-a schimbat nimic");
		expect(page).toContain("0700 000 006");
	});

	it("the edit form clearing both by leaving them empty is refused the same way, writing nothing", async () => {
		const before = await html("/clients/c7");
		const res = await post("/clients/c7/edit", { name: "Nume Nou", phone: "", email: "" });
		expect(await res.text()).toContain("Nu s-a schimbat nimic");
		const after = await html("/clients/c7");
		expect(after).toContain("0700 000 007");
		expect(after).not.toContain("Nume Nou");
		expect(before).toContain("0700 000 007");
	});

	it("a field the form did not send is left as it is (a person who cannot see it never empties it)", async () => {
		await post("/clients/c10/edit", { name: "Doar Numele 10" });
		const page = await html("/clients/c10");
		expect(page).toContain("Doar Numele 10");
		expect(page).toContain("0700 000 010");
		expect(page).toContain("client.10@example.test");
	});

	it("refuses a field that is not a phone or an e-mail", async () => {
		const res = await post("/clients/c8/contact/clear", { field: "name" });
		expect(res.status).toBe(422);
		expect(await html("/clients/c8")).toContain("client.08@example.test");
	});
});

describe("the clear action in the registry", () => {
	it("is registered, in the client palette, behind the contact group, and confirms", () => {
		const a = ACTIONS.find((x) => x.id === "client.clearContact");
		expect(a).toMatchObject({
			route: { method: "POST", path: "/clients/:id/contact/clear" },
			confirm: "confirm",
			needs: { write: ["clients_edit"], group: "contact" },
			placements: { palette: ["client"] },
		});
		expect(a?.label("ro")).toBe("Golește telefonul sau e-mailul");
		expect(a?.label("en")).toBe("Clear the phone or e-mail");
	});

	it("needs a confirmation before it runs, then runs once; the assistant sees it for an owner", async () => {
		const port = createFakePort({
			today: "2026-11-16",
			members: { s1: [{ app: "psizone", roles: ["owner"] }] },
		});
		const ctx: ActionCtx = {
			port,
			app: "psizone",
			can: canOf(await port.capabilities("s1", "psizone"), false),
			actor: { subject: "s1", name: "Ana Test" },
			locale: "ro",
			today: "2026-11-16",
		};
		expect(
			listActions(ctx, { screen: "client", entity: { clientId: "c9" } }).map((x) => x.id),
		).toContain("client.clearContact");
		expect(await runAction(ctx, "client.clearContact", { id: "c9", field: "email" })).toEqual({
			status: "needs-confirmation",
			policy: "confirm",
		});
		expect((await ctx.port.client("psizone", "c9"))?.email).not.toBeNull();
		const done = await runAction(
			ctx,
			"client.clearContact",
			{ id: "c9", field: "email" },
			{ confirmed: true },
		);
		expect(done).toMatchObject({ status: "ok" });
		expect((await ctx.port.client("psizone", "c9"))?.email).toBeNull();
	});
});
