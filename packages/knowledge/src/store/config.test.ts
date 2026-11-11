import { describe, expect, it } from "vitest";
import { chromaFromEnv, resolveVectorConfig } from "./config";

describe("chromaFromEnv", () => {
	it("is null when CHROMA_URL is unset or blank", () => {
		expect(chromaFromEnv({})).toBeNull();
		expect(chromaFromEnv({ CHROMA_URL: "  " })).toBeNull();
	});

	it("reads the URL, key, header, tenant and database, trimmed", () => {
		expect(
			chromaFromEnv({
				CHROMA_URL: " https://chroma.psizone.ro ",
				CHROMA_API_KEY: "secret",
				CHROMA_AUTH_HEADER: "x-chroma-token",
				CHROMA_TENANT: "psi",
				CHROMA_DATABASE: "knowledge",
			}),
		).toEqual({
			kind: "chroma",
			url: "https://chroma.psizone.ro",
			apiKey: "secret",
			authHeader: "x-chroma-token",
			tenant: "psi",
			database: "knowledge",
		});
	});

	it("leaves unset refinements out", () => {
		expect(chromaFromEnv({ CHROMA_URL: "http://localhost:8000", CHROMA_API_KEY: "" })).toEqual({
			kind: "chroma",
			url: "http://localhost:8000",
		});
	});

	it("refuses a Chroma setting without CHROMA_URL", () => {
		expect(() => chromaFromEnv({ CHROMA_API_KEY: "secret" })).toThrow(
			/CHROMA_API_KEY set without CHROMA_URL/,
		);
	});

	it("refuses an unknown auth header", () => {
		expect(() =>
			chromaFromEnv({ CHROMA_URL: "http://localhost:8000", CHROMA_AUTH_HEADER: "cookie" }),
		).toThrow();
	});
});

describe("resolveVectorConfig", () => {
	const chromaEnv = { CHROMA_URL: "http://localhost:8000" };

	it("takes an explicit vector over CHROMA_URL and url", () => {
		const c = resolveVectorConfig(
			{ url: "file:a.db", vector: { kind: "libsql", url: "file:b.db" } },
			chromaEnv,
		);
		expect(c).toEqual({ kind: "libsql", url: "file:b.db" });
	});

	it("takes CHROMA_URL over url, with Chroma's default tenant, database and header", () => {
		expect(resolveVectorConfig({ url: "file:a.db" }, chromaEnv)).toEqual({
			kind: "chroma",
			url: "http://localhost:8000",
			authHeader: "authorization",
			tenant: "default_tenant",
			database: "default_database",
		});
	});

	it("falls back to LibSQL at url when CHROMA_URL is unset", () => {
		expect(resolveVectorConfig({ url: "file:a.db", authToken: "t" }, {})).toEqual({
			kind: "libsql",
			url: "file:a.db",
			authToken: "t",
		});
	});

	it("refuses when no store is named at all", () => {
		expect(() => resolveVectorConfig({}, {})).toThrow(/no vector store/);
	});

	it("refuses an explicit vector with a blank url", () => {
		expect(() => resolveVectorConfig({ vector: { kind: "chroma", url: " " } }, {})).toThrow();
	});
});
