import { z } from "zod";
import { foldName } from "./format";
import type { Step } from "./proposals";
import { NeedsConfirmationSchema, type ProposalLine, propose } from "./propose";
import type { StaffSession, ToolRun } from "./session";

/** A person who is not a client yet: what the person said about them, nothing more. */
export const NewClientFields = {
	name: z.string().trim().min(2).max(120),
	phone: z.string().trim().min(3).max(40).optional(),
	email: z.string().trim().email().max(200).optional(),
	guardian: z.string().trim().min(2).max(120).optional(),
	/** The age said aloud, or the date of birth: stored as the year of birth. */
	age: z.number().int().min(0).max(120).optional(),
	birthDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
} as const;
export const NewClientSchema = z.object(NewClientFields).strict();
export type NewClientIn = z.infer<typeof NewClientSchema>;

const Ambiguous = z.object({
	status: z.literal("ambiguous"),
	candidates: z.array(z.object({ id: z.string(), name: z.string() })),
});
const Out = z.union([NeedsConfirmationSchema, Ambiguous]);
type Out = z.infer<typeof Out>;

/** The year of birth behind an age or a date of birth (the date wins). */
export function birthYearOf(s: StaffSession, input: NewClientIn): number | undefined {
	if (input.birthDate !== undefined) return Number(input.birthDate.slice(0, 4));
	if (input.age === undefined) return undefined;
	return Number(new Date(s.now()).toISOString().slice(0, 4)) - input.age;
}

/** The step that adds this person, with only the fields that were given. */
export function createClientStep(s: StaffSession, input: NewClientIn): Step {
	const birthYear = birthYearOf(s, input);
	return {
		kind: "create_client",
		name: input.name,
		...(input.phone === undefined ? {} : { phone: input.phone }),
		...(input.email === undefined ? {} : { email: input.email }),
		...(input.guardian === undefined ? {} : { guardian: input.guardian }),
		...(birthYear === undefined ? {} : { birthYear }),
	};
}

/** The card lines for the person to be added. */
export function newClientLines(s: StaffSession, input: NewClientIn): Array<ProposalLine> {
	const birthYear = birthYearOf(s, input);
	const l = s.copy.label;
	return [
		{ label: l.client, value: input.name, free: true },
		...(input.phone === undefined ? [] : [{ label: l.phone, value: input.phone, free: true }]),
		...(input.email === undefined ? [] : [{ label: l.email, value: input.email, free: true }]),
		...(input.guardian === undefined
			? []
			: [{ label: l.guardian, value: input.guardian, free: true }]),
		...(birthYear === undefined ? [] : [{ label: l.birthYear, value: String(birthYear) }]),
	];
}

/**
 * Clients already called this: a second one with the same name is a duplicate until the person
 * says it is someone else, so the assistant asks instead of adding.
 */
export async function sameName(
	s: StaffSession,
	name: string,
): Promise<Array<{ id: string; name: string }>> {
	const found = await s.port.findClients({
		query: name,
		includeArchived: true,
		limit: 6,
	});
	if (!found.ok) return [];
	const wanted = foldName(name);
	return found.value
		.filter((c) => foldName(c.name) === wanted)
		.map((c) => ({ id: c.id, name: c.name }));
}

export { Out as CreateClientOut };

export async function runCreateClient(
	input: NewClientIn & { anotherPerson?: boolean | undefined },
	s: StaffSession,
): Promise<ToolRun<Out>> {
	if (input.anotherPerson !== true) {
		const twins = await sameName(s, input.name);
		if (twins.length > 0)
			return {
				ok: true,
				subjects: twins.map((t) => t.id),
				output: { status: "ambiguous", candidates: twins },
			};
	}
	return propose(s, createClientStep(s, input), {
		title: s.copy.proposal.createClient,
		destructive: false,
		lines: newClientLines(s, input),
	});
}
