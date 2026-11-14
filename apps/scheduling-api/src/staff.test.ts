import { StaffInviteResult, StaffSearch } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const search = (q: string, who = "olga") =>
	as(who, "GET", `/staff-accounts?q=${encodeURIComponent(q)}`);
const invite = (body: Record<string, unknown>, who = "olga") =>
	as(who, "POST", "/staff-accounts", {
		email: "nou.venit@example.test",
		displayName: "Nou Venit",
		roles: [w.ids.roles.reception],
		...body,
	});
const audit = async () =>
	(await as("olga", "GET", "/audit?limit=500")).json.items as {
		action: string;
		target: { type: string; id: string };
		detail?: Record<string, unknown>;
	}[];

describe("finding a person of the team's sign-in group", () => {
	it("by name or e-mail, saying who is a member already; a client's account is never offered", async () => {
		w.staff.seed("ana.pop@example.test", "Ana Popescu");
		w.staff.seed("dana@example.test", "Dana Ana", { subject: "rita" });
		w.staff.seed("ana.client@example.test", "Ana Clienta", { staff: false, customer: true });
		w.staff.seed("ana.off@example.test", "Ana Oprită", { active: false });
		const r = await search("ana");
		expect(r.status).toBe(200);
		const { items } = StaffSearch.parse(r.json);
		expect(items.map((i) => i.displayName).sort()).toEqual([
			"Ana Oprită",
			"Ana Popescu",
			"Dana Ana",
		]);
		expect(items.find((i) => i.displayName === "Dana Ana")?.member).toBe(true);
		expect(items.find((i) => i.displayName === "Ana Popescu")?.member).toBe(false);
		expect(items.find((i) => i.displayName === "Ana Oprită")?.active).toBe(false);
		expect((await search("pop@exam")).json.items).toHaveLength(1);
	});

	it("nothing matching is an empty list; unicode is searched as typed", async () => {
		w.staff.seed("stefan@example.test", "Ștefan Ionescu");
		expect((await search("zz")).json.items).toEqual([]);
		expect(StaffSearch.parse((await search("Ștef")).json).items).toHaveLength(1);
	});

	it("answers at most 20 people", async () => {
		for (let i = 0; i < 25; i += 1) w.staff.seed(`p${i}@example.test`, `Persoana ${i}`);
		expect((await search("persoana")).json.items).toHaveLength(20);
	});

	it.each([
		["one character", "a", 400],
		["81 characters", "a".repeat(81), 400],
	])("refuses a query of %s without asking the sign-in", async (_what, q, status) => {
		expect((await search(q)).status).toBe(status);
		expect(w.staff.calls).toEqual([]);
	});

	it("is refused to someone who may not add members, without asking the sign-in", async () => {
		expect((await search("ana", "rita")).status).toBe(403);
		expect(w.staff.calls).toEqual([]);
	});

	it("answers 503 when no staff group is configured, or the sign-in does not answer", async () => {
		w.staff.failing = true;
		expect((await search("ana")).status).toBe(503);
		w.deps.staff = undefined;
		const r = await search("ana");
		expect(r.status).toBe(503);
		expect(JSON.stringify(r.json)).toContain("not_configured");
	});
});

describe("inviting someone by e-mail", () => {
	it("makes their account in the staff group, adds them with the roles, e-mails them and hands back a one-time link", async () => {
		const r = await invite({ locale: "en" });
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		const out = StaffInviteResult.parse(r.json);
		expect(out.account).toBe("created");
		const made = w.staff.accounts.get("nou.venit@example.test");
		expect(made).toMatchObject({ staff: true, customer: false, active: true, name: "Nou Venit" });
		expect(out.signInLink).toBe(`https://sso.test/recover/${made?.userId}`);
		expect(out.member).toMatchObject({
			subject: made?.subject,
			displayName: "Nou Venit",
			email: "nou.venit@example.test",
			roles: [w.ids.roles.reception],
		});
		expect((await as("olga", "GET", `/members/${made?.subject}`)).status).toBe(200);
		// The e-mail is queued to the person, by reference: no address, no link.
		const sent = w.notifier.sent.filter((n) => n.event === "team.invite");
		expect(sent).toEqual([
			expect.objectContaining({
				to: { kind: "person", subject: made?.subject },
				payload: { subject: made?.subject, locale: "en" },
			}),
		]);
		// One addition and one invitation in the journal; neither keeps the link or the address.
		const events = (await audit()).filter((e) => e.target.id === made?.subject);
		expect(events.map((e) => e.action).sort()).toEqual(["member.invite", "member.put"]);
		expect(events.find((e) => e.action === "member.invite")?.detail).toEqual({
			account: "created",
			joined: false,
		});
		expect(events.find((e) => e.action === "member.put")?.detail?.changes).toEqual({
			displayName: { from: "", to: "Nou Venit" },
			roles: { from: "", to: w.ids.roles.reception },
		});
		const journal = JSON.stringify(events);
		expect(journal).not.toContain("sso.test");
		expect(journal).not.toContain("nou.venit@example.test");
		expect(JSON.stringify(w.logs)).not.toContain("sso.test/recover");
	});

	it("an address in other capitals is the same person", async () => {
		w.staff.seed("ana@example.test", "Ana");
		const r = await invite({ email: "  ANA@Example.test " });
		expect(StaffInviteResult.parse(r.json)).toMatchObject({
			account: "existing",
			signInLink: null,
		});
		expect(w.staff.calls.some((c) => c.startsWith("create:"))).toBe(false);
	});

	it("a person already in the staff group is added with their own account: nothing made, no link", async () => {
		const known = w.staff.seed("nou.venit@example.test", "Nou Venit");
		const out = StaffInviteResult.parse((await invite({})).json);
		expect(out).toMatchObject({ account: "existing", signInLink: null });
		expect(out.member.subject).toBe(known.subject);
		expect(w.staff.calls.filter((c) => /^(create|join|recovery):/.test(c))).toEqual([]);
	});

	it("an account of the estate that is neither staff nor a client's is put in the staff group", async () => {
		const known = w.staff.seed("nou.venit@example.test", "Nou Venit", { staff: false });
		const out = StaffInviteResult.parse((await invite({})).json);
		expect(out.account).toBe("existing");
		expect(w.staff.calls).toContain(`join:${known.userId}`);
		expect(known.staff).toBe(true);
	});

	it("with no role at all the person is still added; calendars they coordinate are kept", async () => {
		const out = StaffInviteResult.parse(
			(await invite({ roles: [], coordinates: [w.ids.dora] })).json,
		);
		expect(out.member).toMatchObject({ roles: [], coordinates: [w.ids.dora] });
	});

	it("an e-mail that cannot be queued does not undo the invitation: the account, the member and the link stay", async () => {
		w.notifier.failing = true;
		const r = await invite({});
		expect(r.status).toBe(200);
		expect(StaffInviteResult.parse(r.json).signInLink).not.toBeNull();
	});

	it("a link the sign-in cannot make right now leaves the member added, with no link to show", async () => {
		const real = w.staff.recoveryLink;
		w.staff.recoveryLink = () => Promise.reject(new Error("the sign-in did not answer"));
		const r = await invite({});
		w.staff.recoveryLink = real;
		expect(r.status).toBe(200);
		expect(StaffInviteResult.parse(r.json)).toMatchObject({ account: "created", signInLink: null });
	});
});

describe("inviting: every refusal writes nothing, makes no account and sends nothing", () => {
	const refused = async (
		body: Record<string, unknown>,
		status: number,
		reason: string | undefined,
		who = "olga",
	): Promise<void> => {
		const before = await w.fingerprint();
		const r = await invite(body, who);
		expect(r.status, JSON.stringify(r.json)).toBe(status);
		if (reason !== undefined) expect(JSON.stringify(r.json)).toContain(reason);
		expect(await w.fingerprint()).toBe(before);
		expect(w.staff.calls.filter((c) => /^(create|join|recovery|deactivate):/.test(c))).toEqual([]);
	};

	it("someone who may not add members (and the sign-in is not asked)", async () => {
		await refused({}, 403, undefined, "rita");
		expect(w.staff.calls).toEqual([]);
	});

	it("an unknown role (and the sign-in is not asked)", async () => {
		await refused({ roles: ["no-such-role"] }, 400, "unknown role");
		expect(w.staff.calls).toEqual([]);
	});

	it("an unknown calendar (and the sign-in is not asked)", async () => {
		await refused({ coordinates: ["no-such-person"] }, 400, "unknown person");
		expect(w.staff.calls).toEqual([]);
	});

	it.each([
		["not an e-mail address", { email: "nu-e-adresa" }],
		["no name", { displayName: "  " }],
		["21 roles", { roles: Array.from({ length: 21 }, (_, i) => `r${i}`) }],
		["a language we do not speak", { locale: "de" }],
	])("a malformed invitation: %s", async (_what, body) => {
		await refused(body, 400, undefined);
		expect(w.staff.calls).toEqual([]);
	});

	it("a client's account: never made staff", async () => {
		w.staff.seed("nou.venit@example.test", "Clienta", { staff: false, customer: true });
		await refused({}, 409, "customer_account");
	});

	it("an account that is switched off", async () => {
		w.staff.seed("nou.venit@example.test", "Oprit", { active: false });
		await refused({}, 409, "account_disabled");
	});

	it("someone already in the team", async () => {
		w.staff.seed("nou.venit@example.test", "Rita", { subject: "rita" });
		await refused({}, 409, "already_member");
	});

	it("oneself", async () => {
		w.staff.seed("nou.venit@example.test", "Olga", { subject: "olga" });
		await refused({}, 403, "self");
	});

	it("no staff group configured", async () => {
		w.deps.staff = undefined;
		await refused({}, 503, "not_configured");
	});

	it("a sign-in that does not answer", async () => {
		w.staff.failing = true;
		await refused({}, 503, undefined);
	});
});
