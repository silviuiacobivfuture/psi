/**
 * DEV ONLY — psi's account stack on a workstation, loopback-only:
 *
 *   pnpm --filter @psi/account local:up     OpenFGA (pinned by digest, in-memory) on 127.0.0.1:18080 with psi's model
 *                                           written; Postgres on 127.0.0.1:55451; each site's .env gets a managed block
 *   pnpm --filter @psi/account local:down   removes both containers (the .env blocks stay; `up` rewrites them)
 *
 * The four sites' `.env` files are gitignored and kept at mode 600. Only the block between the markers below is
 * written; every other line is left as it is and no value is ever printed. Secrets in the block are random per run
 * and exist only on this machine. Needs docker and the `fga` CLI (SEB: authz/tools/install-fga.sh).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { writeBlock } from "./env-block";

if (process.env.NODE_ENV === "production")
	throw new Error("dev/local.ts refuses NODE_ENV=production");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OPENFGA_IMAGE =
	"docker.io/openfga/openfga:v1.19.0@sha256:b9543c46f1efd110968ef1d4db65194348651b99f11d013c63a5207c95a3b86c";
const POSTGRES_IMAGE =
	"docker.io/library/postgres:17@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f";
const FGA_CONTAINER = "psi-account-openfga";
const DB_CONTAINER = "psi-account-db";
export const FGA_URL = "http://127.0.0.1:18080";
const DB_PORT = 55451;
/** The block this script owns in each site's .env (the SSO block is dev/sso.ts's). */
export const LOCAL_BLOCK = "local dev";

/** The four sites: their Authentik slug, dev origin and the directory holding their .env. */
export const DEV_SITES = [
	{ app: "psizone-web", origin: "http://localhost:4310" },
	{ app: "eqsync-web", origin: "http://localhost:4320" },
	{ app: "hemisync-web", origin: "http://localhost:4330" },
	{ app: "blog-web", origin: "http://localhost:4340" },
] as const;

const docker = (...args: string[]): string =>
	execFileSync("docker", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();

function rm(name: string): void {
	try {
		docker("rm", "-f", name);
	} catch {
		// not running
	}
}

async function waitFor(url: string, init?: RequestInit): Promise<void> {
	for (let i = 0; i < 60; i++) {
		const ok = await fetch(url, init).then(
			(r) => r.ok,
			() => false,
		);
		if (ok) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`timed out waiting for ${url}`);
}

function waitForPostgres(): void {
	for (let i = 0; i < 60; i++) {
		try {
			docker("exec", DB_CONTAINER, "pg_isready", "-U", "account", "-d", "account");
			return;
		} catch {
			execFileSync("sleep", ["0.5"]);
		}
	}
	throw new Error("timed out waiting for Postgres");
}

const StoreResponse = z.object({ id: z.string().min(1) });
const ModelResponse = z.object({ authorization_model_id: z.string().min(1) });

async function up(): Promise<void> {
	const key = randomBytes(24).toString("base64url");
	const dbPassword = randomBytes(18).toString("base64url");
	rm(FGA_CONTAINER);
	rm(DB_CONTAINER);
	docker(
		"run",
		"-d",
		"--name",
		FGA_CONTAINER,
		"-p",
		"127.0.0.1:18080:8080",
		"-e",
		"OPENFGA_AUTHN_METHOD=preshared",
		"-e",
		`OPENFGA_AUTHN_PRESHARED_KEYS=${key}`,
		"-e",
		"OPENFGA_PLAYGROUND_ENABLED=false",
		OPENFGA_IMAGE,
		"run",
	);
	docker(
		"run",
		"-d",
		"--name",
		DB_CONTAINER,
		"-p",
		`127.0.0.1:${DB_PORT}:5432`,
		"-e",
		"POSTGRES_USER=account",
		"-e",
		`POSTGRES_PASSWORD=${dbPassword}`,
		"-e",
		"POSTGRES_DB=account",
		POSTGRES_IMAGE,
	);
	await waitFor(`${FGA_URL}/healthz`);
	waitForPostgres();
	const auth = {
		authorization: `Bearer ${key}`,
		"content-type": "application/json",
	};
	const store = StoreResponse.parse(
		await (
			await fetch(`${FGA_URL}/stores`, {
				method: "POST",
				headers: auth,
				body: JSON.stringify({ name: "psi-dev" }),
			})
		).json(),
	);
	const written = execFileSync(
		"fga",
		[
			"model",
			"write",
			"--api-url",
			FGA_URL,
			"--api-token",
			key,
			"--store-id",
			store.id,
			"--file",
			join(ROOT, "estate/authz/fga.mod"),
		],
		{ encoding: "utf8" },
	);
	const model = ModelResponse.parse(JSON.parse(written));
	for (const site of DEV_SITES) {
		writeBlock(join(ROOT, "apps", site.app, ".env"), LOCAL_BLOCK, [
			`SESSION_SECRET=${randomBytes(32).toString("base64url")}`,
			`ACCOUNT_DATABASE_URL=postgres://account:${dbPassword}@127.0.0.1:${DB_PORT}/account`,
			`OPENFGA_ENDPOINT=${FGA_URL}`,
			`OPENFGA_STORE_ID=${store.id}`,
			`OPENFGA_MODEL_ID=${model.authorization_model_id}`,
			`OPENFGA_TOKEN=${key}`,
		]);
	}
	console.log(
		`OpenFGA ${FGA_URL} (store ${store.id}, model ${model.authorization_model_id}); Postgres 127.0.0.1:${DB_PORT}`,
	);
	console.log(
		"Each site's .env block is written (mode 600). Next: pnpm dev:sso (the local identity provider)",
	);
}

function down(): void {
	rm(FGA_CONTAINER);
	rm(DB_CONTAINER);
	console.log("removed psi-account-openfga and psi-account-db");
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const command = process.argv[2];
	if (command === "up") await up();
	else if (command === "down") down();
	else {
		console.error("usage: tsx dev/local.ts up|down");
		process.exit(2);
	}
}
