import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import { appLink, parentLink } from "../authz/links";
import type { Ctx, HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import type { PackageRow, PaymentRow } from "../store/types";
import { must, newId, stamps, writeTuples } from "./shared";

type C = Ctx<RouteSpec>;

/** Balances are computed from the ledger, never typed in: total, paid, remaining, sessions left. */
export async function balances(ctx: C, p: PackageRow) {
	const s = ctx.deps.store.c;
	const paid = (await s.payments.list(ctx.app, { eq: { packageId: p.id } })).reduce(
		(n, y) => n + y.amountCents,
		0,
	);
	const used = (await s.appointments.list(ctx.app, { eq: { packageId: p.id } })).filter(
		(a) => a.status === "attended",
	).length;
	const total = Math.max(0, p.priceCents - p.discountCents);
	return {
		id: p.id,
		clientId: p.clientId,
		name: p.name,
		sessions: p.sessions,
		bonus: p.bonus,
		used,
		priceCents: p.priceCents,
		discountCents: p.discountCents,
		totalCents: total,
		paidCents: paid,
		remainingCents: total - paid,
		sessionsRemaining: p.sessions + p.bonus - used,
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
	};
}

const paymentOut = (y: PaymentRow) => ({
	id: y.id,
	clientId: y.clientId,
	...(y.packageId === undefined ? {} : { packageId: y.packageId }),
	...(y.appointmentId === undefined ? {} : { appointmentId: y.appointmentId }),
	amountCents: y.amountCents,
	method: y.method,
	paidAt: y.paidAt,
	...(y.note === undefined ? {} : { note: y.note }),
	createdAt: y.createdAt,
	updatedAt: y.updatedAt,
});

export const packageHandlers: HandlersOf<
	| "packages.list"
	| "packages.create"
	| "packages.get"
	| "packages.update"
	| "packages.remove"
	| "payments.create"
	| "payments.remove"
> = {
	async "packages.list"(ctx) {
		const rows = (
			await ctx.deps.store.c.packages.list(ctx.app, { eq: { clientId: String(ctx.params.id) } })
		).sort((a, b) => a.createdAt - b.createdAt);
		return { items: await Promise.all(rows.map((p) => balances(ctx, p))) };
	},

	async "packages.create"(ctx) {
		const client = await must(ctx.deps.store.c.clients, ctx.app, String(ctx.params.id), "client");
		if (client.status !== "active")
			throw fail("conflict", "only an active client takes a package", { status: client.status });
		if (ctx.body.discountCents > ctx.body.priceCents)
			throw fail("invalid", "the offer is larger than the price", { field: "discountCents" });
		const draft: PackageRow = {
			id: newId("k"),
			app: ctx.app,
			clientId: client.id,
			name: ctx.body.name,
			sessions: ctx.body.sessions,
			bonus: ctx.body.bonus,
			priceCents: ctx.body.priceCents,
			discountCents: ctx.body.discountCents,
			...stamps(ctx.now),
		};
		const row = await ctx.deps.store.c.packages.insert(draft);
		await writeTuples(ctx, [
			appLink("sched_package", row.id, ctx.app),
			parentLink("sched_package", row.id, "client", "sched_client", client.id),
		]);
		return balances(ctx, row);
	},

	async "packages.get"(ctx) {
		const row = await must(ctx.deps.store.c.packages, ctx.app, String(ctx.params.id), "package");
		const base = { package: await balances(ctx, row) };
		if (!(await ctx.canOn("payments_view", "sched_package", row.id))) return base;
		return {
			...base,
			payments: (await ctx.deps.store.c.payments.list(ctx.app, { eq: { packageId: row.id } }))
				.sort((a, b) => a.paidAt - b.paidAt)
				.map(paymentOut),
		};
	},

	async "packages.update"(ctx) {
		const row = await must(ctx.deps.store.c.packages, ctx.app, String(ctx.params.id), "package");
		const next: PackageRow = {
			...row,
			...Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)),
			updatedAt: ctx.now,
		};
		if (next.discountCents > next.priceCents)
			throw fail("invalid", "the offer is larger than the price", { field: "discountCents" });
		const out = await balances(ctx, next);
		if (out.sessionsRemaining < 0)
			throw fail("conflict", "fewer sessions than already used", { used: out.used });
		await ctx.deps.store.c.packages.replace(next);
		ctx.note({ changed: Object.keys(ctx.body) });
		return out;
	},

	async "packages.remove"(ctx) {
		const row = await must(ctx.deps.store.c.packages, ctx.app, String(ctx.params.id), "package");
		const out = await balances(ctx, row);
		if (out.paidCents > 0 || out.used > 0)
			throw fail("conflict", "a package with payments or used sessions is kept", {
				paid: out.paidCents,
				used: out.used,
			});
		await ctx.deps.store.c.packages.remove(ctx.app, row.id);
		await writeTuples(
			ctx,
			[],
			[
				appLink("sched_package", row.id, ctx.app),
				parentLink("sched_package", row.id, "client", "sched_client", row.clientId),
			],
		);
		return { ok: true as const };
	},

	async "payments.create"(ctx) {
		const row = await must(ctx.deps.store.c.packages, ctx.app, String(ctx.params.id), "package");
		const before = await balances(ctx, row);
		if (ctx.body.amountCents > before.remainingCents)
			throw fail("conflict", "more than the package still owes", {
				remainingCents: before.remainingCents,
			});
		const draft: PaymentRow = {
			id: newId("y"),
			app: ctx.app,
			clientId: row.clientId,
			packageId: row.id,
			amountCents: ctx.body.amountCents,
			method: ctx.body.method,
			paidAt: ctx.body.paidAt ?? ctx.now,
			...(ctx.body.note === undefined ? {} : { note: ctx.body.note }),
			...stamps(ctx.now),
		};
		const payment = await ctx.deps.store.c.payments.insert(draft);
		ctx.note({ amountCents: payment.amountCents, packageId: row.id });
		await ctx.notify(
			"payment.recorded",
			{ kind: "team", permission: "payments_view" },
			{
				packageId: row.id,
				paymentId: payment.id,
				clientId: row.clientId,
				amountCents: payment.amountCents,
				what: row.name,
			},
			payment.id,
		);
		return paymentOut(payment);
	},

	async "payments.remove"(ctx) {
		const row = await must(ctx.deps.store.c.payments, ctx.app, String(ctx.params.id), "payment");
		// A payment belongs to a package or, with none, to the client: the permission is asked where it hangs.
		if (row.packageId === undefined)
			await ctx.authorize("payments_delete", "sched_client", row.clientId);
		else await ctx.authorize("payments_delete", "sched_package", row.packageId);
		await ctx.deps.store.c.payments.remove(ctx.app, row.id);
		ctx.note({ amountCents: row.amountCents, packageId: row.packageId ?? null });
		return { ok: true as const };
	},
};
