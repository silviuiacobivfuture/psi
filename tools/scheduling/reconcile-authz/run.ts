import type { AuthzPort, Tuple } from "@psi/scheduling-api/authz-port";
import type { StorePort } from "@psi/scheduling-api/store-types";
import { type FgaReader, SCHED_TYPES } from "./fga";
import { bootstrapMember, type MemberOutcome, type MemberSpec } from "./members";
import { type AppPlan, planApp, tuplesOf } from "./plan";
import { type SeedOutcome, seedRolesIfNone } from "./seed";

export interface ReconcileOptions {
	store: StorePort;
	authz: AuthzPort;
	/** Reads what OpenFGA holds; needed (and only used) with `prune`. */
	reader?: FgaReader;
	apps: readonly string[];
	members: readonly MemberSpec[];
	prefix: string;
	dryRun: boolean;
	prune: boolean;
	/** Give an app with no roles the seed roles first (see seed.ts). */
	seedRoles?: boolean;
	/** Each `members` entry holds exactly its role afterwards (others taken away); see bootstrapMember. */
	exact?: boolean;
	log?: (line: string) => void;
}

export interface AppReport {
	app: string;
	/** Absent when seeding was not asked for. */
	seeded?: SeedOutcome;
	members: { subject: string; outcome: MemberOutcome }[];
	counts: { platform: number; roles: number; members: number; links: number; total: number };
}

export interface ReconcileReport {
	dryRun: boolean;
	apps: AppReport[];
	written: number;
	pruned: number;
}

const key = (t: Tuple): string => `${t.user}\u0000${t.relation}\u0000${t.object}`;

/**
 * Writes every authorization tuple the store implies and OpenFGA lacks (OpenFGA ignores a tuple it already holds, so a
 * rerun changes nothing), after bootstrapping the requested members through the service's store. Nothing is deleted
 * unless `prune`, which removes the service's own object types' tuples that the store no longer implies, for ALL the
 * apps given (so it is only meaningful with every app of the estate).
 */
export async function reconcile(options: ReconcileOptions): Promise<ReconcileReport> {
	const log = options.log ?? (() => undefined);
	const reports: AppReport[] = [];
	const plans: AppPlan[] = [];
	for (const app of options.apps) {
		const seeded =
			options.seedRoles === true
				? await seedRolesIfNone(options.store, app, !options.dryRun)
				: undefined;
		if (seeded !== undefined) log(`${app}: seed roles ${seeded}`);
		const members: AppReport["members"] = [];
		for (const spec of options.members)
			members.push({
				subject: spec.subject,
				outcome: await bootstrapMember(
					options.store,
					app,
					spec,
					!options.dryRun,
					Date.now,
					options.exact === true,
				),
			});
		// A dry run writes no member row: the report says what would be made, the counts are of what the store holds.
		const plan = await planApp(options.store, app, options.prefix);
		plans.push(plan);
		const total = tuplesOf(plan).length;
		reports.push({
			app,
			...(seeded === undefined ? {} : { seeded }),
			members,
			counts: {
				platform: plan.platform.length,
				roles: plan.roles.length,
				members: plan.members.length,
				links: plan.links.length,
				total,
			},
		});
		log(
			`${app}: ${plan.platform.length} platform, ${plan.roles.length} role, ${plan.members.length} member, ${plan.links.length} object-link tuples`,
		);
	}
	const wanted = plans.flatMap(tuplesOf);
	let written = 0;
	let pruned = 0;
	if (!options.dryRun) {
		// Chunked at 100 per request by the live adapter; a duplicate is ignored by OpenFGA.
		await options.authz.write({ writes: wanted, deletes: [] });
		written = wanted.length;
	}
	if (options.prune) {
		if (options.reader === undefined) throw new Error("--prune needs OpenFGA's read access");
		const keep = new Set(wanted.map(key));
		const stale: Tuple[] = [];
		for (const type of SCHED_TYPES)
			for (const t of await options.reader.ofType(type)) if (!keep.has(key(t))) stale.push(t);
		log(`${stale.length} tuple(s) in OpenFGA are not implied by the store`);
		if (!options.dryRun && stale.length > 0) {
			await options.authz.write({ writes: [], deletes: stale });
			pruned = stale.length;
		}
	}
	return { dryRun: options.dryRun, apps: reports, written, pruned };
}
