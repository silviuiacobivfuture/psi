import { describe, expect, it } from "vitest";
import { createFakeOldApp, FAKE_EMAIL, FAKE_PASSWORD, FAKE_URL } from "./fake-old-app";
import { fetchExport, SYNCED_TABLES } from "./old-app";
import {
	assertReadOnly,
	createReadOnlyClient,
	OldAppError,
	ReadOnlyViolation,
	signIn,
} from "./readonly-client";

const EMPTY: Record<string, unknown[]> = Object.fromEntries(SYNCED_TABLES.map((t) => [t, []]));

const clientOf = (fake: ReturnType<typeof createFakeOldApp>) =>
	createReadOnlyClient({
		url: FAKE_URL,
		anonKey: "anon-key-0123456789",
		accessToken: fake.token,
		fetch: fake.fetch,
	});

describe("the old app is read-only, by construction", () => {
	it.each([
		"POST",
		"PUT",
		"PATCH",
		"DELETE",
		"HEAD",
		"OPTIONS",
		"get",
		"",
	])("refuses %s before any request", (method) => {
		expect(() => assertReadOnly(method, "/rest/v1/clients")).toThrow(ReadOnlyViolation);
	});

	it("allows a GET of a table and of a stored object", () => {
		expect(() => assertReadOnly("GET", "/rest/v1/clients")).not.toThrow();
		expect(() =>
			assertReadOnly("GET", "/storage/v1/object/authenticated/avize/a.pdf"),
		).not.toThrow();
	});

	it.each([
		"/rest/v1/rpc/delete_everything",
		"/rest/v1/rpc",
		"/auth/v1/token",
		"/auth/v1/admin/users",
		"/rest/v1/",
		"/rest/v1/clients?select=*",
		"/storage/v1/object/public/avize/a.pdf",
		"/storage/v1/bucket",
		"/functions/v1/anything",
	])("refuses to GET %s: it is not a table read or a stored object", async (path) => {
		const fake = createFakeOldApp({});
		await expect(clientOf(fake).get(path)).rejects.toBeInstanceOf(ReadOnlyViolation);
		expect(fake.requests).toEqual([]);
	});

	it("the client has one method, get: there is nothing else to call", () => {
		const client = clientOf(createFakeOldApp({}));
		expect(Object.keys(client)).toEqual(["get"]);
	});

	it("a whole export is GET requests only, plus the one sign-in POST, and nothing else", async () => {
		const fake = createFakeOldApp({ ...EMPTY, clients: [{ id: 1 }], therapists: [{ id: 1 }] });
		const token = await signIn({
			url: FAKE_URL,
			anonKey: "anon-key-0123456789",
			email: FAKE_EMAIL,
			password: FAKE_PASSWORD,
			fetch: fake.fetch,
		});
		expect(token).toBe(fake.token);
		await fetchExport(clientOf(fake), () => new Date("2026-11-13T10:00:00Z"));
		const posts = fake.requests.filter((r) => r.method !== "GET");
		expect(posts).toEqual([{ method: "POST", path: "/auth/v1/token" }]);
		expect(new Set(fake.requests.filter((r) => r.method === "GET").map((r) => r.method))).toEqual(
			new Set(["GET"]),
		);
		expect(
			fake.requests.every((r) => r.path === "/auth/v1/token" || r.path.startsWith("/rest/v1/")),
		).toBe(true);
	});

	it("never follows a redirect (a redirect could turn a GET into a request elsewhere)", async () => {
		let init: RequestInit | undefined;
		const client = createReadOnlyClient({
			url: FAKE_URL,
			anonKey: "anon-key-0123456789",
			accessToken: "tok-0123456789",
			fetch: async (_input, i) => {
				init = i;
				return Response.json([]);
			},
		});
		await client.get("/rest/v1/clients");
		expect(init?.redirect).toBe("error");
		expect(init?.method).toBe("GET");
	});

	it("insists on https, except for a local test server", () => {
		const make = (url: string) => () =>
			createReadOnlyClient({ url, anonKey: "anon-key-0123456789", accessToken: "tok-0123456789" });
		expect(make("http://old-app.example.test")).toThrow(OldAppError);
		expect(make("not a url")).toThrow(OldAppError);
		expect(make("https://old-app.example.test")).not.toThrow();
		expect(make("http://localhost:54321")).not.toThrow();
	});
});

describe("the sign-in and the reads, without leaking", () => {
	it("a refused sign-in names the status and neither the password nor the e-mail", async () => {
		const fake = createFakeOldApp({});
		const error = await signIn({
			url: FAKE_URL,
			anonKey: "anon-key-0123456789",
			email: FAKE_EMAIL,
			password: "wrong-password",
			fetch: fake.fetch,
		}).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(OldAppError);
		const text = String((error as Error).message);
		expect(text).toContain("400");
		for (const secret of ["wrong-password", FAKE_EMAIL, "anon-key"])
			expect(text).not.toContain(secret);
	});

	it("an unreachable old app names the failure, not the URL's query or the key", async () => {
		const error = await signIn({
			url: FAKE_URL,
			anonKey: "anon-key-0123456789",
			email: FAKE_EMAIL,
			password: FAKE_PASSWORD,
			fetch: async () => {
				throw new Error(`connect failed for ${FAKE_PASSWORD}`);
			},
		}).catch((e: unknown) => e);
		expect(String((error as Error).message)).not.toContain(FAKE_PASSWORD);
	});

	it("a read with a wrong token is refused by the old app and says only the status", async () => {
		const fake = createFakeOldApp({ clients: [{ id: 1 }] });
		const client = createReadOnlyClient({
			url: FAKE_URL,
			anonKey: "anon-key-0123456789",
			accessToken: "tok-wrong-wrong-wrong",
			fetch: fake.fetch,
		});
		const error = await fetchExport(client, () => new Date()).catch((e: unknown) => e);
		expect(String((error as Error).message)).toContain("401");
		expect(String((error as Error).message)).not.toContain("tok-wrong");
	});

	it("reads every table the importer knows, in pages, in id order", async () => {
		const rows = Array.from({ length: 2300 }, (_v, i) => ({ id: 2300 - i }));
		const fake = createFakeOldApp({ ...EMPTY, clients: rows });
		const out = await fetchExport(clientOf(fake), () => new Date("2026-11-13T10:00:00Z"));
		expect(out.exported_at).toBe("2026-11-13T10:00:00.000Z");
		expect(Object.keys(out.tables).sort()).toEqual([...SYNCED_TABLES].sort());
		expect((out.tables.clients ?? []).map((r) => (r as { id: number }).id)).toEqual(
			Array.from({ length: 2300 }, (_v, i) => i + 1),
		);
		expect(fake.requests.filter((r) => r.path === "/rest/v1/clients")).toHaveLength(3);
	});

	it("a missing table is an error, except the ones the importer requires to be empty", async () => {
		const fake = createFakeOldApp({});
		const error = await fetchExport(clientOf(fake), () => new Date()).catch((e: unknown) => e);
		expect(String((error as Error).message)).toContain("404 for table therapists");
		const withAll = createFakeOldApp(
			Object.fromEntries(
				Object.entries(EMPTY).filter(
					([t]) => !["nfb_feedback", "psychotherapy_intake", "client_therapies"].includes(t),
				),
			),
		);
		const out = await fetchExport(clientOf(withAll), () => new Date());
		expect(out.tables.nfb_feedback).toEqual([]);
	});
});
