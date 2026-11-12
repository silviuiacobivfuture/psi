import { behaviourFrom } from "@psi/cms-client/behaviour";
import type { StudioSettings } from "./settings";

/**
 * Field-by-field differences between two versions of a brand's settings. Browser-safe (the
 * studio's page computes "what you changed" as you edit), so it imports only the behaviour's
 * zod-only module.
 */
export interface Change {
	/** A dotted path: `screeningLevel`, `behaviour.style.warmth`, `behaviour.copy.ro.welcome`. */
	path: string;
	before: string;
	after: string;
}

function flat(value: unknown, prefix: string, out: Map<string, string>): void {
	if (Array.isArray(value)) {
		out.set(prefix, value.map((v) => String(v)).join(" · "));
		return;
	}
	if (typeof value === "object" && value !== null) {
		for (const [k, v] of Object.entries(value)) flat(v, prefix === "" ? k : `${prefix}.${k}`, out);
		return;
	}
	out.set(prefix, value === null || value === undefined ? "" : String(value));
}

/**
 * What changed from `before` to `after`, field by field (a list compares as a whole), in a stable
 * order. Unset and empty read alike: clearing a line nobody set is no change.
 */
export function diffSettings(before: StudioSettings | null, after: StudioSettings): Change[] {
	const a = new Map<string, string>();
	const b = new Map<string, string>();
	if (before !== null) flat({ ...before, behaviour: behaviourFrom(before.behaviour) }, "", a);
	flat({ ...after, behaviour: behaviourFrom(after.behaviour) }, "", b);
	const paths = [...new Set([...a.keys(), ...b.keys()])].filter((p) => p !== "behaviour.version");
	return paths
		.map((path) => ({ path, before: a.get(path) ?? "", after: b.get(path) ?? "" }))
		.filter((c) => c.before !== c.after);
}

/** True when two settings are the same, field by field. */
export function sameSettings(a: StudioSettings | null, b: StudioSettings | null): boolean {
	if (a === null || b === null) return a === b;
	return diffSettings(a, b).length === 0;
}
