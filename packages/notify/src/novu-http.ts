import { z } from "zod";

export interface NovuHttpOptions {
	apiUrl: string;
	secretKey: string;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
}

/** Novu answered, but not with success. `retryable` is true for 408, 429 and 5xx. */
export class NovuRefused extends Error {
	override readonly name = "NovuRefused";
	constructor(
		readonly status: number,
		readonly retryable: boolean,
		/** Novu answered from the Idempotency-Key's kept refusal (`Idempotency-Replay: true`). */
		readonly replay = false,
	) {
		super(`Novu answered ${status}`);
	}
}

/** Novu could not be reached (or did not answer in time). Always retryable. */
export class NovuUnreachable extends Error {
	override readonly name = "NovuUnreachable";
	constructor() {
		super("Novu could not be reached");
	}
}

const TriggerAnswer = z.object({
	data: z.object({
		acknowledged: z.boolean(),
		status: z.string(),
		transactionId: z.string().optional(),
	}),
});

export interface SubscriberFields {
	subscriberId: string;
	email?: string;
	phone?: string;
	firstName?: string;
	lastName?: string;
	locale?: string;
	data?: Record<string, string>;
}

export type Target = { subscriberId: string; fields?: SubscriberFields } | { topicKey: string };

export interface TriggerBody {
	workflow: string;
	to: Target;
	payload: Record<string, unknown>;
	overrides?: Record<string, Record<string, string>>;
}

export interface NovuHttp {
	trigger(body: TriggerBody, idempotencyKey: string): Promise<{ status: string }>;
	upsertSubscriber(fields: SubscriberFields): Promise<void>;
	ensureTopic(key: string, name: string): Promise<void>;
	addToTopic(key: string, subscriberIds: ReadonlyArray<string>): Promise<void>;
	removeFromTopic(key: string, subscriberIds: ReadonlyArray<string>): Promise<void>;
	/** Replaces the push device tokens of a subscriber for one Push Webhook integration. */
	setPushTokens(
		subscriberId: string,
		integrationIdentifier: string,
		tokens: ReadonlyArray<string>,
	): Promise<void>;
}

/** The slice of Novu's REST API (/v1) the estate's apps use, with a deadline on every call. */
export function createNovuHttp(options: NovuHttpOptions): NovuHttp {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const base = options.apiUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

	async function call(
		method: string,
		path: string,
		body: unknown,
		headers: Record<string, string> = {},
	): Promise<Response> {
		let res: Response;
		try {
			res = await doFetch(`${base}/v1${path}`, {
				method,
				headers: {
					"content-type": "application/json",
					authorization: `ApiKey ${options.secretKey}`,
					...headers,
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
			});
		} catch {
			throw new NovuUnreachable();
		}
		return res;
	}

	function check(res: Response, tolerate: ReadonlyArray<number> = []): void {
		if (res.ok || tolerate.includes(res.status)) return;
		throw new NovuRefused(
			res.status,
			res.status === 408 || res.status === 429 || res.status >= 500,
			res.headers.get("idempotency-replay") === "true",
		);
	}

	return {
		async trigger(body, idempotencyKey) {
			const to =
				"topicKey" in body.to
					? { type: "Topic", topicKey: body.to.topicKey }
					: { subscriberId: body.to.subscriberId, ...body.to.fields };
			const res = await call(
				"POST",
				"/events/trigger",
				{
					name: body.workflow,
					to,
					payload: body.payload,
					...(body.overrides ? { overrides: body.overrides } : {}),
				},
				{ "idempotency-key": idempotencyKey },
			);
			check(res);
			const parsed = TriggerAnswer.safeParse(await res.json().catch(() => null));
			if (!parsed.success) throw new NovuRefused(res.status, false);
			// Novu answers 2xx for a workflow that is not active and queues nothing: not a delivery.
			if (parsed.data.data.status !== "processed") throw new NovuRefused(422, false);
			return { status: parsed.data.data.status };
		},
		async upsertSubscriber(fields) {
			check(await call("POST", "/subscribers", fields));
		},
		async ensureTopic(key, name) {
			check(await call("POST", "/topics", { key, name }), [409]);
		},
		async addToTopic(key, ids) {
			if (ids.length > 0)
				check(
					await call("POST", `/topics/${encodeURIComponent(key)}/subscribers`, {
						subscribers: ids,
					}),
				);
		},
		async setPushTokens(subscriberId, integrationIdentifier, tokens) {
			check(
				await call("PUT", `/subscribers/${encodeURIComponent(subscriberId)}/credentials`, {
					providerId: "push-webhook",
					integrationIdentifier,
					credentials: { deviceTokens: [...tokens] },
				}),
			);
		},
		async removeFromTopic(key, ids) {
			if (ids.length > 0)
				check(
					await call("POST", `/topics/${encodeURIComponent(key)}/subscribers/removal`, {
						subscribers: ids,
					}),
				);
		},
	};
}
