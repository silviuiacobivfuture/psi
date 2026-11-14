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
	/** The tuples by object and relation: a Check reads its few tuples, never every tuple (a grown clinic holds 100k+). */
	const byTarget = new Map<string, Map<string, Tuple>>();
	/** Every object of a type a tuple names (as its object, or as a plain user): what ListObjects considers. */
	const byType = new Map<string, Map<string, number>>();
	const targetKey = (object: string, relation: string): string => `${object}\u0000${relation}`;
	const count = (object: string, delta: number): void => {
		const of = byType.get(typeOf(object)) ?? new Map<string, number>();
		const next = (of.get(object) ?? 0) + delta;
		if (next <= 0) of.delete(object);
		else of.set(object, next);
		byType.set(typeOf(object), of);
	};
	const add = (t: Tuple): void => {
		const key = keyOf(t);
		if (held.has(key)) return;
		held.set(key, t);
		const tk = targetKey(t.object, t.relation);
		const list = byTarget.get(tk) ?? new Map<string, Tuple>();
		list.set(key, t);
		byTarget.set(tk, list);
		count(t.object, 1);
		if (!t.user.includes("#")) count(t.user, 1);
	};
	const remove = (t: Tuple): void => {
		const key = keyOf(t);
		if (!held.delete(key)) return;
		byTarget.get(targetKey(t.object, t.relation))?.delete(key);
		count(t.object, -1);
		if (!t.user.includes("#")) count(t.user, -1);
	};
	for (const t of seed) add(t);

	const NONE: ReadonlyMap<string, Tuple> = new Map();
	/** Whether a tuple on (object, relation) passes `test`: walks that pair's few tuples, copying nothing. */
	function anyTarget(object: string, relation: string, test: (t: Tuple) => boolean): boolean {
		for (const t of (byTarget.get(targetKey(object, relation)) ?? NONE).values())
			if (test(t)) return true;
		return false;
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
				return anyTarget(object, relation, (t) => {
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
				return anyTarget(
					object,
					clause.via,
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
			const candidates = [...(byType.get(type)?.keys() ?? [])];
			return Promise.resolve(
				candidates.filter((object) => holds(user, relation, object, 0)).sort(),
			);
		},
		write(change: TupleChange) {
			for (const t of change.deletes) remove(t);
			for (const t of change.writes) add(t);
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
