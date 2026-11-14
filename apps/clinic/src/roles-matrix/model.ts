import {
	type Action,
	CATALOGUE,
	type FieldGroup,
	parsePermissionKey,
	RESOURCES,
	type Resource,
	type Scope,
} from "@psi/scheduling/permissions";
import type { RoleSummary } from "../port/port";

/** The areas people think in, in the order the page shows them. */
export const AREAS = [
	"appointments",
	"clients",
	"clinical",
	"files",
	"money",
	"roster",
	"reminders",
	"requests",
	"reports",
	"members",
	"roles",
	"settings",
	"builder",
	"data",
	"audit",
] as const;
export type Area = (typeof AREAS)[number];

/** Where each resource of the service's catalogue is shown: every resource has an area, or this does not compile. */
const AREA_OF: Readonly<Record<Resource, Area>> = {
	appointments: "appointments",
	calendars: "appointments",
	group_activities: "appointments",
	clients: "clients",
	blacklist: "clients",
	report_custom: "clinical",
	report_aba: "clinical",
	report_racemeup: "clinical",
	report_psychotherapy: "clinical",
	questionnaire_parent: "clinical",
	notes: "clinical",
	files: "files",
	packages: "money",
	payments: "money",
	prices: "money",
	roster: "roster",
	leave: "roster",
	availability: "roster",
	booking_pause: "settings",
	reminders: "reminders",
	web_requests: "requests",
	reports: "reports",
	feedback: "reports",
	members: "members",
	people: "members",
	roles: "roles",
	app_settings: "settings",
	// The Owner's own: billing, the organisation itself (delete, hand over), the assistants' budget.
	billing: "settings",
	organisation: "settings",
	assistant_budget: "settings",
	services: "settings",
	rooms: "settings",
	devices: "settings",
	notice_board: "settings",
	builder: "builder",
	imports_exports: "data",
	audit_log: "audit",
};

/** What one column holds for one row: the widest scope, or nothing. */
export type Mark = Scope | "none";
/** What one column holds for a whole resource, folded: every action at `all`, none of them, or something between. */
export type Fold = "full" | "partial" | "none";

/** One action of a resource, or one of its field groups for that action (`clients · view · clinical`). */
export interface Row {
	id: string;
	resource: Resource;
	action: Action;
	group?: FieldGroup;
}
export interface ResourceRows {
	resource: Resource;
	rows: ReadonlyArray<Row>;
}
export interface AreaRows {
	area: Area;
	resources: ReadonlyArray<ResourceRows>;
}

/** A column of the matrix: the platform role, or a role of the organisation. */
export interface Column {
	id: string;
	kind: "platform" | "role";
	name: string;
	system: boolean;
	/** Row id → the scopes held, its own and through the roles it includes. */
	held: ReadonlyMap<string, ReadonlySet<Scope>>;
	/** Row id → the role (id, name) it holds that row from, when it holds it only through an included role. */
	from: ReadonlyMap<string, { id: string; name: string }>;
}

export const PLATFORM_COLUMN = "platform";
const WIDTH: Readonly<Record<Mark, number>> = { all: 3, assigned: 2, own: 1, none: 0 };

const rowId = (resource: string, action: string, group?: string): string =>
	group === undefined ? `${resource}.${action}` : `${resource}.${action}.${group}`;

/** The stored keys of a role, as row id → scopes. A key the catalogue does not know shows nowhere. */
function heldOf(relations: ReadonlyArray<string>): Map<string, Set<Scope>> {
	const held = new Map<string, Set<Scope>>();
	for (const relation of relations) {
		const p = parsePermissionKey(relation);
		if (p === undefined) continue;
		const id = rowId(p.resource, p.action, p.fieldGroup);
		const scopes = held.get(id) ?? new Set<Scope>();
		scopes.add(p.scope);
		held.set(id, scopes);
	}
	return held;
}

/** The rows a role holds only through an included role, and from which (its own rows are never "din X"). */
function fromOf(
	role: RoleSummary["roles"][number],
	names: ReadonlyMap<string, string>,
): Map<string, { id: string; name: string }> {
	const own = heldOf(role.permissions);
	const out = new Map<string, { id: string; name: string }>();
	for (const [relation, source] of Object.entries(role.inherited)) {
		const p = parsePermissionKey(relation);
		if (p === undefined) continue;
		const id = rowId(p.resource, p.action, p.fieldGroup);
		if (own.has(id) || out.has(id)) continue;
		out.set(id, { id: source, name: names.get(source) ?? source });
	}
	return out;
}

/** The seed roles in the order a clinic reads them, from the widest to the narrowest. */
const SEED_ORDER = [
	"admin",
	"owner",
	"coordinator",
	"reception",
	"therapist",
	"accountant",
	"volunteer",
] as const;

function seedRank(role: { id: string; name: string }): number {
	const name = role.name.toLowerCase();
	const at = SEED_ORDER.findIndex((s) => role.id === s || role.id.endsWith(`-${s}`) || name === s);
	return at < 0 ? SEED_ORDER.length : at;
}

/** The columns: the platform role first, then the seed roles in their order, then the custom roles by name. */
export function columnsOf(summary: RoleSummary, platformName: string): Column[] {
	const roles = [...summary.roles].sort(
		(a, b) => seedRank(a) - seedRank(b) || a.name.localeCompare(b.name),
	);
	const names = new Map(summary.roles.map((r) => [r.id, r.name]));
	return [
		{
			id: PLATFORM_COLUMN,
			kind: "platform",
			name: platformName,
			system: true,
			held: heldOf(summary.platform.permissions),
			from: new Map(),
		},
		...roles.map(
			(r): Column => ({
				id: r.id,
				kind: "role",
				name: r.name,
				system: r.system,
				// What it holds in the end: its own keys and those of the roles it includes.
				held: heldOf([...r.permissions, ...Object.keys(r.inherited)]),
				from: fromOf(r, names),
			}),
		),
	];
}

export function markOf(column: Column, row: Row): Mark {
	let best: Mark = "none";
	for (const s of column.held.get(row.id) ?? []) if (WIDTH[s] > WIDTH[best]) best = s;
	return best;
}

export function foldOf(column: Column, rows: ReadonlyArray<Row>): Fold {
	const marks = rows.map((r) => markOf(column, r));
	if (marks.every((x) => x === "none")) return "none";
	return marks.every((x) => x === "all") ? "full" : "partial";
}

/** True when the columns do not all hold the same for the row. */
export const differs = (columns: ReadonlyArray<Column>, row: Row): boolean =>
	new Set(columns.map((c) => markOf(c, row))).size > 1;

/**
 * Every row of the catalogue, by area and resource: each action, then its field groups. A field group shows for
 * `view` always (it is who sees clinical or money data), and for another action when some column holds it.
 */
export function areasOf(columns: ReadonlyArray<Column>): AreaRows[] {
	const heldAnywhere = (id: string): boolean => columns.some((c) => c.held.has(id));
	return AREAS.map((area) => ({
		area,
		resources: RESOURCES.filter((r) => AREA_OF[r] === area).map((resource) => {
			const def = CATALOGUE[resource];
			const rows: Row[] = def.actions.flatMap((action) => [
				{ id: rowId(resource, action), resource, action },
				...(def.fieldGroups ?? [])
					.filter((group) => action === "view" || heldAnywhere(rowId(resource, action, group)))
					.map((group) => ({ id: rowId(resource, action, group), resource, action, group })),
			]);
			return { resource, rows };
		}),
	}));
}

/** Only what differs between the columns: rows, then resources and areas left with none are dropped. */
export function onlyDifferences(
	areas: ReadonlyArray<AreaRows>,
	columns: ReadonlyArray<Column>,
): AreaRows[] {
	return areas
		.map((a) => ({
			area: a.area,
			resources: a.resources
				.map((r) => ({ resource: r.resource, rows: r.rows.filter((row) => differs(columns, row)) }))
				.filter((r) => r.rows.length > 0),
		}))
		.filter((a) => a.resources.length > 0);
}
