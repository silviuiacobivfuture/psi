import { z } from "zod";
import { currentActor } from "../actor";
import { type Collection, type NoteRow, StoreRefused } from "../types";
import { Encrypted, toEncrypted, toSealed } from "./envelope";
import { toApiId } from "./ids";
import { isNotFound, matches } from "./recordSupport";
import { answer, type Rpc, unwrap } from "./rpc";

/**
 * Client notes over `apiNotes`. The service seals a clinical note's text (`ports/crypto.ts`, bound to the client);
 * `envelope.ts` puts that ciphertext in Convex's shape and back, so Convex never sees a clinical word. Reads write no
 * audit event (the API audits the clinical read it authorizes). The author, the category's side of the clinical line and
 * the client of a note are fixed once it is made.
 */
const Stored = z.object({
	id: z.string(),
	client: z.string(),
	category: z.enum(["general", "administrativ", "plata", "comportament", "clinic"]),
	text: z.string().optional(),
	textEnc: Encrypted.optional(),
	pinned: z.boolean(),
	author: z.string(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
const One = answer({ note: Stored });
const Many = answer({ notes: z.array(Stored) });
const Made = answer({ id: z.string() });
const Done = z.union([answer({}), answer({ changed: z.boolean(), version: z.number() })]);

const rowOf = (app: string, n: z.infer<typeof Stored>): NoteRow => ({
	id: toApiId(n.id),
	app,
	clientId: toApiId(n.client),
	category: n.category,
	...(n.text === undefined ? {} : { text: n.text }),
	...(n.textEnc === undefined ? {} : { sealed: toSealed(n.textEnc) }),
	pinned: n.pinned,
	authorSubject: n.author,
	createdAt: n.createdAt,
	updatedAt: n.updatedAt,
});

export function noteCollection(rpc: Rpc): Collection<NoteRow> {
	const actor = () => ({ subject: currentActor() });
	const get = async (app: string, id: string): Promise<NoteRow | undefined> => {
		try {
			return rowOf(
				app,
				unwrap(await rpc.query("apiNotes:byId", { tenant: app, note: id }, One)).note,
			);
		} catch (error) {
			if (isNotFound(error)) return undefined;
			throw error;
		}
	};
	return {
		get,
		async list(app, query) {
			const client = query?.eq?.clientId;
			// Notes are listed for one client at a time: there is no list of every note of an app.
			if (client === undefined) throw new StoreRefused("invalid");
			try {
				const out = unwrap(await rpc.query("apiNotes:list", { tenant: app, client }, Many));
				return out.notes.map((n) => rowOf(app, n)).filter((r) => matches(r, query));
			} catch (error) {
				if (isNotFound(error)) return [];
				throw error;
			}
		},
		async insert(row) {
			const made = unwrap(
				await rpc.mutation(
					"apiNotes:create",
					{
						tenant: row.app,
						actor: actor(),
						client: row.clientId,
						category: row.category,
						pinned: row.pinned,
						...(row.text === undefined ? {} : { text: row.text }),
						...(row.sealed === undefined ? {} : { textEnc: toEncrypted(row.sealed) }),
					},
					Made,
				),
			);
			const saved = await get(row.app, made.id);
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},
		async replace(row) {
			const held = await get(row.app, row.id);
			if (held === undefined) return false;
			if (held.clientId !== row.clientId || held.authorSubject !== row.authorSubject)
				throw new StoreRefused("invalid");
			const patch = {
				...(row.category === held.category ? {} : { category: row.category }),
				...(row.text === undefined || row.text === held.text ? {} : { text: row.text }),
				...(row.sealed === undefined || row.sealed === held.sealed
					? {}
					: { textEnc: toEncrypted(row.sealed) }),
				...(row.pinned === held.pinned ? {} : { pinned: row.pinned }),
			};
			if (Object.keys(patch).length === 0) return true;
			unwrap(
				await rpc.mutation(
					"apiNotes:update",
					{ tenant: row.app, actor: actor(), note: row.id, patch },
					Done,
				),
			);
			return true;
		},
		async remove(app, id) {
			try {
				unwrap(
					await rpc.mutation("apiNotes:remove", { tenant: app, actor: actor(), note: id }, Done),
				);
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
	};
}
