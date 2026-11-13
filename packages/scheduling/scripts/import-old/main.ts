import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { MASTER_KEY_ENV } from "../../src/crypto";
import { createS3Storage, MemoryStorage, readStorageEnv } from "../../src/storage";
import { createDirSource } from "./files";
import { mappingSchema } from "./mapping";
import { formatReport } from "./report";
import { runImport } from "./run";
import { connect } from "./target";

/**
 * Imports the old scheduling app's export into the clinic store.
 *
 *   import-old.sh --export <file.json> --mapping <mapping.json> [--files <dir>] [--dry-run]
 *                 [--allow-skips] [--ignore-table <name>]... [--report <file.json>]
 *
 * A dry run needs no key and no network and prints only counts, anomalies and old ids. A real run
 * needs CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY (the wrapper reads them from the
 * local secrets), CLINIC_MASTER_KEY, and for files S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/
 * S3_SECRET_ACCESS_KEY. Nothing is ever deleted; a re-run changes nothing that did not change.
 */

const envSchema = z.object({
	CONVEX_SELF_HOSTED_URL: z.string().url(),
	CONVEX_SELF_HOSTED_ADMIN_KEY: z.string().min(10),
});

async function readJson(path: string, what: string): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		throw new Error(`cannot read the ${what} file`);
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`the ${what} file is not JSON`);
	}
}

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			export: { type: "string" },
			mapping: { type: "string" },
			files: { type: "string" },
			"dry-run": { type: "boolean", default: false },
			"allow-skips": { type: "boolean", default: false },
			"ignore-table": { type: "string", multiple: true, default: [] },
			report: { type: "string" },
		},
		strict: true,
	});
	if (values.export === undefined || values.mapping === undefined) {
		console.error("usage: import-old --export <file> --mapping <file> [--files <dir>] [--dry-run]");
		return 2;
	}
	const exported = await readJson(values.export, "export");
	const mappingRaw = mappingSchema.safeParse(await readJson(values.mapping, "mapping"));
	if (!mappingRaw.success) {
		const where = mappingRaw.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
		console.error(`the mapping file is not valid: ${where.join(", ")}`);
		return 2;
	}
	const mapping = mappingRaw.data;
	const files = values.files === undefined ? undefined : createDirSource(values.files);
	const common = {
		exported,
		mapping,
		ignoreTables: values["ignore-table"],
		allowSkips: values["allow-skips"],
		files,
	};

	let report: Awaited<ReturnType<typeof runImport>>;
	if (values["dry-run"]) {
		report = await runImport({ ...common, connect: undefined });
	} else {
		const env = envSchema.safeParse(process.env);
		if (!env.success) {
			console.error(`set ${env.error.issues.map((i) => String(i.path[0])).join(", ")}`);
			return 2;
		}
		const storageEnv = readStorageEnv(process.env);
		if (!storageEnv.ok && files !== undefined) {
			console.error(`set ${storageEnv.invalid.join(", ")} to upload files`);
			return 2;
		}
		report = await runImport({
			...common,
			connect: () =>
				connect({
					url: env.data.CONVEX_SELF_HOSTED_URL,
					adminKey: env.data.CONVEX_SELF_HOSTED_ADMIN_KEY,
					masterKey: process.env[MASTER_KEY_ENV],
					mapping,
					storage: storageEnv.ok ? createS3Storage(storageEnv.config) : new MemoryStorage(),
				}),
		});
	}
	console.log(formatReport(report));
	if (values.report !== undefined)
		await writeFile(values.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
	return report.fatal !== undefined || report.refusal !== undefined ? 1 : 0;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		// Names the failure, never a value: the errors above are built to carry none.
		console.error(error instanceof Error ? `${error.name}: ${error.message}` : "import failed");
		process.exitCode = 1;
	},
);
