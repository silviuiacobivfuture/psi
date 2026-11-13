import { z } from "zod";
import type { AdminClient } from "./admin-client";
import type { BlacklistEntry } from "./clinic/blacklist";
import {
	type Snapshot,
	type SnapshotBlock,
	type SnapshotClient,
	type SnapshotPackage,
	type SnapshotRosterDay,
	type SnapshotVisit,
	type ValidationReport,
	validateSnapshot,
} from "./clinic/validate";
import { COLUMN_KINDS } from "./clinic/visits";

/**
 * `validateClinicData(admin, app)`: reads an app's rows (pages of an internal query, admin key),
 * checks them with `validateSnapshot` and returns the report. It changes nothing and the report
 * holds codes, counts and old ids only. The import runs it after a real run; an ops tool can run
 * it any time.
 */
const columnKind = z.enum(COLUMN_KINDS);
const personKind = z.enum(["practitioner", "staff"]);
const person = z.object({ kind: personKind, id: z.string() });
const contact = { phone: z.string().optional(), email: z.string().optional() };

const pages = {
	clients: z.object({
		id: z.string(),
		label: z.string(),
		...contact,
		guardian: z.object(contact).optional(),
	}),
	visits: z.object({
		id: z.string(),
		label: z.string(),
		client: z.string().optional(),
		column: z.object({ kind: columnKind, id: z.string() }),
		room: z.string().optional(),
		device: z.string().optional(),
		start: z.number(),
		end: z.number(),
		status: z.enum(["held", "requested", "confirmed", "cancelled", "declined", "expired"]),
		attendance: z.enum(["pending", "attended", "absent"]),
		package: z.string().optional(),
		creditType: z.enum(["base", "bonus"]).optional(),
	}),
	packages: z.object({
		id: z.string(),
		label: z.string(),
		totalSessions: z.number(),
		bonusSessions: z.number(),
	}),
	roster: z.object({
		person,
		date: z.string(),
		status: z.enum(["works", "annual_leave", "medical_leave", "free"]),
		startMinutes: z.number().optional(),
		endMinutes: z.number().optional(),
	}),
	blocks: z.object({
		person,
		dateStart: z.string(),
		dateEnd: z.string(),
		reason: z.string(),
	}),
	blacklist: z.object({
		id: z.string(),
		client: z.string().optional(),
		phone: z.string().optional(),
		email: z.string().optional(),
		category: z.enum(["no_show_repeated", "unpaid", "abusive", "duplicate", "other"]),
		severity: z.enum(["warn", "block_online", "block_all"]),
		active: z.boolean(),
		expiresAt: z.number().optional(),
		createdAt: z.number(),
	}),
};

async function all<K extends keyof typeof pages>(
	admin: AdminClient,
	app: string,
	table: K,
): Promise<ReadonlyArray<z.infer<(typeof pages)[K]>>> {
	const schema = z.object({ next: z.string().nullable(), rows: z.array(pages[table]) });
	const rows: Array<z.infer<(typeof pages)[K]>> = [];
	let cursor: string | null = null;
	do {
		const page: z.infer<typeof schema> = await admin.query(
			`clinicValidate:${table}`,
			{ tenant: app, cursor },
			schema,
		);
		rows.push(...page.rows);
		cursor = page.next;
	} while (cursor !== null);
	return rows;
}

/** Reads the app's data into a snapshot (one pass per table). Null when the app does not exist. */
export async function readSnapshot(
	admin: AdminClient,
	app: string,
	now: number,
): Promise<Snapshot | null> {
	const zone = await admin.query("clinicValidate:zone", { tenant: app }, z.string().nullable());
	if (zone === null) return null;
	const [clients, visits, packages, roster, blocks, blacklist] = await Promise.all([
		all(admin, app, "clients"),
		all(admin, app, "visits"),
		all(admin, app, "packages"),
		all(admin, app, "roster"),
		all(admin, app, "blocks"),
		all(admin, app, "blacklist"),
	]);
	const snapshotClients: ReadonlyArray<SnapshotClient> = clients;
	const snapshotVisits: ReadonlyArray<SnapshotVisit> = visits;
	const snapshotPackages: ReadonlyArray<SnapshotPackage> = packages;
	const snapshotRoster: SnapshotRosterDay[] = roster.map((d) => ({
		person: d.person,
		date: d.date,
		entry:
			d.status === "works"
				? { status: "works", startMinutes: d.startMinutes ?? 0, endMinutes: d.endMinutes ?? 0 }
				: { status: d.status },
	}));
	const snapshotBlocks: ReadonlyArray<SnapshotBlock> = blocks;
	const entries: BlacklistEntry[] = blacklist.map((e) => ({ ...e, reason: "" }));
	return {
		zone,
		now,
		clients: snapshotClients,
		visits: snapshotVisits,
		packages: snapshotPackages,
		roster: snapshotRoster,
		blocks: snapshotBlocks,
		blacklist: entries,
	};
}

/** Checks an app's stored data and reports; changes nothing. Undefined when the app does not exist. */
export async function validateClinicData(
	admin: AdminClient,
	app: string,
	now: number = Date.now(),
): Promise<ValidationReport | undefined> {
	const snapshot = await readSnapshot(admin, app, now);
	return snapshot === null ? undefined : validateSnapshot(snapshot);
}
