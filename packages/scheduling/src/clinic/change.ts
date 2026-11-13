/**
 * Every change bumps a version and writes an audit event; a change that changes nothing does
 * neither. `planChange` compares a patch with the stored row and says which fields really
 * differ, so the audit event can name fields (never values).
 */
export type Row = Readonly<Record<string, unknown>>;

function same(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export type Change =
	| { changed: false }
	| { changed: true; fields: ReadonlyArray<string>; nextVersion: number };

export function planChange(before: Row & { version: number }, patch: Row): Change {
	const fields = Object.keys(patch)
		.filter((key) => key !== "version" && !same(before[key], patch[key]))
		.sort();
	return fields.length === 0
		? { changed: false }
		: { changed: true, fields, nextVersion: before.version + 1 };
}

/** Who or what is asking for a change to a client. */
export type Origin =
	| { kind: "staff"; actor: string }
	| { kind: "system"; process: "visit" | "import" | "series" | "retention" | "reminder" };

export type TreatingRefusal = "implicit_practitioner_change";

export type TreatingChange =
	| { ok: true; added: ReadonlyArray<string>; removed: ReadonlyArray<string> }
	| { ok: false; reason: TreatingRefusal };

/**
 * The reception's #1 complaint: the old app moved clients to other therapists by itself. Who
 * treats a client is the `treating` relation, and it changes only when a person asks for exactly
 * that. Any system process (saving a visit, a series, a reminder, retention) that would alter it
 * is refused; the one exception is the import seeding a client that has no practitioner yet.
 */
export function planTreatingChange(
	current: ReadonlyArray<string>,
	requested: ReadonlyArray<string>,
	origin: Origin,
): TreatingChange {
	const added = requested.filter((id) => !current.includes(id)).sort();
	const removed = current.filter((id) => !requested.includes(id)).sort();
	const changes = added.length > 0 || removed.length > 0;
	if (
		origin.kind === "system" &&
		changes &&
		!(origin.process === "import" && current.length === 0)
	) {
		return { ok: false, reason: "implicit_practitioner_change" };
	}
	return { ok: true, added, removed };
}
