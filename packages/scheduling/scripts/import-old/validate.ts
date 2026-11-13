import type { BlacklistEntry } from "../../src/clinic/blacklist";
import {
	FINDING_CODES,
	type FindingCode,
	type Snapshot,
	type ValidationReport,
	validateSnapshot,
} from "../../src/clinic/validate";
import type { BlacklistRow, BlockRow, ClientRow, PackageRow, RosterRow, VisitRow } from "./rows";

/**
 * The importer's data check: what it WOULD write (the planned rows, old ids) goes through the same
 * `validateSnapshot` the store-side `validateClinicData` uses, so the dry run and a later check of
 * the store agree. Reports counts and old ids; changes nothing; never blocks a run. Overlaps are
 * left to `detect.ts`, which already reports them.
 */
const ELSEWHERE: ReadonlySet<FindingCode> = new Set<FindingCode>(["visit_overlap"]);
const CHECKED: ReadonlySet<FindingCode> = new Set(FINDING_CODES.filter((c) => !ELSEWHERE.has(c)));

export interface Planned {
	zone: string;
	/** The export's own time: sessions before it are used, after it scheduled. */
	exportedAt: number;
	clients: ReadonlyArray<ClientRow>;
	visits: ReadonlyArray<VisitRow>;
	packages: ReadonlyArray<PackageRow>;
	roster: ReadonlyArray<RosterRow>;
	blocks: ReadonlyArray<BlockRow>;
	blacklist: ReadonlyArray<BlacklistRow>;
}

export function validatePlanned(p: Planned): ValidationReport {
	const entries: BlacklistEntry[] = p.blacklist.map((b) => ({
		id: b.legacyId,
		reason: "",
		category: b.category,
		severity: b.severity,
		active: true,
		createdAt: p.exportedAt,
		...(b.clientLegacy === undefined ? {} : { client: b.clientLegacy }),
		...(b.phone === undefined ? {} : { phone: b.phone }),
		...(b.email === undefined ? {} : { email: b.email }),
		...(b.expiresAt === undefined ? {} : { expiresAt: b.expiresAt }),
	}));
	const snapshot: Snapshot = {
		zone: p.zone,
		now: p.exportedAt,
		clients: p.clients.map((c) => ({
			id: c.legacyId,
			label: c.legacyId,
			phone: c.phone,
			email: c.email,
			guardian:
				c.guardian === undefined ? undefined : { phone: c.guardian.phone, email: c.guardian.email },
		})),
		visits: p.visits.map((v) => ({
			id: v.legacyId,
			label: v.legacyId,
			client: v.clientLegacy,
			column: { kind: v.column.kind, id: v.column.legacyId },
			room: v.roomLegacy,
			device: v.deviceLegacy,
			start: v.start,
			end: v.end,
			status: v.status,
			attendance: v.attendance,
			package: v.packageLegacy,
			creditType: v.creditType,
		})),
		packages: p.packages.map((x) => ({
			id: x.legacyId,
			label: x.legacyId,
			totalSessions: x.totalSessions,
			bonusSessions: x.bonusSessions,
		})),
		roster: p.roster.map((d) => ({
			person: { kind: d.person.kind, id: d.person.legacyId },
			date: d.date,
			entry:
				d.status === "works"
					? { status: "works", startMinutes: d.startMinutes ?? 0, endMinutes: d.endMinutes ?? 0 }
					: { status: d.status },
		})),
		blocks: p.blocks.map((b) => ({
			person: { kind: b.person.kind, id: b.person.legacyId },
			dateStart: b.dateStart,
			dateEnd: b.dateEnd,
			reason: b.reason,
		})),
		blacklist: entries,
	};
	return validateSnapshot(snapshot, CHECKED);
}
