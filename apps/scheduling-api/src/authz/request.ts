import type { AuthzPort, CheckQuestion } from "./port";

/** One request's view of the authorization port: each question answered once until something is written. */
export interface RequestAuthz extends AuthzPort {
	/** Bumped by every write: what was remembered before it is never answered after it. */
	generation(): number;
}

const keyOf = (q: CheckQuestion): string => `${q.user}\u0000${q.relation}\u0000${q.object}`;

/**
 * Remembers, for the life of one request, every Check (single or batched) and every ListObjects it asked, so a list
 * that asks the same question for many rows sends it once; a batch sends only the questions it has not asked yet, in
 * one BatchCheck. A write forgets everything (the next question goes to OpenFGA again, at the stronger consistency the
 * live adapter uses after its own write). Failures are not remembered as answers: a failed question is asked again.
 */
export function requestAuthz(inner: AuthzPort): RequestAuthz {
	let generation = 0;
	const checks = new Map<string, Promise<boolean>>();
	const lists = new Map<string, Promise<string[]>>();
	const remember = <T>(held: Map<string, Promise<T>>, key: string, ask: () => Promise<T>) => {
		const found = held.get(key);
		if (found !== undefined) return found;
		const asked = ask();
		held.set(key, asked);
		asked.catch(() => held.delete(key));
		return asked;
	};
	return {
		generation: () => generation,
		check: (user, relation, object) =>
			remember(checks, keyOf({ user, relation, object }), () =>
				inner.check(user, relation, object),
			),
		async checkMany(questions) {
			const fresh = [...new Map(questions.map((q) => [keyOf(q), q])).entries()].filter(
				([key]) => !checks.has(key),
			);
			if (fresh.length > 0) {
				const batch = inner.checkMany(fresh.map(([, q]) => q));
				fresh.forEach(([key], i) => {
					remember(checks, key, () => batch.then((answers) => answers[i] === true));
				});
			}
			return Promise.all(
				questions.map((q) =>
					remember(checks, keyOf(q), () => inner.check(q.user, q.relation, q.object)),
				),
			);
		},
		listObjects: (user, relation, type) =>
			remember(lists, `${user}\u0000${relation}\u0000${type}`, () =>
				inner.listObjects(user, relation, type),
			),
		async write(change) {
			generation += 1;
			checks.clear();
			lists.clear();
			await inner.write(change);
		},
	};
}
