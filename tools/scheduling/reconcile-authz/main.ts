import { parseArgs } from "node:util";
import { createLiveAuthz } from "@psi/scheduling-api/authz-live";
import { openConvexStore } from "@psi/scheduling-api/open-convex";
import { readConfig } from "./config";
import { createFgaReader } from "./fga";
import { type MemberSpec, parseMemberSpec } from "./members";
import { reconcile } from "./run";

const USAGE = `usage: reconcile-authz [--app <slug>]... [--seed-roles] [--member <subject>=<role name>]... [--dry-run] [--prune]

  Writes every authorization tuple the scheduling store implies and OpenFGA lacks (idempotent; 100 per request).
  --app       an app to reconcile (repeatable; default psizone and hemisync)
  --seed-roles  give an app that holds no role the service's seed roles first (an app the deployment or an import made)
  --member    make <subject> a member of the ONE app given, holding that role, then write its tuples
  --dry-run   write nothing: print what the store implies, and with --prune what would go
  --prune     also delete tuples of the service's object types that the store no longer implies
              (every estate app must be reconciled: it is refused with --app)
Configuration is the environment only (see config.ts); nothing secret is printed.`;

const ESTATE_APPS = ["psizone", "hemisync"] as const;

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			app: { type: "string", multiple: true, default: [] },
			member: { type: "string", multiple: true, default: [] },
			"dry-run": { type: "boolean", default: false },
			prune: { type: "boolean", default: false },
			"seed-roles": { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
		strict: true,
	});
	if (values.help) {
		console.log(USAGE);
		return 0;
	}
	const apps = values.app.length === 0 ? [...ESTATE_APPS] : values.app;
	const members: MemberSpec[] = values.member.map(parseMemberSpec);
	if (members.length > 0 && apps.length !== 1) {
		console.error("--member needs exactly one --app");
		return 2;
	}
	if (values.prune && values.app.length > 0) {
		console.error("--prune reconciles every estate app: do not pass --app");
		return 2;
	}
	const config = await readConfig(process.env);
	const opened = openConvexStore({ url: config.convexUrl, serverKey: config.serverKey });
	try {
		const authz = createLiveAuthz({
			readUrl: config.fga.url,
			writeUrl: config.fga.url,
			storeId: config.fga.storeId,
			modelId: config.fga.modelId,
			token: config.fga.token,
			timeoutMs: 30_000,
		});
		const report = await reconcile({
			store: opened.store,
			authz,
			reader: createFgaReader({
				url: config.fga.url,
				storeId: config.fga.storeId,
				token: config.fga.token,
			}),
			apps,
			members,
			prefix: config.prefix,
			dryRun: values["dry-run"],
			prune: values.prune,
			seedRoles: values["seed-roles"],
			log: (line) => console.log(line),
		});
		for (const app of report.apps)
			for (const m of app.members) console.log(`${app.app}: member ${m.subject} ${m.outcome}`);
		console.log(
			report.dryRun
				? "dry run: nothing written"
				: `wrote ${report.written} tuple(s) (already-present ones are ignored), pruned ${report.pruned}`,
		);
		return 0;
	} finally {
		await opened.close();
	}
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		// Names the failure; never a key, a token or a row.
		console.error(error instanceof Error ? `${error.name}: ${error.message}` : "reconcile failed");
		process.exitCode = 1;
	},
);
