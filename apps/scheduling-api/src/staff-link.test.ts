import { StaffInviteResult, StaffLinkResult } from "@psi/scheduling-sdk/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const invite = async (email = "nou@example.test"): Promise<string> => {
	const r = await as("olga", "POST", "/staff-accounts", {
		email,
		displayName: "Nou Venit",
		roles: [],
	});
	expect(r.status, JSON.stringify(r.json)).toBe(200);
	return StaffInviteResult.parse(r.json).member.subject;
};
const link = (subject: string, who = "olga") =>
	as(who, "POST", `/members/${subject}/sign-in-link`, {});
const sideEffects = () =>
	w.staff.calls.filter((c) => /^(create|join|leave|recovery|deactivate):/.test(c));

describe("a new set-password link for a member who never signed in", () => {
	it("is made by the sign-in and handed to the inviter; the journal says one was made, never the link", async () => {
		const subject = await invite();
		const account = w.staff.accounts.get("nou@example.test");
		const r = await link(subject);
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		expect(StaffLinkResult.parse(r.json).signInLink).toBe(
			`https://sso.test/recover/${account?.userId}`,
		);
		expect(w.staff.calls.filter((c) => c.startsWith("recovery:"))).toHaveLength(2);
		const events = (
			(await as("olga", "GET", "/audit?limit=500")).json.items as {
				action: string;
				target: { id: string };
				detail?: unknown;
			}[]
		).filter((e) => e.action === "member.link");
		expect(events).toEqual([
			expect.objectContaining({
				target: expect.objectContaining({ id: subject }),
				detail: { link: "issued" },
			}),
		]);
		expect(JSON.stringify(events)).not.toContain("sso.test");
		expect(JSON.stringify(w.logs)).not.toContain("sso.test/recover");
	});

	it("each request asks for a new link (the sign-in replaces its earlier one)", async () => {
		const subject = await invite();
		await link(subject);
		await link(subject);
		expect(w.staff.calls.filter((c) => c.startsWith("recovery:"))).toHaveLength(3);
	});
});

describe("a new link: every refusal writes nothing and asks the sign-in for no link", () => {
	const refused = async (
		subject: string,
		status: number,
		reason: string | undefined,
		who = "olga",
	): Promise<void> => {
		const before = await w.fingerprint();
		const recoveries = w.staff.calls.filter((c) => c.startsWith("recovery:")).length;
		const r = await link(subject, who);
		expect(r.status, JSON.stringify(r.json)).toBe(status);
		if (reason !== undefined) expect(JSON.stringify(r.json)).toContain(reason);
		expect(await w.fingerprint()).toBe(before);
		expect(w.staff.calls.filter((c) => c.startsWith("recovery:")).length).toBe(recoveries);
	};

	it("a member who has already signed in", async () => {
		const subject = await invite();
		w.staff.signIn("nou@example.test", w.clock.now);
		await refused(subject, 409, "already_signed_in");
	});

	it("someone who may not add members", async () => {
		await refused(await invite(), 403, undefined, "rita");
	});

	it("someone who is not in the team", async () => {
		await refused("nobody-here", 404, undefined);
	});

	it("oneself", async () => {
		await refused("olga", 403, "self");
	});

	it("a member with no e-mail address", async () => {
		// rita was added by her sign-in id, with no address
		await refused("rita", 409, "no_email");
	});

	it("a member whose address belongs to another sign-in", async () => {
		await as("olga", "PUT", "/members/odd-one", {
			displayName: "Altcineva",
			email: "shared@example.test",
			roles: [],
			coordinates: [],
		});
		w.staff.seed("shared@example.test", "Alt Cont");
		await refused("odd-one", 409, "no_account");
	});

	it("an account that left the staff group", async () => {
		const subject = await invite();
		const account = w.staff.accounts.get("nou@example.test");
		if (account !== undefined) account.staff = false;
		await refused(subject, 409, "not_staff");
	});

	it("an account that is switched off", async () => {
		const subject = await invite();
		const account = w.staff.accounts.get("nou@example.test");
		if (account !== undefined) account.active = false;
		await refused(subject, 409, "account_disabled");
	});

	it("no staff group configured", async () => {
		const subject = await invite();
		w.deps.staff = undefined;
		await refused(subject, 503, "not_configured");
	});

	it("a sign-in that does not answer", async () => {
		const subject = await invite();
		w.staff.failing = true;
		await refused(subject, 503, undefined);
	});
});

describe("an invitation whose member write fails undoes what the sign-in did", () => {
	it("a new account is switched off again, and no member is left", async () => {
		w.authz.failing = true;
		const r = await as("olga", "POST", "/staff-accounts", {
			email: "nou@example.test",
			displayName: "Nou Venit",
			roles: [w.ids.roles.reception],
		});
		w.authz.failing = false;
		expect(r.status).toBe(503);
		const account = w.staff.accounts.get("nou@example.test");
		expect(account?.active).toBe(false);
		expect(w.staff.calls).toContain(`deactivate:${account?.userId}`);
		expect((await as("olga", "GET", `/members/${account?.subject}`)).status).toBe(404);
		expect(w.notifier.sent.filter((n) => n.event === "team.invite")).toEqual([]);
	});

	it("an account put into the staff group leaves it again, and no member is left", async () => {
		const known = w.staff.seed("nou@example.test", "Nou Venit", { staff: false });
		w.authz.failing = true;
		const r = await as("olga", "POST", "/staff-accounts", {
			email: "nou@example.test",
			displayName: "Nou Venit",
			roles: [w.ids.roles.reception],
		});
		w.authz.failing = false;
		expect(r.status).toBe(503);
		expect(w.staff.calls).toEqual(
			expect.arrayContaining([`join:${known.userId}`, `leave:${known.userId}`]),
		);
		expect(known.staff).toBe(false);
		expect(known.active).toBe(true);
		expect((await as("olga", "GET", `/members/${known.subject}`)).status).toBe(404);
	});

	it("an account already in the staff group is left exactly as it was", async () => {
		const known = w.staff.seed("nou@example.test", "Nou Venit");
		w.authz.failing = true;
		await as("olga", "POST", "/staff-accounts", {
			email: "nou@example.test",
			displayName: "Nou Venit",
			roles: [w.ids.roles.reception],
		});
		w.authz.failing = false;
		expect(sideEffects()).toEqual([]);
		expect(known).toMatchObject({ staff: true, active: true });
	});
});
