import autocannon from "autocannon";

export interface Target {
	/** Short, stable: how the row is named in the results. */
	name: string;
	kind: "page" | "api";
	/** One URL, or one per replica of the same thing (the connections are spread over them, as an ingress would). */
	urls: readonly string[];
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

interface Run {
	result: autocannon.Result;
	samples: number[];
	bytes: number;
}

/** One autocannon run against one URL, recording every response's own time. */
function run(
	url: string,
	headers: Record<string, string>,
	connections: number,
	seconds: number,
	timeoutSeconds: number,
): Promise<Run> {
	const samples: number[] = [];
	let bytes = 0;
	return new Promise<Run>((resolve, reject) => {
		const instance = autocannon(
			{ url, connections, duration: seconds, headers, timeout: timeoutSeconds },
			(error: Error | null, done: autocannon.Result) =>
				error === null ? resolve({ result: done, samples, bytes }) : reject(error),
		);
		instance.on("response", (_client, _status, resBytes, responseTime) => {
			samples.push(responseTime);
			bytes = resBytes;
		});
	});
}

/**
 * Loads one target with `connections` concurrent connections for `seconds` (spread evenly over its URLs, all at once),
 * computing the percentiles from every sample (autocannon's summary has no 95th percentile).
 */
export async function measure(
	target: Target,
	connections: number,
	seconds: number,
	timeoutSeconds: number,
): Promise<Measured> {
	const share = (i: number): number =>
		Math.floor(connections / target.urls.length) + (i < connections % target.urls.length ? 1 : 0);
	const runs = await Promise.all(
		target.urls
			.map((url, i) => ({ url, connections: share(i) }))
			.filter((r) => r.connections > 0)
			.map((r) => run(r.url, target.headers, r.connections, seconds, timeoutSeconds)),
	);
	const samples = runs.flatMap((r) => r.samples).sort((a, b) => a - b);
	const sum = (pick: (r: Run) => number): number => runs.reduce((s, r) => s + pick(r), 0);
	return {
		name: target.name,
		kind: target.kind,
		requests: sum((r) => r.result.requests.total),
		errors: sum((r) => r.result.errors + r.result.timeouts),
		non2xx: sum((r) => r.result.non2xx),
		p50: round(quantile(samples, 0.5)),
		p95: round(quantile(samples, 0.95)),
		p99: round(quantile(samples, 0.99)),
		rps: Math.round(sum((r) => r.result.requests.average)),
		bytes: runs[0]?.bytes ?? 0,
	};
}

const round = (n: number): number => Math.round(n * 10) / 10;
