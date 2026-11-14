import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { MASTER_KEY_ENV } from "../../src/crypto";
import { openFile, sealFile } from "./envelope";
import { Manifest } from "./manifest";
import { checkSealed, countDiff, countsOf, tablesOf } from "./verify";
import { readZip } from "./zip";

/**
 * The appointments store's backup tool (bundled to /app/backup.mjs in the scheduling-deploy image).
 *
 *   export   `convex export` of the deployment, sealed for the backup public key, with a manifest (counts, hashes)
 *   open     opens a sealed export with the private key (a restore, a drill)
 *   verify   counts the tables of an export and opens every sealed field with the master key; with --against, the
 *            counts must equal the manifest's (a restore against its source); exits 1 on any difference or failure
 *
 * Configuration is the environment, parsed here; key material is read from FILES whose paths the environment names,
 * never from the command line. Output is JSON of names, counts and hashes: never a key, never a value.
 */
const run = promisify(execFile);

const ExportEnv = z.object({
	CONVEX_SELF_HOSTED_URL: z.string().url(),
	CONVEX_SELF_HOSTED_ADMIN_KEY: z.string().min(1),
	BACKUP_PUBLIC_KEY_FILE: z.string().min(1),
	BACKUP_ENV: z.enum(["dev", "prod"]),
	BACKUP_OUT: z.string().min(1),
	CONVEX_BIN: z.string().default("./node_modules/.bin/convex"),
});

function arg(args: ReadonlyArray<string>, name: string): string {
	const i = args.indexOf(`--${name}`);
	const v = i === -1 ? undefined : args[i + 1];
	if (v === undefined || v.startsWith("--")) throw new Error(`--${name} <path> is required`);
	return v;
}
const optional = (args: ReadonlyArray<string>, name: string): string | undefined =>
	args.includes(`--${name}`) ? arg(args, name) : undefined;

async function exportCommand(): Promise<number> {
	const env = ExportEnv.parse(process.env);
	const plain = join(env.BACKUP_OUT, "export.zip");
	const sealed = join(env.BACKUP_OUT, "convex.zip.enc");
	await rm(plain, { force: true });
	// The CLI reads the deployment and its key from the environment; nothing secret is on its command line.
	await run(env.CONVEX_BIN, ["export", "--path", plain], {
		env: process.env,
		maxBuffer: 16 * 1024 * 1024,
	});
	try {
		const tables = countsOf(tablesOf(readZip(await readFile(plain))));
		const s = await sealFile(plain, sealed, await readFile(env.BACKUP_PUBLIC_KEY_FILE, "utf8"));
		const manifest: Manifest = {
			format: 1,
			env: env.BACKUP_ENV,
			createdAt: new Date().toISOString(),
			key: s.key,
			bytes: s.bytes,
			plainSha256: s.plainSha256,
			sealedSha256: s.sealedSha256,
			tables,
		};
		await writeFile(
			join(env.BACKUP_OUT, "manifest.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		process.stdout.write(`${JSON.stringify({ exported: manifest })}\n`);
	} finally {
		// The plaintext never outlives the seal.
		await rm(plain, { force: true });
	}
	return 0;
}

async function openCommand(args: ReadonlyArray<string>): Promise<number> {
	const keyFile = z.string().min(1).parse(process.env.BACKUP_PRIVATE_KEY_FILE);
	const r = await openFile(arg(args, "in"), arg(args, "out"), await readFile(keyFile, "utf8"));
	process.stdout.write(`${JSON.stringify({ opened: r })}\n`);
	return 0;
}

async function verifyCommand(args: ReadonlyArray<string>): Promise<number> {
	const tables = tablesOf(readZip(await readFile(arg(args, "zip"))));
	const counts = countsOf(tables);
	const master = process.env[MASTER_KEY_ENV];
	const sealed = master === undefined || master === "" ? null : await checkSealed(tables, master);
	const against = optional(args, "against");
	const diff =
		against === undefined
			? []
			: countDiff(Manifest.parse(JSON.parse(await readFile(against, "utf8"))).tables, counts);
	const ok = diff.length === 0 && (sealed === null || sealed.failed.length === 0);
	process.stdout.write(
		`${JSON.stringify({ ok, tables: counts, documents: Object.values(counts).reduce((a, b) => a + b, 0), sealed, diff })}\n`,
	);
	if (args.includes("--require-sealed") && sealed === null) {
		process.stderr.write(`verify: ${MASTER_KEY_ENV} is required with --require-sealed\n`);
		return 1;
	}
	return ok ? 0 : 1;
}

async function main(argv: ReadonlyArray<string>): Promise<number> {
	const [command, ...args] = argv;
	switch (command) {
		case "export":
			return exportCommand();
		case "open":
			return openCommand(args);
		case "verify":
			return verifyCommand(args);
		default:
			process.stderr.write(
				"usage: backup export | open --in <f> --out <f> | verify --zip <f> [--against <manifest>]\n",
			);
			return 2;
	}
}

main(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		// The message names the cause; no step puts a key or a value in one.
		process.stderr.write(`backup: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	},
);
