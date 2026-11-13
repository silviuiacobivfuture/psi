import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type SealRoot, sealRootFrom } from "@psi/engine/staff";

type Env = Readonly<Record<string, string | undefined>>;

export interface StaffMemoryConfig {
	url: string;
	root: Buffer;
}

/** A development-only key, made once beside the development store (both under the gitignored `.data`). */
function devRoot(dataDir: string): SealRoot {
	const file = resolve(dataDir, "staff-memory.key");
	if (!existsSync(file)) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
		chmodSync(file, 0o600);
	}
	const root = sealRootFrom({ STAFF_MEMORY_KEY: readFileSync(file, "utf8").trim() });
	if (root === undefined) throw new Error(`${file} is empty`);
	return root;
}

/**
 * Where the staff assistant keeps what was said, and what seals it. Nothing without a model key (the
 * assistant is then off). In production a key (`STAFF_MEMORY_KEY`, or `CLINIC_MASTER_KEY` to derive one
 * from) and a store (`STAFF_MEMORY_URL`, a file on the app's volume) are required and the start fails
 * loudly without them: the memory is never in the clear and never only in process memory. The
 * development fake uses a file store and its own key under `.data`.
 */
export function staffMemoryFrom(env: Env, dataDir = ".data"): StaffMemoryConfig | undefined {
	if (env.OPENROUTER_API_KEY === undefined || env.OPENROUTER_API_KEY === "") return undefined;
	const production = env.NODE_ENV === "production";
	const dev = !production && env.CLINIC_FAKE_PORT !== undefined;
	const configured = sealRootFrom(env);
	const url =
		env.STAFF_MEMORY_URL?.trim() ||
		(dev ? `file:${resolve(dataDir, "staff-memory.db")}` : undefined);
	if (url === undefined) {
		throw new Error(
			"MISSING REQUIRED SETTING: STAFF_MEMORY_URL (the staff assistant's memory file)",
		);
	}
	if (configured !== undefined) return { url, root: configured.key };
	if (dev) return { url, root: devRoot(dataDir).key };
	throw new Error(
		"MISSING REQUIRED SECRET: STAFF_MEMORY_KEY (or CLINIC_MASTER_KEY): the staff assistant's memory is sealed",
	);
}
