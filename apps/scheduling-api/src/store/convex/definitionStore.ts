import { z } from "zod";
import { currentActor } from "../actor";
import { type Collection, type DefinitionRow, StoreConflict } from "../types";
import { isNotFound, matches, parseBody } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * The builder's definitions over apiRecordsExtra: stored exactly as the API takes them (all five kinds, the API's id,
 * the body as given, every replace the next version). A form is also written as a form template, which is what records
 * are written against; the seeded templates are listed too, as the API's own shape (`{kind, fields: [names]}`).
 * Convex numbers the versions (the templates and the definitions share one sequence), so a replace returns the
 * version Convex gave.
 */
const Stored = z.object({
	id: z.string(),
	kind: z.enum(["fields", "forms", "views", "actions", "catalogues"]),
	version: z.number(),
	name: z.object({ ro: z.string(), en: z.string() }),
	body: z.string(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
const Listed = answer({ definitions: z.array(Stored) });
const Put = answer({ version: z.number(), createdAt: z.number(), updatedAt: z.number() });
const Done = answer({});

const rowOf = (app: string, d: z.infer<typeof Stored>): DefinitionRow => ({
	id: d.id,
	app,
	kind: d.kind,
	version: d.version,
	name: d.name,
	body: parseBody(d.body),
	createdAt: d.createdAt,
	updatedAt: d.updatedAt,
});

export function definitionCollection(rpc: Rpc): Collection<DefinitionRow> {
	const actor = () => ({ subject: currentActor() });
	const list = async (app: string, id?: string): Promise<DefinitionRow[]> =>
		unwrap(
			await rpc.query(
				"apiDefinitionsExtra:listDefinitions",
				{ tenant: app, ...(id === undefined ? {} : { id }) },
				Listed,
			),
		).definitions.map((d) => rowOf(app, d));
	const put = async (row: DefinitionRow): Promise<DefinitionRow> => {
		const out = unwrap(
			await rpc.mutation(
				"apiDefinitionsExtra:putDefinition",
				{
					tenant: row.app,
					actor: actor(),
					id: row.id,
					kind: row.kind,
					name: row.name,
					body: JSON.stringify(row.body),
				},
				Put,
			),
		);
		return { ...row, version: out.version, createdAt: out.createdAt, updatedAt: out.updatedAt };
	};
	return {
		async get(app, id) {
			return (await list(app, id))[0];
		},
		async list(app, query) {
			return (await list(app)).filter((r) => matches(r, query));
		},
		async insert(row) {
			if ((await list(row.app, row.id)).length > 0) throw new StoreConflict(`${row.id} exists`);
			return put(row);
		},
		async replace(row) {
			if ((await list(row.app, row.id)).length === 0) return false;
			await put(row);
			return true;
		},
		async remove(app, id) {
			try {
				unwrap(
					await rpc.mutation(
						"apiDefinitionsExtra:removeDefinition",
						{ tenant: app, actor: actor(), id },
						Done,
					),
				);
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
	};
}
