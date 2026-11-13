import { z } from "zod";

export interface FeedOptions {
	/** Novu's API origin (in-cluster `http://novu-api.novu.svc.cluster.local:3000` or the public host). */
	apiUrl: string;
	/** The estate environment's application identifier (`secret/apps/novu/estate` → `application_id`). */
	applicationId: string;
	/** The environment's secret key: it derives each person's subscriber hash, it never leaves the server. */
	secretKey: string;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	timeoutMs?: number;
}

export class FeedUnavailable extends Error {
	override readonly name = "FeedUnavailable";
}

const Session = z.object({ data: z.object({ token: z.string().min(10) }) });
const Notification = z.object({
	id: z.string(),
	subject: z.string().nullish(),
	body: z.string().default(""),
	isRead: z.boolean(),
	createdAt: z.string(),
	redirect: z.object({ url: z.string() }).nullish(),
});
export type FeedNotification = z.infer<typeof Notification>;
const List = z.object({ data: z.array(Notification) });
const Count = z.object({
	data: z.union([
		z.object({ count: z.number() }),
		z.object({ counts: z.array(z.object({ count: z.number() })) }),
	]),
});

export interface Feed {
	list(
		subscriberId: string,
		limit: number,
	): Promise<{ entries: ReadonlyArray<FeedNotification>; unread: number }>;
	markRead(subscriberId: string, notificationId: string): Promise<void>;
	markAllRead(subscriberId: string): Promise<void>;
}

import { subscriberHash } from "../identity";

const SESSION_MS = 10 * 60_000;

/**
 * Novu's Inbox API with the person's subscriber hash (secure mode): a session per subscriber is
 * opened with HMAC(secret key, subscriber id), then used as a bearer token. The browser never sees
 * the key or the token — the console's server is the only client.
 */
export function createFeed(options: FeedOptions): Feed {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const now = options.now ?? Date.now;
	const base = `${options.apiUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/inbox`;
	const sessions = new Map<string, { token: Promise<string>; until: number }>();

	async function send(
		method: string,
		path: string,
		token: string | undefined,
		body?: unknown,
	): Promise<Response> {
		try {
			return await doFetch(`${base}${path}`, {
				method,
				headers: {
					"content-type": "application/json",
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
			});
		} catch {
			throw new FeedUnavailable("Novu could not be reached");
		}
	}

	async function open(subscriberId: string): Promise<string> {
		const res = await send("POST", "/session", undefined, {
			applicationIdentifier: options.applicationId,
			subscriber: subscriberId,
			subscriberHash: subscriberHash(options.secretKey, subscriberId),
		});
		if (!res.ok) throw new FeedUnavailable(`Novu refused the inbox session (${res.status})`);
		const parsed = Session.safeParse(await res.json().catch(() => null));
		if (!parsed.success) throw new FeedUnavailable("Novu answered the inbox session unexpectedly");
		return parsed.data.data.token;
	}

	/** One session per person at a time, shared by calls made together. */
	function session(subscriberId: string, fresh = false): Promise<string> {
		const kept = sessions.get(subscriberId);
		if (!fresh && kept !== undefined && kept.until > now()) return kept.token;
		const token = open(subscriberId);
		sessions.set(subscriberId, { token, until: now() + SESSION_MS });
		token.catch(() => sessions.delete(subscriberId));
		return token;
	}

	/** One call with the person's token; a 401 opens a fresh session once. */
	async function authed(
		subscriberId: string,
		method: string,
		path: string,
		body?: unknown,
	): Promise<Response> {
		let res = await send(method, path, await session(subscriberId), body);
		if (res.status === 401) res = await send(method, path, await session(subscriberId, true), body);
		if (!res.ok) throw new FeedUnavailable(`Novu answered ${res.status}`);
		return res;
	}

	return {
		async list(subscriberId, limit) {
			const filters = encodeURIComponent(JSON.stringify([{ read: false }]));
			const [feed, count] = await Promise.all([
				authed(subscriberId, "GET", `/notifications?limit=${limit}`),
				authed(subscriberId, "GET", `/notifications/count?filters=${filters}`),
			]);
			const list = List.safeParse(await feed.json().catch(() => null));
			const counted = Count.safeParse(await count.json().catch(() => null));
			if (!list.success || !counted.success)
				throw new FeedUnavailable("Novu answered the inbox unexpectedly");
			const c = counted.data.data;
			return {
				entries: list.data.data,
				unread: "count" in c ? c.count : c.counts.reduce((n, x) => n + x.count, 0),
			};
		},
		async markRead(subscriberId, id) {
			await authed(subscriberId, "PATCH", `/notifications/${encodeURIComponent(id)}/read`);
		},
		async markAllRead(subscriberId) {
			await authed(subscriberId, "POST", "/notifications/read", {});
		},
	};
}
