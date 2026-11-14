import { describe, expect, it } from "vitest";
import { signToken } from "../reminders/token";
import { signInviteToken } from "./index";
import { createInviteRoutes, type InviteLinkActions, type InviteLinkState } from "./routes";

const SECRET = "s".repeat(40);
const NOW = Date.parse("2026-12-01T10:00:00Z");

function build(
	state: InviteLinkState = "ok",
	proceed: InviteLinkActions["proceed"] = async () => ({ url: "https://sso.test/recover/u1" }),
) {
	const calls: string[] = [];
	const actions: InviteLinkActions = {
		inspect: async (_app, clientId, tokenId) => {
			calls.push(`inspect:${clientId}:${tokenId}`);
			return state;
		},
		proceed: async (...args) => {
			calls.push("proceed");
			return proceed(...args);
		},
		signInUrl: () => "https://psizone.example/cont",
	};
	const routes = createInviteRoutes({ secret: SECRET, actions, app: "psizone", now: () => NOW });
	return { routes, calls };
}
const token = (over: Partial<Parameters<typeof signInviteToken>[0]> = {}): string =>
	signInviteToken({
		secret: SECRET,
		app: "psizone",
		clientId: "cli_1",
		tokenId: "tok-12345678",
		locale: "ro",
		expiresAt: NOW + 3_600_000,
		...over,
	});
const get = (r: ReturnType<typeof build>["routes"], t: string) => r.request(`/${t}`);
const post = (r: ReturnType<typeof build>["routes"], t: string) =>
	r.request(`/${t}`, { method: "POST" });

describe("invitation link", () => {
	it("GET shows one button and changes nothing: a mail scanner can open it", async () => {
		const { routes, calls } = build();
		const res = await get(routes, token());
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('method="post"');
		expect(html).toContain("Continuă");
		expect(calls).toEqual(["inspect:cli_1:tok-12345678"]);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(res.headers.get("x-robots-tag")).toBe("noindex");
	});
	it("POST redirects to the sign-in, and the link works again (it is not single use)", async () => {
		const { routes, calls } = build();
		for (let i = 0; i < 2; i++) {
			const res = await post(routes, token());
			expect(res.status).toBe(303);
			expect(res.headers.get("location")).toBe("https://sso.test/recover/u1");
		}
		expect(calls.filter((c) => c === "proceed")).toHaveLength(2);
	});
	it("writes the page in the language the invitation was sent in", async () => {
		const { routes } = build();
		const html = await (await get(routes, token({ locale: "en" }))).text();
		expect(html).toContain("Press the button to continue");
		expect(html).toContain('lang="en"');
	});
	for (const [state, status, text] of [
		["expired", 410, "Invitația a expirat"],
		["replaced", 410, "invitație mai nouă"],
		["revoked", 410, "nu mai este valabilă"],
		["gone", 410, "Link nevalid"],
	] as const)
		it(`a ${state} invitation says so, on GET and on POST, and never proceeds`, async () => {
			const { routes, calls } = build(state);
			for (const send of [get, post]) {
				const res = await send(routes, token());
				expect(res.status).toBe(status);
				expect(await res.text()).toContain(text);
			}
			expect(calls).not.toContain("proceed");
		});
	it("an active account is pointed to the site's sign-in, not to a password reset", async () => {
		const { routes, calls } = build("active");
		const res = await post(routes, token());
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('href="https://psizone.example/cont"');
		expect(calls).not.toContain("proceed");
	});
	it("a link past its expiry is refused before the store is asked", async () => {
		const { routes, calls } = build();
		const res = await get(routes, token({ expiresAt: NOW - 1000 }));
		expect(res.status).toBe(410);
		expect(await res.text()).toContain("Invitația a expirat");
		expect(calls).toEqual([]);
	});
	it("a forged, truncated or empty token is refused and the store is never asked", async () => {
		const { routes, calls } = build();
		const good = token();
		for (const bad of [`${good}x`, good.split(".")[0] ?? "", "abc.def", "x"]) {
			expect((await get(routes, bad)).status).toBe(400);
			expect((await post(routes, bad)).status).toBe(400);
		}
		expect(calls).toEqual([]);
	});
	it("a reminder's token cannot open an invitation", async () => {
		const { routes, calls } = build();
		const confirm = signToken({
			secret: SECRET,
			app: "psizone",
			appointmentId: "cli_1",
			action: "confirm",
			locale: "ro",
			expiresAt: NOW + 3_600_000,
		});
		expect((await get(routes, confirm)).status).toBe(400);
		expect(calls).toEqual([]);
	});
	it("a token of another app is refused", async () => {
		const { routes, calls } = build();
		expect((await get(routes, token({ app: "hemisync" }))).status).toBe(400);
		expect(calls).toEqual([]);
	});
	it("an unreachable sign-in answers 503 with a retry hint and a page, not a crash", async () => {
		const { routes } = build("ok", async () => {
			throw new Error("down");
		});
		const res = await post(routes, token());
		expect(res.status).toBe(503);
		expect(res.headers.get("retry-after")).toBe("60");
		expect(await res.text()).toContain("Nu putem continua acum");
	});
	it("a sign-in that no longer knows the account is a gone link, not a redirect", async () => {
		const { routes } = build("ok", async () => undefined);
		const res = await post(routes, token());
		expect(res.status).toBe(410);
		expect(res.headers.get("location")).toBeNull();
	});
});
