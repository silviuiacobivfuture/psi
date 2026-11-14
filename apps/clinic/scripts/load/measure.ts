import autocannon from "autocannon";

export interface Target {
	/** Short, stable: how the row is named in the results. */
	name: string;
	kind: "page" | "api";
	url: string;
	headers: Record<string, string>;
}

export interface Measured {
	name: string;
	kind: Target["kind"];
	requests: number;
	errors: number;
	non2xx: number;
	p50: number;
	p95: number;
	p99: number;
	rps: number;
	/** Bytes of one answer, uncompressed or as sent (what the network carries). */
	bytes: number;
}

/** The value at `q` (0..1) of the sorted latencies: nearest rank, as every load tool reports it. */
export function quantile(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return Number.NaN;
	const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
	return sorted[rank] ?? Number.NaN;
}

/**
 * Loads one target with `connections` concurrent connections for `seconds`, recording every response's own time
 * (autocannon's summary has no 95th percentile, so it is computed from the samples).
 */
export async function measure(
	target: Target,
	connections: number,
	seconds: number,
	timeoutSeconds: number,
): Promise<Measured> {
	const samples: number[] = [];
	let bytes = 0;
	const result = await new Promise<autocannon.Result>((resolve, reject) => {
		const instance = autocannon(
			{
				url: target.url,
				connections,
				duration: seconds,
				headers: target.headers,
				timeout: timeoutSeconds,
			},
			(error: Error | null, done: autocannon.Result) =>
				error === null ? resolve(done) : reject(error),
		);
		instance.on("response", (_client, _status, resBytes, responseTime) => {
			samples.push(responseTime);
			bytes = resBytes;
		});
	});
	samples.sort((a, b) => a - b);
	return {
		name: target.name,
		kind: target.kind,
		requests: result.requests.total,
		errors: result.errors + result.timeouts,
		non2xx: result.non2xx,
		p50: round(quantile(samples, 0.5)),
		p95: round(quantile(samples, 0.95)),
		p99: round(quantile(samples, 0.99)),
		rps: Math.round(result.requests.average),
		bytes,
	};
}

const round = (n: number): number => Math.round(n * 10) / 10;
