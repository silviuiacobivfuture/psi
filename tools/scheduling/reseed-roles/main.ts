import { parseArgs } from "node:util";
import { openConvexStore } from "@psi/scheduling-api/open-convex";
import { readConfig } from "../reconcile-authz/config";
import { reseed } from "./run";

const USAGE = `usage: reseed-roles [--app <slug>]... [--dry-run]

  Rewrites the seed roles into their composed form: the Owner includes the Administrator (and gains the Owner-only
  keys), the Administrator includes Recepție, Terapeut, Coordonator and Contabil, Terapeut includes Voluntar. A role
  includes another only when it already holds everything that one holds, so what every role holds in the end does not
  change, but the Owner's. A role that does not ("not_contained") stays flat and lists what it lacks. Writes the store
  only: run reconcile-authz, then reconcile-authz --prune, afterwards.
  --app       an app to re-seed (repeatable; default psizone and hemisync)
  --dry-run   write nothing: print what each role would become
Configuration is the environment only (see ../reconcile-authz/config.ts); nothing secret is printed.`;

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			app: { type: "string", multiple: true, default: [] },
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
		strict: true,
	});
	if (values.help) {
		console.log(USAGE);
		return 0;
	}
	const apps = values.app.length === 0 ? ["psizone", "hemisync"] : values.app;
	const config = await readConfig(process.env);
	const opened = openConvexStore({ url: config.convexUrl, serverKey: config.serverKey });
	try {
		const reports = await reseed({
			store: opened.store,
			apps,
			dryRun: values["dry-run"],
			now: Date.now(),
		});
		for (const r of reports) {
			console.log(`${r.app}: ${r.written} rewritten${values["dry-run"] ? " (dry run)" : ""}`);
			for (const s of r.steps)
				console.log(
					`  ${s.kind.padEnd(14)} ${s.name}${s.missing === undefined ? "" : ` lacks ${s.missing.join(", ")}`}`,
				);
		}
		return 0;
	} finally {
		await opened.close();
	}
}

main().then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(error instanceof Error ? error.message : "reseed-roles failed");
		process.exit(1);
	},
);
