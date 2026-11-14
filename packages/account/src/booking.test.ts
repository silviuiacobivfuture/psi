import type { Guide } from "@psi/guide";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Account, createAccount } from "./account";
import { createBookingAccounts } from "./booking";

const SITE = { slug: "test-web", key: "psizone", origin: "http://localhost" } as const;
const base = createAccount({ site: SITE });

/** The site's account whose store is down: every read refuses as a dead database does. */
const down = (): Account => {
	const refused = Object.assign(
		new Error("connect ECONNREFUSED 127.0.0.1:55451 postgres://u:p@h"),
		{ code: "ECONNREFUSED" },
	);
	return {
		...base,
		origin: "http://localhost",
		status: { ...base.status, identity: "ready" },
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

const accounts = createBookingAccounts({
	account: base,
	site: "psizone",
	base: (locale) => (locale === "ro" ? "" : "/en"),
	listsRequests: true,
});

function app(source: Account): Hono {
	const h = new Hono();
	h.get("/programare", async (c) =>
		c.json(await accounts.bookingAccount(c, "ro", "/contact", source)),
	);
	h.get("/ghid", async (c) => c.json(await accounts.guideForRequest(c, guide, source)));
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

	it("a request from another origin is anonymous: no account is read", async () => {
		const reads = vi.fn();
		const source: Account = { ...down(), person: reads };
		const h = new Hono();
		h.post("/programare", async (c) =>
			c.json(await accounts.bookingAccount(c, "ro", "/contact", source)),
		);
		const res = await h.request("http://localhost/programare", {
			method: "POST",
			headers: { origin: "http://evil.test" },
		});
		expect(await res.json()).toEqual({ prefill: {} });
		expect(reads).not.toHaveBeenCalled();
	});
});

describe("a site that does not list requests in its account", () => {
	it("a signed-in person is pre-filled but the request carries no account and links no bookings page", async () => {
		const quiet = createBookingAccounts({
			account: base,
			site: "hemisync",
			base: () => "",
			listsRequests: false,
		});
		const signedIn: Account = {
			...down(),
			person: async () => ({
				subject: "sub-1",
				user: "user:sub-1",
				name: "Ana",
				email: "ana@example.test",
			}),
		};
		const h = new Hono();
		h.get("/", async (c) => c.json(await quiet.bookingAccount(c, "ro", "/contact", signedIn)));
		const body = await (await h.request("http://localhost/")).json();
		expect(body.form).toEqual({ signedIn: true });
		expect(body).not.toHaveProperty("subject");
		expect(body).not.toHaveProperty("bookingsHref");
	});
});
