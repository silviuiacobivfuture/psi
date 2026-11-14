import { z } from "zod";
import { convexEnv, convexTarget } from "../store/contract/adapters";
import { splitTable } from "../store/convex/ids";
import { createRpc, type Rpc } from "../store/convex/rpc";
import { aliasApps } from "./alias-store";
import { createWorld, type Populated } from "./populate";

/**
 * The service on each store adapter, populated through the API like in service. Memory always; Convex when a backend is
 * reachable (`CONVEX_URL`, `PSI_CONVEX_DATA`, see store/contract/adapters.ts), otherwise it is absent and the run says
 * so. A test file written against `worldFactories()` runs once per adapter: the same assertions on both.
 */
export interface WorldFactory {
	name: "memory" | "convex";
	create(): Promise<Populated>;
	cleanup(): Promise<void>;
}

/** The apps every populated world creates. */
const APPS = ["psizone", "hemisync", "newapp"] as const;

/**
 * The visitor routes offer a slot only where a practitioner has weekly hours. A new practitioner in Convex has none (the
 * memory store seeds Monday to Friday), so the Convex world gives its two practitioners a working week, every day, so
 * that the booking happy paths have slots to take.
 */
async function openHours(rpc: Rpc, tenant: string, people: readonly string[]): Promise<void> {
	for (const person of people) {
		const ref = splitTable(["p", "s"], person);
		if (ref?.table !== "p") continue;
		await rpc.mutation(
			"staffSetup:setDayRules",
			{
				tenant,
				practitioner: ref.id,
				weekdays: [1, 2, 3, 4, 5, 6, 7],
				windows: [{ start: 540, end: 1020, modes: ["onsite", "online"] }],
				actor: { subject: "setup" },
			},
			z.unknown(),
		);
	}
}

export async function worldFactories(): Promise<WorldFactory[]> {
	const factories: WorldFactory[] = [
		{ name: "memory", create: () => createWorld(), cleanup: () => Promise.resolve() },
	];
	const target = await convexTarget();
	if (target === undefined) {
		console.warn(
			"worlds: no Convex backend (CONVEX_URL, PSI_CONVEX_DATA): the Convex run is skipped",
		);
		return factories;
	}
	const env = convexEnv(target);
	const admin = createRpc({ url: target.url, adminKey: target.adminKey });
	const keyed = createRpc({ url: target.url, serverKey: target.serverKey });
	const held: string[] = [];
	factories.push({
		name: "convex",
		async create() {
			const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
			const aliases = Object.fromEntries(APPS.map((app) => [app, `test-${app}-${stamp}`]));
			held.push(...Object.values(aliases));
			// The tenants exist before the API creates the apps in them (the tenant row is the app).
			const world = await createWorld({
				store: aliasApps(env.store, aliases),
				apps: APPS,
				// Row counts per table, the audit log and the change log included: a refusal that wrote anything moves one.
				storeDigest: async () =>
					JSON.stringify(
						await Promise.all(
							Object.values(aliases).map((tenant) =>
								admin.query("clinicInspect:counts", { tenant }, z.record(z.string(), z.number())),
							),
						),
					),
			});
			await openHours(keyed, `test-psizone-${stamp}`, [world.ids.dora, world.ids.elena]);
			return world;
		},
		async cleanup() {
			for (const tenant of held)
				await admin.mutation("seed:dropFixture", { tenant }, z.unknown()).catch(() => undefined);
			await env.cleanup();
		},
	});
	return factories;
}
