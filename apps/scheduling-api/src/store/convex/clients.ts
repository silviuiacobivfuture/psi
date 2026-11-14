import { RECOVERY_DAYS } from "@psi/scheduling/clinic";
import { z } from "zod";
import type { ClientCollection, ClientRow, Query } from "../types";
import { StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { catalogCollection } from "./catalog-collection";
import { Encrypted, toEncrypted, toSealed } from "./envelope";
import { readExtra, writeExtra } from "./extra";
import { matches } from "./filter";
import { splitTable } from "./ids";

/**
 * `clients` on `apiClients` (+ `apiCatalogExtra` for the pages and the extra column). The mapping, column by column:
 *
 *   name, archivedAt, deletedAt, createdAt, updatedAt   the same columns
 *   status                                              derived: deletedAt -> deleted, archivedAt -> archived, else
 *                                                       active (the column `status` is the clinic's own, untouched)
 *   purgeAt                                             deletedAt + RECOVERY_DAYS
 *   birthYear                                           the year of `birthDate` (written as `<year>-01-01`; a fuller
 *                                                       imported date is kept while the year does not change)
 *   contact.phone / .email                              phone / email
 *   guardian                                            guardian (its `occupation` is Convex's and is kept)
 *   treating                                            the `treating` relation, replaced only by `setTreating`
 *   clinicalSealed                                      `diagnosisEnc` = toEncrypted(sealed) (the whole clinical group,
 *                                                       ONE envelope); `extra.sealed` says the envelope is ours, so
 *                                                       an imported `diagnosisEnc` (the package's key ring) is never
 *                                                       handed to the service's crypto
 *   contact.address, money                              `extra` (no column holds them)
 *   audience (kind), consent                            not in the API: set on creation from the guardian and the
 *                                                       contact, then left alone (kind follows the birth year only
 *                                                       when it changes)
 * Standing changes go through `standing`, never through a patch.
 */
const FN = "apiCatalogExtra";
const PAGE = 500;
/** The ids one batched read names (`apiClients:getMany`, `treatingForMany`). */
const MANY = 100;

const Guardian = z.object({
	name: z.string(),
	phone: z.string().optional(),
	email: z.string().optional(),
	relationship: z.string().optional(),
	occupation: z.string().optional(),
});
const Doc = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(["child", "teen", "adult"]),
	phone: z.string().optional(),
	email: z.string().optional(),
	guardian: Guardian.optional(),
	consent: z.object({ contact: z.boolean(), reminders: z.boolean() }),
	archivedAt: z.number().optional(),
	deletedAt: z.number().optional(),
	birthDate: z.string().optional(),
	diagnosisEnc: Encrypted.optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
	extra: z.string().optional(),
});
type ClientDoc = z.infer<typeof Doc>;

const Extra = z.object({
	address: z.string().optional(),
	money: z
		.object({
			tariffCents: z.number().optional(),
			discountPercent: z.number().optional(),
			billingName: z.string().optional(),
		})
		.optional(),
	sealed: z.boolean().optional(),
});
type ExtraData = z.infer<typeof Extra>;

const dayMs = 86_400_000;
const yearOf = (birthDate: string | undefined): number | undefined => {
	const year = birthDate === undefined ? Number.NaN : Number.parseInt(birthDate.slice(0, 4), 10);
	return Number.isInteger(year) ? year : undefined;
};
const standingOf = (d: Pick<ClientDoc, "archivedAt" | "deletedAt">): ClientRow["status"] =>
	d.deletedAt !== undefined ? "deleted" : d.archivedAt !== undefined ? "archived" : "active";

function toRow(app: string, d: ClientDoc, treating: string[]): ClientRow {
	const extra = readExtra(Extra, d.extra);
	const year = yearOf(d.birthDate);
	const contact = {
		...(d.phone === undefined ? {} : { phone: d.phone }),
		...(d.email === undefined ? {} : { email: d.email }),
		...(extra?.address === undefined ? {} : { address: extra.address }),
	};
	return {
		id: d.id,
		app,
		name: d.name,
		status: standingOf(d),
		treating,
		...(year === undefined ? {} : { birthYear: year }),
		...(d.archivedAt === undefined ? {} : { archivedAt: d.archivedAt }),
		...(d.deletedAt === undefined
			? {}
			: { deletedAt: d.deletedAt, purgeAt: d.deletedAt + RECOVERY_DAYS * dayMs }),
		...(Object.keys(contact).length === 0 ? {} : { contact }),
		...(d.guardian === undefined
			? {}
			: {
					guardian: {
						name: d.guardian.name,
						...(d.guardian.phone === undefined ? {} : { phone: d.guardian.phone }),
						...(d.guardian.email === undefined ? {} : { email: d.guardian.email }),
						...(d.guardian.relationship === undefined
							? {}
							: { relationship: d.guardian.relationship }),
					},
				}),
		...(extra?.money === undefined ? {} : { money: extra.money }),
		...(extra?.sealed === true && d.diagnosisEnc !== undefined
			? { clinicalSealed: toSealed(d.diagnosisEnc) }
			: {}),
		// `createdAt` of a page row is Convex's creation time, which has a fraction.
		createdAt: Math.floor(d.createdAt),
		updatedAt: Math.floor(d.updatedAt),
	};
}

const extraOf = (row: ClientRow): ExtraData => ({
	...(row.contact?.address === undefined ? {} : { address: row.contact.address }),
	...(row.money === undefined ? {} : { money: row.money }),
	...(row.clinicalSealed === undefined ? {} : { sealed: true }),
});

const audienceOf = (
	birthYear: number | undefined,
	guardian: boolean,
	now: number,
): "child" | "teen" | "adult" => {
	if (birthYear === undefined) return guardian ? "child" : "adult";
	const age = new Date(now).getUTCFullYear() - birthYear;
	return age < 13 ? "child" : age < 18 ? "teen" : "adult";
};

/** The plain columns of a row, as `apiClients` takes them. */
function columns(row: ClientRow, kept: ClientDoc | undefined, now: number) {
	const hasContact =
		row.contact?.phone !== undefined ||
		row.contact?.email !== undefined ||
		row.guardian !== undefined;
	return {
		name: row.name,
		kind: kept?.kind ?? audienceOf(row.birthYear, row.guardian !== undefined, now),
		...(row.contact?.phone === undefined ? {} : { phone: row.contact.phone }),
		...(row.contact?.email === undefined ? {} : { email: row.contact.email }),
		...(row.guardian === undefined
			? {}
			: {
					guardian: {
						name: row.guardian.name,
						...(row.guardian.phone === undefined ? {} : { phone: row.guardian.phone }),
						...(row.guardian.email === undefined ? {} : { email: row.guardian.email }),
						...(row.guardian.relationship === undefined
							? {}
							: { relationship: row.guardian.relationship }),
						...(kept?.guardian?.occupation === undefined
							? {}
							: { occupation: kept.guardian.occupation }),
					},
				}),
		consent: kept?.consent ?? { contact: hasContact, reminders: hasContact },
		...(row.birthYear === undefined || yearOf(kept?.birthDate) === row.birthYear
			? kept?.birthDate === undefined
				? {}
				: { birthDate: kept.birthDate }
			: { birthDate: `${row.birthYear}-01-01` }),
		...(row.clinicalSealed === undefined ? {} : { diagnosisEnc: toEncrypted(row.clinicalSealed) }),
	};
}

export function clientsCollection(call: Caller, clock: () => number): ClientCollection {
	const treatingByClient = async (app: string): Promise<Map<string, string[]>> => {
		const catalog = await call.query(
			`${FN}:practitioners`,
			{ tenant: app },
			{ practitioners: z.array(z.object({ id: z.string() })) },
		);
		const map = new Map<string, string[]>();
		const ids = catalog.practitioners.map((p) => p.id);
		const chunks: string[][] = [];
		for (let at = 0; at < ids.length; at += MANY) chunks.push(ids.slice(at, at + MANY));
		// One read for the whole team (a hundred practitioners at a time), never one per practitioner.
		const pages = await Promise.all(
			chunks.map((practitioners) =>
				call.query(
					"apiClients:treatingForMany",
					{ tenant: app, practitioners },
					{
						treating: z.array(z.object({ practitioner: z.string(), clients: z.array(z.string()) })),
					},
				),
			),
		);
		for (const { practitioner, clients } of pages.flatMap((p) => p.treating))
			for (const c of clients) map.set(c, [...(map.get(c) ?? []), `p${practitioner}`]);
		return map;
	};
	const read = async (
		app: string,
		standing: "active" | "archived" | "deleted" | "all",
	): Promise<ClientRow[]> => {
		const docs: ClientDoc[] = [];
		let cursor: string | null = null;
		for (;;) {
			const page: { clients: ClientDoc[]; continueCursor: string; isDone: boolean } =
				await call.query(
					`${FN}:clientsPage`,
					{ tenant: app, standing, cursor, numItems: PAGE },
					{ clients: z.array(Doc), continueCursor: z.string(), isDone: z.boolean() },
				);
			docs.push(...page.clients);
			if (page.isDone) break;
			cursor = page.continueCursor;
		}
		const treating = await treatingByClient(app);
		return docs.map((d) => toRow(app, d, treating.get(d.id) ?? []));
	};
	async function fetch(
		app: string,
		id: string,
	): Promise<{ client: ClientDoc; treating: string[] } | undefined> {
		try {
			return await call.query(
				"apiClients:get",
				{ tenant: app, client: id },
				{ client: Doc, treating: z.array(z.string()) },
			);
		} catch (error) {
			if (error instanceof StoreRefused && error.reason === "not_found") return undefined;
			throw error;
		}
	}
	async function one(app: string, id: string): Promise<ClientRow | undefined> {
		const out = await fetch(app, id);
		return out === undefined
			? undefined
			: toRow(
					app,
					out.client,
					out.treating.map((t) => `p${t}`),
				);
	}
	const currentDoc = async (app: string, id: string): Promise<ClientDoc | undefined> =>
		(await fetch(app, id))?.client;

	/**
	 * Moves a client to a standing along the steps the domain allows, from the standing it has NOW: restoring a deleted
	 * client that was archived first brings it back archived (the service's restore clears both, so it unarchives too).
	 */
	async function standing(app: string, id: string, to: ClientRow["status"]): Promise<void> {
		const step = (action: "archive" | "unarchive" | "delete" | "restore") =>
			call.mutate(
				"apiClients:standing",
				{ tenant: app, actor: actorArg(), client: id, action },
				{},
			);
		const now = await currentDoc(app, id);
		if (now === undefined) throw new StoreRefused("not_found");
		if (to === "deleted") {
			if (now.deletedAt === undefined) await step("delete");
			return;
		}
		if (now.deletedAt !== undefined) await step("restore");
		const archived = now.archivedAt !== undefined;
		if (to === "archived" && !archived) await step("archive");
		if (to === "active" && archived) await step("unarchive");
	}

	const base = catalogCollection<ClientRow>({
		all: (app) => read(app, "all"),
		one,
		async create(row) {
			const now = clock();
			const { birthDate, diagnosisEnc, ...plain } = columns(row, undefined, now);
			const made = await call.mutate(
				"apiClients:create",
				{
					tenant: row.app,
					actor: actorArg(),
					client: {
						...plain,
						...(birthDate === undefined ? {} : { birthDate }),
						...(diagnosisEnc === undefined ? {} : { diagnosisEnc }),
					},
					practitioners: row.treating.map((id) => practitionerId(id)),
				},
				{ id: z.string() },
			);
			const extra = extraOf(row);
			if (Object.keys(extra).length > 0)
				await call.mutate(
					`${FN}:setExtra`,
					{
						tenant: row.app,
						actor: actorArg(),
						table: "clients",
						id: made.id,
						extra: writeExtra(extra),
					},
					{},
				);
			if (row.status !== "active") await standing(row.app, made.id, row.status);
			const saved = await one(row.app, made.id);
			return saved ?? { ...row, id: made.id };
		},
		async update(before, after) {
			const now = clock();
			const kept = await currentDoc(before.app, before.id);
			const cols = columns(after, kept, now);
			const changed =
				after.name !== before.name ||
				after.contact?.phone !== before.contact?.phone ||
				after.contact?.email !== before.contact?.email ||
				JSON.stringify(after.guardian) !== JSON.stringify(before.guardian) ||
				after.birthYear !== before.birthYear ||
				after.clinicalSealed !== before.clinicalSealed;
			if (changed) {
				const clear = [
					...(after.contact?.phone === undefined && before.contact?.phone !== undefined
						? ["phone"]
						: []),
					...(after.contact?.email === undefined && before.contact?.email !== undefined
						? ["email"]
						: []),
					...(after.guardian === undefined && before.guardian !== undefined ? ["guardian"] : []),
				];
				const { consent: _consent, kind: _kind, ...patch } = cols;
				await call.mutate(
					"apiClients:update",
					{
						tenant: after.app,
						actor: actorArg(),
						client: after.id,
						patch: {
							...patch,
							...(after.birthYear !== before.birthYear ? { kind: cols.kind } : {}),
						},
						clear,
					},
					{ changed: z.boolean().optional(), version: z.number().optional() },
				);
			}
			if (JSON.stringify(extraOf(after)) !== JSON.stringify(extraOf(before)))
				await call.mutate(
					`${FN}:setExtra`,
					{
						tenant: after.app,
						actor: actorArg(),
						table: "clients",
						id: after.id,
						extra: writeExtra(extraOf(after)),
					},
					{},
				);
			if (after.status !== before.status) await standing(after.app, after.id, after.status);
			if (!sameSet(after.treating, before.treating))
				await call.mutate(
					"apiClients:setTreating",
					{
						tenant: after.app,
						actor: actorArg(),
						client: after.id,
						practitioners: after.treating.map((id) => practitionerId(id)),
					},
					{ changed: z.boolean() },
				);
		},
		async remove(app, id) {
			// The service never hard-deletes a client: it deletes softly, and the erasure job (or a GDPR request) does the rest.
			const found = await one(app, id);
			if (found === undefined) return false;
			await standing(app, id, "deleted");
			return true;
		},
	});

	return {
		...base,
		async getMany(app, ids) {
			const chunks: string[][] = [];
			const unique = [...new Set(ids)];
			for (let at = 0; at < unique.length; at += MANY) chunks.push(unique.slice(at, at + MANY));
			const pages = await Promise.all(
				chunks.map((clients) =>
					call.query(
						"apiClients:getMany",
						{ tenant: app, clients },
						{ clients: z.array(z.object({ client: Doc, treating: z.array(z.string()) })) },
					),
				),
			);
			return pages.flatMap((page) =>
				page.clients.map((found) =>
					toRow(
						app,
						found.client,
						found.treating.map((t) => `p${t}`),
					),
				),
			);
		},
		async list(app: string, query?: Query<ClientRow>) {
			const wanted = query?.eq?.status;
			const rows = await read(app, wanted ?? "all");
			return rows.filter((row) => matches(row, query));
		},
	};
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((x) => b.includes(x));

function practitionerId(apiId: string): string {
	const at = splitTable(["p"], apiId);
	if (at === undefined) throw new StoreRefused("unknown_practitioner");
	return at.id;
}
