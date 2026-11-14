/**
 * Setup file for every suite that can build a model or embedding client: a test never spends money and never
 * reaches a provider. The key is blanked (a blank key counts as unset), and `fetch` refuses any host that is not
 * this machine, so only the in-process fakes (a local HTTP server) are reachable. A test that needs a key sets its
 * own (`vi.stubEnv`, an explicit `apiKey`); one that needs a network is a live test and is excluded by name.
 */
process.env.OPENROUTER_API_KEY = "";

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const realFetch: typeof globalThis.fetch = globalThis.fetch;

function hostOf(input: Parameters<typeof globalThis.fetch>[0]): string {
	if (typeof input === "string") return new URL(input).hostname;
	if (input instanceof URL) return input.hostname;
	return new URL(input.url).hostname;
}

globalThis.fetch = (input, init) => {
	const host = hostOf(input);
	if (!LOCAL_HOSTS.has(host)) {
		return Promise.reject(
			new Error(`tests do not reach the network: refused a request to ${host} (use the in-process fake)`),
		);
	}
	return realFetch(input, init);
};
