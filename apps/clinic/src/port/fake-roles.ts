import { type ComposedRole, inclusionProblem } from "@psi/scheduling/permissions";
import { extraCapabilities } from "./fake-caps-extra";
import { type ClinicPort, PortError } from "./port";
import { composed, type StoredRole } from "./role-composition";
import { relationsFromGrants } from "./role-map";
import type { AppSlug, Role } from "./schema";
import type { AppData } from "./seed";

/** A fake role's own relations, as the role editor would save them plus what the fake derives from coarser rows. */
export const relationsOf = (r: Role): string[] =>
	[
		...new Set([
			...relationsFromGrants(r, []),
			...Object.entries(extraCapabilities(r)).flatMap(([key, scopes]) =>
				scopes.map((s) => `${key}_${s}`),
			),
		]),
	].sort();

export const storedOf = (roles: ReadonlyArray<Role>): StoredRole[] =>
	roles.map((r) => ({ id: r.id, relations: relationsOf(r), includes: r.includes ?? [] }));

/** The fake's roles: each with what it includes and inherits; a save refuses what the service refuses. */
export function createFakeRoles(deps: {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}): Pick<ClinicPort, "roles" | "saveRole"> {
	const { data, guard, log } = deps;
	return {
		async roles(app) {
			guard("roles");
			const d = data(app);
			return composed(d.roles, storedOf(d.roles));
		},
		async saveRole(app, role) {
			guard("saveRole");
			const d = data(app);
			const i = d.roles.findIndex((r) => r.id === role.id);
			if (i < 0) throw new PortError("not-found", role.id);
			const includes = [...new Set(role.includes ?? d.roles[i]?.includes ?? [])].sort();
			const byId = new Map<string, ComposedRole>(
				storedOf(d.roles).map((s) => [
					s.id,
					{ id: s.id, permissions: s.relations, includes: s.includes },
				]),
			);
			const problem = inclusionProblem(role.id, includes, byId);
			if (problem !== undefined) throw new PortError("invalid", `includes:${problem.kind}`);
			const { inherited: _i, effective: _e, ...own } = role;
			d.roles[i] = { ...own, includes };
			log(d, "console", "role.save", role.id);
			const saved = composed(d.roles, storedOf(d.roles)).find((r) => r.id === role.id);
			if (saved === undefined) throw new PortError("not-found", role.id);
			return saved;
		},
	};
}
