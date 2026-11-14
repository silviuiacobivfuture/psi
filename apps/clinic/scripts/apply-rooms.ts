import { readFileSync } from "node:fs";
import { parseRoomsSeed } from "@psi/scheduling/clinic";
import { createSchedulingClient } from "@psi/scheduling-sdk";
import { z } from "zod";
import { applyRooms } from "../src/tools/apply-rooms";

/**
 * Applies a rooms seed to a clinic through the scheduling service:
 *
 *   SCHEDULING_API_URL=https://… SCHEDULING_TOKEN=<bearer of a person who may edit settings> \
 *     pnpm --filter @psi/clinic rooms:apply -- --app psizone [--seed path/to/seed.json] [--dry-run]
 *
 * The default seed is the owner's Psizone layout (`packages/scheduling/seed/psizone-rooms.json`).
 */
const Env = z.object({
	SCHEDULING_API_URL: z.string().url(),
	SCHEDULING_TOKEN: z.string().min(10),
});

function argOf(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at < 0 ? undefined : process.argv[at + 1];
}

async function main(): Promise<void> {
	const env = Env.parse(process.env);
	const app = argOf("app") ?? "psizone";
	const seedPath =
		argOf("seed") ??
		new URL("../../../packages/scheduling/seed/psizone-rooms.json", import.meta.url).pathname;
	const seed = parseRoomsSeed(JSON.parse(readFileSync(seedPath, "utf8")));
	const dryRun = process.argv.includes("--dry-run");
	const api = createSchedulingClient({
		baseUrl: env.SCHEDULING_API_URL,
		auth: { bearer: async () => env.SCHEDULING_TOKEN },
	});
	const report = await applyRooms(api, app, seed, dryRun);
	process.stdout.write(
		`${dryRun ? "[dry run] " : ""}created ${report.created.length}, updated ${report.updated.length}, kept ${report.kept.length}; floor plan ${report.planSaved ? "saved" : "already as the seed draws it"}\n`,
	);
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
