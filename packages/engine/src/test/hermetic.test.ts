import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { readOpenRouterKey } from "../model";

/** The suites' setup (.mono/vitest/hermetic.ts): a test never holds a key and never reaches a provider. */
describe("tests are hermetic", () => {
	it("the provider key is unset, whatever the shell holds", () => {
		expect(readOpenRouterKey(process.env)).toBeUndefined();
	});

	it("a request to the real provider is refused before it leaves the machine", async () => {
		await expect(fetch("https://openrouter.ai/api/v1/chat/completions")).rejects.toThrow(
			/do not reach the network.*openrouter\.ai/,
		);
	});

	it("any other external host is refused too, by URL object or request", async () => {
		await expect(fetch(new URL("https://example.com/"))).rejects.toThrow(/example\.com/);
		await expect(fetch(new Request("https://example.org/"))).rejects.toThrow(/example\.org/);
	});

	it("this machine still answers: the in-process fakes are reachable", async () => {
		const server = createServer((_req, res) => res.end("ok"));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const address = server.address();
			if (address === null || typeof address === "string") throw new Error("no port");
			const res = await fetch(`http://127.0.0.1:${address.port}/`);
			expect(await res.text()).toBe("ok");
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
