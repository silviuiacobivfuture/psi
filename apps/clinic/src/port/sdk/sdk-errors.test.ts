import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { ERROR_STATUS, type ErrorCode } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError, type PortErrorCode } from "../port";
import { createSdkPort } from "./index";

/** What the network says: a stand-in for the service's wire, not for any code of ours. */
const answering =
	(status: number, body: unknown): typeof globalThis.fetch =>
	async () =>
		new Response(typeof body === "string" ? body : JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
const port = (fetch: typeof globalThis.fetch) =>
	createSdkPort({ baseUrl: "http://service.test", bearer: async () => "t", fetch });
const failure = async (fetch: typeof globalThis.fetch): Promise<PortError> => {
	try {
		await port(fetch).audit("psizone");
	} catch (error) {
		if (error instanceof PortError) return error;
		throw error;
	}
	throw new Error("expected a refusal");
};
const refusalBody = (code: ErrorCode) => ({
	error: { code, message: "no", requestId: "req-123" },
});

const EXPECTED: Readonly<Record<ErrorCode, PortErrorCode>> = {
	invalid: "invalid",
	unauthenticated: "unauthenticated",
	invalid_token: "unauthenticated",
	forbidden: "forbidden",
	not_found: "not-found",
	conflict: "conflict",
	slot_taken: "conflict",
	hold_expired: "conflict",
	unavailable_online: "conflict",
	booking_paused: "conflict",
	not_allowed: "forbidden",
	rate_limited: "rate-limited",
	internal: "unavailable",
	unavailable: "unavailable",
};

describe("every refusal of the service becomes a typed result", () => {
	it.each(Object.entries(EXPECTED))("the service's `%s` is the port's `%s`", async (code, port) => {
		const c = code as ErrorCode;
		const e = await failure(answering(ERROR_STATUS[c], refusalBody(c)));
		expect(e.code).toBe(port);
		// the request id travels, so a person can quote it
		expect(e.message).toContain("req-123");
	});
	it("a service that cannot be reached is unavailable", async () => {
		const e = await failure(async () => {
			throw new TypeError("fetch failed");
		});
		expect(e.code).toBe("unavailable");
	});
	it("an answer in a shape the contract does not allow is unavailable, not trusted", async () => {
		expect((await failure(answering(502, "<html>bad gateway</html>"))).code).toBe("unavailable");
		expect((await failure(answering(200, { items: "nope" }))).code).toBe("unavailable");
	});
	it("a refusal is told to whoever is listening, once per call", async () => {
		const told: PortError[] = [];
		const p = createSdkPort({
			baseUrl: "http://service.test",
			bearer: async () => "t",
			fetch: answering(403, refusalBody("forbidden")),
			onError: (e) => told.push(e),
		});
		await expect(p.audit("psizone")).rejects.toBeInstanceOf(PortError);
		expect(told.map((e) => e.code)).toEqual(["forbidden"]);
	});
});

describe("the person's own token goes to the service, and nothing else", () => {
	let api: RunningApi;
	beforeAll(async () => {
		api = await startApi();
	});
	afterAll(async () => {
		await api.close();
	});

	it("every call carries the bearer it was given, never a service key", async () => {
		const seen: Array<Record<string, string>> = [];
		const token = await api.tokenFor("rita");
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: async () => token,
			fetch: async (input, init) => {
				seen.push(Object.fromEntries(new Headers(init?.headers)));
				return fetch(input, init);
			},
		});
		await p.memberships("rita");
		await p.capabilities("rita", "psizone");
		await p.requests("psizone");
		expect(seen.length).toBeGreaterThanOrEqual(3);
		for (const h of seen) {
			expect(h.authorization).toBe(`Bearer ${token}`);
			expect(h["x-service-key"]).toBeUndefined();
			expect(h["x-psi-view-as"]).toBeUndefined();
		}
	});
	it("two people through the same service are two different people: the service answers for each", async () => {
		const as = (who: string) =>
			createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(who) });
		expect((await as("rita").capabilities("rita", "psizone")).subject).toBe("rita");
		expect((await as("dora").capabilities("dora", "psizone")).subject).toBe("dora");
		await expect(as("vera").clients("psizone", "current", "")).rejects.toMatchObject({
			code: "forbidden",
		});
		expect((await as("rita").clients("psizone", "current", "")).length).toBeGreaterThan(0);
	});
	it("a token the service does not accept is `unauthenticated`", async () => {
		const p = createSdkPort({ baseUrl: api.url, bearer: async () => "not-a-token" });
		await expect(p.memberships("x")).rejects.toMatchObject({ code: "unauthenticated" });
	});
	it("an expired token is `unauthenticated` too (the console sends the person through sign-in)", async () => {
		const expired = await api.world.issuer.mint("rita", { expiresIn: -60 });
		const p = createSdkPort({ baseUrl: api.url, bearer: async () => expired });
		await expect(p.memberships("rita")).rejects.toMatchObject({ code: "unauthenticated" });
	});
	it("only while viewing as someone else does the read-only header go out", async () => {
		const seen: string[] = [];
		const p = createSdkPort({
			baseUrl: api.url,
			bearer: () => api.tokenFor("olga"),
			viewAs: "role:psizone-reception",
			fetch: async (input, init) => {
				seen.push(new Headers(init?.headers).get("x-psi-view-as") ?? "");
				return fetch(input, init);
			},
		});
		await p.requests("psizone");
		expect(seen.every((h) => h === "role:psizone-reception")).toBe(true);
	});
});
