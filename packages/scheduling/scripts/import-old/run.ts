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
import type { ImportSink, Kind, RowsByKind } from "./sink";
import { WRITE_ORDER } from "./sink";
import { parseExport } from "./source";
import { type Ctx, canonical, type Encryptor } from "./support";
import { planVisits } from "./visits";

export interface RunOptions {
	/** The parsed JSON of the export. */
	exported: unknown;
	mapping: Mapping;
	/** Tables the owner chose to leave out. */
	ignoreTables: ReadonlyArray<string>;
	allowSkips: boolean;
	enc: Encryptor;
	/** Where the file bytes are; without it a non-empty files table is blocking. */
	files: FileSource | undefined;
	/** Present in a real run; absent in a dry run, which writes and reads nothing remote. */
	target: { sink: ImportSink; storage: ObjectStorage } | undefined;
}

const ZONE = "Europe/Bucharest";

/**
 * Parses and maps the WHOLE export first, then decides: a dry run reports and stops; a real run
 * writes only when nothing is blocking (and nothing would be skipped, unless allowed). Idempotent:
 * every row is keyed on its old id and carries a keyed fingerprint, so a second run changes nothing.
 */
export async function runImport(options: RunOptions): Promise<Report> {
	const mode = options.target === undefined ? "dry-run" : "real";
	const parsed = parseExport(options.exported, options.ignoreTables);
	if ("fatal" in parsed)
		return { mode, fatal: parsed.fatal, tables: [], anomalies: [], filesChecked: 0, written: [] };

	const log = new AnomalyLog();
	for (const p of parsed.problems)
		log.add(`parse_error:${p.table}:${p.issues.join(",")}`, "blocking", `${p.table}:${p.id}`);
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
		enc: options.enc,
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
	const known =
		options.target === undefined
			? undefined
			: await options.target.sink.knownFiles(ctx.tenant, [
					...r.client_files.map((f) => `client_files:${f.id}`),
					...r.avize.map((f) => `avize:${f.id}`),
				]);
	const files = await planFiles(
		ctx,
		r.client_files,
		r.avize,
		clients.ids,
		options.files,
		options.target === undefined || known === undefined
			? undefined
			: { storage: options.target.storage, known },
	);
	const stats = detect(
		visits.facts,
		new Map([...packages.stored].map(([id, s]) => [id, { used: s.used, bonusUsed: s.bonusUsed }])),
		clients.names,
		parsed.exportedAt,
		log,
	);

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
	const sourceCount = (name: string): number => parsed.sourceCounts[name] ?? 0;
	const tables: TableCount[] = [
		count(
			"therapists",
			sourceCount("therapists"),
			r.therapists.length,
			people.practitioners.length,
		),
		count(
			"(mapping) devices and rooms",
			options.mapping.resources.length,
			options.mapping.resources.length,
			people.devices.length + people.rooms.length,
		),
		count(
			"(mapping) roster-only staff",
			options.mapping.staff.length,
			options.mapping.staff.length,
			options.mapping.staff.length,
		),
		count(
			"group_activities",
			sourceCount("group_activities"),
			r.group_activities.length,
			people.groups.length,
		),
		count(
			"optimo_volunteers",
			sourceCount("optimo_volunteers"),
			r.optimo_volunteers.length,
			r.optimo_volunteers.length,
		),
		count("clients", sourceCount("clients"), r.clients.length, clients.rows.length),
		count("appointments", sourceCount("appointments"), r.appointments.length, visits.rows.length),
		count(
			"client_subscriptions",
			sourceCount("client_subscriptions"),
			r.client_subscriptions.length,
			packages.packages.length,
		),
		count(
			"staff_schedule",
			sourceCount("staff_schedule"),
			r.staff_schedule.length,
			roster.roster.length,
		),
		count("staff_blocks", sourceCount("staff_blocks"), r.staff_blocks.length, roster.blocks.length),
		count(
			"session_feedback",
			sourceCount("session_feedback"),
			r.session_feedback.length,
			responses.filter((x) => x.legacyId.startsWith("session_feedback:")).length,
		),
		count(
			"racemeup_feedback",
			sourceCount("racemeup_feedback"),
			r.racemeup_feedback.length,
			responses.filter((x) => x.legacyId.startsWith("racemeup_feedback:")).length,
		),
		count(
			"psychotherapy_feedback",
			sourceCount("psychotherapy_feedback"),
			r.psychotherapy_feedback.length,
			responses.filter((x) => x.legacyId.startsWith("psychotherapy_feedback:")).length,
		),
		count(
			"parent_feedback",
			sourceCount("parent_feedback"),
			r.parent_feedback.length,
			responses.filter((x) => x.legacyId.startsWith("parent_feedback:")).length,
		),
		count(
			"client_files",
			sourceCount("client_files"),
			r.client_files.length,
			files.checkedClientFiles,
		),
		count("avize", sourceCount("avize"), r.avize.length, files.checkedAvize),
	];
	const base: Report = {
		mode,
		tables,
		anomalies: log.list(),
		stats,
		filesChecked: files.checked,
		written: [],
	};
	if (options.target === undefined) return base;
	if (log.has("blocking")) return { ...base, refusal: "blocking" };
	if (log.has("skipped") && !options.allowSkips) return { ...base, refusal: "skipped" };

	const { sink } = options.target;
	await sink.ensureApp({
		slug: ctx.tenant,
		name: options.mapping.appName,
		kind: options.mapping.appKind,
		...(options.mapping.address === undefined ? {} : { address: options.mapping.address }),
	});
	const batches: { [K in Kind]: ReadonlyArray<RowsByKind[K]> } = {
		practitioners: people.practitioners,
		devices: people.devices,
		rooms: people.rooms,
		groups: people.groups,
		staff: people.staff,
		clients: clients.rows,
		packages: packages.packages,
		visits: visits.rows,
		payments: packages.payments,
		roster: roster.roster,
		blocks: roster.blocks,
		responses,
		files: files.rows,
	};
	const written: Written[] = [];
	for (const kind of WRITE_ORDER) {
		const results = await sink.upsert(ctx.tenant, kind, batches[kind]);
		const w: Written = { kind, created: 0, updated: 0, unchanged: 0, orphan: 0 };
		for (const result of results) {
			w[result.outcome] += 1;
			if (result.outcome === "orphan")
				log.add(`orphan_in_store:${result.flag ?? "?"}`, "skipped", result.legacyId);
			if (result.flag === "treating_differs")
				log.add("client_practitioner_differs_from_store", "note", result.legacyId);
		}
		if (kind === "files") w.unchanged += files.unchanged;
		written.push(w);
	}
	return { ...base, anomalies: log.list(), written };
}
