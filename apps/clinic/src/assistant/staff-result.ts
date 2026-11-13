import type { PortResult } from "@psi/engine/staff";
import { PortError } from "../port/port";

export const ok = <T>(value: T): PortResult<T> => ({ ok: true, value });
export const refused = (
	reason: "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable",
): PortResult<never> => ({
	ok: false,
	reason,
});

/** The console port's refusal, in the assistant's words: what the person can act on, and "unavailable" for the rest. */
export function refusalOf(
	error: PortError,
): "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable" {
	switch (error.code) {
		case "not-found":
			return "not_found";
		case "forbidden":
		case "unauthenticated":
			return "forbidden";
		case "conflict":
			return "conflict";
		case "invalid":
			return "invalid";
		case "unavailable":
		case "rate-limited":
		case "not-available-yet":
			return "unavailable";
		default: {
			const never: never = error.code;
			return never;
		}
	}
}

/** A service port that threw is `not_found`, `invalid` or `unavailable`: nothing else leaks out. */
export async function wrap<T>(work: () => Promise<PortResult<T>>): Promise<PortResult<T>> {
	try {
		return await work();
	} catch (error) {
		// Nothing leaks to the assistant, but the cause is kept for whoever runs the console.
		console.error("[clinic] the assistant's port call failed:", error);
		if (error instanceof PortError) return refused(refusalOf(error));
		return refused("unavailable");
	}
}
