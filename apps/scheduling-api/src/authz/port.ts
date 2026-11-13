/** One relationship fact, in OpenFGA's wire form: `user:<sub>` or `sched_role:<id>#member`, a relation, `type:id`. */
export interface Tuple {
	user: string;
	relation: string;
	object: string;
}

export interface TupleChange {
	writes: readonly Tuple[];
	deletes: readonly Tuple[];
}

/** OpenFGA could not answer (down, slow, a pinned model it no longer holds). The caller fails CLOSED. */
export class AuthzUnavailable extends Error {
	override readonly name = "AuthzUnavailable";
}

/**
 * The service's one seam to authorization. The live adapter speaks OpenFGA's HTTP API with the pinned model id;
 * the in-memory adapter evaluates the same generated relation definitions, so tests need no OpenFGA.
 * `now` is never a parameter: the live adapter supplies it at Check time and never persists it.
 */
export interface AuthzPort {
	check(user: string, relation: string, object: string): Promise<boolean>;
	/** The ids (`type:id`) of the objects of `type` on which `user` holds `relation`. */
	listObjects(user: string, relation: string, type: string): Promise<string[]>;
	/** Idempotent: writing a tuple that exists, or deleting one that does not, is not an error. */
	write(change: TupleChange): Promise<void>;
}

export const userOf = (subject: string): string => `user:${subject}`;
export const objectOf = (type: string, id: string): string => `${type}:${id}`;
export const idOf = (object: string): string => object.slice(object.indexOf(":") + 1);
