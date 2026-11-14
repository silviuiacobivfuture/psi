import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

/** Adding a member without their sign-in id, over the in-memory clinic: the search, the invitation, their refusals. */
let c: Console;
const STAFF = [
	{ subject: "acct-ana", displayName: "Ana Popescu", email: "ana.pop@example.test" },
	{ subject: "iuliana", displayName: "Iuliana Ionescu", email: "iuliana@example.test" },
	{ subject: "acct-off", displayName: "Ana Oprită", email: "ana.off@example.test", active: false },
	{
		subject: "acct-client",
		displayName: "Ana Clienta",
		email: "ana.client@example.test",
		customer: true,
	},
	{ subject: "acct-tag", displayName: '<b>Ana</b> & "co"', email: "tag@example.test" },
	{ subject: "acct-seen", displayName: "Sorin Văzut", email: "seen@example.test", signedIn: true },
];
beforeEach(async () => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16", staff: STAFF },
		{
			[MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }],
			iuliana: [{ app: "psizone", roles: ["reception"] }],
		},
	);
	await c.signIn();
});
afterEach(() => c.close());

const SSE = { "content-type": "application/json", "datastar-request": "true" };
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const find = async (q: string, who: Console = c) =>
	who.post("/settings/members/staff", JSON.stringify({ nm: { q } }), SSE);
const invite = (values: [string, string][], who: Console = c) =>
	who.post("/settings/members/invite", new URLSearchParams(values), FORM);
const team = async () => (await c.port.members("psizone")).map((x) => x.subject).sort();

describe("Adaugă membru: finding the person by name or e-mail", () => {
	it("the sheet offers the search, and the sign-in id is filled from it", async () => {
		const html = await (await c.get("/settings/members?new=1")).text();
		expect(html).toContain("data-staff-search");
		expect(html).toContain('id="mb-staff-results"');
		expect(html).toContain("Caută persoana");
		expect(html).not.toContain("Invitațiile prin e-mail nu sunt încă disponibile");
	});

	it("finds by name and by e-mail; one already in the team or switched off cannot be picked; a client's account never shows", async () => {
		const html = await (await find("ana")).text();
		expect(html).toContain("Ana Popescu");
		expect(html).toContain("Ana Oprită");
		expect(html).toContain("cont dezactivat");
		expect(html).not.toContain("Ana Clienta");
		expect(html).toMatch(/data-staff="acct-ana"(?![^>]*disabled)[^>]*data-on:click/);
		expect(html).toMatch(/data-staff="acct-off"[^>]*disabled/);
		const byMail = await (await find("iuliana@")).text();
		expect(byMail).toContain("deja în echipă");
		expect(byMail).toMatch(/data-staff="iuliana"[^>]*disabled/);
	});

	it("nothing under two letters asks nothing; no match says so; markup is shown, never run", async () => {
		expect(await (await find("a")).text()).not.toContain("data-staff=");
		expect(await (await find("zzz")).text()).toContain("Nimeni din echipă pentru");
		const tag = await (await find("tag@")).text();
		expect(tag).not.toContain("<b>Ana</b>");
		expect(tag).toContain("&lt;b&gt;Ana&lt;/b&gt;");
	});

	it("says so when the sign-in does not answer", async () => {
		await c.close();
		c = await startConsole(
			MEMBER,
			{ today: "2026-11-16", staff: STAFF, failing: new Set(["searchStaff"]) },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
		);
		await c.signIn();
		expect(await (await find("ana")).text()).toContain("Căutarea nu răspunde acum");
	});

	it("is refused to someone who may not add members", async () => {
		const reception = await startConsole(
			MEMBER,
			{ today: "2026-11-16", staff: STAFF },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await reception.signIn();
		expect((await find("ana", reception)).status).toBe(403);
		expect(await (await reception.get("/settings/members")).text()).not.toContain(
			"data-staff-search",
		);
		await reception.close();
	});
});

describe("Invită prin e-mail", () => {
	it("a new address: added with the roles, the page shows the one-time link once, nothing cached", async () => {
		const r = await invite([
			["email", "nou@example.test"],
			["displayName", "Nou Venit"],
			["roles", "reception"],
		]);
		expect(r.status).toBe(200);
		expect(r.headers.get("cache-control")).toContain("no-store");
		const html = await r.text();
		expect(html).toContain("Persoana a fost adăugată");
		expect(html).toContain('id="mb-invite-link"');
		expect(html).toContain("https://sso.example.test/recovery/");
		expect(html).toContain("Copiază linkul");
		const added = (await c.port.members("psizone")).find((x) => x.displayName === "Nou Venit");
		expect(added?.roles).toEqual(["reception"]);
		// The link was in that answer only: the list shows it nowhere.
		expect(await (await c.get("/settings/members")).text()).not.toContain(
			"sso.example.test/recovery",
		);
	});

	it("an address that already has an account: added, no link, told they sign in as usual", async () => {
		const html = await (
			await invite([
				["email", "ana.pop@example.test"],
				["displayName", "Ana Popescu"],
			])
		).text();
		expect(html).toContain("avea deja cont");
		expect(html).not.toContain('id="mb-invite-link"');
		expect(await team()).toContain("acct-ana");
	});

	it.each([
		["a client's account", "ana.client@example.test", "adresa e a unui client"],
		["a switched-off account", "ana.off@example.test", "adresa e a unui client"],
		["someone already in the team", "iuliana@example.test", "adresa e a unui client"],
		["not an address", "nu-e-adresa", "Schimbarea nu a fost făcută"],
	])("refuses %s: the sheet opens again with the reason, and the team is as it was", async (_what, email, words) => {
		const before = await team();
		const r = await invite([
			["email", email],
			["displayName", "X"],
		]);
		// sent back (303, followed) to the open invitation sheet, with the reason
		expect(r.status).toBe(200);
		const html = await r.text();
		expect(html).toContain(words);
		expect(html).toContain("&quot;inviteMember&quot;:true");
		expect(html).not.toContain('id="mb-invite-link"');
		expect(await team()).toEqual(before);
	});

	it("words each reason the page is sent back with", async () => {
		expect(
			await (await c.get("/settings/members?invite=1&problem=invite-conflict")).text(),
		).toContain("adresa e a unui client");
		expect(
			await (await c.get("/settings/members?invite=1&problem=invite-unavailable")).text(),
		).toContain("nu poate fi creat acum");
	});

	it("is refused to someone who may not add members: 403 and nobody added", async () => {
		const reception = await startConsole(
			MEMBER,
			{ today: "2026-11-16", staff: STAFF },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await reception.signIn();
		const before = (await reception.port.members("psizone")).length;
		const r = await invite(
			[
				["email", "nou@example.test"],
				["displayName", "Nou"],
			],
			reception,
		);
		expect(r.status).toBe(403);
		expect((await reception.port.members("psizone")).length).toBe(before);
		await reception.close();
	});

	it("the journal says it came by invitation", async () => {
		await invite([
			["email", "nou@example.test"],
			["displayName", "Nou Venit"],
		]);
		expect(await (await c.get("/settings/audit")).text()).toContain(
			"A invitat prin e-mail în echipă",
		);
	});
});

describe("Link nou de setare a parolei", () => {
	const invited = async (email: string, name: string): Promise<string> => {
		await invite([
			["email", email],
			["displayName", name],
		]);
		const found = (await c.port.members("psizone")).find((x) => x.displayName === name);
		if (found === undefined) throw new Error("not invited");
		return found.subject;
	};
	const ask = (subject: string, who: Console = c) =>
		who.post(`/settings/members/${encodeURIComponent(subject)}/link`, "", FORM);

	it("is offered in the editor of a member with an e-mail, and gives a new link once", async () => {
		const subject = await invited("nou@example.test", "Nou Venit");
		expect(await (await c.get(`/settings/members?edit=${subject}`)).text()).toContain(
			'data-form="member-link"',
		);
		const r = await ask(subject);
		expect(r.status).toBe(200);
		expect(r.headers.get("cache-control")).toContain("no-store");
		const html = await r.text();
		expect(html).toContain("data-new-link");
		expect(html).toContain('id="mb-invite-link"');
		expect(html).toContain(`https://sso.example.test/recovery/${subject}-`);
		expect(await (await c.get("/settings/audit")).text()).toContain(
			"A făcut un link nou de setare a parolei pentru",
		);
	});

	it("is not offered for a member with no e-mail address", async () => {
		expect(await (await c.get("/settings/members?edit=iuliana")).text()).not.toContain(
			'data-form="member-link"',
		);
	});

	it.each([
		["a member who has already signed in", "seen@example.test", "Sorin Văzut"],
		["a member added by the sign-in id, with no e-mail", "", ""],
	])("refuses %s: the editor opens again with the reason, and no link is shown", async (_what, email, name) => {
		const subject = email === "" ? "iuliana" : await invited(email, name);
		const r = await ask(subject);
		expect(r.status).toBe(200);
		const html = await r.text();
		expect(html).toContain("Linkul nu a fost făcut");
		expect(html).not.toContain("data-new-link");
		expect(html).not.toContain("sso.example.test/recovery");
	});

	it("says so when the sign-in does not answer", async () => {
		const subject = await invited("nou@example.test", "Nou Venit");
		await c.close();
		c = await startConsole(
			MEMBER,
			{ today: "2026-11-16", staff: STAFF, failing: new Set(["newSignInLink"]) },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["owner"] }] },
		);
		await c.signIn();
		const html = await (await ask(subject)).text();
		expect(html).toContain("contul de autentificare nu răspunde acum");
		expect(html).not.toContain("data-new-link");
	});

	it("is refused to someone who may not add members", async () => {
		const reception = await startConsole(
			MEMBER,
			{ today: "2026-11-16", staff: STAFF },
			{ [MEMBER.sub]: [{ app: "psizone", roles: ["reception"] }] },
		);
		await reception.signIn();
		expect((await ask("iuliana", reception)).status).toBe(403);
		await reception.close();
	});
});
