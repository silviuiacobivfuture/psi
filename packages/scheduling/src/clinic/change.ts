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

export type ClientChangeRefusal = "implicit_practitioner_change";

export type ClientChange =
	| { ok: true; change: Change }
	| { ok: false; reason: ClientChangeRefusal };

/**
 * The reception's #1 complaint: the old app moved clients to other therapists by itself. A
 * client's `treatingPractitioner` changes only when a person asks for exactly that; any system
 * process (saving a visit, a series, an import, a reminder) that would alter it is refused.
 */
export function planClientChange(
	before: Row & { version: number },
	patch: Row,
	origin: Origin,
): ClientChange {
	const change = planChange(before, patch);
	if (
		origin.kind === "system" &&
		change.changed &&
		change.fields.includes("treatingPractitioner")
	) {
		return { ok: false, reason: "implicit_practitioner_change" };
	}
	return { ok: true, change };
}
