import { SchedulingApiError, SchedulingTransportError } from "@psi/scheduling-sdk";
import { PortError } from "../port";

/**
 * The service's refusals, as the port's typed results. A screen branches on `code`, never on a message; the message
 * carries the request id so a person can quote it.
 */
export function toPortError(error: unknown): PortError {
	if (error instanceof PortError) return error;
	if (error instanceof SchedulingApiError) {
		const quote = `${error.code} (${error.requestId})`;
		// The service's own reason inside a code (`no_email`, `already_active`): a screen words each one.
		const reason = typeof error.detail?.reason === "string" ? error.detail.reason : undefined;
		switch (error.code) {
			case "invalid":
				return new PortError("invalid", quote, [], reason);
			case "unauthenticated":
			case "invalid_token":
				return new PortError("unauthenticated", quote);
			case "forbidden":
			case "not_allowed":
				return new PortError("forbidden", quote, [], reason);
			case "not_found":
				return new PortError("not-found", quote);
			case "conflict":
			case "slot_taken":
			case "hold_expired":
			case "unavailable_online":
				return new PortError("conflict", quote, [], reason);
			// A pause that blocks staff too: the screen says booking is stopped, by its own reason.
			case "booking_paused":
				return new PortError("conflict", quote, [], "booking_paused");
			case "rate_limited":
				return new PortError("rate-limited", quote);
			case "internal":
			case "unavailable":
				return new PortError("unavailable", quote, [], reason);
			default: {
				const never: never = error.code;
				return new PortError("unavailable", String(never));
			}
		}
	}
	if (error instanceof SchedulingTransportError) return new PortError("unavailable", error.reason);
	return new PortError("unavailable", "the scheduling service could not be asked");
}
