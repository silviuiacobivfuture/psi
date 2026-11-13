import { z } from "zod";
import { currentActor } from "../actor";
import {
	type Collection,
	type PackageRow,
	type PaymentRow,
	type Query,
	StoreRefused,
} from "../types";
import { answer, Refusal, type Rpc, unwrap } from "./rpc";

const Package = z.object({
	id: z.string(),
	client: z.string(),
	sessionType: z.string(),
	totalSessions: z.number(),
	bonusSessions: z.number(),
	priceMinor: z.number(),
	discountMinor: z.number().optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
});
const Line = z.object({
	id: z.string(),
	client: z.string(),
	package: z.string().optional(),
	visit: z.string().optional(),
	amountMinor: z.number(),
	method: z.enum(["cash", "card", "transfer"]).optional(),
	note: z.string().optional(),
	at: z.number(),
	_creationTime: z.number(),
});
const Id = answer({ id: z.string() });
const Done = z.union([z.object({ ok: z.literal(true) }).passthrough(), Refusal]);
const OnePackage = z.union([answer({ package: Package }), Refusal]);
const ManyPackages = z.union([answer({ packages: z.array(Package) }), Refusal]);
const Lines = z.union([answer({ lines: z.array(Line) }), Refusal]);

function toPackage(app: string, p: z.infer<typeof Package>): PackageRow {
	return {
		id: p.id,
		app,
		clientId: p.client,
		name: p.sessionType,
		sessions: p.totalSessions,
		bonus: p.bonusSessions,
		priceCents: p.priceMinor,
		discountCents: p.discountMinor ?? 0,
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
	};
}

const matches = <R extends object>(row: R, query?: Query<R>): boolean =>
	Object.entries(query?.eq ?? {}).every(
		([k, want]) => want === undefined || Reflect.get(row, k) === want,
	);

/** Packages over `apiMoney` (create, update, remove) and `apiMoneyExtra` (reads by id, the offer). */
export function packageCollection(rpc: Rpc): Collection<PackageRow> {
	const actor = (): { subject: string } => ({ subject: currentActor() });
	const discount = (app: string, id: string, discountMinor: number) =>
		rpc.mutation(
			"apiMoneyExtra:setPackageDiscount",
			{ tenant: app, actor: actor(), package: id, discountMinor },
			Done,
		);
	const collection: Collection<PackageRow> = {
		async get(app, id) {
			const out = await rpc.query(
				"apiMoneyExtra:packageById",
				{ tenant: app, package: id },
				OnePackage,
			);
			if (!out.ok) {
				if (out.reason === "not_found") return undefined;
				throw new StoreRefused(out.reason);
			}
			return toPackage(app, out.package);
		},

		async list(app, query) {
			const out = unwrap(
				await rpc.query(
					"apiMoneyExtra:packages",
					{
						tenant: app,
						...(query?.eq?.clientId === undefined ? {} : { client: query.eq.clientId }),
					},
					ManyPackages,
				),
			);
			return out.packages.map((p) => toPackage(app, p)).filter((row) => matches(row, query));
		},

		async insert(row) {
			const created = unwrap(
				await rpc.mutation(
					"apiMoney:createPackage",
					{
						tenant: row.app,
						actor: actor(),
						client: row.clientId,
						sessionType: row.name,
						totalSessions: row.sessions,
						bonusSessions: row.bonus,
						priceMinor: row.priceCents,
					},
					Id,
				),
			);
			if (row.discountCents > 0) {
				const set = await discount(row.app, created.id, row.discountCents);
				if (!set.ok) {
					await rpc
						.mutation(
							"apiMoney:removePackage",
							{ tenant: row.app, actor: actor(), package: created.id },
							Done,
						)
						.catch(() => undefined);
					throw new StoreRefused(set.reason);
				}
			}
			const saved = await collection.get(row.app, created.id);
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},

		async replace(row) {
			const cur = await collection.get(row.app, row.id);
			if (cur === undefined) return false;
			if (cur.clientId !== row.clientId) throw new StoreRefused("invalid");
			const patch = {
				...(row.name === cur.name ? {} : { sessionType: row.name }),
				...(row.sessions === cur.sessions ? {} : { totalSessions: row.sessions }),
				...(row.bonus === cur.bonus ? {} : { bonusSessions: row.bonus }),
				...(row.priceCents === cur.priceCents ? {} : { priceMinor: row.priceCents }),
			};
			const offer = row.discountCents !== cur.discountCents;
			// The offer may not pass the price at any moment: lower it first when the price falls, raise it after when it rises.
			const offerFirst = offer && row.priceCents < cur.priceCents;
			if (offerFirst) unwrap(await discount(row.app, row.id, row.discountCents));
			if (Object.keys(patch).length > 0)
				unwrap(
					await rpc.mutation(
						"apiMoney:updatePackage",
						{ tenant: row.app, actor: actor(), package: row.id, patch },
						Done,
					),
				);
			if (offer && !offerFirst) unwrap(await discount(row.app, row.id, row.discountCents));
			return true;
		},

		async remove(app, id) {
			const out = await rpc.mutation(
				"apiMoney:removePackage",
				{ tenant: app, actor: actor(), package: id },
				Done,
			);
			if (out.ok) return true;
			if (out.reason === "not_found") return false;
			throw new StoreRefused(out.reason);
		},
	};
	return collection;
}

/**
 * The ledger is append-only on Convex: a line is made (`insert`), deleted (`remove`, audited) and never edited. A line
 * taken for one appointment carries that appointment, and the appointment's amount paid follows it in one transaction;
 * so an appointment's money is derived and never written twice. Refund lines (negative) and lines with no method (an
 * import's) are not representable in the API's `Payment`: the first are left out of reads, the second read as cash.
 */
export function paymentCollection(rpc: Rpc): Collection<PaymentRow> {
	const actor = (): { subject: string } => ({ subject: currentActor() });
	const toPayment = (app: string, l: z.infer<typeof Line>): PaymentRow => ({
		id: l.id,
		app,
		clientId: l.client,
		...(l.package === undefined ? {} : { packageId: l.package }),
		...(l.visit === undefined ? {} : { appointmentId: l.visit }),
		amountCents: l.amountMinor,
		method: l.method ?? "cash",
		paidAt: l.at,
		...(l.note === undefined ? {} : { note: l.note }),
		createdAt: Math.floor(l._creationTime),
		updatedAt: Math.floor(l._creationTime),
	});
	const read = async (app: string, args: Record<string, unknown>): Promise<PaymentRow[]> =>
		unwrap(await rpc.query("apiMoneyExtra:ledger", { tenant: app, ...args }, Lines))
			.lines.filter((l) => l.amountMinor > 0)
			.map((l) => toPayment(app, l));
	const collection: Collection<PaymentRow> = {
		async get(app, id) {
			return (await read(app, { payment: id }))[0];
		},

		async list(app, query) {
			const eq = query?.eq ?? {};
			const rows = await read(app, {
				...(eq.packageId === undefined
					? eq.appointmentId === undefined
						? eq.clientId === undefined
							? {}
							: { client: eq.clientId }
						: { visit: eq.appointmentId }
					: { package: eq.packageId }),
			});
			return rows.filter((row) => matches(row, query));
		},

		async insert(row) {
			const created = unwrap(
				await rpc.mutation(
					"apiMoneyExtra:addLedgerPayment",
					{
						tenant: row.app,
						actor: actor(),
						client: row.clientId,
						amountMinor: row.amountCents,
						method: row.method,
						at: row.paidAt,
						...(row.packageId === undefined ? {} : { package: row.packageId }),
						...(row.appointmentId === undefined ? {} : { visit: row.appointmentId }),
						...(row.note === undefined ? {} : { note: row.note }),
					},
					Id,
				),
			);
			const saved = await collection.get(row.app, created.id);
			if (saved === undefined) throw new StoreRefused("not_found");
			return saved;
		},

		async replace(row) {
			const cur = await collection.get(row.app, row.id);
			if (cur === undefined) return false;
			const same =
				cur.clientId === row.clientId &&
				cur.packageId === row.packageId &&
				cur.appointmentId === row.appointmentId &&
				cur.amountCents === row.amountCents &&
				cur.method === row.method &&
				cur.paidAt === row.paidAt &&
				cur.note === row.note;
			// A ledger line is never edited: delete it and add another.
			if (!same) throw new StoreRefused("not_allowed");
			return true;
		},

		async remove(app, id) {
			const out = await rpc.mutation(
				"apiMoneyExtra:removeLedgerPayment",
				{ tenant: app, actor: actor(), payment: id },
				Done,
			);
			if (out.ok) return true;
			if (out.reason === "not_found") return false;
			throw new StoreRefused(out.reason);
		},
	};
	return collection;
}
