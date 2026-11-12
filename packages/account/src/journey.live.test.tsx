/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { readBlock } from "../dev/env-block";
import { FGA_URL, LOCAL_BLOCK } from "../dev/local";
import { type Account, createAccount } from "./account";
import type { Say } from "./journey/labels";
import type { OwnReservation, ReservationsPort } from "./journey/ports";
import { registerJourney } from "./journey/routes";
import { hashSessionId } from "./seal";
import { memoryStores } from "./stores/memory";
import type { Stores } from "./stores/types";

/**
 * The signed-in journey against the REAL engine (local OpenFGA, psi's current model in a fresh store):
 * every page and write, allowed and denied. Fails, never skips, when OpenFGA is not running.
 */
const ROOT = join(import.meta.dirname, "..", "..", "..");
const key = readBlock(join(ROOT, "apps/blog-web/.env"), LOCAL_BLOCK).OPENFGA_TOKEN ?? "";
const ORIGIN = "http://journey.test";
const ANA = "local-ana";
const BOGDAN = "local-bogdan";
const COOKIE = "__Host-psi-journey-session";
const ANA_ID = "a".repeat(43);
const BOGDAN_ID = "b".repeat(43);
const NOW = Date.UTC(2026, 10, 12, 10);

/** Every journey word is its own key, so a test reads which words a page used. */
const say: Say = (key) => key;

const ANONYMOUS_CODE = "Q7RM-2KXA-9PLT-4WZE";
const ANONYMOUS: OwnReservation = {
	reference: "ANON-0001",
	status: "requested",
	mode: "online",
	start: NOW + 172_800_000,
	end: NOW + 176_400_000,
	practitionerName: "DEMO",
	submittedAt: NOW - 5000,
};

function fakeReservations(): ReservationsPort & {
	cancelled: string[];
	unlinked: string[];
} {
	const rows: Record<string, OwnReservation[]> = {
		[ANA]: [
			{
				reference: "K7M3-9QXA",
				status: "requested",
				mode: "onsite",
				start: NOW + 86_400_000,
				end: NOW + 90_000_000,
				practitionerName: "DEMO",
				submittedAt: NOW - 1000,
			},
		],
		[BOGDAN]: [
			{
				reference: "B0GD-AN00",
				status: "requested",
				mode: "online",
				start: NOW + 86_400_000,
				end: NOW + 90_000_000,
				practitionerName: "DEMO",
				submittedAt: NOW - 1000,
			},
		],
	};
	const port = {
		cancelled: [] as string[],
		unlinked: [] as string[],
		async requests(subject: string) {
			return rows[subject] ?? [];
		},
		async cancel(_subject: string, reference: string) {
			port.cancelled.push(reference);
			return true;
		},
		/** The proof: the anonymous request's reference AND its cancel code, as the store checks them. */
		async link(subject: string, reference: string, cancelCode: string) {
			if (reference !== ANONYMOUS.reference || cancelCode !== ANONYMOUS_CODE) return false;
			rows[subject] = [...(rows[subject] ?? []), ANONYMOUS];
			return true;
		},
		async unlink(subject: string) {
			port.unlinked.push(subject);
		},
	};
	return port;
}

let storeId = "";
let modelId = "";

beforeAll(async () => {
	expect(key, "run `pnpm --filter @psi/account local:up` first").not.toBe("");
	const headers = {
		authorization: `Bearer ${key}`,
		"content-type": "application/json",
	};
	const store = z.object({ id: z.string() }).parse(
		await (
			await fetch(`${FGA_URL}/stores`, {
				method: "POST",
				headers,
				body: JSON.stringify({ name: "journey-test" }),
			})
		).json(),
	);
	storeId = store.id;
	const out = execFileSync(
		"fga",
		[
			"model",
			"write",
			"--api-url",
			FGA_URL,
			"--api-token",
			key,
			"--store-id",
			storeId,
			"--file",
			join(ROOT, "estate/authz/fga.mod"),
		],
		{ encoding: "utf8" },
	);
	modelId = z
		.object({ authorization_model_id: z.string() })
		.parse(JSON.parse(out)).authorization_model_id;
});

async function setup(
	endpoint = FGA_URL,
	extra: { dataHome?: string; noReservations?: boolean } = {},
): Promise<{
	app: Hono;
	stores: Stores;
	port: ReturnType<typeof fakeReservations>;
	account: Account;
}> {
	const stores = memoryStores();
	for (const [subject, id] of [
		[ANA, ANA_ID],
		[BOGDAN, BOGDAN_ID],
	] as const) {
		await stores.accounts.signedIn(
			{
				issuer: "http://issuer.test/",
				subject,
				email: `${subject}@psi.test`,
				name: subject,
			},
			NOW,
		);
		await stores.sessions.create(hashSessionId(id), {
			subject,
			issuer: "http://issuer.test/",
			sid: null,
			idToken: "t",
			email: `${subject}@psi.test`,
			name: subject,
			createdAt: Date.now(),
			lastSeenAt: Date.now(),
		});
	}
	const account = createAccount({
		site: { slug: "journey", key: "journey", origin: ORIGIN },
		stores,
		onWarn: () => {},
		env: {
			OPENFGA_ENDPOINT: endpoint,
			OPENFGA_STORE_ID: storeId,
			OPENFGA_MODEL_ID: modelId,
			OPENFGA_TOKEN: key,
			// Sign-in configured (never discovered here): the invitation then carries its link.
			OIDC_ISSUER: "http://127.0.0.1:9/application/o/journey/",
			OIDC_ALLOW_INSECURE_LOOPBACK: "true",
			OIDC_CLIENT_ID: "journey-test",
			OIDC_CLIENT_SECRET: "journey-test-secret",
			SESSION_SECRET: "s".repeat(40),
		},
	});
	const port = fakeReservations();
	const app = new Hono();
	account.mount(app);
	registerJourney(app, {
		account,
		locale: "ro",
		base: "",
		site: "psizone",
		say,
		siteNames: { psizone: "Psizone" },
		...(extra.noReservations === true ? {} : { reservations: port }),
		...(extra.dataHome === undefined ? {} : { dataHome: extra.dataHome }),
		now: () => NOW,
		render: (c, page) => c.html(<main>{page.body}</main>, page.status === 503 ? 503 : 200),
	});
	return { app, stores, port, account };
}

const as = (id: string | null, init: RequestInit = {}) => {
	const headers = new Headers(init.headers);
	if (id !== null) headers.set("cookie", `${COOKIE}=${id}`);
	if (init.method === "POST") {
		headers.set("origin", ORIGIN);
		headers.set("sec-fetch-site", "same-origin");
		headers.set("content-type", "application/x-www-form-urlencoded");
	}
	return { ...init, headers };
};
const go = (app: Hono, path: string, id: string | null, init: RequestInit = {}) =>
	app.fetch(new Request(`${ORIGIN}${path}`, as(id, init)));

describe("the signed-in journey (live OpenFGA)", () => {
	it("invites a signed-out visitor in, back to the page they asked for, and never answers a write", async () => {
		const { app } = await setup();
		// First a silent check with the provider (prompt=none), even on a deep link…
		const silent = await go(app, "/cont/profil", null);
		expect(silent.status).toBe(302);
		expect(silent.headers.get("location")).toBe(
			"/auth/sign-in?prompt=none&return=%2Fcont%2Fprofil",
		);
		// …then, not signed in there either, a clear invitation back to the same page.
		const res = await app.fetch(
			new Request(`${ORIGIN}/cont/profil`, {
				headers: { cookie: "__Host-psi-journey-sso-checked=1" },
			}),
		);
		const html = await res.text();
		expect(html).toContain('data-account="signed-out"');
		expect(html).toContain("/auth/sign-in?return=%2Fcont%2Fprofil");
		const write = await go(app, "/cont/profil", null, {
			method: "POST",
			body: "displayName=x",
		});
		expect(write.status).toBe(303);
		expect(write.headers.get("location")).toBe("/auth/sign-in?return=%2Fcont%2Fprofil");
	});

	it("shows and changes the person's own profile; refuses another origin's write", async () => {
		const { app, stores } = await setup();
		expect(await (await go(app, "/cont/profil", ANA_ID)).text()).toContain("account_profile_title");
		const body = "displayName=Ana+Test&phone=%2B40+700+000+000&preferredContact=phone&language=en";
		const saved = await go(app, "/cont/profil", ANA_ID, {
			method: "POST",
			body,
		});
		expect(saved.headers.get("location")).toBe("/cont/profil?ok=1");
		expect(await stores.profiles.get(ANA)).toMatchObject({
			displayName: "Ana Test",
			preferredContact: "phone",
			language: "en",
		});
		const bad = await go(app, "/cont/profil", ANA_ID, {
			method: "POST",
			body: "displayName=x&phone=&preferredContact=phone&language=ro",
		});
		expect(bad.headers.get("location")).toBe("/cont/profil?invalid=1");
		const foreign = await app.fetch(
			new Request(`${ORIGIN}/cont/profil`, {
				method: "POST",
				body,
				headers: {
					cookie: `${COOKIE}=${ANA_ID}`,
					origin: "http://other.test",
					"content-type": "application/x-www-form-urlencoded",
				},
			}),
		);
		expect(foreign.status).toBe(403);
	});

	it("grants and withdraws a consent, and a withdrawal of memory deletes what was kept", async () => {
		const { app, stores } = await setup();
		await go(app, "/cont/consimtaminte", ANA_ID, {
			method: "POST",
			body: "purpose=guide_memory&action=grant",
		});
		expect(await stores.consents.current(ANA, "guide_memory")).toBe(true);
		await stores.conversations.append(ANA, "psizone", {
			question: "q",
			answer: "a",
			at: NOW,
		});
		await go(app, "/cont/consimtaminte", ANA_ID, {
			method: "POST",
			body: "purpose=guide_memory&action=withdraw",
		});
		expect(await stores.consents.current(ANA, "guide_memory")).toBe(false);
		expect(await stores.conversations.list(ANA)).toEqual([]);
		expect((await stores.consents.list(ANA))[0]?.withdrawnAt).not.toBeNull();
	});

	it("links an anonymous request only with its reference and cancel code", async () => {
		const { app } = await setup();
		const wrong = await go(app, "/cont/programari/leaga", ANA_ID, {
			method: "POST",
			body: "reference=ANON-0001&code=AAAA-AAAA-AAAA-AAAA",
		});
		expect(wrong.headers.get("location")).toBe("/cont/programari?link=failed");
		expect(await (await go(app, "/cont/programari", ANA_ID)).text()).not.toContain("ANON-0001");
		const right = await go(app, "/cont/programari/leaga", ANA_ID, {
			method: "POST",
			body: `reference=ANON-0001&code=${ANONYMOUS_CODE}`,
		});
		expect(right.headers.get("location")).toBe("/cont/programari?ok=linked");
		expect(await (await go(app, "/cont/programari", ANA_ID)).text()).toContain("ANON-0001");
		expect(await (await go(app, "/cont/programari", BOGDAN_ID)).text()).not.toContain("ANON-0001");
	});

	it("lists only the person's own reservations and cancels only those", async () => {
		const { app, port } = await setup();
		const page = await (await go(app, "/cont/programari", ANA_ID)).text();
		expect(page).toContain("K7M3-9QXA");
		expect(page).not.toContain("B0GD-AN00");
		const theirs = await go(app, "/cont/programari/anuleaza", ANA_ID, {
			method: "POST",
			body: "reference=B0GD-AN00",
		});
		expect(theirs.status).toBe(404);
		const mine = await go(app, "/cont/programari/anuleaza", ANA_ID, {
			method: "POST",
			body: "reference=K7M3-9QXA",
		});
		expect(mine.headers.get("location")).toBe("/cont/programari?ok=cancelled");
		expect(port.cancelled).toEqual(["K7M3-9QXA"]);
	});

	it("shows and deletes a person's own conversation; OpenFGA refuses another person's", async () => {
		const { app, stores } = await setup();
		await stores.conversations.append(ANA, "psizone", {
			question: "Ce este o evaluare?",
			answer: "…",
			at: NOW,
		});
		await stores.conversations.append(BOGDAN, "psizone", {
			question: "privat",
			answer: "…",
			at: NOW,
		});
		const [anas] = await stores.conversations.list(ANA);
		const [bogdans] = await stores.conversations.list(BOGDAN);
		if (anas === undefined || bogdans === undefined) throw new Error("no conversation");
		const page = await (await go(app, "/cont/conversatii", ANA_ID)).text();
		expect(page).toContain("Ce este o evaluare?");
		expect(page).not.toContain("privat");
		const denied = await go(app, `/cont/conversatii/${bogdans.id}/sterge`, ANA_ID, {
			method: "POST",
		});
		expect(denied.status).toBe(404);
		expect(await stores.conversations.get(bogdans.id)).not.toBeNull();
		await go(app, `/cont/conversatii/${anas.id}/sterge`, ANA_ID, {
			method: "POST",
		});
		expect(await stores.conversations.get(anas.id)).toBeNull();
	});

	it("exports the person's data, and erases only with the typed word", async () => {
		const { app, stores, port } = await setup();
		await stores.profiles.save(
			ANA,
			{
				displayName: "Ana",
				phone: null,
				preferredContact: "email",
				language: "ro",
			},
			NOW,
		);
		const exported = await go(app, "/cont/date/export", ANA_ID);
		expect(exported.headers.get("content-disposition")).toContain("attachment");
		const data = z
			.object({
				account: z.object({ subject: z.string() }),
				profile: z.object({ displayName: z.string() }),
				reservations: z.array(z.unknown()),
			})
			.parse(await exported.json());
		expect(data).toMatchObject({
			account: { subject: ANA },
			profile: { displayName: "Ana" },
		});
		expect(data.reservations).toHaveLength(1);
		const wrong = await go(app, "/cont/date/sterge", ANA_ID, {
			method: "POST",
			body: "confirm=nu",
		});
		expect(wrong.headers.get("location")).toBe("/cont/date?mismatch=1");
		expect(await stores.accounts.get(ANA)).not.toBeNull();
		const erased = await go(app, "/cont/date/sterge", ANA_ID, {
			method: "POST",
			body: "confirm=account_erase_word",
		});
		expect(erased.status).toBe(303);
		expect(await stores.accounts.get(ANA)).toBeNull();
		expect(await stores.profiles.get(ANA)).toBeNull();
		expect(port.unlinked).toEqual([ANA]);
		expect(await stores.accounts.get(BOGDAN)).not.toBeNull();
	});

	it("sends export and erasure to the data home where the site keeps no reservations", async () => {
		const home = "https://landing.psizone.ro/cont/date";
		const { app, stores } = await setup(FGA_URL, {
			dataHome: home,
			noReservations: true,
		});
		expect(await (await go(app, "/cont/date", ANA_ID)).text()).toContain(home);
		expect((await go(app, "/cont/date/export", ANA_ID)).headers.get("location")).toBe(home);
		const erase = await go(app, "/cont/date/sterge", ANA_ID, {
			method: "POST",
			body: "confirm=account_erase_word",
		});
		expect(erase.headers.get("location")).toBe(home);
		expect(await stores.accounts.get(ANA)).not.toBeNull();
	});

	it("forgets all of a person's conversations and none of anyone else's", async () => {
		const { app, stores } = await setup();
		await stores.conversations.append(ANA, "psizone", {
			question: "a",
			answer: "b",
			at: NOW,
		});
		await stores.conversations.append(ANA, "blog", {
			question: "c",
			answer: "d",
			at: NOW,
		});
		await stores.conversations.append(BOGDAN, "psizone", {
			question: "e",
			answer: "f",
			at: NOW,
		});
		await go(app, "/cont/conversatii/sterge-tot", ANA_ID, { method: "POST" });
		expect(await stores.conversations.list(ANA)).toEqual([]);
		expect(await stores.conversations.list(BOGDAN)).toHaveLength(1);
	});

	it("offers only the purposes the site uses, and refuses any other", async () => {
		const { app, stores } = await setup();
		const page = await (await go(app, "/cont/consimtaminte", ANA_ID)).text();
		expect(page).toContain('data-purpose="guide_memory"');
		expect(page).not.toContain('data-purpose="programme_progress"');
		await go(app, "/cont/consimtaminte", ANA_ID, {
			method: "POST",
			body: "purpose=programme_progress&action=grant",
		});
		expect(await stores.consents.current(ANA, "programme_progress")).toBe(false);
	});

	it("fails closed: OpenFGA away answers 503 and shows nothing", async () => {
		const { app } = await setup("http://127.0.0.1:9");
		const res = await go(app, "/cont/programari", ANA_ID);
		expect(res.status).toBe(503);
		expect(await res.text()).not.toContain("K7M3-9QXA");
	});
});
