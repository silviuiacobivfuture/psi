import { z } from "zod";
import { type AppRow, type Collection, StoreConflict, StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { matches } from "./filter";

/**
 * `apps`: the tenant. The app's id IS its slug, so `get` and `list` answer for that one id only. Created through
 * `apiAppsExtra:createApp`, which also seeds the package's roles and forms (the same as `clinicApps:ensureApp`);
 * `suspended` is the tenant's `active: false`.
 */
const AppShape = {
	id: z.string(),
	name: z.string(),
	timeZone: z.string(),
	active: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number(),
};
type Stored = z.infer<z.ZodObject<typeof AppShape>>;

const toRow = (a: Stored): AppRow => ({
	id: a.id,
	app: a.id,
	name: a.name,
	timeZone: a.timeZone,
	status: a.active ? "active" : "suspended",
	createdAt: a.createdAt,
	updatedAt: a.updatedAt,
});

async function read(call: Caller, app: string): Promise<AppRow | undefined> {
	try {
		return toRow(await call.query("apiAppsExtra:getApp", { tenant: app }, AppShape));
	} catch (error) {
		if (error instanceof StoreRefused && error.reason === "not_found") return undefined;
		throw error;
	}
}

export function appsCollection(call: Caller): Collection<AppRow> {
	return {
		get: (app, id) => (id === app ? read(call, app) : Promise.resolve(undefined)),
		async list(app, query) {
			const row = await read(call, app);
			return row !== undefined && matches(row, query) ? [row] : [];
		},
		async insert(row) {
			if (row.id !== row.app) throw new StoreRefused("invalid");
			try {
				await call.mutate(
					"apiAppsExtra:createApp",
					{ tenant: row.id, actor: actorArg(), name: row.name, timeZone: row.timeZone },
					AppShape,
				);
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "exists")
					throw new StoreConflict(`${row.id} exists`);
				throw error;
			}
			if (row.status === "suspended")
				await call.mutate(
					"apiAppsExtra:updateApp",
					{ tenant: row.id, actor: actorArg(), active: false },
					{},
				);
			return (await read(call, row.id)) ?? row;
		},
		async replace(row) {
			try {
				await call.mutate(
					"apiAppsExtra:updateApp",
					{
						tenant: row.app,
						actor: actorArg(),
						name: row.name,
						timeZone: row.timeZone,
						active: row.status === "active",
					},
					{},
				);
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				throw error;
			}
		},
		async remove(app, id) {
			if (id !== app) return false;
			try {
				await call.mutate("apiAppsExtra:removeApp", { tenant: app, actor: actorArg() }, {});
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				throw error;
			}
		},
	};
}
