import { z } from "zod";
import { type Collection, type RoleRow, StoreConflict, StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { matches } from "./filter";
import { toConvexId } from "./ids";

/**
 * `roles`: `apiAccess:roles` for reads, `createRole`/`deleteRole` and `apiAppsExtra:saveRole` (which can rename) for
 * writes. A role the app started with is `seeded` in Convex and `system` in the API. `ensureApp` has already seeded the
 * package's roles in a new app, so inserting a system role whose name exists ADOPTS the seeded one (the same row, not a
 * second): what provisioning an app does on both adapters.
 */
const Stored = z.object({
	id: z.string(),
	_creationTime: z.number(),
	name: z.string(),
	description: z.string(),
	permissions: z.array(z.string()),
	includes: z.array(z.string()).optional(),
	seeded: z.boolean(),
	updatedAt: z.number(),
});
type Stored = z.infer<typeof Stored>;

const toRow = (app: string, r: Stored): RoleRow => ({
	id: r.id,
	app,
	name: r.name,
	...(r.description === "" ? {} : { description: r.description }),
	system: r.seeded,
	permissions: [...r.permissions].sort(),
	includes: [...(r.includes ?? [])].sort(),
	createdAt: Math.floor(r._creationTime),
	updatedAt: r.updatedAt,
});

export function rolesCollection(call: Caller): Collection<RoleRow> {
	const all = async (app: string): Promise<RoleRow[]> =>
		(await call.query("apiAccess:roles", { tenant: app }, { roles: z.array(Stored) })).roles.map(
			(r) => toRow(app, r),
		);
	return {
		async get(app, id) {
			return toConvexId(id) === undefined ? undefined : (await all(app)).find((r) => r.id === id);
		},
		async list(app, query) {
			return (await all(app)).filter((r) => matches(r, query));
		},
		async insert(row) {
			const held = await all(row.app);
			const same = held.find((r) => r.name === row.name);
			if (same !== undefined) {
				if (row.system && same.system) return same;
				throw new StoreConflict(`${row.name} exists`);
			}
			const made = await call.mutate(
				"apiAccess:createRole",
				{
					tenant: row.app,
					actor: actorArg(),
					name: row.name,
					description: row.description ?? "",
					permissions: row.permissions,
					includes: row.includes,
				},
				{ id: z.string() },
			);
			return (await all(row.app)).find((r) => r.id === made.id) ?? { ...row, id: made.id };
		},
		async replace(row) {
			if (toConvexId(row.id) === undefined) return false;
			try {
				await call.mutate(
					"apiAppsExtra:saveRole",
					{
						tenant: row.app,
						actor: actorArg(),
						role: row.id,
						name: row.name,
						description: row.description ?? "",
						permissions: row.permissions,
						includes: row.includes,
					},
					{},
				);
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				if (error instanceof StoreRefused && error.reason === "exists")
					throw new StoreConflict(`${row.name} exists`);
				throw error;
			}
		},
		async remove(app, id) {
			if (toConvexId(id) === undefined) return false;
			try {
				await call.mutate("apiAccess:deleteRole", { tenant: app, actor: actorArg(), role: id }, {});
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				if (error instanceof StoreRefused && error.reason === "included")
					throw new StoreConflict("another role includes it");
				throw error;
			}
		},
	};
}
