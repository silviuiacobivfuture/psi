import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Counter, CounterBatch, counterId } from "@psi/cms-client";
import { z } from "zod";

/** Where the counters go: the CMS (the recommended store), a local file (dev), or nowhere. */
export interface CounterSink {
	readonly kind: "cms" | "file" | "none";
	write(counters: ReadonlyArray<Counter>): Promise<void>;
}

/** POST {CMS_URL}/api/analytics/ingest with the collector's key, at most 5000 counters a call. */
export function cmsSink(cmsUrl: string, token: string, f: typeof fetch = fetch): CounterSink {
	return {
		kind: "cms",
		async write(counters) {
			for (let i = 0; i < counters.length; i += 5000) {
				const body = JSON.stringify(CounterBatch.parse({ counters: counters.slice(i, i + 5000) }));
				const r = await f(`${cmsUrl}/api/analytics/ingest`, {
					method: "POST",
					headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
					body,
					signal: AbortSignal.timeout(5000),
				});
				if (!r.ok) throw new Error(`cms ingest answered ${r.status}`);
			}
		},
	};
}

const Stored = z.object({ counters: z.array(z.unknown()) });

/**
 * DEV STORE: the counters summed into one JSON file (default .data/analytics.json, gitignored
 * with .data). One process, one writer; the file holds counters only.
 */
export function fileSink(path: string): CounterSink {
	return {
		kind: "file",
		async write(counters) {
			let stored: Counter[] = [];
			try {
				const raw = Stored.parse(JSON.parse(await readFile(path, "utf8")));
				stored = z.array(CounterBatch.shape.counters.element).parse(raw.counters);
			} catch {
				stored = [];
			}
			const all = new Map(stored.map((c) => [counterId(c), { ...c }]));
			for (const c of counters) {
				const cur = all.get(counterId(c));
				if (cur !== undefined) cur.count += c.count;
				else all.set(counterId(c), { ...c });
			}
			await mkdir(dirname(path), { recursive: true });
			await writeFile(`${path}.tmp`, JSON.stringify({ counters: [...all.values()] }));
			await rename(`${path}.tmp`, path);
		},
	};
}

export const noSink: CounterSink = { kind: "none", write: async () => undefined };
