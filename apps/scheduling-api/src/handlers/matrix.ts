import type { MatrixRow, ScopeName } from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import { CATALOGUE, type PermissionDef } from "../authz/catalogue";
import { labelOf } from "../authz/manifest";

/** The whole catalogue, one row per permission, with the scopes `held` says are held: a role's, or a member's in effect. */
export function catalogueMatrix(
	held: (def: PermissionDef) => readonly ScopeName[],
): z.output<typeof MatrixRow>[] {
	return CATALOGUE.map((def) => ({
		key: def.key,
		resource: def.resource,
		action: def.action,
		effect: def.effect,
		...(def.group === undefined ? {} : { fieldGroup: def.group }),
		name: labelOf(def),
		scoped: def.scopes.length > 1,
		scopes: [...def.scopes],
		held: def.scopes.filter((s) => held(def).includes(s)),
	}));
}
