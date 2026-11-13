import { z } from "zod";
import { currentActor } from "../actor";
import { type Collection, type RecordRow, StoreRefused } from "../types";
import { Encrypted, toEncrypted, toSealed } from "./envelope";
import { toApiId } from "./ids";
import { isNotFound, matches } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Clinical records over apiRecords / apiRecordsExtra. The service seals the answers (`ports/crypto.ts`, bound to the
 * client) and `envelope.ts` puts that ciphertext in Convex's shape and back: Convex never sees a plain word. Reads use
 * the extra queries, which write no audit event (the API audits the read it authorizes, and a refused caller's lookup
 * must leave nothing behind). The API's `formId` is the form template's key; `formVersion` its version.
 */
const Stored = z.object({
	id: z.string(),
	definitionKey: z.string(),
	definitionVersion: z.number(),
	client: z.string(),
	visit: z.string().optional(),
	payload: Encrypted,
	createdAt: z.number(),
	updatedAt: z.number(),
	createdBy: z.string(),
});
const One = answer({ record: Stored });
const Many = answer({ records: z.array(Stored) });
const Saved = answer({ id: z.string() });
const Updated = answer({ version: z.number() });
const Done = answer({});

const rowOf = (app: string, r: z.infer<typeof Stored>): RecordRow => ({
	id: toApiId(r.id),
	app,
	clientId: toApiId(r.client),
	formId: r.definitionKey,
	formVersion: r.definitionVersion,
	...(r.visit === undefined ? {} : { appointmentId: toApiId(r.visit) }),
	authorSubject: r.createdBy,
	sealed: toSealed(r.payload),
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});

export function recordCollection(rpc: Rpc): Collection<RecordRow> {
	const actor = () => ({ subject: currentActor() });
	const get = async (app: string, id: string): Promise<RecordRow | undefined> => {
		try {
			return rowOf(
				app,
				unwrap(await rpc.query("apiRecordsExtra:recordById", { tenant: app, record: id }, One))
					.record,
			);
		} catch (error) {
			if (isNotFound(error)) return undefined;
			throw error;
		}
	};
	return {
		get,
		async list(app, query) {
			const eq = query?.eq;
			const out = unwrap(
				await rpc.query(
					"apiRecordsExtra:recordsList",
					{
						tenant: app,
						...(eq?.clientId === undefined ? {} : { client: eq.clientId }),
						...(eq?.formId === undefined ? {} : { definitionKey: eq.formId }),
					},
					Many,
				),
			);
			return out.records.map((r) => rowOf(app, r)).filter((r) => matches(r, query));
		},
		async insert(row) {
			const made = unwrap(
				await rpc.mutation(
					"apiRecords:writeRecord",
					{
						tenant: row.app,
						actor: actor(),
						definitionKey: row.formId,
						definitionVersion: row.formVersion,
						client: row.clientId,
						...(row.appointmentId === undefined ? {} : { visit: row.appointmentId }),
						payload: toEncrypted(row.sealed),
					},
					Saved,
				),
			);
			const saved = await get(row.app, made.id);
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},
		async replace(row) {
			try {
				unwrap(
					await rpc.mutation(
						"apiRecords:updateRecord",
						{ tenant: row.app, actor: actor(), record: row.id, payload: toEncrypted(row.sealed) },
						Updated,
					),
				);
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
		async remove(app, id) {
			try {
				unwrap(
					await rpc.mutation(
						"apiRecords:deleteRecord",
						{ tenant: app, actor: actor(), record: id },
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
