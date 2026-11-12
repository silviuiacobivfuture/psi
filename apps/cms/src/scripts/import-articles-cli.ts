/**
 * `pnpm import:articles [--dry-run]`. `payload run` hands a script only its positional arguments
 * (flags are dropped), so this passes `--dry-run` on as the word `dry-run`.
 */
import { spawnSync } from "node:child_process";

const flags = process.argv.slice(2);
const unknown = flags.filter((f) => f !== "--dry-run");
if (unknown.length > 0) {
	console.error(`import:articles: unknown argument ${unknown.join(" ")} (only --dry-run)`);
	process.exit(2);
}
const words = flags.includes("--dry-run") ? ["dry-run"] : [];
const run = spawnSync(
	"pnpm",
	["exec", "payload", "run", "src/scripts/import-repo-articles.ts", ...words],
	{ stdio: "inherit" },
);
process.exit(run.status ?? 1);
