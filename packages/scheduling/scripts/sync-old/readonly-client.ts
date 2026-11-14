import { z } from "zod";

/**
 * The only way this tool talks to the old app, and it cannot write to it BY CONSTRUCTION:
 *
 *  - the data client has one method, `get`; there is no method to call for anything else, and the one function that
 *    reaches `fetch` (`send`) throws `ReadOnlyViolation` for any verb but GET, before any request is made;
 *  - it only reaches table reads (`/rest/v1/<table>`) and stored objects (`/storage/v1/object/...`); a GET of
 *    `/rest/v1/rpc/...` would RUN a database function (which may write), so it is refused too;
 *  - the sign-in is a separate function with ONE fixed target, Supabase Auth's password grant
 *    (`POST /auth/v1/token?grant_type=password`). It creates a session for the account and changes no data.
 *
 * Errors name the failure and the status, never a body, a token or a password.
 */

export class ReadOnlyViolation extends Error {
	override readonly name = "ReadOnlyViolation";
}

export class OldAppError extends Error {
	override readonly name = "OldAppError";
	readonly status: number | undefined;

	constructor(message: string, status?: number) {
		super(message);
		this.status = status;
	}
}

export type Fetch = typeof globalThis.fetch;

const READ_PATHS = [
	/^\/rest\/v1\/(?!rpc(\/|$))[a-z_][a-z0-9_]*$/,
	/^\/storage\/v1\/object\/authenticated\/[^?#]+$/,
];

function baseOf(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new OldAppError("the old app's URL is not a URL");
	}
	const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
	if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))
		throw new OldAppError("the old app's URL must be https");
	return parsed;
}

/** The rule, stated once: only a GET, and only of a table read or a stored object. Throws before any request. */
export function assertReadOnly(method: string, path: string): void {
	if (method !== "GET") throw new ReadOnlyViolation(`the old app is read-only: ${method} refused`);
	if (!READ_PATHS.some((allowed) => allowed.test(path)))
		throw new ReadOnlyViolation("the old app is read-only: only table reads and stored objects");
}

/** The one place a request leaves for the old app's data. */
async function send(
	doFetch: Fetch,
	base: URL,
	method: string,
	path: string,
	query: Readonly<Record<string, string>>,
	headers: Readonly<Record<string, string>>,
): Promise<Response> {
	assertReadOnly(method, path);
	const url = new URL(base.origin + path);
	for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
	try {
		return await doFetch(url, { method: "GET", headers, redirect: "error" });
	} catch {
		throw new OldAppError("the old app is unreachable");
	}
}

export interface ReadOnlyClient {
	/** GET `path` (a table read or a stored object); the response, unread. */
	get(path: string, query?: Readonly<Record<string, string>>): Promise<Response>;
}

export interface ReadOnlyConfig {
	url: string;
	anonKey: string;
	/** The signed-in user's JWT, from `signIn`. */
	accessToken: string;
	fetch?: Fetch;
}

export function createReadOnlyClient(config: ReadOnlyConfig): ReadOnlyClient {
	const base = baseOf(config.url);
	const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
	const headers = {
		apikey: config.anonKey,
		authorization: `Bearer ${config.accessToken}`,
		accept: "application/json",
	};
	return { get: (path, query = {}) => send(doFetch, base, "GET", path, query, headers) };
}

const TokenResponse = z.object({ access_token: z.string().min(10) });

/** The password grant: the account's e-mail and password for a user JWT. Nothing else is ever POSTed. */
export async function signIn(config: {
	url: string;
	anonKey: string;
	email: string;
	password: string;
	fetch?: Fetch;
}): Promise<string> {
	const base = baseOf(config.url);
	const doFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
	const target = new URL(`${base.origin}/auth/v1/token`);
	target.searchParams.set("grant_type", "password");
	let res: Response;
	try {
		res = await doFetch(target, {
			method: "POST",
			headers: { apikey: config.anonKey, "content-type": "application/json" },
			body: JSON.stringify({ email: config.email, password: config.password }),
			redirect: "error",
		});
	} catch {
		throw new OldAppError("the old app's sign-in is unreachable");
	}
	if (!res.ok) throw new OldAppError(`the old app refused the sign-in (${res.status})`, res.status);
	const parsed = TokenResponse.safeParse(await res.json().catch(() => undefined));
	if (!parsed.success) throw new OldAppError("the old app's sign-in answered no token");
	return parsed.data.access_token;
}
