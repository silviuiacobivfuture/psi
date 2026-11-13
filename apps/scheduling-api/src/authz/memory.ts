import { buildModel, type Clause, type Model, platformModel } from "./model";
import { type AuthzPort, objectOf, type Tuple, type TupleChange } from "./port";

const MAX_DEPTH = 16;

export interface MemoryAuthz extends AuthzPort {
	/** Every tuple now held, for tests that assert what was (not) written. */
	tuples(): Tuple[];
}

const keyOf = (t: Tuple): string => `${t.user}\u0000${t.relation}\u0000${t.object}`;
const typeOf = (object: string): string => object.slice(0, object.indexOf(":"));

/** Evaluates the generated model over a set of tuples: direct, computed, `from` and `(a and b)`, as OpenFGA does. */
export function createMemoryAuthz(
	seed: readonly Tuple[] = [],
	model: Model = { ...buildModel(), ...platformModel() },
): MemoryAuthz {
	const held = new Map<string, Tuple>();
	for (const t of seed) held.set(keyOf(t), t);

	function targetsOf(object: string, relation: string): Tuple[] {
		const out: Tuple[] = [];
		for (const t of held.values()) if (t.object === object && t.relation === relation) out.push(t);
		return out;
	}

	function holds(user: string, relation: string, object: string, depth: number): boolean {
		if (depth > MAX_DEPTH) return false;
		const clauses = model[typeOf(object)]?.[relation];
		if (clauses === undefined) return false;
		return clauses.some((clause) => satisfies(user, clause, relation, object, depth));
	}

	function satisfies(
		user: string,
		clause: Clause,
		relation: string,
		object: string,
		depth: number,
	): boolean {
		switch (clause.kind) {
			case "direct":
				return targetsOf(object, relation).some((t) => {
					if (t.user === user) return clause.types.includes("user") && user.startsWith("user:");
					const hash = t.user.indexOf("#");
					if (hash < 0) return false;
					const subjectType = `${typeOf(t.user)}#${t.user.slice(hash + 1)}`;
					return (
						clause.types.includes(subjectType) &&
						holds(user, t.user.slice(hash + 1), t.user.slice(0, hash), depth + 1)
					);
				});
			case "computed":
				return holds(user, clause.relation, object, depth + 1);
			case "from":
				return targetsOf(object, clause.via).some(
					(t) => !t.user.includes("#") && holds(user, clause.relation, t.user, depth + 1),
				);
			case "and":
				return clause.all.every((term) => satisfies(user, term, relation, object, depth));
			default:
				return clause satisfies never;
		}
	}

	return {
		check: (user, relation, object) => Promise.resolve(holds(user, relation, object, 0)),
		checkMany: (checks) =>
			Promise.resolve(checks.map((q) => holds(q.user, q.relation, q.object, 0))),
		listObjects(user, relation, type) {
			const candidates = new Set<string>();
			for (const t of held.values()) {
				if (typeOf(t.object) === type) candidates.add(t.object);
				if (!t.user.includes("#") && typeOf(t.user) === type) candidates.add(t.user);
			}
			return Promise.resolve(
				[...candidates].filter((object) => holds(user, relation, object, 0)).sort(),
			);
		},
		write(change: TupleChange) {
			for (const t of change.deletes) held.delete(keyOf(t));
			for (const t of change.writes) held.set(keyOf(t), t);
			return Promise.resolve();
		},
		tuples: () => [...held.values()],
	};
}

/** Seeds the platform: this user is the estate's administrator and holds the scheduling platform role. */
export function platformAdminTuples(subject: string): Tuple[] {
	return [
		{ user: `user:${subject}`, relation: "administrator", object: objectOf("platform", "psi") },
		{
			user: `user:${subject}`,
			relation: "role_sched_app_admin",
			object: objectOf("platform", "psi"),
		},
	];
}
