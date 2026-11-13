import { ERROR_STATUS, type ErrorCode } from "@psi/scheduling-sdk/contract";

/** A refusal with a contract code. The message is for people reading logs and never carries data. */
export class ApiError extends Error {
	override readonly name = "ApiError";
	readonly code: ErrorCode;
	readonly detail: Record<string, unknown> | undefined;

	constructor(code: ErrorCode, message: string, detail?: Record<string, unknown>) {
		super(message);
		this.code = code;
		this.detail = detail;
	}

	get status(): number {
		return ERROR_STATUS[code(this)];
	}
}

const code = (e: ApiError): ErrorCode => e.code;

export const fail = (c: ErrorCode, message: string, detail?: Record<string, unknown>): ApiError =>
	new ApiError(c, message, detail);
export const notFound = (what: string): ApiError => fail("not_found", `${what} not found`);
export const forbidden = (message = "not allowed", detail?: Record<string, unknown>): ApiError =>
	fail("forbidden", message, detail);

export const unavailableFiles = (): ApiError =>
	fail("unavailable", "file storage is not configured");
