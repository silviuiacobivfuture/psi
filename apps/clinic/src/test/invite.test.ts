import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PortError } from "../port/port";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER);
	await c.signIn();
});
afterEach(() => c.close());

const state = () => c.port.invite("psizone", "c1");
const audits = async () =>
	(await c.port.audit("psizone")).filter((e) => e.action.startsWith("client.invite")).length;

describe("the client page offers the online account", () => {
	it("a card with the action, for someone who may invite", async () => {
		const html = await (await c.get("/clients/c1")).text();
		expect(html).toContain('data-testid="invite-card"');
		expect(html).toContain("Cont online");
		expect(html).toContain('href="/clients/c1/invite"');
		expect(html).toContain("Invită în contul online");
	});
	it("shows no card for someone who may not invite, and refuses the page and every step", async () => {
		const other = await startConsole(
			MEMBER,
			{},
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["accountant"] }] },
		);
		try {
			await other.signIn();
			expect(await (await other.get("/clients/c1")).text()).not.toContain("invite-card");
			expect((await other.get("/clients/c1/invite")).status).toBe(403);
			for (const step of ["preview", "send", "resend", "revoke"])
				expect((await other.post(`/clients/c1/invite/${step}`)).status).toBe(403);
			expect(await other.port.invite("psizone", "c1")).toBeNull();
		} finally {
			await other.close();
		}
	});
	it("an archived client is not offered the action", async () => {
		const html = await (await c.get("/clients/c23")).text();
		expect(html).not.toContain('href="/clients/c23/invite"');
	});
	it("reading the page changes nothing", async () => {
		const before = await audits();
		await c.get("/clients/c1");
		await c.get("/clients/c1/invite");
		expect(await state()).toBeNull();
		expect(await audits()).toBe(before);
	});
});

describe("the flow: pick, preview, send", () => {
	it("the page asks who and in which language", async () => {
		const html = await (await c.get("/clients/c1/invite")).text();
		expect(html).toContain("Cui trimitem invitația?");
		expect(html).toContain('name="contact"');
		expect(html).toContain('name="locale"');
		expect(html).not.toContain("invite-preview");
	});
	it("the preview shows the e-mail in a sandboxed frame, and writes nothing", async () => {
		const res = await c.post(
			"/clients/c1/invite/preview",
			new URLSearchParams({ contact: "client", locale: "ro" }),
		);
		const html = await res.text();
		expect(html).toContain('data-testid="invite-preview"');
		expect(html).toContain("Creează-ți contul online");
		expect(html).toContain("client.01@example.test");
		expect(html).toMatch(/<iframe[^>]*sandbox=""/);
		expect(html).toContain('action="/clients/c1/invite/send"');
		expect(await state()).toBeNull();
		expect(await audits()).toBe(0);
	});
	it("the preview follows the language chosen", async () => {
		const res = await c.post(
			"/clients/c1/invite/preview",
			new URLSearchParams({ contact: "client", locale: "en" }),
		);
		expect(await res.text()).toContain("Create your online account");
	});
	it("sending records the invitation, audits it, and the page says Invitat with where it went", async () => {
		const res = await c.post(
			"/clients/c1/invite/send",
			new URLSearchParams({ contact: "client", locale: "ro" }),
		);
		const html = await res.text();
		expect(html).toContain("Invitația a fost trimisă.");
		expect(html).toContain("Invitat");
		expect(html).toContain("c***@example.test");
		expect(await state()).toMatchObject({ status: "invited", contact: "client", sends: 1 });
		expect(await audits()).toBe(1);
	});
	it("a second send is refused with the reason, and the invitation is as it was", async () => {
		const form = new URLSearchParams({ contact: "client", locale: "ro" });
		await c.post("/clients/c1/invite/send", form);
		const before = await audits();
		const res = await c.post("/clients/c1/invite/send", form);
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("O invitație așteaptă deja");
		expect(await audits()).toBe(before);
		expect((await state())?.sends).toBe(1);
	});
	it("a contact with no address is refused in words, and nothing is written", async () => {
		const res = await c.post(
			"/clients/c3/invite/preview",
			new URLSearchParams({ contact: "guardian" }),
		);
		// c3 has no guardian: the fake has no address for it.
		expect(res.status).toBe(400);
		expect(await res.text()).toContain("nu are adresă de e-mail");
		expect(await c.port.invite("psizone", "c3")).toBeNull();
		expect(await audits()).toBe(0);
	});
	it("an unknown client is not found", async () => {
		expect((await c.get("/clients/nope/invite")).status).toBe(404);
		expect(
			(await c.post("/clients/nope/invite/send", new URLSearchParams({ contact: "client" })))
				.status,
		).toBe(404);
	});
	it("a bad form falls back to the client and Romanian, and still asks the service, never trusts the body", async () => {
		const res = await c.post(
			"/clients/c1/invite/send",
			new URLSearchParams({ contact: "uncle", locale: "fr" }),
		);
		expect(res.status).toBe(200);
		expect(await state()).toMatchObject({ contact: "client", locale: "ro" });
	});
	it("an unreachable sign-in puts the person back on the page with nothing sent", async () => {
		const down = await startConsole(MEMBER, { failing: new Set(["sendInvite"]) });
		try {
			await down.signIn();
			const res = await down.post(
				"/clients/c1/invite/send",
				new URLSearchParams({ contact: "client" }),
			);
			expect(res.status).toBe(503);
			expect(await res.text()).toContain("Autentificarea nu răspunde");
			expect(await down.port.invite("psizone", "c1")).toBeNull();
		} finally {
			await down.close();
		}
	});
});

describe("status, resend and withdraw", () => {
	beforeEach(async () => {
		await c.post(
			"/clients/c1/invite/send",
			new URLSearchParams({ contact: "client", locale: "ro" }),
		);
	});
	it("resending counts the send, and a second tap inside a minute is refused with its reason", async () => {
		const first = await c.post("/clients/c1/invite/resend");
		expect(await first.text()).toMatch(
			/Invitația a fost trimisă acum un moment|Invitația a fost trimisă din nou/,
		);
		const again = await c.post("/clients/c1/invite/resend");
		expect(await again.text()).toContain("Invitația a fost trimisă acum un moment");
		expect((await state())?.sends).toBe(1);
	});
	it("withdrawing asks once, then the page says Retras and offers a new invitation", async () => {
		const html = await (await c.get("/clients/c1")).text();
		expect(html.match(/action="\/clients\/c1\/invite\/revoke"/g)).toHaveLength(1);
		const res = await c.post("/clients/c1/invite/revoke");
		const after = await res.text();
		expect(after).toContain("Invitația a fost retrasă.");
		expect(after).toContain("Retras");
		expect(after).toContain('href="/clients/c1/invite"');
		expect((await state())?.status).toBe("revoked");
	});
	it("withdrawing twice, or resending a withdrawn invitation, says why and changes nothing", async () => {
		await c.post("/clients/c1/invite/revoke");
		const before = await audits();
		expect(await (await c.post("/clients/c1/invite/revoke")).text()).toContain(
			"Invitația a fost retrasă: trimite una nouă.",
		);
		expect(await (await c.post("/clients/c1/invite/resend")).text()).toContain("trimite una nouă");
		expect(await audits()).toBe(before);
	});
	it("a client never invited has nothing to resend or withdraw", async () => {
		expect((await c.post("/clients/c2/invite/resend")).status).toBe(404);
		expect((await c.post("/clients/c2/invite/revoke")).status).toBe(404);
	});
	it("a new invitation after a withdrawal starts again at one send", async () => {
		await c.post("/clients/c1/invite/revoke");
		await c.post(
			"/clients/c1/invite/send",
			new URLSearchParams({ contact: "client", locale: "en" }),
		);
		expect(await state()).toMatchObject({ status: "invited", sends: 1, locale: "en" });
	});
});

describe("the port's refusals carry the service's reason", () => {
	it("a refusal names its reason, so the page can say it", async () => {
		await c.port.sendInvite("psizone", "c1", { contact: "client", locale: "ro" });
		const error = await c.port
			.sendInvite("psizone", "c1", { contact: "client", locale: "ro" })
			.then(
				() => undefined,
				(e: unknown) => e,
			);
		expect(error).toBeInstanceOf(PortError);
		expect(error).toMatchObject({ code: "conflict", reason: "already_invited" });
	});
});
