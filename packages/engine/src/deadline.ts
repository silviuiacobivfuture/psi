/** Raised when a step of an answer outlives its budget. */
export class StepTimeoutError extends Error {
	constructor(what: string, ms: number) {
		super(`${what} timed out after ${ms}ms`);
		this.name = "StepTimeoutError";
	}
}

/** Raised when the caller (or a deadline) aborted the answer. */
export class AskAbortedError extends Error {
	constructor() {
		super("aborted");
		this.name = "AskAbortedError";
	}
}

/**
 * Settles with the promise, or rejects once `ms` pass or the signal aborts, whichever comes
 * first. The timer is always cleared, so nothing keeps the process alive.
 */
export function within<T>(
	promise: Promise<T>,
	ms: number,
	what: string,
	signal?: AbortSignal,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		if (signal?.aborted === true) {
			reject(new AskAbortedError());
			return;
		}
		const onAbort = (): void => {
			cleanup();
			reject(new AskAbortedError());
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new StepTimeoutError(what, ms));
		}, ms);
		const cleanup = (): void => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error: unknown) => {
				cleanup();
				reject(error);
			},
		);
	});
}
