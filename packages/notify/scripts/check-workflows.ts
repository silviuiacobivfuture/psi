import { diffWorkflows, presentWorkflowIds, servedWorkflowIds } from "../src/workflow-sync";

/**
 * The deploy's check that Novu holds every workflow the bridge serves (`pnpm --filter @psi/notify workflows:check`).
 * Reads only. The sync itself is the estate's (`infrastructure/hetzner/scripts/novu-bootstrap.sh <env>` in SEB, which points the
 * environment at the one bridge and syncs): this says whether it has run since the catalogue last changed.
 *   NOVU_API_URL, NOVU_SECRET_KEY   the environment's API address and key (secret/apps/novu/estate)
 * Exit 0: nothing missing. Exit 1: names what is missing or stale. Exit 2: Novu could not be read.
 */
const apiUrl = process.env.NOVU_API_URL;
const secretKey = process.env.NOVU_SECRET_KEY;
if (apiUrl === undefined || secretKey === undefined || apiUrl === "" || secretKey === "") {
	process.stderr.write("workflows:check needs NOVU_API_URL and NOVU_SECRET_KEY\n");
	process.exit(2);
}
const served = servedWorkflowIds();
try {
	const diff = diffWorkflows(served, await presentWorkflowIds({ apiUrl, secretKey }));
	process.stdout.write(
		`${served.length} workflows served; ${diff.missing.length} missing in Novu, ${diff.stale.length} stale\n`,
	);
	for (const id of diff.missing) process.stdout.write(`MISSING ${id}\n`);
	for (const id of diff.stale) process.stdout.write(`STALE ${id}\n`);
	process.exit(diff.missing.length === 0 ? 0 : 1);
} catch (error) {
	process.stderr.write(
		`workflows:check could not read Novu: ${error instanceof Error ? error.message : "unknown"}\n`,
	);
	process.exit(2);
}
