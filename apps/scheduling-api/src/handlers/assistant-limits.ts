import {
	ASSISTANT_LIMIT_OVERRIDES,
	ASSISTANT_LIMIT_SETTINGS,
	type AssistantOrgDocumentType,
} from "@psi/scheduling-sdk/contract";

/** A value as text with its keys in order, so two equal parts compare equal whatever order they were written in. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value === "object" && value !== null)
		return `{${Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

const pick = (source: object | undefined, keys: ReadonlyArray<string>): Record<string, unknown> =>
	Object.fromEntries(
		keys.map((k) => [k, source === undefined ? undefined : Reflect.get(source, k)]),
	);

function overridesDiffer(
	before: Readonly<Record<string, object>>,
	after: Readonly<Record<string, object>>,
): boolean {
	for (const id of new Set([...Object.keys(before), ...Object.keys(after)]))
		if (
			canonical(pick(before[id], ASSISTANT_LIMIT_OVERRIDES)) !==
			canonical(pick(after[id], ASSISTANT_LIMIT_OVERRIDES))
		)
			return true;
	return false;
}

/**
 * Whether a save changes any budget or limit of the organisation's tier (either surface's, a role's or a person's)
 * from what is stored; nothing stored is the built-in values, so a first save that sets one changes it.
 */
export function limitsChanged(
	stored: AssistantOrgDocumentType | undefined,
	next: AssistantOrgDocumentType,
): boolean {
	for (const surface of ["staff", "visitor"] as const)
		if (
			canonical(pick(stored?.[surface], ASSISTANT_LIMIT_SETTINGS)) !==
			canonical(pick(next[surface], ASSISTANT_LIMIT_SETTINGS))
		)
			return true;
	return (
		overridesDiffer(stored?.roles ?? {}, next.roles) ||
		overridesDiffer(stored?.people ?? {}, next.people)
	);
}
