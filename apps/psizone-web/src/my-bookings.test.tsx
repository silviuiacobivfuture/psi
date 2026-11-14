import { createAccount, memoryStores, registerJourney } from "@psi/account";
import { type MockIssuer, type MockPerson, startMockIssuer } from "@psi/account/dev/mock-issuer";
import { type Browser, createBrowser } from "@psi/account/dev/test-browser";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { ownBookings } from "@psi/scheduling-sdk";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountSay } from "./account";

/**
 * "Programările mele" end to end: the site's real journey and its SDK adapter, over the real scheduling service on a
 * socket, signed in through an Authentik-shaped issuer. OpenFGA is the one thing stood in for: it answers as the
 * model does for a person's own records (the owner, named in the contextual tuples, may view and edit).
 */
const ORIGIN = "http://psizone.test";
const ANA: MockPerson = { sub: "visitor-ana-01", email: "ana@example.test", name: "Ana Client" };
const SECRET = "s".repeat(64);
const HOUR = 3_600_000;

let api: RunningApi;
let mock: MockIssuer;
let browser: Browser;
/** What the next calls use as the person's token for the service: theirs, or one the service refuses. */
let token: "own" | "refused" = "own";

/** OpenFGA as the model answers a person's own records: allowed when the owner tuple names the asking user. */
const ownerFga: typeof globalThis.fetch = async (input, init) => {
	const body = JSON.parse(String(init?.body ?? "{}")) as {
		tuple_key?: { user: string; object: string };
		contextual_tuples?: { tuple_keys: { user: string; object: string }[] };
		checks?: {
			tuple_key: { user: string; object: string };
			contextual_tuples?: { tuple_keys: { user: string; object: string }[] };
			correlation_id: string;
		}[];
	};
	const owns = (
		key: { user: string; object: string },
		ctx?: { tuple_keys: { user: string; object: string }[] },
	) => (ctx?.tuple_keys ?? []).some((t) => t.user === key.user && t.object === key.object);
	if (String(input).endsWith("/batch-check"))
		return Response.json({
			result: Object.fromEntries(
				(body.checks ?? []).map((c) => [
					c.correlation_id,
					{ allowed: owns(c.tuple_key, c.contextual_tuples) },
				]),
			),
		});
	return Response.json({
		allowed: body.tuple_key === undefined ? false : owns(body.tuple_key, body.contextual_tuples),
	});
};

const go = async (path: string, init?: RequestInit) =>
	(await browser.go(`${ORIGIN}${path}`, init)).res;
const post = (path: string, values: Record<string, string>) =>
	browser.go(`${ORIGIN}${path}`, {
		method: "POST",
		body: new URLSearchParams(values),
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			origin: ORIGIN,
			"sec-fetch-site": "same-origin",
		},
	});
const site = (method: string, path: string, body?: unknown) =>
	api.world.callKey("psizone-web", method, `/v1/apps/psizone${path}`, body, {
		"x-psi-subject": ANA.sub,
	});

/** Ana books the `nth` free time of the evaluation through the site's booking flow. */
async function book(nth: number): Promise<string> {
	const now = api.world.clock.now;
	const slots = (
		await site(
			"GET",
			`/book/slots?service=evaluation&from=${now}&to=${now + 10 * 24 * HOUR}&limit=40`,
		)
	).json.slots as { practitioner: string; start: number }[];
	const slot = slots[nth];
	if (slot === undefined) throw new Error("no slot");
	const held = await site("POST", "/book/holds", {
		service: "evaluation",
		practitioner: slot.practitioner,
		start: slot.start,
		mode: "onsite",
		locale: "ro",
		channel: "form",
	});
	const sent = await site("POST", `/book/holds/${String(held.json.reference)}/submit`, {
		holdToken: String(held.json.holdToken),
		contact: { name: "Ana Client", email: "ana@example.test" },
	});
	return String(sent.json.reference);
}
const mine = async () =>
	(await site("GET", "/me/appointments")).json.items as {
		id: string;
		reference: string;
		status: string;
		start: number;
		canChange: boolean;
	}[];

beforeAll(async () => {
	api = await startApi();
	mock = await startMockIssuer({
		clients: [
			{
				slug: "psizone-web",
				clientId: "psizone-test",
				clientSecret: "psizone-secret",
				redirectUris: [`${ORIGIN}/auth/callback`],
				postLogoutRedirectUris: [`${ORIGIN}/`],
				logoutUri: `${ORIGIN}/auth/backchannel-logout`,
			},
		],
		people: [ANA],
	});
	const account = createAccount({
		site: { slug: "psizone-web", key: "psizone", origin: ORIGIN },
		stores: memoryStores(),
		onWarn: () => {},
		fetch: ownerFga,
		env: {
			OIDC_ISSUER: mock.issuer("psizone-web"),
			OIDC_CLIENT_ID: "psizone-test",
			OIDC_CLIENT_SECRET: "psizone-secret",
			SESSION_SECRET: SECRET,
			OIDC_ALLOW_INSECURE_LOOPBACK: "true",
			OPENFGA_ENDPOINT: "http://fga.test",
			OPENFGA_STORE_ID: "store-test",
			OPENFGA_MODEL_ID: "model-test",
			OPENFGA_TOKEN: "fga-token",
		},
	});
	const app = new Hono();
	account.mount(app);
	registerJourney(app, {
		account,
		locale: "ro",
		base: "",
		site: "psizone",
		say: accountSay("ro"),
		siteNames: { psizone: "Psizone" },
		bookings: ownBookings({ baseUrl: api.url, app: "psizone" }),
		// The service here trusts its own test issuer: the person's token is minted there, for their subject.
		tokenFor: async (_c, person) =>
			token === "own" ? api.tokenFor(person.subject) : "refused.token.value",
		now: () => api.world.clock.now,
		render: (c, page) =>
			c.html(`<main>${String(page.body)}</main>`, page.status === 503 ? 503 : 200),
	});
	browser = createBrowser({ [ORIGIN]: (req) => app.fetch(req) });
	await go("/auth/sign-in?return=%2Fcont");
});
afterAll(async () => {
	await mock.close();
	await api.close();
});

describe("Programările mele", () => {
	it("lists the person's own bookings through the service: upcoming with until when they may change, and the way to move", async () => {
		const reference = await book(12);
		const html = await (await go("/cont/programari")).text();
		expect(html).toContain(`data-reference="${reference}"`);
		expect(html).toContain('data-bookings="upcoming"');
		expect(html).toContain("Se poate anula sau muta online până la");
		expect(html).toContain("/muta");
	});

	it("a booking at the edge of the clinic's notice offers no change online, and says to call", async () => {
		const reference = await book(0);
		const html = await (await go("/cont/programari")).text();
		const row = html.slice(html.indexOf(`data-reference="${reference}"`));
		expect(row.slice(0, row.indexOf("</li>"))).toContain("Nu se mai poate schimba online");
	});

	it("moves a booking to another free time of the same person: the page says so and the service holds the new time", async () => {
		await book(14);
		const before = (await mine()).find((r) => r.canChange && r.status === "requested");
		if (before === undefined) throw new Error("fixture");
		const page = await (await go(`/cont/programari/${encodeURIComponent(before.id)}/muta`)).text();
		expect(page).toContain("data-move-form");
		const start = page.match(/name="start" value="(\d+)"/)?.[1];
		expect(start).toBeDefined();
		const moved = await post(`/cont/programari/${encodeURIComponent(before.id)}/muta`, {
			start: String(start),
			mode: "onsite",
		});
		expect(await moved.res.text()).toContain("Programarea a fost mutată.");
		const after = await mine();
		expect(after.find((r) => r.reference === before.reference)?.status).toBe("cancelled");
		expect(after.some((r) => r.start === Number(start) && r.status === "requested")).toBe(true);
	});

	it("cancels a booking of the person's own; the service shows it cancelled", async () => {
		const reference = await book(16);
		const row = (await mine()).find((r) => r.reference === reference);
		const done = await post("/cont/programari/anuleaza", { id: String(row?.id) });
		expect(done.res.status).toBe(200);
		expect((await mine()).find((r) => r.reference === reference)?.status).toBe("cancelled");
	});

	it("a booking that is not the person's is not found, and nothing changes", async () => {
		const before = await mine();
		const res = await post("/cont/programari/anuleaza", { id: "q-not-hers-0001" });
		expect(res.res.status).toBe(404);
		expect(await mine()).toEqual(before);
		expect((await go("/cont/programari/q-not-hers-0001/muta")).status).toBe(404);
	});

	it("a token the service refuses sends the person through a silent sign-in once, then says the service is unavailable", async () => {
		token = "refused";
		try {
			const walk = await browser.go(`${ORIGIN}/cont/programari`);
			// Out through the provider without a screen (prompt=none), back once (fresh=1), and no further.
			expect(walk.trail.some((u) => u.includes("prompt=none"))).toBe(true);
			expect(walk.trail.at(-1)).toContain("fresh=1");
			expect(walk.trail.length).toBeLessThan(8);
			expect(walk.res.status).toBe(503);
		} finally {
			token = "own";
		}
	});
});
