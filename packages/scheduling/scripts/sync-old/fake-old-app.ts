import type { Fetch } from "./readonly-client";

/**
 * A stand-in for the old app's Supabase, for the sync's tests: password sign-in, PostgREST table reads (limit,
 * offset, order by id) and authenticated storage reads. It records every request so a test can assert what the
 * tool did to it: its method, its path, nothing else.
 */
export interface FakeOldApp {
	fetch: Fetch;
	requests: Array<{ method: string; path: string }>;
	tables: Record<string, unknown[]>;
	files: Map<string, Uint8Array<ArrayBuffer>>;
	/** The token the fake hands out and then demands on every read. */
	token: string;
}

export const FAKE_URL = "https://old-app.example.test";
export const FAKE_EMAIL = "sync@example.test";
export const FAKE_PASSWORD = "correct horse battery staple";

export function createFakeOldApp(
	tables: Record<string, unknown[]>,
	files: Iterable<[string, Uint8Array<ArrayBuffer>]> = [],
): FakeOldApp {
	const fake: FakeOldApp = {
		requests: [],
		tables,
		files: new Map(files),
		token: "tok-0123456789-abcdef",
		fetch: async (input, init) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			fake.requests.push({ method, path: url.pathname });
			if (method === "POST" && url.pathname === "/auth/v1/token") {
				const body = JSON.parse(String(init?.body)) as { email?: string; password?: string };
				return body.email === FAKE_EMAIL && body.password === FAKE_PASSWORD
					? Response.json({ access_token: fake.token })
					: new Response("{}", { status: 400 });
			}
			const headers = new Headers(init?.headers);
			if (headers.get("authorization") !== `Bearer ${fake.token}`)
				return new Response("{}", { status: 401 });
			if (method !== "GET") return new Response("{}", { status: 405 });
			const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
			if (rest?.[1] !== undefined) {
				const rows = fake.tables[rest[1]];
				if (rows === undefined) return new Response("{}", { status: 404 });
				const limit = Number(url.searchParams.get("limit") ?? rows.length);
				const offset = Number(url.searchParams.get("offset") ?? 0);
				const byId = [...rows].sort(
					(a, b) => Number((a as { id: number }).id) - Number((b as { id: number }).id),
				);
				return Response.json(byId.slice(offset, offset + limit));
			}
			const object = /^\/storage\/v1\/object\/authenticated\/(.+)$/.exec(url.pathname);
			if (object?.[1] !== undefined) {
				const bytes = fake.files.get(decodeURIComponent(object[1]));
				return bytes === undefined ? new Response("{}", { status: 404 }) : new Response(bytes);
			}
			return new Response("{}", { status: 404 });
		},
	};
	return fake;
}
