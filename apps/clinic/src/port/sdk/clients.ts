import { SchedulingApiError } from "@psi/scheduling-sdk";
import { PortError } from "../port";
import type { AppSlug, Client, Package } from "../schema";
import type { SdkContext } from "./context";
import { clientOf, packageOf } from "./map";

/** Clients and their packages. */
export function clientsGroup(
	sdk: SdkContext,
	listClients: (app: AppSlug, status: "active" | "archived", q: string) => Promise<Client[]>,
) {
	const { api, run } = sdk;
	return {
		clients: (app: AppSlug, filter: "current" | "archived", q: string): Promise<Client[]> =>
			run(() => listClients(app, filter === "current" ? "active" : "archived", q.trim())),

		client: (app: AppSlug, id: string): Promise<Client | null> =>
			run(async () => {
				try {
					return clientOf(await api.clients.get({ app, id }));
				} catch (error) {
					// "Not found" also answers "not yours to see": the page says it is not there.
					if (error instanceof SchedulingApiError && error.code === "not_found") return null;
					throw error;
				}
			}),

		archiveClient: (app: AppSlug, id: string): Promise<void> =>
			run(async () => {
				await api.clients.archive({ app, id });
			}),

		deleteClient: (app: AppSlug, id: string): Promise<void> =>
			run(async () => {
				await api.clients.remove({ app, id });
			}),

		packages: (app: AppSlug, clientId: string): Promise<Package[]> =>
			run(async () => (await api.packages.list({ app, id: clientId })).items.map(packageOf)),

		/**
		 * Saves what the package form edits. The price is the form's total plus the discount the package already has;
		 * "paid" is not a field of the package but the sum of its payments, so a higher figure records a cash payment of
		 * the difference and a lower one is refused (a payment is removed on purpose, not by typing).
		 */
		savePackage: (app: AppSlug, pkg: Package): Promise<Package> =>
			run(async () => {
				const held = (await api.packages.get({ app, id: pkg.id })).package;
				if (held.clientId !== pkg.clientId) throw new PortError("not-found", pkg.id);
				if (pkg.paidBani < held.paidCents)
					throw new PortError("invalid", "a payment is removed, not typed over");
				const priceCents = pkg.totalBani + held.discountCents;
				if (
					held.name !== pkg.name ||
					held.sessions !== pkg.sessions ||
					held.bonus !== pkg.bonus ||
					held.priceCents !== priceCents
				)
					await api.packages.update({
						app,
						id: pkg.id,
						name: pkg.name,
						sessions: pkg.sessions,
						bonus: pkg.bonus,
						priceCents,
					});
				if (pkg.paidBani > held.paidCents)
					await api.payments.create({
						app,
						id: pkg.id,
						amountCents: pkg.paidBani - held.paidCents,
						method: "cash",
					});
				return packageOf((await api.packages.get({ app, id: pkg.id })).package);
			}),
	};
}
