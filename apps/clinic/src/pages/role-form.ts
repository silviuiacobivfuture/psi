import { z } from "zod";
import {
	ACTIONS,
	FIELD_GROUPS,
	RESOURCE_ACTIONS,
	RESOURCES,
	type Role,
	ScopeSchema,
} from "../port/schema";

const FormSchema = z.record(z.unknown());

/**
 * A role from the matrix form: `perm.<resource>.<action>` = a scope or "none", `field.<group>` = on.
 * Anything not offered for a resource, or with an unknown scope, is dropped — a form can never
 * widen a role beyond the catalogue.
 */
export function roleFromForm(current: Role, raw: unknown): Role {
	const form = FormSchema.parse(raw);
	const grants: Role["grants"] = {};
	for (const r of RESOURCES) {
		for (const a of ACTIONS) {
			if (!RESOURCE_ACTIONS[r.key].includes(a)) continue;
			const scope = ScopeSchema.safeParse(form[`perm.${r.key}.${a}`]);
			if (!scope.success) continue;
			grants[r.key] = { ...(grants[r.key] ?? {}), [a]: scope.data };
		}
	}
	return {
		...current,
		grants,
		fieldGroups: FIELD_GROUPS.filter((f) => form[`field.${f}`] !== undefined),
	};
}
