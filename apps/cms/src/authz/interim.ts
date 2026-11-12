import { ROLES } from "./manifest";
import { type Authorizer, BRANDS, type Brand, type Relation, type Subject } from "./types";

/**
 * INTERIM ADAPTER — isolated on purpose, deleted when psi's OpenFGA answers the CMS.
 *
 * psi's OpenFGA is deployed (gitops/seb-pieces/openfga) but in-cluster only, behind a read
 * filter whose image is not yet built, with no store or model for cms. Until then the bindings
 * come from the environment (`CMS_ROLE_ASSIGNMENTS`, OpenBao `secret/apps/cms/env`), in the shape
 * Polaris will hold them: a directory group (or one person) bound to a manifest role, on every
 * brand or on one:
 *
 *     group:app-cms-editor=cms:editor@eqsync;dr.ion@psizone.ro=cms:clinical_reviewer
 *
 * Only roles declared in authz.manifest.json exist, each grants exactly its manifest grants, and
 * no role is stored in the CMS: the groups are the directory's, mirrored at each sign-in.
 */
type Grants = Map<Relation, Set<Brand>>;

const BrandSet = new Set<string>(BRANDS);
function isBrand(v: string): v is Brand {
	return BrandSet.has(v);
}

/**
 * The assignments, and what in them was not understood. A malformed entry, an unknown role or an
 * unknown brand is reported and skipped, never thrown: one bad line in the environment (or a
 * manifest the running bundle has not reloaded yet) must not take the whole CMS down, and what it
 * skips grants nothing.
 */
export function parseAssignments(raw: string): {
	assignments: ReadonlyMap<string, Grants>;
	problems: ReadonlyArray<string>;
} {
	const out = new Map<string, Grants>();
	const problems: string[] = [];
	for (const entry of raw.split(";").map((s) => s.trim())) {
		if (entry === "") continue;
		const [who, roles, extra] = entry.split("=");
		const key = who?.trim().toLowerCase() ?? "";
		const valid = key.startsWith("group:") ? key.length > 6 : key.includes("@");
		if (roles === undefined || extra !== undefined || !valid) {
			problems.push(
				"CMS_ROLE_ASSIGNMENTS: expected <email|group:name>=role[@brand]+…;… (entry skipped)",
			);
			continue;
		}
		const grants = out.get(key) ?? new Map<Relation, Set<Brand>>();
		for (const spec of roles.split("+").map((r) => r.trim())) {
			const [role, scope] = spec.split("@");
			const relations = ROLES.get(role ?? "");
			if (relations === undefined) {
				problems.push(`CMS_ROLE_ASSIGNMENTS: unknown role ${role ?? ""} (skipped)`);
				continue;
			}
			if (scope !== undefined && !isBrand(scope)) {
				problems.push(`CMS_ROLE_ASSIGNMENTS: unknown brand ${scope} (skipped)`);
				continue;
			}
			const brands: Brand[] = scope === undefined ? [...BRANDS] : [scope];
			for (const r of relations) {
				const set = grants.get(r) ?? new Set<Brand>();
				for (const b of brands) set.add(b);
				grants.set(r, set);
			}
		}
		out.set(key, grants);
	}
	return { assignments: out, problems };
}

export function interimAuthorizer(
	raw: string,
	onProblem: (message: string) => void = (m) => console.error(m),
): Authorizer {
	const { assignments, problems } = parseAssignments(raw);
	for (const p of problems) onProblem(p);
	return {
		kind: "interim",
		async brands(s: Subject, relation: Relation): Promise<Brand[]> {
			const keys = [s.email.toLowerCase(), ...s.groups.map((g) => `group:${g.toLowerCase()}`)];
			const brands = new Set<Brand>();
			for (const k of keys) for (const b of assignments.get(k)?.get(relation) ?? []) brands.add(b);
			return BRANDS.filter((b) => brands.has(b));
		},
	};
}
