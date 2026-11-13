import type { ErrorBodyType, ErrorCode } from "./contract/index";

/** The service refused the call: a typed code to branch on, the request id to quote, never a message to parse. */
export class SchedulingApiError extends Error {
	override readonly name = "SchedulingApiError";
	readonly code: ErrorCode;
	readonly status: number;
	readonly requestId: string;
	readonly detail: Record<string, unknown> | undefined;

	constructor(status: number, body: ErrorBodyType["error"]) {
		super(`${body.code}: ${body.message}`);
		this.code = body.code;
		this.status = status;
		this.requestId = body.requestId;
		this.detail = body.detail;
	}
}

/** The service could not be asked: unreachable, past the deadline, or it answered in a shape the contract does not allow. */
export class SchedulingTransportError extends Error {
	override readonly name = "SchedulingTransportError";
	readonly reason: "unreachable" | "timeout" | "bad_response";

	constructor(reason: "unreachable" | "timeout" | "bad_response", message: string) {
		super(message);
		this.reason = reason;
	}
}
