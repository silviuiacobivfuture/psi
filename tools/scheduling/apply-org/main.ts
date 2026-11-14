import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { parseRoomsSeed } from "@psi/scheduling/clinic";
import { openConvexStore } from "@psi/scheduling-api/open-convex";
import { readStoreConfig } from "../reconcile-authz/config";
import { applyOrg } from "./apply";
import { parseLink } from "./links";
import { formatReport } from "./report";
import { parseOrgSeed } from "./seed";

const USAGE = `usage: apply-org [--app <slug>] [--only rooms] [--link "<practitioner>=<subject>"]... [--dry-run]

  Applies the clinic's seed (@psi/scheduling/seed/<app>-rooms.json and <app>-org.json) to the store, as system:rooms:
  the owner's rooms (an imported room renamed in place, keeping its id and every appointment booked in it; one the
  seed names a former name of), the old rooms that are none of them taken off the plan and out of booking, the floor
  plan; then the organisation's name, its devices in their rooms, its groups, the services it lacks (drafts: inactive,
  no price), each practitioner's own room, and the sign-in accounts given with --link. Safe to run again: a second run
  writes nothing. Writes the store only: run reconcile-authz afterwards for the new rooms', devices' and links' tuples.
  --app       the app (default psizone)
  --only      rooms: the rooms and the floor plan alone (what apply-rooms runs)
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
	if (values.only !== undefined && values.only !== "rooms")
		throw new Error(`--only takes "rooms": got "${values.only}"`);
	const roomsOnly = values.only === "rooms";
	if (roomsOnly && values.link.length > 0)
		throw new Error("--link belongs to the whole run, not --only rooms");
	const rooms = parseRoomsSeed(seedFile(`${values.app}-rooms.json`));
	const org = roomsOnly ? undefined : parseOrgSeed(seedFile(`${values.app}-org.json`), rooms);
	const links = values.link.map(parseLink);
	const config = await readStoreConfig(process.env);
	const opened = openConvexStore({ url: config.convexUrl, serverKey: config.serverKey });
	try {
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
