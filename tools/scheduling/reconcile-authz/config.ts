import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

/**
 * What the tool needs, from the environment only (nothing is ever taken from argv or printed):
 *   CONVEX_URL or CONVEX_SELF_HOSTED_URL       the scheduling deployment
 *   PSI_SCHEDULING_KEY                         the service's server key; or CONVEX_SELF_HOSTED_ADMIN_KEY, with which
 *                                              the key is read from the deployment's own environment
 *   OPENFGA_API_URL                            where tuples are written and read (OPENFGA_READ_URL: Check/List, unused)
 *   OPENFGA_STORE_ID, OPENFGA_TOKEN, OPENFGA_MODEL_ID
 *   OPENFGA_APP_PREFIX                         optional: prefix of the app's id on `sched_app` objects
 */
const Env = z.object({
	CONVEX_URL: z.string().url().optional(),
	CONVEX_SELF_HOSTED_URL: z.string().url().optional(),
	PSI_SCHEDULING_KEY: z.string().min(32).optional(),
	CONVEX_SELF_HOSTED_ADMIN_KEY: z.string().min(10).optional(),
	OPENFGA_API_URL: z.string().url(),
	OPENFGA_STORE_ID: z.string().min(1),
	OPENFGA_TOKEN: z.string().min(1),
	OPENFGA_MODEL_ID: z
		.string()
		.min(1)
		.refine((v) => v !== "latest", "pinned, never latest"),
	OPENFGA_APP_PREFIX: z.string().default(""),
});

export interface ToolConfig {
	convexUrl: string;
	serverKey: string;
	fga: { url: string; storeId: string; token: string; modelId: string };
	prefix: string;
}

const run = promisify(execFile);

/** The service's server key: given, or read from the deployment with the admin key (the Convex CLI, in-process). */
async function serverKeyOf(env: z.infer<typeof Env>, url: string): Promise<string> {
	if (env.PSI_SCHEDULING_KEY !== undefined) return env.PSI_SCHEDULING_KEY;
	if (env.CONVEX_SELF_HOSTED_ADMIN_KEY === undefined)
		throw new Error(
			"set PSI_SCHEDULING_KEY, or CONVEX_SELF_HOSTED_ADMIN_KEY to read it from the deployment",
		);
	const { stdout } = await run("npx", ["convex", "env", "get", "PSI_SCHEDULING_KEY"], {
		cwd: resolve(import.meta.dirname, "../../../packages/scheduling"),
		env: {
			...process.env,
			CONVEX_SELF_HOSTED_URL: url,
			CONVEX_SELF_HOSTED_ADMIN_KEY: env.CONVEX_SELF_HOSTED_ADMIN_KEY,
		},
	});
	const key = stdout.trim();
	if (key.length < 32) throw new Error("the deployment holds no PSI_SCHEDULING_KEY");
	return key;
}

export async function readConfig(
	raw: Readonly<Record<string, string | undefined>>,
): Promise<ToolConfig> {
	const parsed = Env.safeParse(raw);
	if (!parsed.success)
		throw new Error(
			`configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
		);
	const env = parsed.data;
	const convexUrl = env.CONVEX_SELF_HOSTED_URL ?? env.CONVEX_URL;
	if (convexUrl === undefined) throw new Error("set CONVEX_SELF_HOSTED_URL (or CONVEX_URL)");
	return {
		convexUrl,
		serverKey: await serverKeyOf(env, convexUrl),
		fga: {
			url: env.OPENFGA_API_URL,
			storeId: env.OPENFGA_STORE_ID,
			token: env.OPENFGA_TOKEN,
			modelId: env.OPENFGA_MODEL_ID,
		},
		prefix: env.OPENFGA_APP_PREFIX,
	};
}
