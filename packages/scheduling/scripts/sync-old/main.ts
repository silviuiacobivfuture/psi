import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { MASTER_KEY_ENV } from "../../src/crypto";
import { createS3Storage, MemoryStorage, readStorageEnv } from "../../src/storage";
import { type Mapping, mappingSchema } from "../import-old/mapping";
import { connect, connectReadOnly } from "../import-old/target";
import { anonymizeExport } from "./anonymize";
import { createRemoteFileSource, fetchExport } from "./old-app";
import { createReadOnlyClient, signIn } from "./readonly-client";
import { formatSync, realDataAllowed, runSync } from "./sync";

/**
 * Keeps the new clinic store in step with the old app until the cut-over. ONE tool for every target:
 *
 *   sync-old.sh --mapping <mapping.json> [--dry-run] [--anonymize] [--allow-skips]
 *               [--ignore-table <name>]... [--report <file.json>]
 *
 * Reads the old app strictly read-only (GET; the sign-in is the one POST), writes the importer's export
 * format in memory, and runs the importer against the target: changed rows update, new rows insert, rows
 * gone from the old app are reported and never deleted. `--dry-run` prints counts only and writes nothing.
 * `--anonymize` swaps every identity for a dummy one before anything reaches the target (local and dev).
 *
 * Real data goes only where the owner said (production): without `--anonymize` the run refuses unless
 * SYNC_ALLOW_REAL=1 is set, which only the production CronJob sets.
 *
 * Environment (never logged): OLD_APP_SUPABASE_URL, OLD_APP_SUPABASE_ANON_KEY, OLD_APP_EMAIL, OLD_APP_PASSWORD;
 * the target's CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY, CLINIC_MASTER_KEY, and for files S3_*.
 */

const oldAppEnv = z.object({
	OLD_APP_SUPABASE_URL: z.string().url(),
	OLD_APP_SUPABASE_ANON_KEY: z.string().min(10),
	OLD_APP_EMAIL: z.string().min(3),
	OLD_APP_PASSWORD: z.string().min(1),
});
const targetEnv = z.object({
	CONVEX_SELF_HOSTED_URL: z.string().url(),
	CONVEX_SELF_HOSTED_ADMIN_KEY: z.string().min(10),
});

async function readMapping(path: string): Promise<Mapping | undefined> {
	try {
		const parsed = mappingSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			mapping: { type: "string" },
			"dry-run": { type: "boolean", default: false },
			anonymize: { type: "boolean", default: false },
			"allow-skips": { type: "boolean", default: false },
			"ignore-table": { type: "string", multiple: true, default: [] },
			report: { type: "string" },
		},
		strict: true,
	});
	if (values.mapping === undefined) {
		console.error(
			"usage: sync-old --mapping <file> [--dry-run] [--anonymize] [--allow-skips] [--report <file>]",
		);
		return 2;
	}
	if (
		!realDataAllowed({ anonymize: values.anonymize, dryRun: values["dry-run"], env: process.env })
	) {
		console.error(
			"refused: real data is written only where SYNC_ALLOW_REAL=1; pass --anonymize for dev and local",
		);
		return 2;
	}
	const mapping = await readMapping(values.mapping);
	if (mapping === undefined) {
		console.error("the mapping file is missing or not valid");
		return 2;
	}
	const old = oldAppEnv.safeParse(process.env);
	if (!old.success) {
		console.error(`set ${old.error.issues.map((i) => String(i.path[0])).join(", ")}`);
		return 2;
	}
	const target = targetEnv.safeParse(process.env);
	if (!target.success && !values["dry-run"]) {
		console.error(`set ${target.error.issues.map((i) => String(i.path[0])).join(", ")}`);
		return 2;
	}
	const storageEnv = readStorageEnv(process.env);
	if (!storageEnv.ok && !values["dry-run"]) {
		console.error(`set ${storageEnv.invalid.join(", ")} to store files`);
		return 2;
	}

	const accessToken = await signIn({
		url: old.data.OLD_APP_SUPABASE_URL,
		anonKey: old.data.OLD_APP_SUPABASE_ANON_KEY,
		email: old.data.OLD_APP_EMAIL,
		password: old.data.OLD_APP_PASSWORD,
	});
	const client = createReadOnlyClient({
		url: old.data.OLD_APP_SUPABASE_URL,
		anonKey: old.data.OLD_APP_SUPABASE_ANON_KEY,
		accessToken,
	});
	const fetched = await fetchExport(client, () => new Date());
	// Anonymized: the real file bytes are never even downloaded.
	const anonymized = values.anonymize ? anonymizeExport(fetched) : undefined;
	const exported = anonymized?.export ?? fetched;
	const files = anonymized?.files ?? createRemoteFileSource(client);

	const config = (storage: MemoryStorage | ReturnType<typeof createS3Storage>) =>
		target.success
			? {
					url: target.data.CONVEX_SELF_HOSTED_URL,
					adminKey: target.data.CONVEX_SELF_HOSTED_ADMIN_KEY,
					masterKey: process.env[MASTER_KEY_ENV],
					mapping,
					storage,
				}
			: undefined;
	const result = await runSync({
		exported,
		files,
		mapping,
		allowSkips: values["allow-skips"],
		ignoreTables: values["ignore-table"],
		dryRun: values["dry-run"],
		openReadOnly: async () => {
			const c = config(new MemoryStorage());
			return c === undefined ? undefined : connectReadOnly(c);
		},
		openWrite: async () => {
			const c = config(storageEnv.ok ? createS3Storage(storageEnv.config) : new MemoryStorage());
			if (c === undefined) throw new Error("the target is not configured");
			return connect(c);
		},
	});
	console.log(formatSync(result, !values["dry-run"]));
	if (values.report !== undefined)
		await writeFile(values.report, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
	return result.refused ? 1 : 0;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		// Names the failure, never a value: the errors above are built to carry none.
		console.error(error instanceof Error ? `${error.name}: ${error.message}` : "sync failed");
		process.exitCode = 1;
	},
);
