import {
	type CallbackResult,
	type HoldResult,
	type SchedulingClient,
	SchedulingUnavailable,
	type SubmitInput,
	type SubmitResult,
} from "@psi/scheduling";
import {
	createSchedulingClient as createSdkClient,
	type ErrorCode,
	SchedulingApiError,
	type SchedulingClient as SdkClient,
} from "@psi/scheduling-sdk";
import { getContext } from "hono/context-storage";
import type { SchedulingApiConfig } from "./service-env";

/** A submit as the site makes it: the signed-in visitor's subject (never a hash) owns the request. */
export interface VisitorSubmit extends Omit<SubmitInput, "accountHash"> {
	subject?: string;
	/** What the site's sign-in vouches for about that visitor: their e-mail, only when `email_verified`. */
	verifiedEmail?: string;
}

/**
 * What the booking forms, the callback intake and the guide's port use: the scheduling client's shape, answered by
 * the scheduling service (apps/scheduling-api) over its visitor routes with this site's service key, so a public
 * booking goes through the service's own rules, journal and team notifications like every other one.
 */
export interface VisitorScheduling extends Omit<SchedulingClient, "submit"> {
	submit(input: VisitorSubmit): Promise<SubmitResult>;
}

/**
 * The visitor's address for the service's rate limit, read as the rest of the site reads it (the guide's limiter, the
 * visitor keys): the first forwarded address, else `x-real-ip`. Outside a request (boot, warm-up) there is no visitor.
 */
function visitorAddress(): string | undefined {
	let headers: { header(name: string): string | undefined };
	try {
		headers = getContext().req;
	} catch {
		return undefined;
	}
	const address =
		headers.header("x-forwarded-for")?.split(",")[0]?.trim() || headers.header("x-real-ip")?.trim();
	return address === undefined || address === "" ? undefined : address.slice(0, 64);
}

/**
 * The service's refusal when it is one of the codes about the call itself (`expected`); any other failure (down, past
 * the deadline, rate-limited, a key it refused) is the service being unavailable, which the forms answer with the
 * callback request.
 */
function refusal<C extends ErrorCode>(error: unknown, expected: ReadonlyArray<C>, call: string): C {
	const code =
		error instanceof SchedulingApiError ? expected.find((c) => c === error.code) : undefined;
	if (code !== undefined) return code;
	if (error instanceof SchedulingApiError)
		throw new SchedulingUnavailable(`the scheduling service refused ${call} (${error.code})`);
	throw new SchedulingUnavailable(`the scheduling service could not be asked for ${call}`);
}

/** A refused hold in the words the forms branch on. */
const HOLD_REASON = {
	slot_taken: "slot_taken",
	conflict: "not_offered",
	not_found: "unknown_service",
	invalid: "invalid",
} as const satisfies Record<string, Extract<HoldResult, { ok: false }>["reason"]>;

/** The site's scheduling over the service, for one app (the tenant every call is about). */
export function createVisitorScheduling(
	config: SchedulingApiConfig,
	app: string,
): VisitorScheduling {
	const sdk = (subject?: string, verifiedEmail?: string): SdkClient => {
		const clientIp = visitorAddress();
		return createSdkClient({
			baseUrl: config.url,
			timeoutMs: config.timeoutMs,
			auth: {
				serviceKey: config.serviceKey,
				...(subject === undefined ? {} : { subject }),
				...(subject === undefined || verifiedEmail === undefined ? {} : { verifiedEmail }),
				...(clientIp === undefined ? {} : { clientIp }),
			},
		});
	};
	return {
		async services(tenant) {
			try {
				return await sdk().visitor.services({ app: tenant });
			} catch (error) {
				refusal(error, ["not_found"], "the services");
				return undefined;
			}
		},
		async findSlots(search) {
			try {
				const out = await sdk().visitor.slots({
					app: search.tenant,
					service: search.service,
					from: search.from,
					to: search.to,
					...(search.mode === undefined ? {} : { mode: search.mode }),
					...(search.limit === undefined ? {} : { limit: search.limit }),
				});
				return { ok: true, ...out };
			} catch (error) {
				refusal(error, ["not_found"], "the free times");
				return { ok: false, reason: "unknown_service" };
			}
		},
		async hold(input) {
			try {
				const { tenant, ...rest } = input;
				return { ok: true, ...(await sdk().visitor.hold({ app: tenant, ...rest })) };
			} catch (error) {
				const code = refusal(error, ["slot_taken", "conflict", "not_found", "invalid"], "a hold");
				return { ok: false, reason: HOLD_REASON[code] };
			}
		},
		async submit(input) {
			try {
				const out = await sdk(input.subject, input.verifiedEmail).visitor.submit({
					app,
					reference: input.reference,
					holdToken: input.holdToken,
					contact: input.contact,
					...(input.audience === undefined ? {} : { audience: input.audience }),
				});
				return { ok: true, ...out };
			} catch (error) {
				const reason = refusal(
					error,
					["invalid", "not_found", "hold_expired", "not_allowed", "unavailable_online"],
					"a request",
				);
				return { ok: false, reason };
			}
		},
		async release(input) {
			try {
				await sdk().visitor.release({ app, ...input });
				return { ok: true };
			} catch (error) {
				const code = refusal(
					error,
					["invalid", "not_found", "hold_expired", "not_allowed"],
					"a release",
				);
				return { ok: false, reason: code === "invalid" ? "not_found" : code };
			}
		},
		async cancel(input) {
			try {
				return { ok: true, ...(await sdk().visitor.cancel({ app, ...input })) };
			} catch (error) {
				const code = refusal(
					error,
					["invalid", "not_found", "hold_expired", "not_allowed"],
					"a cancel",
				);
				return { ok: false, reason: code === "invalid" ? "not_found" : code };
			}
		},
		async requestCallback(input): Promise<CallbackResult> {
			// Nothing leaves the site without the visitor's consent, as before.
			if (!input.consent) return { ok: false, reason: "no_consent" };
			try {
				const out = await sdk().visitor.callback({
					app: input.tenant,
					contact: input.contact,
					audience: input.audience,
					locale: input.locale,
					when: input.when,
					page: input.page,
					channel: input.channel,
					...(input.preferredStart === undefined ? {} : { preferredStart: input.preferredStart }),
					...(input.service === undefined ? {} : { service: input.service }),
				});
				return { ok: true, id: out.reference };
			} catch (error) {
				const code = refusal(error, ["invalid", "not_found", "unavailable_online"], "a callback");
				return { ok: false, reason: code === "not_found" ? "unknown_tenant" : "invalid" };
			}
		},
	};
}
