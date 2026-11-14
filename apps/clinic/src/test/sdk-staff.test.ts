import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, type Session, startSdkConsole } from "./sdk-harness";

/**
 * Adding a member without their sign-in id, against the real service in-process (its in-memory store and its fake
 * sign-in): the console's search and invitation go through the SDK to the service's staff routes.
 */
let k: SdkConsole;
let olga: Session;
beforeAll(async () => {
	k = await startSdkConsole();
	olga = await k.as("olga");
	k.api.world.staff.seed("ana.pop@example.test", "Ana Popescu");
	k.api.world.staff.seed("ana.client@example.test", "Ana Clienta", {
		staff: false,
		customer: true,
	});
	k.api.world.staff.seed("rita.mail@example.test", "Rita Recepție", { subject: "rita" });
});
afterAll(async () => {
	await k.close();
});

const SSE = { "content-type": "application/json", "datastar-request": "true" };
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const find = (s: Session, q: string) =>
	s.raw("/settings/members/staff", {
		method: "POST",
		body: JSON.stringify({ nm: { q } }),
		headers: SSE,
	});
const invite = (s: Session, values: [string, string][]) =>
	s.raw("/settings/members/invite", {
		method: "POST",
		body: new URLSearchParams(values),
		headers: FORM,
	});
const members = async (): Promise<string[]> =>
	(
		(await k.api.world.call("olga", "GET", "/v1/apps/psizone/members")).json.items as {
			subject: string;
		}[]
	)
		.map((m) => m.subject)
		.sort();

describe("the search, through the service", () => {
	it("finds the team's sign-in group by name, says who is in the team, and never offers a client", async () => {
		const html = await (await find(olga, "ana")).text();
		expect(html).toContain("Ana Popescu");
		expect(html).not.toContain("Ana Clienta");
		const rita = await (await find(olga, "rita.mail")).text();
		expect(rita).toContain("deja în echipă");
	});

	it("is not offered to someone who may not add members", async () => {
		const vera = await k.as("vera");
		expect((await find(vera, "ana")).status).toBe(403);
	});
});

describe("the invitation, through the service", () => {
	it("makes the account, adds the person and shows the one-time link once", async () => {
		const r = await invite(olga, [
			["email", "nou.sdk@example.test"],
			["displayName", "Nou Prin Serviciu"],
		]);
		expect(r.status).toBe(200);
		const html = await r.text();
		expect(html).toContain('id="mb-invite-link"');
		expect(html).toContain("https://sso.test/recover/");
		const made = k.api.world.staff.accounts.get("nou.sdk@example.test");
		expect(made?.staff).toBe(true);
		expect(await members()).toContain(made?.subject);
		expect(k.api.world.notifier.sent.some((n) => n.event === "team.invite")).toBe(true);
	});

	it("a new link for that member, through the service; refused once they have signed in, writing nothing", async () => {
		const made = k.api.world.staff.accounts.get("nou.sdk@example.test");
		const subject = made?.subject ?? "";
		const ask = () =>
			olga.raw(`/settings/members/${encodeURIComponent(subject)}/link`, {
				method: "POST",
				body: "",
				headers: FORM,
			});
		const r = await ask();
		expect(r.status).toBe(200);
		expect(await r.text()).toContain(`https://sso.test/recover/${made?.userId}`);
		k.api.world.staff.signIn("nou.sdk@example.test", Date.now());
		const before = await k.api.world.fingerprint();
		const again = await ask();
		expect(again.status).toBe(303);
		expect(again.headers.get("location")).toBe(
			`/settings/members?edit=${encodeURIComponent(subject)}&problem=link-conflict`,
		);
		expect(await k.api.world.fingerprint()).toBe(before);
	});

	it("a client's address is refused with its reason, and nothing is written", async () => {
		const before = await k.api.world.fingerprint();
		const r = await invite(olga, [
			["email", "ana.client@example.test"],
			["displayName", "Ana Clienta"],
		]);
		expect(r.status).toBe(303);
		expect(r.headers.get("location")).toBe("/settings/members?invite=1&problem=invite-conflict");
		expect(await k.api.world.fingerprint()).toBe(before);
	});

	it("a sign-in that does not answer sends the person back with that reason, and nothing is written", async () => {
		k.api.world.staff.failing = true;
		const before = await k.api.world.fingerprint();
		const r = await invite(olga, [
			["email", "later@example.test"],
			["displayName", "Mai Târziu"],
		]);
		k.api.world.staff.failing = false;
		expect(r.headers.get("location")).toBe("/settings/members?invite=1&problem=invite-unavailable");
		expect(await k.api.world.fingerprint()).toBe(before);
	});
});
