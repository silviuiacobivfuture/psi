import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { z } from "zod";
import { createAdminClient } from "../admin-client";
import { CONVEX_DATA, CONVEX_URL } from "./backend";

/** Calls internal Convex functions with the admin key, as the import and the ops tools do. */

const ADMIN_FILE = join(CONVEX_DATA, "secrets/admin-key");
const PKG = resolve(import.meta.dirname, "../..");

export const backendReady: boolean = await fetch(`${CONVEX_URL}/version`, {
	signal: AbortSignal.timeout(2_000),
})
	.then((res) => res.ok)
	.catch(() => false)
	.then((up) => up && existsSync(ADMIN_FILE));

const admin = backendReady
	? createAdminClient({ url: CONVEX_URL, adminKey: readFileSync(ADMIN_FILE, "utf8").trim() })
	: undefined;

function need() {
	if (admin === undefined) throw new Error("no local backend");
	return admin;
}

export const runMutation = <T>(
	name: string,
	args: Record<string, unknown>,
	schema: z.ZodType<T>,
): Promise<T> => need().mutation(name, args, schema);

export const runQuery = <T>(
	name: string,
	args: Record<string, unknown>,
	schema: z.ZodType<T>,
): Promise<T> => need().query(name, args, schema);

/** The raw stored rows of a table, through the CLI (the tests' way to look at what is really stored). */
export function dumpTable(table: string): string {
	return execFileSync(
		join(PKG, "scripts/convex.sh"),
		["data", table, "--limit", "5000", "--format", "jsonLines"],
		{ cwd: PKG, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
	);
}
