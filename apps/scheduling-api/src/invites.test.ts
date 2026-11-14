import { beforeEach, describe, expect, it, vi } from "vitest";
import { inviteKit } from "./testing/invite-kit";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const _A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const { as, invite, state, visitor, sent, audit, person, writesNothing, detail } = inviteKit(
	() => w,
);

describe("the permission: clients_invite", () => {
	it("the seed Reception, Admin and Owner hold it; a therapist and an empty role do not", async () => {
		const id = await person();
		expect((await as("rita", "GET", `/clients/${id}/invite`)).status).toBe(200);
		expect((await as("nina", "GET", `/clients/${id}/invite`)).status).toBe(200);
		expect((await as("dora", "GET", `/clients/${id}/invite`)).status).toBe(404);
		expect((await as("blank", "GET", `/clients/${id}/invite`)).status).toBe(404);
	});
	it("every route under the client refuses without it, and nothing is written or asked of the sign-in", async () => {
		const id = await person();
		for (const [method, path, body] of [
			["GET", `/clients/${id}/invite/preview?contact=client`, undefined],
			["POST", `/clients/${id}/invite`, { contact: "client" }],
			["POST", `/clients/${id}/invite/resend`, {}],
			["DELETE", `/clients/${id}/invite`, undefined],
		] as const) {
			const r = await writesNothing(() => as("dora", method, path, body));
			expect(r.status, `${method} ${path}`).toBe(404);
		}
		expect(w.sso.calls).toEqual([]);
	});
	it("a role that may invite but not read the client's contact cannot invite to it", async () => {
		const role = w.ids.roles.volunteer;
		const held = (await as("olga", "GET", `/roles/${role}`)).json.role as { permissions: string[] };
		await as("olga", "PUT", `/roles/${role}/permissions`, {
			permissions: [...held.permissions, "clients_invite_all", "clients_view_all"],
		});
		const id = await person();
		expect((await as("vera", "GET", `/clients/${id}/invite`)).status).toBe(200);
		const preview = await writesNothing(() =>
			as("vera", "GET", `/clients/${id}/invite/preview?contact=client`),
		);
		expect(preview.status).toBe(403);
		expect(detail(preview)).toMatchObject({ group: "contact" });
		const send = await writesNothing(() =>
			as("vera", "POST", `/clients/${id}/invite`, { contact: "client" }),
		);
		expect(send.status).toBe(403);
		const guardian = await writesNothing(() =>
			as("vera", "POST", `/clients/${id}/invite`, { contact: "guardian" }),
		);
		expect(detail(guardian)).toMatchObject({ group: "guardian" });
	});
});

describe("the preview", () => {
	it("is the real e-mail with a placeholder link, in either language, and writes nothing", async () => {
		const id = await person();
		const ro = await writesNothing(() =>
			as("rita", "GET", `/clients/${id}/invite/preview?contact=client`),
		);
		expect(ro.status).toBe(200);
		expect(ro.json).toMatchObject({
			to: "maria@example.test",
			subject: "Creează-ți contul online",
			existingAccount: false,
			expiresAt: NOW + 7 * DAY,
		});
		expect(String(ro.json.html)).toContain("https://api-programari.test/v1/public/invites/PREVIEW");
		expect(String(ro.json.html)).toContain("Maria Invitata");
		expect(String(ro.json.text)).toContain("Setează parola");
		const en = await as("rita", "GET", `/clients/${id}/invite/preview?contact=client&locale=en`);
		expect(en.json.subject).toBe("Create your online account");
		expect(await state(id)).toBeNull();
	});
	it("for a guardian greets the guardian and names the child", async () => {
		const id = await person();
		const r = await as("rita", "GET", `/clients/${id}/invite/preview?contact=guardian`);
		expect(r.json.to).toBe("tata@example.test");
		expect(String(r.json.html)).toContain("Tata Invitat");
		expect(String(r.json.text)).toContain("pentru Maria Invitata");
	});
	it("says when the address already has an account, and then the e-mail is the sign-in one", async () => {
		const id = await person();
		w.sso.seed("maria@example.test");
		const r = await as("rita", "GET", `/clients/${id}/invite/preview?contact=client`);
		expect(r.json).toMatchObject({
			existingAccount: true,
			subject: "Contul tău online este legat",
		});
	});
	it("refuses a contact with no e-mail, an archived client, an unknown client and a sign-in that is away", async () => {
		const bare = await person({ contact: { phone: "0712 345 678" } });
		const noMail = await writesNothing(() =>
			as("rita", "GET", `/clients/${bare}/invite/preview?contact=client`),
		);
		expect(noMail.status).toBe(400);
		expect(detail(noMail)).toMatchObject({ reason: "no_email" });
		const archived = await person();
		await as("olga", "POST", `/clients/${archived}/archive`);
		const gone = await writesNothing(() =>
			as("rita", "GET", `/clients/${archived}/invite/preview?contact=client`),
		);
		expect(detail(gone)).toMatchObject({ reason: "client_not_active" });
		expect((await as("rita", "GET", "/clients/zzzzzz/invite/preview?contact=client")).status).toBe(
			404,
		);
		const id = await person();
		w.sso.failing = true;
		expect((await as("rita", "GET", `/clients/${id}/invite/preview?contact=client`)).status).toBe(
			503,
		);
	});
});

describe("sending an invitation", () => {
	it("creates the account, links it, stores the invitation and queues the e-mail", async () => {
		const id = await person();
		const r = await invite(id);
		expect(r.status).toBe(200);
		expect(r.json).toMatchObject({
			clientId: id,
			status: "invited",
			contact: "client",
			sentTo: "m***@example.test",
			sends: 1,
			existingAccount: false,
			invitedBy: "olga",
			expiresAt: NOW + 7 * DAY,
		});
		expect(w.sso.calls).toEqual(["find:maria@example.test", "create:maria@example.test"]);
		const queued = sent("account.invite");
		expect(queued).toHaveLength(1);
		expect(queued[0]).toMatchObject({ to: { kind: "client", clientId: id } });
		expect(JSON.stringify(w.notifier.sent)).not.toContain("maria@example.test");
		expect(await state(id)).toMatchObject({ status: "invited" });
	});
	it("audits it with the contact and no address", async () => {
		const id = await person();
		await invite(id);
		const [entry] = await audit("client.invite");
		expect(entry).toMatchObject({ actor: { subject: "olga" }, target: { id } });
		expect(JSON.stringify(entry)).not.toContain("example.test");
	});
	it("a guardian's invitation goes to the guardian's address", async () => {
		const id = await person();
		const r = await invite(id, { contact: "guardian", locale: "en" });
		expect(r.json).toMatchObject({
			contact: "guardian",
			sentTo: "t***@example.test",
			locale: "en",
		});
		expect(w.sso.calls).toContain("create:tata@example.test");
	});
	it("an address that already has an account is linked, never created again and never reset", async () => {
		const id = await person();
		const account = w.sso.seed("maria@example.test");
		const r = await invite(id);
		expect(r.json).toMatchObject({ existingAccount: true });
		expect(w.sso.calls.some((c) => c.startsWith("create:"))).toBe(false);
		expect(w.sso.accounts.get("maria@example.test")).toEqual(account);
		expect(sent("account.invite_existing")).toHaveLength(1);
		expect(sent("account.invite")).toHaveLength(0);
	});
	it("refuses a switched-off account, an invitation already waiting, and one already active; nothing changes", async () => {
		const id = await person();
		w.sso.seed("maria@example.test", { active: false });
		const off = await writesNothing(() => invite(id));
		expect(off.status).toBe(409);
		expect(detail(off)).toMatchObject({ reason: "account_disabled" });
		w.sso.accounts.clear();
		expect((await invite(id)).status).toBe(200);
		const twice = await writesNothing(() => invite(id));
		expect(detail(twice)).toMatchObject({ reason: "already_invited" });
		await visitor(
			w.sso.accounts.get("maria@example.test")?.subject ?? "none",
			"GET",
			"/me/appointments",
		);
		expect(await state(id)).toMatchObject({ status: "active" });
		const active = await writesNothing(() => invite(id));
		expect(detail(active)).toMatchObject({ reason: "already_active" });
	});
	it("refuses a contact with no e-mail, an archived or deleted client, and an unknown one", async () => {
		const bare = await person({ contact: { phone: "0712 345 678" } });
		expect(detail(await writesNothing(() => invite(bare)))).toMatchObject({ reason: "no_email" });
		const archived = await person();
		await as("olga", "POST", `/clients/${archived}/archive`);
		expect(detail(await writesNothing(() => invite(archived)))).toMatchObject({
			reason: "client_not_active",
		});
		const deleted = await person();
		await as("olga", "DELETE", `/clients/${deleted}`);
		expect(detail(await writesNothing(() => invite(deleted)))).toMatchObject({
			reason: "client_not_active",
		});
		expect((await writesNothing(() => invite("zzzzzz"))).status).toBe(404);
	});
	it("refuses a body that names no contact, or a language we do not write", async () => {
		const id = await person();
		expect((await writesNothing(() => invite(id, {}))).status).toBe(400);
		expect((await writesNothing(() => invite(id, { contact: "uncle" }))).status).toBe(400);
		expect(
			(await writesNothing(() => invite(id, { contact: "client", locale: "fr" }))).status,
		).toBe(400);
	});
	it("a sign-in that is away answers 503 and nothing is stored", async () => {
		const id = await person();
		w.sso.failing = true;
		const r = await writesNothing(() => invite(id));
		expect(r.status).toBe(503);
		expect(await state(id)).toBeNull();
	});
	it("without a sign-in configured the routes say so, and nothing is stored", async () => {
		const id = await person();
		const held = w.deps.sso;
		w.deps.sso = undefined;
		try {
			const r = await writesNothing(() => invite(id));
			expect(r.status).toBe(503);
			expect(detail(r)).toMatchObject({ reason: "not_configured" });
		} finally {
			w.deps.sso = held;
		}
	});
	it("an account made for an invitation that could not be stored is switched off again", async () => {
		const id = await person();
		const put = vi.spyOn(w.store.keyed, "put").mockRejectedValueOnce(new Error("store down"));
		const r = await invite(id);
		put.mockRestore();
		expect(r.status).toBe(500);
		expect(w.sso.calls).toContain("deactivate:u1");
		expect(w.sso.accounts.get("maria@example.test")?.active).toBe(false);
		expect(await state(id)).toBeNull();
		expect(sent("account.invite")).toHaveLength(0);
	});
	it("two sends at once: one invitation, one e-mail", async () => {
		const id = await person();
		const [a, b] = await Promise.all([invite(id), invite(id)]);
		expect([a.status, b.status].sort()).toEqual([200, 409]);
		expect(sent("account.invite")).toHaveLength(1);
	});
});
