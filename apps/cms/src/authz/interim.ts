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

export function parseAssignments(raw: string): ReadonlyMap<string, Grants> {
	const out = new Map<string, Grants>();
	for (const entry of raw.split(";").map((s) => s.trim())) {
		if (entry === "") continue;
		const [who, roles, extra] = entry.split("=");
		const key = who?.trim().toLowerCase() ?? "";
		const valid = key.startsWith("group:") ? key.length > 6 : key.includes("@");
		if (roles === undefined || extra !== undefined || !valid) {
			throw new Error("CMS_ROLE_ASSIGNMENTS: expected <email|group:name>=role[@brand]+…;…");
		}
		const grants = out.get(key) ?? new Map<Relation, Set<Brand>>();
		for (const spec of roles.split("+").map((r) => r.trim())) {
			const [role, scope] = spec.split("@");
			const relations = ROLES.get(role ?? "");
			if (relations === undefined) throw new Error(`CMS_ROLE_ASSIGNMENTS: unknown role ${role}`);
			if (scope !== undefined && !isBrand(scope)) {
				throw new Error(`CMS_ROLE_ASSIGNMENTS: unknown brand ${scope}`);
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
	return out;
}

export function interimAuthorizer(raw: string): Authorizer {
	const assignments = parseAssignments(raw);
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
