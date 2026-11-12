/**
 * The closed error union of SEB's authorization contract (docs/autorizare/03-contracts §5), verbatim.
 * Callers branch on `code`; `message` is for a log and is never parsed or shown to a person.
 */
export type AuthzErrorCode =
	/** No token, or one OpenFGA refuses. */
	| "unauthenticated"
	/** Authenticated and refused. */
	| "forbidden"
	/** Malformed request, unknown relation or type, an unqualified id, a caller-supplied `now`. */
	| "invalid"
	| "not_found"
	| "conflict"
	| "rate_limited"
	/** OpenFGA is unreachable or failing. Safe to retry; the client already did. */
	| "unavailable"
	/** The pinned `authorization_model_id` is not in this store. Fixed by re-pinning, never by waiting. */
	| "model_stale"
	/** Anything unclassified. Never branch on it. */
	| "unknown";

export class AuthzError extends Error {
	readonly code: AuthzErrorCode;

	constructor(code: AuthzErrorCode, message: string) {
		super(message);
		this.name = "AuthzError";
		this.code = code;
	}

	/** Whether retrying could plausibly succeed: OpenFGA's judgement, not the caller's. */
	get retryable(): boolean {
		return this.code === "unavailable" || this.code === "rate_limited";
	}
}

/** OpenFGA's own codes meaning the pinned model is unusable (D5: re-pin, do not retry). */
const MODEL_PIN_CODES = new Set(["authorization_model_not_found", "invalid_authorization_model"]);

/** Maps an OpenFGA HTTP status (and its `{code}` body field) onto the union. */
export function classify(status: number, upstreamCode: string | undefined): AuthzErrorCode {
	if (upstreamCode !== undefined && MODEL_PIN_CODES.has(upstreamCode)) return "model_stale";
	if (status === 401) return "unauthenticated";
	if (status === 403) return "forbidden";
	if (status === 404) return "not_found";
	if (status === 409) return "conflict";
	if (status === 429) return "rate_limited";
	if (status >= 500) return "unavailable";
	if (status >= 400) return "invalid";
	return "unknown";
}
