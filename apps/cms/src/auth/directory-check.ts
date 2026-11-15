import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { z } from "zod";

/**
 * A CMS sign-in may last as long as the estate's SESSION_LIFETIME ("never" by default), so it must
 * still end when the directory disables the person. At sign-in the CMS keeps the directory's
 * refresh token for that person (offline_access; blueprints-cms.yaml gives it the estate's
 * lifetime). Authentik deletes a deactivated account's tokens, so asking the directory whether
 * that token is still active (RFC 7662 introspection, with the cms client's own credentials; the
 * token is never spent or rotated) answers "is this person still enabled". Every two minutes:
 *
 *   active     nothing changes
 *   inactive   every CMS session of that person is removed: their next request is signed out
 *   unknown    nothing changes — never on an answer the directory did not give (down, refusing
 *              the client's credentials, an unreadable reply), as SEB's hub does
 *
 * Authentik answers `{"active": false}` with status 200 for a token it deleted AND for a client
 * it could not authenticate (authentik/providers/oauth2/views/introspection.py). So before any
 * "inactive" is believed, each sweep first proves the directory accepts the cms client:
 * a refresh with a token nobody holds must be refused as `invalid_grant` (the client is known,
 * the token is not), never `invalid_client`. Otherwise nobody is signed out that round.
 */
export type DirectoryAnswer = "active" | "inactive" | "unknown";

export const CHECK_EVERY_MS = 2 * 60 * 1000;

const Introspection = z.object({ active: z.boolean() });

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Authentik's introspection endpoint, derived from the application's issuer. */
export function introspectionUrl(issuer: string): string {
	return `${new URL(issuer).origin}/application/o/introspect/`;
}

export async function introspect(
	client: { issuer: string; clientId: string; clientSecret: string },
	token: string,
	fetchFn: Fetch,
): Promise<DirectoryAnswer> {
	let res: Response;
	try {
		res = await fetchFn(introspectionUrl(client.issuer), {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
				authorization: basic(client),
			},
			body: new URLSearchParams({
				token,
				token_type_hint: "refresh_token",
			}).toString(),
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		return "unknown";
	}
	if (res.status !== 200) return "unknown";
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		return "unknown";
	}
	const parsed = Introspection.safeParse(body);
	if (!parsed.success) return "unknown";
	return parsed.data.active ? "active" : "inactive";
}

function basic(client: { clientId: string; clientSecret: string }): string {
	const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
	return `Basic ${Buffer.from(pair).toString("base64")}`;
}

const TokenError = z.object({ error: z.string() });

/**
 * Whether the directory accepts the cms client's credentials right now: a refresh with a token
 * nobody holds answers 400 `invalid_grant` only when it does. Anything else (invalid_client,
 * a 5xx, no answer) is false, and no "inactive" is believed this round.
 */
export async function clientAccepted(
	client: { issuer: string; clientId: string; clientSecret: string },
	fetchFn: Fetch,
	probeToken: string,
): Promise<boolean> {
	try {
		const res = await fetchFn(`${new URL(client.issuer).origin}/application/o/token/`, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
				authorization: basic(client),
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: probeToken,
			}).toString(),
			signal: AbortSignal.timeout(10_000),
		});
		if (res.status !== 400) return false;
		const body = TokenError.safeParse(await res.json());
		return body.success && body.data.error === "invalid_grant";
	} catch {
		return false;
	}
}

/** The people the check asks about: signed in through the directory, with a session open. */
export type DirectoryPerson = {
	id: number | string;
	email: string;
	directoryToken: string;
};

/** Where the people and their sessions are kept (the users collection; payloadUsers below). */
export type DirectoryUsers = {
	signedIn(): Promise<DirectoryPerson[]>;
	/** Removes every session of that person and the token: each device is signed out. */
	endSessions(id: DirectoryPerson["id"]): Promise<void>;
};

export type SweepResult = {
	asked: number;
	ended: string[];
	unknown: number;
	/** False when the directory did not accept the cms client: nobody was asked or signed out. */
	trusted: boolean;
};

export async function sweep(
	users: DirectoryUsers,
	ask: (token: string) => Promise<DirectoryAnswer>,
	accepted: () => Promise<boolean>,
): Promise<SweepResult> {
	const people = await users.signedIn();
	if (people.length === 0) return { asked: 0, ended: [], unknown: 0, trusted: true };
	if (!(await accepted())) return { asked: 0, ended: [], unknown: people.length, trusted: false };
	const out: SweepResult = { asked: 0, ended: [], unknown: 0, trusted: true };
	for (const person of people) {
		out.asked += 1;
		const answer = await ask(person.directoryToken);
		if (answer === "inactive") {
			await users.endSessions(person.id);
			out.ended.push(person.email);
		} else if (answer === "unknown") {
			out.unknown += 1;
		}
	}
	return out;
}

const SessionRow = z.object({ id: z.string() });
const UserRow = z.object({
	id: z.union([z.number(), z.string()]),
	email: z.string(),
	directoryToken: z.string().min(1).nullish(),
	sessions: z.array(SessionRow).nullish(),
});

/** The users collection as the check needs it. */
export function payloadUsers(payload: Payload): DirectoryUsers {
	return {
		async signedIn(): Promise<DirectoryPerson[]> {
			const found = await payload.find({
				collection: "users",
				where: { directoryToken: { exists: true } },
				showHiddenFields: true,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			});
			const out: DirectoryPerson[] = [];
			for (const doc of found.docs) {
				const row = UserRow.parse(doc);
				if (row.directoryToken && (row.sessions ?? []).length > 0) {
					out.push({
						id: row.id,
						email: row.email,
						directoryToken: row.directoryToken,
					});
				}
			}
			return out;
		},
		async endSessions(id): Promise<void> {
			await payload.db.updateOne({
				collection: "users",
				id,
				data: { sessions: [], directoryToken: null },
				returning: false,
			});
		},
	};
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Starts the check in this process, once (Payload's onInit). */
export function startDirectoryCheck(
	payload: Payload,
	client: { issuer: string; clientId: string; clientSecret: string },
): void {
	if (timer !== undefined) return;
	const users = payloadUsers(payload);
	const run = async (): Promise<void> => {
		try {
			const r = await sweep(
				users,
				(t) => introspect(client, t, fetch),
				() => clientAccepted(client, fetch, `cms-probe-${randomUUID()}`),
			);
			if (!r.trusted) {
				payload.logger.warn(
					"the directory did not accept the cms client; nobody is signed out this round",
				);
			}
			for (const email of r.ended) {
				payload.logger.info(
					{ email },
					"the directory disabled this person: their CMS sessions are ended",
				);
			}
			if (r.unknown > 0) {
				payload.logger.warn(
					{ unknown: r.unknown },
					"the directory gave no answer for some people; their sessions are kept",
				);
			}
		} catch (err) {
			payload.logger.error({ err }, "the directory check could not run; every session is kept");
		}
	};
	timer = setInterval(() => void run(), CHECK_EVERY_MS);
	timer.unref();
}
