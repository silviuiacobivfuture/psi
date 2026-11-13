import { SchedulingApiError } from "@psi/scheduling-sdk";
import { PortError } from "../port";
import type { AppSlug, Client, NewPackage, NewPayment, Package, PackagePatch } from "../schema";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { clientOf, packageOf, paymentOf } from "./map";
import { instantOf } from "./time";

const soon = (what: string): PortError => new PortError("not-available-yet", what);

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

		/** The list answer carries no payments: each package is read once more for them (a person who may not see payments sees none). */
		packages: (app: AppSlug, clientId: string): Promise<Package[]> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const listed = (await api.packages.list({ app, id: clientId })).items;
				return Promise.all(
					listed.map(async (p) => {
						const full = await api.packages.get({ app, id: p.id }).catch((error: unknown) => {
							if (toPortError(error).code === "forbidden") return null;
							throw error;
						});
						return packageOf(
							p,
							(full?.payments ?? []).map((x) => paymentOf(x, tz)),
						);
					}),
				);
			}),

		createPackage: (app: AppSlug, clientId: string, input: NewPackage): Promise<Package> =>
			run(async () => {
				if (input.note !== "") throw soon("a note on a package");
				const made = await api.packages.create({
					app,
					id: clientId,
					name: input.name,
					sessions: input.sessions,
					bonus: input.bonus,
					priceCents: input.totalBani,
				});
				return packageOf(made);
			}),

		/** The total is the price less the discount the package already has; a note has no place in the service yet. */
		updatePackage: (
			app: AppSlug,
			clientId: string,
			packageId: string,
			patch: PackagePatch,
		): Promise<Package> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const held = (await api.packages.get({ app, id: packageId })).package;
				if (held.clientId !== clientId) throw new PortError("not-found", packageId);
				if (patch.note !== undefined && patch.note !== "") throw soon("a note on a package");
				const sessions = patch.sessions ?? held.sessions;
				const bonus = patch.bonus ?? held.bonus;
				if (sessions + bonus < held.used)
					throw new PortError("invalid", "fewer sessions than are already used");
				await api.packages.update({
					app,
					id: packageId,
					...(patch.name === undefined ? {} : { name: patch.name }),
					...(patch.sessions === undefined ? {} : { sessions: patch.sessions }),
					...(patch.bonus === undefined ? {} : { bonus: patch.bonus }),
					...(patch.totalBani === undefined
						? {}
						: { priceCents: patch.totalBani + held.discountCents }),
				});
				const after = await api.packages.get({ app, id: packageId });
				return packageOf(
					after.package,
					(after.payments ?? []).map((x) => paymentOf(x, tz)),
				);
			}),

		/** A payment is only ever appended; the service stamps who recorded it from the token. */
		addPayment: (
			app: AppSlug,
			clientId: string,
			packageId: string,
			input: NewPayment,
		): Promise<Package> =>
			run(async () => {
				const tz = await sdk.zone(app);
				const held = (await api.packages.get({ app, id: packageId })).package;
				if (held.clientId !== clientId) throw new PortError("not-found", packageId);
				await api.payments.create({
					app,
					id: packageId,
					amountCents: input.amountBani,
					method: input.method,
					paidAt: instantOf(input.date, 12 * 60, tz),
				});
				const after = await api.packages.get({ app, id: packageId });
				return packageOf(
					after.package,
					(after.payments ?? []).map((x) => paymentOf(x, tz)),
				);
			}),
	};
}
