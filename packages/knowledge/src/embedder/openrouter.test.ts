import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenRouterEmbedder, DEFAULT_EMBED_MODEL, openRouterSpace } from "./openrouter";
import { embedderFromEnv } from "./select";

/**
 * The network is replaced by a stub `fetch` (the provider's documented test seam); no request
 * leaves the machine and no real key is used. The live endpoint is NOT exercised here.
 */

const RequestBody = z.object({
	model: z.string(),
	input: z.array(z.string()),
	provider: z.object({ data_collection: z.string() }),
});

interface Seen {
	url: string;
	auth: string | null;
	body: z.infer<typeof RequestBody>;
}

function stubFetch(seen: Seen[], dimension = 3): typeof fetch {
	return async (input, init) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const headers = new Headers(init?.headers);
		const body = RequestBody.parse(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
		seen.push({ url, auth: headers.get("authorization"), body });
		const data = body.input.map((text, index) => ({
			object: "embedding",
			index,
			embedding: Array.from({ length: dimension }, (_, d) => text.length + d),
		}));
		return new Response(JSON.stringify({ object: "list", data, model: body.model }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	};
}

describe("the OpenRouter embedder", () => {
	it("posts to /embeddings with the model, the inputs and data_collection: deny", async () => {
		const seen: Seen[] = [];
		const e = createOpenRouterEmbedder({ apiKey: "test-key", fetch: stubFetch(seen) });
		const vectors = await e.embed(["ab", "abcd"]);
		expect(vectors).toEqual([
			[2, 3, 4],
			[4, 5, 6],
		]);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.url).toBe("https://openrouter.ai/api/v1/embeddings");
		expect(seen[0]?.auth).toBe("Bearer test-key");
		expect(seen[0]?.body).toEqual({
			model: DEFAULT_EMBED_MODEL,
			input: ["ab", "abcd"],
			provider: { data_collection: "deny" },
		});
		expect(e.kind).toBe("openrouter");
	});

	it("batches large inputs and keeps their order", async () => {
		const seen: Seen[] = [];
		const e = createOpenRouterEmbedder({ apiKey: "k", model: "x/y", fetch: stubFetch(seen, 1) });
		const texts = Array.from({ length: 150 }, (_, i) => "a".repeat(i + 1));
		const vectors = await e.embed(texts);
		expect(seen.map((s) => s.body.input.length)).toEqual([64, 64, 22]);
		expect(vectors.map((v) => v[0])).toEqual(texts.map((t) => t.length));
	});

	it("rejects a response with the wrong number of vectors", async () => {
		const short: typeof fetch = async () =>
			new Response(JSON.stringify({ object: "list", data: [], model: "m" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		const e = createOpenRouterEmbedder({ apiKey: "k", fetch: short });
		await expect(e.embed(["a"])).rejects.toThrow(/0 vectors for 1 inputs/);
	});

	it("names a stable, SQL-safe vector space per model", () => {
		const s = openRouterSpace("openai/text-embedding-3-small");
		expect(s).toMatch(/^[a-z0-9_]{1,24}$/);
		expect(openRouterSpace("openai/text-embedding-3-small")).toBe(s);
		expect(openRouterSpace("openai/text-embedding-3-large")).not.toBe(s);
	});
});

describe("embedderFromEnv", () => {
	it("falls back to the lexical embedder without a key (or with a blank one)", () => {
		expect(embedderFromEnv({}).kind).toBe("lexical");
		expect(embedderFromEnv({ OPENROUTER_API_KEY: "  " }).kind).toBe("lexical");
	});

	it("picks OpenRouter when a key is present, model from PSI_EMBED_MODEL", () => {
		const e = embedderFromEnv({
			OPENROUTER_API_KEY: "k",
			PSI_EMBED_MODEL: "qwen/qwen3-embedding-8b",
		});
		expect(e.kind).toBe("openrouter");
		expect(e.model).toBe("qwen/qwen3-embedding-8b");
		expect(embedderFromEnv({ OPENROUTER_API_KEY: "k" }).model).toBe(DEFAULT_EMBED_MODEL);
	});
});
