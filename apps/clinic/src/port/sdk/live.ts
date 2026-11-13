import type { SchedulingClient } from "@psi/scheduling-sdk";
import type { LiveSignal } from "../port";
import { toPortError } from "./errors";

export interface Backoff {
	baseMs: number;
	maxMs: number;
}
export const DEFAULT_BACKOFF: Backoff = { baseMs: 500, maxMs: 15_000 };

/** Waits, or ends early when the signal aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();
		const timer = setTimeout(done, ms);
		function done(): void {
			clearTimeout(timer);
			signal.removeEventListener("abort", done);
			resolve();
		}
		signal.addEventListener("abort", done);
	});
}

type Source = (
	after: number | undefined,
	signal: AbortSignal,
) => AsyncIterable<{ seq: number; signal: LiveSignal | null }>;

/**
 * One stream, kept open: when it drops (the network, a rolling restart, the service closing it) it is opened again
 * after a growing pause, resuming after the last event it saw. A refusal that waiting cannot cure (sign-in gone, no
 * permission, not built yet) ends it by throwing; everything else is retried for as long as the page is open.
 */
async function* keepOpen(
	open: Source,
	signal: AbortSignal,
	backoff: Backoff,
): AsyncGenerator<LiveSignal> {
	let after: number | undefined;
	let failures = 0;
	while (!signal.aborted) {
		try {
			for await (const event of open(after, signal)) {
				failures = 0;
				after = event.seq;
				if (event.signal !== null) yield event.signal;
			}
		} catch (error) {
			if (signal.aborted) return;
			const refusal = toPortError(error);
			if (
				refusal.code === "unauthenticated" ||
				refusal.code === "forbidden" ||
				refusal.code === "not-available-yet"
			)
				throw refusal;
		}
		if (signal.aborted) return;
		failures += 1;
		await pause(Math.min(backoff.maxMs, backoff.baseMs * 2 ** (failures - 1)), signal);
	}
}

/** The three streams of an app, merged: whenever any says something changed, one signal. Ends when `signal` aborts. */
export async function* liveSignals(
	api: SchedulingClient,
	app: string,
	signal: AbortSignal,
	backoff: Backoff = DEFAULT_BACKOFF,
	onError: (error: unknown) => void = () => {},
): AsyncGenerator<LiveSignal> {
	const sources: Source[] = [
		async function* (after, s) {
			for await (const e of api.calendar.stream(
				{ app, ...(after === undefined ? {} : { after }) },
				{ signal: s },
			))
				yield { seq: e.seq, signal: e.op === "ready" ? null : { stream: "calendar" as const } };
		},
		async function* (after, s) {
			for await (const e of api.requests.stream(
				{ app, ...(after === undefined ? {} : { after }) },
				{ signal: s },
			))
				yield { seq: e.seq, signal: e.op === "ready" ? null : { stream: "requests" as const } };
		},
		async function* (after, s) {
			for await (const e of api.inbox.stream(
				{ app, ...(after === undefined ? {} : { after }) },
				{ signal: s },
			))
				yield {
					seq: e.seq,
					signal: {
						stream: "inbox" as const,
						counts: {
							requests: e.requests,
							...(e.reminders === undefined ? {} : { reminders: e.reminders }),
						},
					},
				};
		},
	];
	const queue: LiveSignal[] = [];
	let wake: (() => void) | undefined;
	let ended = 0;
	const stop = new AbortController();
	const link = (): void => stop.abort();
	signal.addEventListener("abort", link);
	for (const open of sources) {
		void (async () => {
			try {
				for await (const s of keepOpen(open, stop.signal, backoff)) {
					queue.push(s);
					wake?.();
				}
			} catch (error) {
				// A stream that can never open (no permission, not built yet) is silent: the others carry on.
				onError(error);
			} finally {
				ended += 1;
				wake?.();
			}
		})();
	}
	try {
		while (!signal.aborted && ended < sources.length) {
			const next = queue.shift();
			if (next !== undefined) yield next;
			else
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
		}
	} finally {
		signal.removeEventListener("abort", link);
		stop.abort();
	}
}
