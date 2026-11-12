/**
 * Writes src/client/compass-chat.generated.ts from src/client/compass-chat.ts (Node strips the
 * types of this script itself). `--check` fails when the generated file is out of date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileClient, generatedModule } from "../src/client/build.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = `${ROOT}src/client/compass-chat.generated.ts`;
const text = generatedModule(
	compileClient(readFileSync(`${ROOT}src/client/compass-chat.ts`, "utf8")),
);

if (process.argv.includes("--check")) {
	if (readFileSync(OUT, "utf8") !== text) {
		console.error(
			"compass-chat.generated.ts is out of date: run `pnpm --filter @psi/ui build:client`",
		);
		process.exit(1);
	}
	console.log("compass chat bundle up to date");
} else {
	writeFileSync(OUT, text);
	console.log(
		`compass chat ${text.length} B → src/client/compass-chat.generated.ts`,
	);
}
