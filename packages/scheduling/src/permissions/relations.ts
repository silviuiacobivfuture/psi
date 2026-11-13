import type { ScopeFacts } from "./evaluate";

/**
 * Scope relations are data (docs/plans/clinic.md section 4): `treating` (a practitioner treats a
 * client), `assigned_to` (a coordinator is assigned to a practitioner) and self (a practitioner's
 * row names the person's subject). This turns them into the facts `can` reads.
 */

/** The person asking, as the relations say. */
export interface PersonRelations {
	readonly subject: string;
	/** The practitioner row that names this subject (self), if any. */
	readonly practitionerId?: string;
	/** The practitioners this person coordinates. */
	readonly assignedPractitionerIds: ReadonlySet<string>;
}

/** The thing being touched: whose calendar, who treats the client, whose leave. */
export interface TargetRelations {
	/** The practitioner whose calendar, appointment, package or leave it is. */
	readonly practitionerId?: string;
	/** For a client or what belongs to a client: the practitioners treating that client. */
	readonly treatedBy?: ReadonlyArray<string>;
	/** For a thing a person owns directly (their own leave request): that person's subject. */
	readonly ownerSubject?: string;
}

export function scopeFactsFor(
	person: PersonRelations,
	target: TargetRelations,
	fieldGroup?: ScopeFacts["fieldGroup"],
): ScopeFacts {
	const practitioners = [
		...(target.practitionerId === undefined ? [] : [target.practitionerId]),
		...(target.treatedBy ?? []),
	];
	const own =
		(person.practitionerId !== undefined && practitioners.includes(person.practitionerId)) ||
		(target.ownerSubject !== undefined && target.ownerSubject === person.subject);
	const assigned = practitioners.some((id) => person.assignedPractitionerIds.has(id));
	return { own, assigned, ...(fieldGroup === undefined ? {} : { fieldGroup }) };
}
