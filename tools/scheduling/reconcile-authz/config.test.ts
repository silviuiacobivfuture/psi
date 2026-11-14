import { describe, expect, it } from "vitest";
import { readConfig } from "./config";
import { createFgaReader } from "./fga";

const KEY = "k".repeat(40);
const base = {
	CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3720",
	PSI_SCHEDULING_KEY: KEY,
	OPENFGA_API_URL: "http://openfga.test:8080",
	OPENFGA_STORE_ID: "store-1",
	OPENFGA_TOKEN: "synthetic-token",
	OPENFGA_MODEL_ID: "model-1",
};

describe("the tool's configuration", () => {
	it("reads the environment, with the prefix empty by default", async () => {
		const c = await readConfig(base);
		expect(c.convexUrl).toBe("http://127.0.0.1:3720");
		expect(c.serverKey).toBe(KEY);
		expect(c.prefix).toBe("");
		expect((await readConfig({ ...base, OPENFGA_APP_PREFIX: "dev-" })).prefix).toBe("dev-");
	});

	it.each([
		["no Convex url", { CONVEX_SELF_HOSTED_URL: undefined }],
		["no server key and no admin key", { PSI_SCHEDULING_KEY: undefined }],
		["no OpenFGA store", { OPENFGA_STORE_ID: undefined }],
		["a model id of latest", { OPENFGA_MODEL_ID: "latest" }],
		["a short server key", { PSI_SCHEDULING_KEY: "short" }],
	])("refuses %s, and says nothing of any secret", async (_label, over) => {
		const error = await readConfig({ ...base, ...over }).then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(Error);
		const text = String(error);
		for (const secret of [KEY, "synthetic-token"]) expect(text).not.toContain(secret);
	});
});

describe("reading OpenFGA's tuples of a type", () => {
	const page = (tuples: string[], token = "") =>
		new Response(
			JSON.stringify({
				tuples: tuples.map((object) => ({ key: { user: "user:a", relation: "member", object } })),
				continuation_token: token,
			}),
		);

	it("follows the continuation token to the last page, asking for the type's objects", async () => {
		const asked: unknown[] = [];
		const answers = [page(["sched_client:1"], "next"), page(["sched_client:2"])];
		const reader = createFgaReader({
			url: "http://openfga.test:8080/",
			storeId: "store-1",
			token: "synthetic-token",
			fetch: async (_url, init) => {
				asked.push(JSON.parse(String(init?.body)));
				return answers.shift() ?? page([]);
			},
		});
		const got = await reader.ofType("sched_client");
		expect(got.map((t) => t.object)).toEqual(["sched_client:1", "sched_client:2"]);
		expect(asked[0]).toMatchObject({ tuple_key: { object: "sched_client:" }, page_size: 100 });
		expect(asked[1]).toMatchObject({ continuation_token: "next" });
	});

	it("fails, naming the status and not the token, when OpenFGA refuses", async () => {
		const reader = createFgaReader({
			url: "http://openfga.test:8080",
			storeId: "store-1",
			token: "synthetic-token",
			fetch: async () => new Response("no", { status: 403 }),
		});
		const error = await reader.ofType("sched_client").then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(String(error)).toContain("403");
		expect(String(error)).not.toContain("synthetic-token");
	});
});
