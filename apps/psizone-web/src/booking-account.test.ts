import type { Account } from "@psi/account";
import type { Guide } from "@psi/guide";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { account } from "./account";
import { bookingAccount, guideForRequest } from "./booking-account";

/** The site's account whose store is down: every read refuses as a dead database does. */
const down = (): Account => {
	const refused = Object.assign(
		new Error("connect ECONNREFUSED 127.0.0.1:55451 postgres://u:p@h"),
		{
			code: "ECONNREFUSED",
		},
	);
	return {
		...account,
		origin: "http://localhost",
		status: { ...account.status, identity: "ready" },
		person: async () => {
			throw refused;
		},
	};
};

const guide: Guide = {
	brand: "psizone",
	model: "test",
	async *ask() {
		yield { type: "done" };
	},
};

function app(source: Account): Hono {
	const h = new Hono();
	h.get("/programare", async (c) => c.json(await bookingAccount(c, "ro", "/programare", source)));
	h.get("/ghid", async (c) => c.json(await guideForRequest(c, guide, source)));
	return h;
}

describe("the account's store is down", () => {
	afterEach(() => vi.restoreAllMocks());

	it("the booking goes on as for a visitor without an account, and the log names only the code", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await app(down()).request("http://localhost/programare");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ prefill: {} });
		expect(log).toHaveBeenCalledTimes(1);
		const said = String(log.mock.calls[0]?.[0]);
		expect(said).toBe("account: unavailable for a booking (ECONNREFUSED)");
		expect(said).not.toContain("postgres://");
	});

	it("the guide answers without memory instead of failing", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await app(down()).request("http://localhost/ghid");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ brand: "psizone", model: "test" });
		expect(log).toHaveBeenCalledTimes(1);
	});

	it("a working account is untouched: a signed-out visitor gets the sign-in line, nothing is logged", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const fine: Account = {
			...down(),
			person: async () => null,
			signInHref: (to: string) => `/cont/intra?to=${encodeURIComponent(to)}`,
		};
		const res = await app(fine).request("http://localhost/programare");
		expect(await res.json()).toEqual({
			form: { signedIn: false, signInHref: "/cont/intra?to=%2Fprogramare" },
			prefill: {},
		});
		expect(log).not.toHaveBeenCalled();
	});
});
