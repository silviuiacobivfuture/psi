import { appRelation, appRelations, CATALOGUE, type PermissionDef } from "./catalogue";

/**
 * The OpenFGA model of the service as DATA: the manifest is rendered from it, and the in-memory authorizer
 * evaluates it, so a green test run speaks about the model that is deployed. `model.drift.test.ts` compares it with
 * the committed, generated `estate/authz/modules/sched.fga`.
 */
export type Clause =
	/** `[user, sched_role#member]`: tuples written directly, of these subject types. */
	| { kind: "direct"; types: readonly string[] }
	/** Another relation of the same object. */
	| { kind: "computed"; relation: string }
	/** `relation from via`: a relation of the object the `via` tuple points at. */
	| { kind: "from"; relation: string; via: string }
	/** `(a and b)`: only ever inside a union, of single terms. */
	| { kind: "and"; all: readonly Term[] };

export type TypeModel = Record<string, readonly Clause[]>;
export type Model = Record<string, TypeModel>;

export type Term = Exclude<Clause, { kind: "and" }>;
export const direct = (...types: string[]): Term => ({ kind: "direct", types });
export const from = (relation: string, via: string): Term => ({ kind: "from", relation, via });
const computed = (relation: string): Term => ({ kind: "computed", relation });

export function render(clause: Clause): string {
	switch (clause.kind) {
		case "direct":
			return `[${clause.types.join(", ")}]`;
		case "computed":
			return clause.relation;
		case "from":
			return `${clause.relation} from ${clause.via}`;
		case "and":
			return `(${clause.all.map(render).join(" and ")})`;
		default:
			return clause satisfies never;
	}
}

/** The role the estate's platform administrators hold for this module (a catalogue role: generate.py appends its clauses). */
export const PLATFORM_ROLE = "role_sched_app_admin";
/** The clause the generator appends to every relation the platform role grants (it is not written in the manifest). */
export const PLATFORM_CLAUSE: Term = {
	kind: "from",
	relation: PLATFORM_ROLE,
	via: "parent_platform",
};

/** The relations that make a person the `own` / `assigned` reach of an object, per type. */
export const REACH_OWN = "reach_own";
export const REACH_ASSIGNED = "reach_assigned";
const REACH: Readonly<Record<string, { own: Term; assigned: Term } | undefined>> = {
	sched_client: { own: computed("practitioner"), assigned: computed("coordinator") },
	sched_calendar: { own: computed("owner"), assigned: computed("coordinator") },
	sched_appointment: { own: from("owner", "calendar"), assigned: from("coordinator", "calendar") },
	sched_package: { own: from("practitioner", "client"), assigned: from("coordinator", "client") },
	sched_record: { own: from("practitioner", "client"), assigned: from("coordinator", "client") },
	sched_file: { own: from("practitioner", "client"), assigned: from("coordinator", "client") },
};

function appClauses(def: PermissionDef): Clause[] {
	const clauses: Clause[] = [direct("user", "sched_role#member")];
	if (def.platformAdmin === true)
		clauses.push(from("administrator", "parent_platform"), PLATFORM_CLAUSE);
	return clauses;
}

/** `key` on an object: the app-wide relation, or the narrower one together with the object's reach. */
function objectClauses(def: PermissionDef): Clause[] {
	const clauses: Clause[] = [from(appRelation(def, "all"), "app")];
	if (def.scopes.includes("assigned"))
		clauses.push({
			kind: "and",
			all: [from(appRelation(def, "assigned"), "app"), computed(REACH_ASSIGNED)],
		});
	if (def.scopes.includes("own"))
		clauses.push({
			kind: "and",
			all: [from(appRelation(def, "own"), "app"), computed(REACH_OWN)],
		});
	return clauses;
}

/** The module's types and relations, in the manifest's `objects` order. */
export function buildModel(): Model {
	const app: TypeModel = {
		parent_platform: [direct("platform")],
		member: [direct("user"), from("administrator", "parent_platform")],
	};
	for (const def of CATALOGUE)
		for (const relation of appRelations(def)) app[relation] = appClauses(def);
	const model: Model = {
		sched_app: app,
		sched_role: { app: [direct("sched_app")], member: [direct("user")] },
		// A client is treated by calendars (people); a person's account is bound once, as the calendar's owner.
		sched_client: {
			app: [direct("sched_app")],
			treating: [direct("sched_calendar")],
			practitioner: [from("owner", "treating")],
			coordinator: [from("coordinator", "treating")],
		},
		sched_calendar: {
			app: [direct("sched_app")],
			owner: [direct("user")],
			coordinator: [direct("user")],
		},
		sched_appointment: { app: [direct("sched_app")], calendar: [direct("sched_calendar")] },
		sched_room: { app: [direct("sched_app")] },
		sched_device: { app: [direct("sched_app")] },
		sched_package: { app: [direct("sched_app")], client: [direct("sched_client")] },
		sched_record: { app: [direct("sched_app")], client: [direct("sched_client")] },
		sched_file: { app: [direct("sched_app")], client: [direct("sched_client")] },
	};
	for (const [type, reach] of Object.entries(REACH)) {
		const target = model[type];
		if (target === undefined || reach === undefined) continue;
		target[REACH_OWN] = [reach.own];
		target[REACH_ASSIGNED] = [reach.assigned];
	}
	for (const def of CATALOGUE) {
		if (def.objects.length === 1 && def.objects[0] === "sched_app") continue;
		for (const type of def.objects) {
			const target = model[type];
			if (target !== undefined) target[def.key] = objectClauses(def);
		}
	}
	return model;
}

/** What the model needs from the platform's own types (core.fga), for the in-memory evaluator only. */
export function platformModel(): Model {
	return { platform: { administrator: [direct("user")], [PLATFORM_ROLE]: [direct("user")] } };
}
