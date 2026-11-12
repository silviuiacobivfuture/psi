import { AuthzError } from "./errors";

/** One relationship fact supplied at Check time and never persisted. */
export interface ContextualTuple {
	user: string;
	relation: string;
	object: string;
}

/**
 * What the caller's token says, as facts OpenFGA reasons over (SEB SDK `ContextualClaims`).
 * psi's Authentik tokens carry no organisation, so in practice only `user` and `tuples` are used.
 */
export interface ContextualClaims {
	/** The subject, fully qualified: `user:<sub>`. */
	user?: string;
	/** Organisations the token asserts membership of: `org:<id>`. */
	orgs?: ReadonlyArray<string>;
	/** Relation → the objects the token asserts it on. */
	roles?: Readonly<Record<string, ReadonlyArray<string>>>;
	/** Extra tuples, for a fact these two do not cover. */
	tuples?: ReadonlyArray<ContextualTuple>;
	/** CEL context merged into the check. Never `now`: the client injects it. */
	context?: Readonly<Record<string, unknown>>;
}

/** `type:id`, both halves non-empty — OpenFGA's object format. An unqualified id is refused, never repaired. */
export function requireQualified(value: string): void {
	const colon = value.indexOf(":");
	if (colon <= 0 || colon === value.length - 1) {
		throw new AuthzError(
			"invalid",
			`authz: "${value}" is not a qualified id (type:id)`,
		);
	}
}

/** Claims → contextual tuples, exactly as SEB's SDK `claimsToTuples` does it. */
export function claimsToTuples(
	claims: ContextualClaims,
	subject: string,
): ContextualTuple[] {
	const user = claims.user ?? subject;
	requireQualified(user);
	const tuples: ContextualTuple[] = [];
	for (const org of claims.orgs ?? []) {
		requireQualified(org);
		tuples.push({ user, relation: "member", object: org });
	}
	for (const [relation, objects] of Object.entries(claims.roles ?? {})) {
		for (const object of objects) {
			requireQualified(object);
			tuples.push({ user, relation, object });
		}
	}
	for (const tuple of claims.tuples ?? []) {
		requireQualified(tuple.user);
		requireQualified(tuple.object);
		tuples.push({
			user: tuple.user,
			relation: tuple.relation,
			object: tuple.object,
		});
	}
	return tuples;
}

/**
 * The facts a site supplies about one of its own records (docs/plans/accounts.md §4): the record sits on the
 * estate's platform, and its owner — read from the site's own row, the system of record — holds `ownerRelations`
 * on it. Nothing here is persisted in OpenFGA.
 */
export function recordTuples(record: {
	object: string;
	platform: string;
	owner: string | null;
	ownerRelations: ReadonlyArray<string>;
}): ContextualTuple[] {
	requireQualified(record.object);
	requireQualified(record.platform);
	const tuples: ContextualTuple[] = [
		{
			user: record.platform,
			relation: "parent_platform",
			object: record.object,
		},
	];
	if (record.owner !== null) {
		const owner = `user:${record.owner}`;
		for (const relation of record.ownerRelations) {
			tuples.push({ user: owner, relation, object: record.object });
		}
	}
	return tuples;
}
