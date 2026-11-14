import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { parseRoomsSeed } from "@psi/scheduling/clinic";
import { openConvexStore } from "@psi/scheduling-api/open-convex";
import { readStoreConfig } from "../reconcile-authz/config";
import { applyOrg, ROOMS_ACTOR } from "./apply";
import { parseLink } from "./links";
import { applyProfile } from "./profile";
import { formatReport, profileLine } from "./report";
import { parseOrgSeed } from "./seed";

const USAGE = `usage: apply-org [--app <slug>] [--only rooms|profile] [--link "<practitioner>=<subject>"]... [--dry-run]

  Applies the clinic's seed (@psi/scheduling/seed/<app>-rooms.json and <app>-org.json) to the store, as system:rooms:
  the owner's rooms (an imported room renamed in place, keeping its id and every appointment booked in it; one the
  seed names a former name of), the old rooms that are none of them taken off the plan and out of booking, the floor
  plan; then the organisation's name, its devices in their rooms, its groups, the services it lacks (drafts: inactive,
  no price), each practitioner's own room, the sign-in accounts given with --link, and the contact profile (only the
  fields the owners left unset are filled; the save is journaled as org.profile). Safe to run again: a second run
  writes nothing. Writes the store only: run reconcile-authz afterwards for the new rooms', devices' and links' tuples.
  --app       the app (default psizone)
  --only      rooms: the rooms and the floor plan alone (what apply-rooms runs)
              profile: the contact profile alone (what apply-profile runs)
  --link      a practitioner (as named on the team) and the subject of their sign-in account (repeatable)
  --dry-run   write nothing: print what would be done
Configuration is the environment only (CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY or PSI_SCHEDULING_KEY);
nothing secret is printed.`;

const seedFile = (name: string): unknown =>
	JSON.parse(
		readFileSync(createRequire(import.meta.url).resolve(`@psi/scheduling/seed/${name}`), "utf8"),
	);

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			app: { type: "string", default: "psizone" },
			only: { type: "string" },
			link: { type: "string", multiple: true, default: [] },
			"dry-run": { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
		strict: true,
	});
	if (values.help) {
		console.log(USAGE);
		return 0;
	}
	const only = values.only;
	if (only !== undefined && only !== "rooms" && only !== "profile")
		throw new Error(`--only takes "rooms" or "profile": got "${only}"`);
	if (only !== undefined && values.link.length > 0)
		throw new Error(`--link belongs to the whole run, not --only ${only}`);
	const rooms = parseRoomsSeed(seedFile(`${values.app}-rooms.json`));
	const org =
		only === "rooms" ? undefined : parseOrgSeed(seedFile(`${values.app}-org.json`), rooms);
	if (only === "profile" && org?.profile === undefined)
		throw new Error(`the ${values.app} org seed has no contact profile`);
	const links = values.link.map(parseLink);
	const config = await readStoreConfig(process.env);
	const opened = openConvexStore({ url: config.convexUrl, serverKey: config.serverKey });
	try {
		if (only === "profile" && org?.profile !== undefined) {
			const app = rooms.app;
			if ((await opened.store.c.apps.get(app, app)) === undefined)
				throw new Error(`the app ${app} is not in the store`);
			const step = await applyProfile({
				store: opened.store,
				app,
				seed: org.profile,
				actor: ROOMS_ACTOR,
				dryRun: values["dry-run"],
				now: Date.now(),
			});
			console.log(`${app}${values["dry-run"] ? " (dry run: nothing written)" : ""}`);
			console.log(profileLine(step, values["dry-run"]));
			return 0;
		}
		const report = await applyOrg({
			store: opened.store,
			rooms,
			...(org === undefined ? {} : { org }),
			links,
			dryRun: values["dry-run"],
			now: Date.now(),
		});
		console.log(formatReport(report));
		return 0;
	} finally {
		await opened.close();
	}
}

main().then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(error instanceof Error ? error.message : "apply-org failed");
		process.exit(1);
	},
);
