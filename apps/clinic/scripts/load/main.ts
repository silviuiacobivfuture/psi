import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { type Measured, measure, type Target } from "./measure";
import { startStack } from "./stack";

/**
 * The console's and the service's load test, on the in-memory world grown to `--factor` times the clinic (~220 clients,
 * ~5600 visits at 1): p50/p95/p99 per page and per API list at `--connections` concurrent connections.
 *
 *   pnpm --filter @psi/clinic load --factor 10 --connections 20 --seconds 10 --out $PWD/scripts/load/results/after.json
 *   pnpm --filter @psi/clinic load --factor 10 --connections 20 --consoles 2   # two console replicas, a thread each
 *
 * (No `--` before the flags: node's parseArgs stops at it, and every flag would be ignored.)
 * Budgets (local, one process each): a console page p95 under 300 ms, an API list p95 under 150 ms. `--strict` exits 1
 * when one is over. The numbers measure this machine and the in-memory adapters, not Convex or OpenFGA.
 */
export const BUDGET_MS = { page: 300, api: 150 } as const;

const Args = z.object({
	factor: z.coerce.number().int().min(0).max(50).default(10),
	connections: z.coerce.number().int().min(1).max(200).default(20),
	seconds: z.coerce.number().int().min(1).max(120).default(10),
	out: z.string().optional(),
	only: z.string().optional(),
	strict: z.boolean().default(false),
	/** 0: one console in this thread, beside the load generator (the first measurements); N: N replicas, a thread each. */
	consoles: z.coerce.number().int().min(0).max(8).default(0),
});

/** A request slower than this counts as an error (autocannon's own timeout). */
const TIMEOUT_S = 10;

const failed = (t: Target): Measured => ({
	name: t.name,
	kind: t.kind,
	requests: 0,
	errors: 1,
	non2xx: 0,
	p50: Number.NaN,
	p95: Number.NaN,
	p99: Number.NaN,
	rps: 0,
	bytes: 0,
});

const DATE = "2026-11-16";
const WEEK = { from: Date.UTC(2026, 10, 15, 22), to: Date.UTC(2026, 10, 22, 22) };
const CLIENT = "cs000014";

function targets(
	consoleUrls: readonly string[],
	apiUrl: string,
	owner: string,
	therapist: string,
): Target[] {
	const page = (name: string, path: string, subject = "olga"): Target => ({
		name,
		kind: "page",
		urls: consoleUrls.map((u) => `${u}${path}`),
		headers: { cookie: `psi-clinic-dev-subject=${subject}` },
	});
	const api = (name: string, path: string, token = owner): Target => ({
		name,
		kind: "api",
		urls: [`${apiUrl}/v1/apps/psizone${path}`],
		headers: { authorization: `Bearer ${token}` },
	});
	return [
		page("page calendar week", `/calendar?view=week&date=${DATE}`),
		page("page calendar month", `/calendar?view=month&date=${DATE}`),
		page("page calendar day", `/calendar?view=day&date=${DATE}`),
		page("page clients", "/clients"),
		page("page clients search", "/clients?q=Scale%20Client%20001"),
		page("page clients (therapist)", "/clients", "dora"),
		page("page client", `/clients/${CLIENT}`),
		page("page client packages", `/clients/${CLIENT}/packages`),
		page("page client notes", `/clients/${CLIENT}/notes`),
		page("page search", "/search?q=Scale%20Client%20002"),
		page("page journal", "/settings/audit"),
		page("page requests", "/requests"),
		page("page reminders", `/reminders?date=${DATE}`),
		page("page roster", "/roster"),
		page("page settings", "/settings"),
		api("api me", "/me"),
		api("api clients.list", "/clients?limit=50"),
		api("api clients.list q", "/clients?limit=50&q=Scale%20Client%20001"),
		api("api clients.list (therapist)", "/clients?limit=50", therapist),
		api("api appointments.list week", `/appointments?from=${WEEK.from}&to=${WEEK.to}&limit=200`),
		api("api calendar.get week", `/calendar?from=${WEEK.from}&to=${WEEK.to}`),
		api("api calendar.get week first=1", `/calendar?from=${WEEK.from}&to=${WEEK.to}&first=1`),
		api("api audit.list", "/audit?limit=50"),
		api("api notes.list", `/clients/${CLIENT}/notes`),
		api("api packages.list", `/clients/${CLIENT}/packages`),
		api("api requests.list", `/requests?from=${WEEK.from - 30 * 86_400_000}&to=${WEEK.to}`),
		api("api reminders.list", `/reminders?date=${DATE}`),
		api("api members.list", "/members?limit=50"),
	];
}

function table(rows: readonly Measured[]): string {
	const head = "| target | p50 ms | p95 ms | p99 ms | req/s | bytes | errors | non-2xx | budget |";
	const line = rows.map((r) => {
		const budget = r.p95 <= BUDGET_MS[r.kind] ? "ok" : `OVER ${BUDGET_MS[r.kind]}`;
		return `| ${r.name} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.rps} | ${r.bytes} | ${r.errors} | ${r.non2xx} | ${budget} |`;
	});
	return [head, "|---|---:|---:|---:|---:|---:|---:|---:|---|", ...line].join("\n");
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			factor: { type: "string" },
			connections: { type: "string" },
			seconds: { type: "string" },
			out: { type: "string" },
			only: { type: "string" },
			strict: { type: "boolean" },
			consoles: { type: "string" },
		},
		allowPositionals: true,
	});
	const args = Args.parse(values);
	const started = Date.now();
	const stack = await startStack(args.factor, args.consoles);
	console.log(
		`world grown x${args.factor} in ${Date.now() - started} ms: ${JSON.stringify(stack.counts)}`,
	);
	try {
		const owner = await stack.tokenFor("olga");
		const therapist = await stack.tokenFor("dora");
		const all = targets(stack.consoleUrls, stack.apiUrl, owner, therapist).filter(
			(t) => args.only === undefined || t.name.startsWith(args.only),
		);
		const rows: Measured[] = [];
		for (const target of all) {
			// One warm-up request per replica: the first call of a kind fills the token and zone caches. One that takes longer than
			// the timeout is recorded as failing, not measured (it would only time out under load too).
			const warm = Date.now();
			const answers = await Promise.all(
				target.urls.map((url) =>
					fetch(url, {
						headers: target.headers,
						signal: AbortSignal.timeout(TIMEOUT_S * 1000),
					}).then(
						async (res) => {
							await res.arrayBuffer();
							return res.ok;
						},
						() => false,
					),
				),
			);
			const ok = answers.every((a) => a);
			if (!ok) {
				console.log(`${target.name}: FAILED warm-up after ${Date.now() - warm} ms`);
				rows.push(failed(target));
				continue;
			}
			const row = await measure(target, args.connections, args.seconds, TIMEOUT_S);
			console.log(`${row.name}: p50 ${row.p50} p95 ${row.p95} (${row.requests} requests)`);
			rows.push(row);
		}
		console.log(table(rows));
		if (args.out !== undefined)
			writeFileSync(
				args.out,
				`${JSON.stringify({ at: new Date().toISOString(), ...args, counts: stack.counts, rows }, null, "\t")}\n`,
			);
		const over = rows.filter((r) => r.p95 > BUDGET_MS[r.kind] || r.errors > 0 || r.non2xx > 0);
		if (args.strict && over.length > 0) {
			console.error(`over budget or failing: ${over.map((r) => r.name).join(", ")}`);
			process.exitCode = 1;
		}
	} finally {
		await stack.close();
	}
}

await main();
