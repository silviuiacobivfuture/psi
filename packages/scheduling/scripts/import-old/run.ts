import { sha256Hex } from "../../src/crypto";
import type { ObjectStorage } from "../../src/storage";
import { planClients } from "./clients";
import { detect } from "./detect";
import { type FileSource, planFiles } from "./files";
import { AnomalyLog } from "./log";
import type { Mapping } from "./mapping";
import { planPackages } from "./money";
import { planPeople } from "./people";
import { planResponses } from "./records";
import type { Report, TableCount, Written } from "./report";
import { planRoster } from "./roster";
import type { ImportSink, Kind, RowsByKind, SlugKind } from "./sink";
import { WRITE_ORDER } from "./sink";
import { type ParsedExport, parseExport } from "./source";
import { type Ctx, canonical, dryEncryptor, type Encryptor } from "./support";
import { planVisits } from "./visits";

/** What a real run writes through: the store, the encryptor on its data key, and the object store. */
export interface Target {
	sink: ImportSink;
	enc: Encryptor;
	storage: ObjectStorage;
}

export interface RunOptions {
	/** The parsed JSON of the export. */
	exported: unknown;
	mapping: Mapping;
	/** Tables the owner chose to leave out. */
	ignoreTables: ReadonlyArray<string>;
	allowSkips: boolean;
	/** Where the file bytes are; without it a non-empty files table is blocking. */
	files: FileSource | undefined;
	/**
	 * Opens the store (and makes the app and its data key if they are new). Absent in a dry run, which
	 * touches no key, no store and no network. It is called only after the whole export has been
	 * parsed and mapped and nothing blocks it.
	 */
	connect: (() => Promise<Target>) | undefined;
}

const ZONE = "Europe/Bucharest";

async function plan(
	options: RunOptions,
	parsed: ParsedExport,
	enc: Encryptor,
	real: { storage: ObjectStorage; known: ReadonlyMap<string, string> } | undefined,
) {
	const log = new AnomalyLog();
	for (const p of parsed.problems) {
		log.add(`parse_error:${p.table}:${p.issues.join(",")}`, "blocking", `${p.table}:${p.id}`);
	}
	for (const t of parsed.unmappedTables)
		log.add(`unmapped_table:${t.table}`, "blocking", `${t.table}:*${t.rows}`);
	for (const t of parsed.nonEmptyForbidden)
		log.add(`table_must_be_empty:${t.table}`, "blocking", `${t.table}:*${t.rows}`);
	for (const t of parsed.missing) log.add(`required_table_missing:${t}`, "blocking", `${t}:*`);
	const ctx: Ctx = {
		tenant: options.mapping.app,
		zone: ZONE,
		exportedAt: parsed.exportedAt,
		mapping: options.mapping,
		mappingDigest: await sha256Hex(new TextEncoder().encode(canonical(options.mapping))),
		enc,
		log,
	};
	const r = parsed.rows;
	const people = await planPeople(ctx, r.therapists, r.group_activities, r.optimo_volunteers);
	const clients = await planClients(ctx, r.clients, people.practitionerIds);
	const packages = await planPackages(ctx, r.client_subscriptions, clients.ids);
	const visits = await planVisits(ctx, r.appointments, {
		practitionerIds: people.practitionerIds,
		groupIds: people.groupIds,
		clientIds: clients.ids,
		subscriptionIds: packages.ids,
	});
	const roster = await planRoster(ctx, r.staff_schedule, r.staff_blocks, {
		practitionerIds: people.practitionerIds,
		staffIds: people.staffIds,
	});
	const responses = await planResponses(ctx, r, {
		clientIds: clients.ids,
		appointmentIds: new Set(visits.facts.map((f) => f.id)),
		practitionerIds: people.practitionerIds,
	});
	const files = await planFiles(ctx, r.client_files, r.avize, clients.ids, options.files, real);
	const stats = detect(
		visits.facts,
		new Map([...packages.stored].map(([id, s]) => [id, { used: s.used, bonusUsed: s.bonusUsed }])),
		clients.names,
		parsed.exportedAt,
		log,
	);
	return { ctx, log, people, clients, packages, visits, roster, responses, files, stats };
}

type Plan = Awaited<ReturnType<typeof plan>>;

function tableCounts(options: RunOptions, parsed: ParsedExport, p: Plan): TableCount[] {
	const r = parsed.rows;
	const sourceCount = (name: string): number => parsed.sourceCounts[name] ?? 0;
	const count = (
		table: string,
		source: number,
		parsedRows: number,
		planned: number,
	): TableCount => ({
		table,
		source,
		parsed: parsedRows,
		planned,
	});
	const responsesOf = (table: string): number =>
		p.responses.rows.filter((x) => x.legacyId.startsWith(`${table}:`)).length;
	const m = options.mapping;
	return [
		count(
			"therapists",
			sourceCount("therapists"),
			r.therapists.length,
			p.people.practitioners.length,
		),
		count(
			"(mapping) devices and rooms",
			m.resources.length,
			m.resources.length,
			p.people.devices.length + p.people.rooms.length,
		),
		count("(mapping) roster-only staff", m.staff.length, m.staff.length, m.staff.length),
		count(
			"group_activities",
			sourceCount("group_activities"),
			r.group_activities.length,
			p.people.groups.length,
		),
		count(
			"optimo_volunteers",
			sourceCount("optimo_volunteers"),
			r.optimo_volunteers.length,
			r.optimo_volunteers.length,
		),
		count("clients", sourceCount("clients"), r.clients.length, p.clients.rows.length),
		count("appointments", sourceCount("appointments"), r.appointments.length, p.visits.rows.length),
		count(
			"client_subscriptions",
			sourceCount("client_subscriptions"),
			r.client_subscriptions.length,
			p.packages.packages.length,
		),
		count(
			"staff_schedule",
			sourceCount("staff_schedule"),
			r.staff_schedule.length,
			p.roster.roster.length,
		),
		count(
			"staff_blocks",
			sourceCount("staff_blocks"),
			r.staff_blocks.length,
			p.roster.blocks.length,
		),
		count(
			"session_feedback",
			sourceCount("session_feedback"),
			r.session_feedback.length,
			responsesOf("session_feedback"),
		),
		count(
			"racemeup_feedback",
			sourceCount("racemeup_feedback"),
			r.racemeup_feedback.length,
			responsesOf("racemeup_feedback"),
		),
		count(
			"psychotherapy_feedback",
			sourceCount("psychotherapy_feedback"),
			r.psychotherapy_feedback.length,
			responsesOf("psychotherapy_feedback"),
		),
		count(
			"parent_feedback",
			sourceCount("parent_feedback"),
			r.parent_feedback.length,
			responsesOf("parent_feedback"),
		),
		count(
			"client_files",
			sourceCount("client_files"),
			r.client_files.length,
			p.files.checkedClientFiles,
		),
		count("avize", sourceCount("avize"), r.avize.length, p.files.checkedAvize),
	];
}

/** The slugs a plan would give, by kind, with the old id that wants each. */
function plannedSlugs(p: Plan): Array<{ kind: SlugKind; slug: string; legacyId: string }> {
	return [
		...p.people.practitioners.map((x) => ({
			kind: "practitioners" as const,
			slug: x.slug,
			legacyId: x.legacyId,
		})),
		...p.people.rooms.map((x) => ({ kind: "rooms" as const, slug: x.slug, legacyId: x.legacyId })),
		...p.people.devices.map((x) => ({
			kind: "devices" as const,
			slug: x.slug,
			legacyId: x.legacyId,
		})),
		...p.people.groups.map((x) => ({
			kind: "groups" as const,
			slug: x.slug,
			legacyId: x.legacyId,
		})),
	];
}

/**
 * Parses and maps the WHOLE export first, with no key, no store and no network, then decides: a dry
 * run reports and stops; a real run connects and writes only when nothing blocks it (and nothing
 * would be skipped, unless allowed), and only after checking the store for slugs the web flow
 * already uses. Idempotent: every row is keyed on its old id and carries a keyed fingerprint, so a
 * second run changes nothing. Nothing is ever deleted.
 */
export async function runImport(options: RunOptions): Promise<Report> {
	const mode = options.connect === undefined ? "dry-run" : "real";
	const parsed = parseExport(options.exported, options.ignoreTables);
	if ("fatal" in parsed) {
		return { mode, fatal: parsed.fatal, tables: [], anomalies: [], filesChecked: 0, written: [] };
	}
	const first = await plan(options, parsed, dryEncryptor, undefined);
	const report: Report = {
		mode,
		tables: tableCounts(options, parsed, first),
		anomalies: first.log.list(),
		stats: first.stats,
		filesChecked: first.files.checked,
		written: [],
	};
	if (options.connect === undefined) return report;
	if (first.log.has("blocking")) return { ...report, refusal: "blocking" };
	if (first.log.has("skipped") && !options.allowSkips) return { ...report, refusal: "skipped" };

	const { sink, enc, storage } = await options.connect();
	const stored = await sink.slugs(options.mapping.app);
	const clash = plannedSlugs(first).filter((want) =>
		stored.some(
			(have) =>
				have.kind === want.kind && have.slug === want.slug && have.legacyId !== want.legacyId,
		),
	);
	if (clash.length > 0) {
		for (const c of clash) first.log.add(`slug_taken:${c.kind}`, "blocking", c.legacyId);
		return { ...report, anomalies: first.log.list(), refusal: "blocking" };
	}

	const known = await sink.knownFiles(options.mapping.app, [
		...parsed.rows.client_files.map((f) => `client_files:${f.id}`),
		...parsed.rows.avize.map((f) => `avize:${f.id}`),
	]);
	const second = await plan(options, parsed, enc, { storage, known });
	const batches: { [K in Kind]: ReadonlyArray<RowsByKind[K]> } = {
		practitioners: second.people.practitioners,
		devices: second.people.devices,
		rooms: second.people.rooms,
		groups: second.people.groups,
		staff: second.people.staff,
		clients: second.clients.rows,
		packages: second.packages.packages,
		visits: second.visits.rows,
		payments: second.packages.payments,
		roster: second.roster.roster,
		blocks: second.roster.blocks,
		responses: second.responses.rows,
		files: second.files.rows,
	};
	const written: Written[] = [];
	for (const kind of WRITE_ORDER) {
		if (kind === "responses")
			await sink.learnOptions(options.mapping.app, second.responses.learned);
		const results = await sink.upsert(options.mapping.app, kind, batches[kind]);
		const w: Written = { kind, created: 0, updated: 0, unchanged: 0, orphan: 0 };
		for (const result of results) {
			w[result.outcome] += 1;
			const flag = result.flag ?? "?";
			if (result.outcome === "orphan") {
				second.log.add(
					`not_written:${flag}`,
					flag.startsWith("erased") ? "note" : "skipped",
					result.legacyId,
				);
			}
			if (flag === "treating_differs")
				second.log.add("client_practitioner_differs_from_store", "note", result.legacyId);
			if (flag === "erased") second.log.add("client_erased_in_store", "note", result.legacyId);
		}
		if (kind === "files") w.unchanged += second.files.unchanged;
		written.push(w);
	}
	return { ...report, anomalies: second.log.list(), written };
}
