import type { AppointmentStatus } from "../domain/conflicts";
import { toLocal } from "../domain/time";
import { type BlacklistEntry, blacklistMatch } from "./blacklist";
import { normalizedIdentifiers, normalizeEmail, normalizePhone } from "./identifiers";
import { type LinkedVisit, remainingSessions, usageOf } from "./packages";
import { dayAvailability, type RosterEntry, type StaffBlock } from "./roster";
import { type Attendance, type CreditType, findOverlaps, type VisitSpan } from "./visits";

/**
 * Checks the data of an app (imported or typed) WITHOUT changing it. Pure: a snapshot in, a
 * report out. Every row has an `id` (what links rows together: an old id in a dry run, the
 * store's id from the store) and a `label` (what the report prints: always an old id when there
 * is one, else the store's id). A report holds codes, counts and labels, never a name, phone,
 * e-mail or note.
 */

export const FINDING_CODES = [
	"client_phone_invalid",
	"client_email_invalid",
	"guardian_phone_invalid",
	"guardian_email_invalid",
	"client_without_contact",
	"duplicate_contact",
	"visit_on_day_off",
	"visit_outside_hours",
	"visit_overlap",
	"package_negative_remaining",
	"client_blacklisted",
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

export interface SnapshotClient {
	id: string;
	label: string;
	phone?: string | undefined;
	email?: string | undefined;
	guardian?: { phone?: string | undefined; email?: string | undefined } | undefined;
}

export interface SnapshotVisit {
	id: string;
	label: string;
	client?: string | undefined;
	column: { kind: "practitioner" | "device" | "room" | "group"; id: string };
	room?: string | undefined;
	device?: string | undefined;
	start: number;
	end: number;
	status: AppointmentStatus;
	attendance: Attendance;
	package?: string | undefined;
	creditType?: CreditType | undefined;
}

export interface SnapshotPackage {
	id: string;
	label: string;
	totalSessions: number;
	bonusSessions: number;
}

export interface SnapshotRosterDay {
	person: { kind: "practitioner" | "staff"; id: string };
	date: string;
	entry: RosterEntry;
}

export interface SnapshotBlock extends StaffBlock {
	person: { kind: "practitioner" | "staff"; id: string };
}

export interface Snapshot {
	zone: string;
	/** When "now" is for usage and overlaps: a session in the past is used, in the future scheduled. */
	now: number;
	clients: ReadonlyArray<SnapshotClient>;
	visits: ReadonlyArray<SnapshotVisit>;
	packages: ReadonlyArray<SnapshotPackage>;
	roster: ReadonlyArray<SnapshotRosterDay>;
	blocks: ReadonlyArray<SnapshotBlock>;
	blacklist: ReadonlyArray<BlacklistEntry>;
}

export interface Finding {
	code: FindingCode;
	/** How many rows (clients, visits, packages) the finding concerns. */
	count: number;
	/** The first labels; `count` says how many in all. */
	labels: ReadonlyArray<string>;
	/** For duplicates: how many groups of clients share a contact. */
	groups?: number;
}

export interface ValidationReport {
	/** Findings that occurred, in the order of `FINDING_CODES`. */
	findings: ReadonlyArray<Finding>;
	/** Visits left out of the roster checks because their person has no roster rows at all. */
	visitsWithoutRoster: number;
}

export const LABELS_KEPT = 200;

class Collector {
	private readonly byCode = new Map<FindingCode, Set<string>>();
	groups = 0;
	add(code: FindingCode, label: string): void {
		const set = this.byCode.get(code) ?? new Set<string>();
		set.add(label);
		this.byCode.set(code, set);
	}
	list(): Finding[] {
		return FINDING_CODES.flatMap((code): Finding[] => {
			const set = this.byCode.get(code);
			if (set === undefined) return [];
			return [
				{
					code,
					count: set.size,
					labels: [...set].sort().slice(0, LABELS_KEPT),
					...(code === "duplicate_contact" ? { groups: this.groups } : {}),
				},
			];
		});
	}
}

function checkClients(s: Snapshot, out: Collector): void {
	const owners = new Map<string, Set<string>>();
	const labelOf = new Map(s.clients.map((c) => [c.id, c.label]));
	for (const c of s.clients) {
		const bad = (raw: string | undefined, ok: (t: string) => string | undefined): boolean =>
			raw !== undefined && raw.trim() !== "" && ok(raw) === undefined;
		if (bad(c.phone, normalizePhone)) out.add("client_phone_invalid", c.label);
		if (bad(c.email, normalizeEmail)) out.add("client_email_invalid", c.label);
		if (bad(c.guardian?.phone, normalizePhone)) out.add("guardian_phone_invalid", c.label);
		if (bad(c.guardian?.email, normalizeEmail)) out.add("guardian_email_invalid", c.label);
		const usable = normalizedIdentifiers({
			phones: [c.phone, c.guardian?.phone],
			emails: [c.email, c.guardian?.email],
		});
		if (usable.phones.length + usable.emails.length === 0) {
			out.add("client_without_contact", c.label);
		}
		// A shared contact between clients themselves; a guardian shared by siblings is normal.
		const own = normalizedIdentifiers({ phones: [c.phone], emails: [c.email] });
		for (const key of [...own.phones, ...own.emails]) {
			owners.set(key, (owners.get(key) ?? new Set()).add(c.id));
		}
	}
	const seen = new Set<string>();
	for (const ids of owners.values()) {
		if (ids.size < 2) continue;
		const group = [...ids].sort().join("|");
		if (!seen.has(group)) {
			seen.add(group);
			out.groups += 1;
		}
		for (const id of ids) out.add("duplicate_contact", labelOf.get(id) ?? id);
	}
	for (const c of s.clients) {
		const hit = blacklistMatch(
			{
				clients: [c.id],
				phones: [c.phone, c.guardian?.phone],
				emails: [c.email, c.guardian?.email],
			},
			s.blacklist,
			s.now,
		);
		if (hit !== undefined) out.add("client_blacklisted", c.label);
	}
}

const personKey = (p: { kind: string; id: string }): string => `${p.kind}:${p.id}`;

function checkRoster(s: Snapshot, out: Collector): number {
	const days = new Map<string, Map<string, RosterEntry>>();
	for (const d of s.roster) {
		const key = personKey(d.person);
		days.set(key, (days.get(key) ?? new Map()).set(d.date, d.entry));
	}
	const blocks = new Map<string, StaffBlock[]>();
	for (const b of s.blocks) {
		const key = personKey(b.person);
		blocks.set(key, [...(blocks.get(key) ?? []), b]);
	}
	let skipped = 0;
	for (const v of s.visits) {
		if (v.status !== "confirmed" || v.column.kind !== "practitioner") continue;
		const key = personKey({ kind: "practitioner", id: v.column.id });
		const mine = days.get(key);
		if (mine === undefined) {
			skipped += 1;
			continue;
		}
		const from = toLocal(v.start, s.zone);
		const until = toLocal(v.end, s.zone);
		// A visit that runs past local midnight ends at 24:00 of its first day.
		const endMinutes = until.date === from.date ? until.minutes : 1_440;
		const day = dayAvailability(mine.get(from.date), blocks.get(key) ?? [], from.date);
		if (day.kind === "off") out.add("visit_on_day_off", v.label);
		else if (from.minutes < day.startMinutes || endMinutes > day.endMinutes) {
			out.add("visit_outside_hours", v.label);
		}
	}
	return skipped;
}

function checkVisits(s: Snapshot, out: Collector): void {
	const label = new Map(s.visits.map((v) => [v.id, v.label]));
	const spans: VisitSpan[] = s.visits.map((v) => ({
		id: v.id,
		column: v.column,
		...(v.room === undefined ? {} : { room: v.room }),
		...(v.device === undefined ? {} : { device: v.device }),
		start: v.start,
		end: v.end,
		status: v.status,
	}));
	for (const o of findOverlaps(spans, s.now)) {
		out.add("visit_overlap", label.get(o.a) ?? o.a);
		out.add("visit_overlap", label.get(o.b) ?? o.b);
	}
	for (const p of s.packages) {
		const linked: LinkedVisit[] = s.visits
			.filter((v) => v.package === p.id)
			.map((v) => ({
				status: v.status,
				attendance: v.attendance,
				creditType: v.creditType ?? "base",
				start: v.start,
			}));
		const left = remainingSessions(p, usageOf(linked, s.now));
		if (left.overdrawn > 0) out.add("package_negative_remaining", p.label);
	}
}

/**
 * Reads the snapshot and reports. `only` limits the checks (the importer leaves overlaps to its
 * own detector). Nothing is changed; the same snapshot always gives the same report.
 */
export function validateSnapshot(s: Snapshot, only?: ReadonlySet<FindingCode>): ValidationReport {
	const out = new Collector();
	checkClients(s, out);
	const visitsWithoutRoster = checkRoster(s, out);
	checkVisits(s, out);
	const findings = out.list().filter((f) => only === undefined || only.has(f.code));
	return { findings, visitsWithoutRoster };
}
