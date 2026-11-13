import { z } from "zod";
import type { Collection, PersonRow } from "../types";
import { StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { catalogCollection } from "./catalog-collection";
import { readExtra, writeExtra } from "./extra";
import { splitTable, withTable } from "./ids";
import { slugFor } from "./slug";

/**
 * `people`: one API collection over two Convex tables. A practitioner (`practitioners`, bookable, with a calendar) has
 * its API id prefixed `p`; reception, volunteers and other staff (`staffMembers`) `s`. Columns hold what they have
 * (name, active, the sign-in subject, a practitioner's colour and contractor flag); `extra` holds the rest (a staff
 * member's API kind, colour and contractor flag; a practitioner has none). A person cannot move between the two tables: a kind change across
 * them is refused (`invalid`), within staff it is kept in `extra`.
 */
const TABLES = ["p", "s"] as const;
const FN = "apiCatalogExtra";

const Practitioner = z.object({
	id: z.string(),
	_creationTime: z.number(),
	displayName: z.string(),
	active: z.boolean(),
	external: z.boolean().optional(),
	color: z.string().optional(),
	staffSubject: z.string().optional(),
	updatedAt: z.number().optional(),
	extra: z.string().optional(),
});
/** What a team member says beyond the columns: where to reach them, their specialty, hours, rooms and services. */
const Facts = z.object({
	email: z.string().optional(),
	specialty: z.string().optional(),
	hours: z
		.array(z.object({ from: z.number(), to: z.number() }).nullable())
		.length(7)
		.optional(),
	roomIds: z.array(z.string()).optional(),
	serviceIds: z.array(z.string()).optional(),
});
const factsOf = (p: PersonRow): Record<string, unknown> => ({
	...(p.email === undefined ? {} : { email: p.email }),
	...(p.specialty === undefined ? {} : { specialty: p.specialty }),
	...(p.hours === undefined ? {} : { hours: p.hours }),
	...(p.roomIds === undefined ? {} : { roomIds: p.roomIds }),
	...(p.serviceIds === undefined ? {} : { serviceIds: p.serviceIds }),
});
const fromFacts = (f: z.output<typeof Facts> | undefined): Partial<PersonRow> => ({
	...(f?.email === undefined ? {} : { email: f.email }),
	...(f?.specialty === undefined ? {} : { specialty: f.specialty }),
	...(f?.hours === undefined ? {} : { hours: f.hours }),
	...(f?.roomIds === undefined ? {} : { roomIds: f.roomIds }),
	...(f?.serviceIds === undefined ? {} : { serviceIds: f.serviceIds }),
});
const Staff = z.object({
	id: z.string(),
	_creationTime: z.number(),
	name: z.string(),
	kind: z.enum(["reception", "other", "volunteer"]),
	active: z.boolean(),
	subject: z.string().optional(),
	updatedAt: z.number().optional(),
	extra: z.string().optional(),
});
const StaffExtra = Facts.extend({
	kind: z.enum(["practitioner", "reception", "volunteer", "staff"]),
	color: z.string().optional(),
	external: z.boolean().optional(),
});

const NATIVE_KIND = { reception: "reception", volunteer: "volunteer", other: "staff" } as const;
const CONVEX_KIND = { reception: "reception", volunteer: "volunteer", staff: "other" } as const;
const stamp = (n: number): number => Math.floor(n);

function fromPractitioner(app: string, p: z.infer<typeof Practitioner>): PersonRow {
	return {
		id: withTable("p", p.id),
		app,
		displayName: p.displayName,
		kind: "practitioner",
		...(p.staffSubject === undefined ? {} : { subject: p.staffSubject }),
		active: p.active,
		external: p.external === true,
		...(p.color === undefined ? {} : { color: p.color }),
		...fromFacts(readExtra(Facts, p.extra)),
		createdAt: stamp(p._creationTime),
		updatedAt: stamp(p.updatedAt ?? p._creationTime),
	};
}

function fromStaff(app: string, s: z.infer<typeof Staff>): PersonRow {
	const extra = readExtra(StaffExtra, s.extra);
	return {
		id: withTable("s", s.id),
		app,
		displayName: s.name,
		kind: extra?.kind ?? NATIVE_KIND[s.kind],
		...(s.subject === undefined ? {} : { subject: s.subject }),
		active: s.active,
		external: extra?.external === true,
		...(extra?.color === undefined ? {} : { color: extra.color }),
		...fromFacts(extra),
		createdAt: stamp(s._creationTime),
		updatedAt: stamp(s.updatedAt ?? s._creationTime),
	};
}

const staffExtraOf = (p: PersonRow): string =>
	writeExtra({
		kind: p.kind,
		...(p.color === undefined ? {} : { color: p.color }),
		...(p.external ? { external: true } : {}),
		...factsOf(p),
	});

export function peopleCollection(call: Caller): Collection<PersonRow> {
	const readAll = async (app: string): Promise<PersonRow[]> => {
		const [practitioners, staff] = await Promise.all([
			call.query(`${FN}:practitioners`, { tenant: app }, { practitioners: z.array(Practitioner) }),
			call.query("apiResources:staff", { tenant: app }, { staff: z.array(Staff) }),
		]);
		return [
			...practitioners.practitioners.map((p) => fromPractitioner(app, p)),
			...staff.staff.map((s) => fromStaff(app, s)),
		];
	};
	return catalogCollection<PersonRow>({
		all: readAll,
		async create(row) {
			if (row.kind === "practitioner") {
				const made = await call.mutate(
					"staffSetup:createPractitioner",
					{
						tenant: row.app,
						slug: slugFor(row.displayName),
						displayName: row.displayName,
						...(row.external ? { external: true } : {}),
						actor: actorArg(),
					},
					{ id: z.string() },
				);
				// Account and colour have columns but no wrapper of their own; this also audits the creation.
				await call.mutate(
					`${FN}:setExtra`,
					{
						tenant: row.app,
						actor: actorArg(),
						table: "practitioners",
						id: made.id,
						...(row.subject === undefined ? {} : { staffSubject: row.subject }),
						...(row.color === undefined ? {} : { color: row.color }),
						...(Object.keys(factsOf(row)).length === 0 ? {} : { extra: writeExtra(factsOf(row)) }),
					},
					{},
				);
				return { ...row, id: withTable("p", made.id) };
			}
			const made = await call.mutate(
				"apiResources:createStaff",
				{
					tenant: row.app,
					actor: actorArg(),
					name: row.displayName,
					kind: CONVEX_KIND[row.kind],
					...(row.subject === undefined ? {} : { subject: row.subject }),
				},
				{ id: z.string() },
			);
			await call.mutate(
				`${FN}:setExtra`,
				{
					tenant: row.app,
					actor: actorArg(),
					table: "staffMembers",
					id: made.id,
					extra: staffExtraOf(row),
				},
				{},
			);
			return { ...row, id: withTable("s", made.id) };
		},
		async update(before, after) {
			const at = splitTable(TABLES, after.id);
			if (at === undefined) throw new StoreRefused("not_found");
			if ((before.kind === "practitioner") !== (after.kind === "practitioner"))
				throw new StoreRefused("invalid");
			if (at.table === "p") {
				if (
					before.displayName !== after.displayName ||
					before.active !== after.active ||
					before.external !== after.external
				)
					await call.mutate(
						"staffSetup:updatePractitioner",
						{
							tenant: after.app,
							practitioner: at.id,
							actor: actorArg(),
							patch: {
								displayName: after.displayName,
								active: after.active,
								external: after.external,
							},
						},
						{ upcoming: z.number() },
					);
				const factsChanged = JSON.stringify(factsOf(before)) !== JSON.stringify(factsOf(after));
				if (before.subject !== after.subject || before.color !== after.color || factsChanged)
					await call.mutate(
						`${FN}:setExtra`,
						{
							tenant: after.app,
							actor: actorArg(),
							table: "practitioners",
							id: at.id,
							staffSubject: after.subject ?? null,
							color: after.color ?? null,
							extra: Object.keys(factsOf(after)).length === 0 ? null : writeExtra(factsOf(after)),
						},
						{},
					);
				return;
			}
			if (
				before.displayName !== after.displayName ||
				before.active !== after.active ||
				before.subject !== after.subject
			)
				await call.mutate(
					"apiResources:updateStaff",
					{
						tenant: after.app,
						actor: actorArg(),
						staff: at.id,
						patch: {
							name: after.displayName,
							active: after.active,
							...(after.subject === undefined ? {} : { subject: after.subject }),
						},
					},
					{ changed: z.boolean() },
				);
			if (
				before.kind !== after.kind ||
				before.color !== after.color ||
				before.external !== after.external ||
				JSON.stringify(factsOf(before)) !== JSON.stringify(factsOf(after))
			)
				await call.mutate(
					`${FN}:setExtra`,
					{
						tenant: after.app,
						actor: actorArg(),
						table: "staffMembers",
						id: at.id,
						extra: staffExtraOf(after),
					},
					{},
				);
		},
		async remove(app, id) {
			const at = splitTable(TABLES, id);
			if (at === undefined) return false;
			try {
				await call.mutate(
					`${FN}:removeRow`,
					{
						tenant: app,
						actor: actorArg(),
						table: at.table === "p" ? "practitioners" : "staffMembers",
						id: at.id,
					},
					{},
				);
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				throw error;
			}
		},
	});
}
